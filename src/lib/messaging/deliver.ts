// Delivering queued messages, in the background (DELIVER_JOB). Safe to run
// twice: each recipient is claimed (Queued -> Sending) and saved before its
// provider is called, so a second run never sends to the same person again.
// A recipient whose result was lost in a crash is marked Failed, never resent
// by itself (a duplicate message to a parent is worse than a visible failure).
import "server-only";

import type { DeliveryStatus, Prisma } from "@prisma/client";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { enqueue } from "../jobs";
import { notify } from "../notifications";
import { fileStore } from "../storage";
import { CHANNEL_LABEL, channelSecrets, channelSetups, PROVIDER_CHANNELS, type Channel, type ProviderChannel } from "./channels";
import { creditBalances, creditsFor, PAID_CHANNELS, returnCredits, spendCredits } from "./credits";
import { inTestMode, providerFor, type Outgoing, type Provider, type SendResult } from "./providers";
import { CANCELLED_REASON, DELIVER_JOB, MessagingProblem, NOT_SENT } from "./send";

export { CANCELLED_REASON };
import { messageSettings, type BackupType } from "./settings";
import { currentVersions, render } from "./templates";
import { linksIn, receiptKeyIn, withRealLinks } from "../parent-link/token";
import { isCodeTemplate, variablesIn, whatsappParts } from "./blanks";
import { cardBody, effectiveButtons, readCard, type SubmittedCard, type WhatsappCard } from "./card";
import { buttonSuffix, receiptPaymentIn } from "./button-links";
import { logTestModeLink, testModeCarriesCodes } from "../dev-codes";
import { CODE_EXPIRED, CODE_NOT_RESENT, CODE_SEND_WINDOW_MS, isCodeMessage, unsealCode, withCode } from "./one-time-code";
import { word } from "../notification-words";

/** Stop starting new sends after this long, so a job always finishes within its transaction time. */
const RUN_BUDGET_MS = 6_000;
const BATCH = 25;
const IN_FLIGHT = 8;
/** A recipient left in Sending longer than this lost its result. */
const STALE_MS = 10 * 60_000;

const RANK: Record<DeliveryStatus, number> = { QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };

type HistoryLine = { at: string; status: string; note?: string | null };
const historyWith = (h: unknown, line: HistoryLine) => [...((Array.isArray(h) ? h : []) as HistoryLine[]), line].slice(-30) as unknown as Prisma.InputJsonValue;

type Claimed = Prisma.MessageRecipientGetPayload<{ include: { message: { select: { title: true; attachmentFileIds: true; messageType: true } } } }>;

type CachedVersion = { id: string; templateId: string; language: string; whatsappName: string | null; whatsappStatus: string | null; whatsappNote: string | null; body: string; dltTemplateId: string | null; whatsappCard: unknown };
const VERSION_FIELDS = { id: true, templateId: true, language: true, whatsappName: true, whatsappStatus: true, whatsappNote: true, body: true, dltTemplateId: true, whatsappCard: true } as const;

type Context = {
  providers: Partial<Record<ProviderChannel, Provider>>;
  dlt: { entityId: string | null; header: string | null };
  versions: Map<string, CachedVersion>;
  attachments: Map<string, { filename: string; content: Buffer; contentType: string }[]>;
  /** Receipt PDFs made in this run, by payment: made once and shared by all the payment's parents. */
  receipts: Map<string, Promise<{ content: Buffer; filename: string } | null>>;
};

async function loadContext(ctx: SchoolContext): Promise<Context> {
  return withSchool(ctx, async (tx) => {
    const setups = await channelSetups(tx, ctx);
    const providers: Context["providers"] = {};
    for (const c of ["whatsapp", "sms", "email"] as const) providers[c] = providerFor(setups[c], await channelSecrets(tx, ctx, c));
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
    return { providers, dlt: { entityId: school.smsDltEntityId, header: school.smsSenderHeader }, versions: new Map(), attachments: new Map(), receipts: new Map() };
  });
}

const realApproval = (v: Pick<CachedVersion, "whatsappStatus" | "whatsappName" | "whatsappNote">) =>
  v.whatsappStatus === "APPROVED" && Boolean(v.whatsappName) && !(v.whatsappNote ?? "").startsWith("Test mode");

/**
 * The approved WhatsApp text a message goes in when the version it was planned
 * with is not approved (its words changed, WhatsApp rejected that language, or
 * it was planned in test mode): the last approved version in the same
 * language, else the approved English one, else any approved one, whose blanks
 * this person's values fill. Null when there is none: then nothing is sent,
 * because a plain text is dropped by WhatsApp outside a 24-hour reply window
 * (live test 15 Nov 2026, item 7).
 */
async function approvedFallback(tx: Tx, ctx: SchoolContext, v: CachedVersion, values: Record<string, string>): Promise<CachedVersion | null> {
  const rows = await tx.templateVersion.findMany({
    where: { schoolId: ctx.schoolId, templateId: v.templateId, whatsappStatus: "APPROVED", whatsappName: { not: null } },
    select: VERSION_FIELDS,
    orderBy: [{ isCurrent: "desc" }, { version: "desc" }],
  });
  const usable = rows.filter((x) => realApproval(x) && variablesIn(x.body).every((k) => values[k] !== undefined && String(values[k]).trim() !== ""));
  return usable.find((x) => x.language === v.language) ?? usable.find((x) => x.language === "en") ?? usable[0] ?? null;
}

/** The parts a card was approved with; a card never sent shows its own parts (test mode, and versions from before `submitted`). */
function layoutOf(body: string, card: WhatsappCard): SubmittedCard {
  if (card.submitted) return card.submitted;
  return {
    header: card.header ? (card.header.type === "document" ? "document" : "text") : null,
    buttons: effectiveButtons(body, card).map((b) => (b.type === "PHONE" ? { type: "PHONE" as const } : "target" in b ? { type: "URL" as const, target: b.target, blank: b.blank } : { type: "URL" as const, path: b.path })),
  };
}

/** True when the payment is of the recipient's own child (or the recipient is that student). */
async function paymentOfRecipient(tx: Tx, paymentId: string, r: Claimed): Promise<boolean> {
  const p = await tx.payment.findFirst({ where: { id: paymentId }, select: { studentId: true } });
  if (!p) return false;
  if (r.studentId && r.studentId === p.studentId) return true;
  if (!r.guardianId) return false;
  return Boolean(await tx.studentGuardian.findFirst({ where: { guardianId: r.guardianId, studentId: p.studentId }, select: { studentId: true } }));
}

const PARENT_LINK_CODE = /⟦parent-link:([0-9a-f-]{36})⟧/g;
const RECEIPT_CODE = /⟦receipt:([0-9a-f-]{36}):([0-9a-f-]{36})⟧/g;
/** The same words with every Parent Link code not of this recipient, and every receipt code not of their own child, removed. */
async function ownCodesOnly(tx: Tx, r: Claimed, words: Record<string, string>): Promise<Record<string, string>> {
  const all = Object.values(words).join(" ");
  const linkIds = [...new Set([...all.matchAll(PARENT_LINK_CODE)].map((m) => m[1]))];
  const receipts = [...new Set([...all.matchAll(RECEIPT_CODE)].map((m) => m[2]))];
  if (!linkIds.length && !receipts.length) return words;
  const ownLinks = new Set(linkIds.length && r.guardianId
    ? (await tx.parentLink.findMany({ where: { id: { in: linkIds }, guardianId: r.guardianId }, select: { id: true } })).map((l) => l.id)
    : []);
  const ownPayments = new Set<string>();
  for (const id of receipts) if (await paymentOfRecipient(tx, id, r)) ownPayments.add(id);
  const clean = (v: string) => v
    .replace(PARENT_LINK_CODE, (m, id: string) => (ownLinks.has(id) ? m : ""))
    .replace(RECEIPT_CODE, (m, _school: string, id: string) => (ownPayments.has(id) ? m : ""));
  return Object.fromEntries(Object.entries(words).map(([k, v]) => [k, typeof v === "string" ? clean(v) : v]));
}

type Prepared = Outgoing & { refuse?: string; receiptFor?: string };

/** code: a one-time code, put in only now, for the provider (QA SEC-01). */
async function outgoingFor(tx: Tx, ctx: SchoolContext, r: Claimed, c: Context, code: string | null): Promise<Prepared> {
  let v = r.templateVersionId ? c.versions.get(r.templateVersionId) : undefined;
  if (r.templateVersionId && !v) {
    const row = await tx.templateVersion.findUnique({ where: { id: r.templateVersionId }, select: VERSION_FIELDS });
    if (row) { v = row; c.versions.set(r.templateVersionId, row); }
  }
  // A Parent Link or receipt code in this person's words or blanks must be their own; any other is dropped,
  // so a code that slipped in can never send another family's link or receipt (security review, 15 Nov).
  const values = await ownCodesOnly(tx, r, (r.values ?? {}) as Record<string, string>);
  const ownText = (await ownCodesOnly(tx, r, { t: r.text })).t;
  const out: Prepared = { channel: r.channel as Outgoing["channel"], to: r.address, text: withCode(withRealLinks(ownText), code), subject: r.message.title };
  if (r.channel === "sms") Object.assign(out, { dltTemplateId: v?.dltTemplateId ?? null, dltEntityId: c.dlt.entityId, senderHeader: c.dlt.header });
  if (r.channel === "whatsapp" && v) {
    const real = c.providers.whatsapp && c.providers.whatsapp.key !== "sandbox";
    // A real WhatsApp account takes a message from an approved template only; the planned text not
    // approved (any more) goes in the approved one, never as plain text.
    if (real && !realApproval(v)) {
      const other = await approvedFallback(tx, ctx, v, values);
      if (!other) return { ...out, refuse: "WhatsApp has not approved this message's template in any language yet, so it was not sent. Send the template for approval in Message Templates, then retry." };
      v = other;
    }
    if (v.whatsappStatus === "APPROVED" && v.whatsappName) {
      const language = v.language;
      const card = readCard(v.whatsappCard);
      const fill = (k: string) => withCode(withRealLinks(values[k] ?? ""), code);
      if (isCodeTemplate(v.body)) {
        // An Authentication template (Meta's own words): the code is its only blank, and the "Copy code" button's too.
        const otp = code ?? values.code ?? "";
        out.whatsappTemplate = { name: v.whatsappName, language, params: [otp], buttonParam: otp };
      } else if (card) {
        // A card: the same parts it was approved with. Each link button gets this person's own secret at its own position.
        const layout = layoutOf(v.body, card);
        const buttons = layout.buttons.flatMap((b, index) => (b.type === "URL" && "target" in b ? [{ index, value: buttonSuffix(b.target, values[b.blank]) }] : []));
        out.whatsappTemplate = { name: v.whatsappName, language, params: variablesIn(cardBody(v.body, card)).map(fill), buttons };
        if (layout.header === "document") {
          // The receipt comes only from the card's own receipt button blank, never from other words (a typed
          // message could carry another family's receipt), and it must be a payment of this person's own child.
          const rb = layout.buttons.find((b) => b.type === "URL" && "target" in b && b.target === "receipt");
          const paid = rb && "blank" in rb ? receiptPaymentIn({ receipt: values[rb.blank] ?? "" }) : null;
          out.whatsappTemplate.header = { type: "document", filename: "receipt.pdf" };
          if (paid && paid.schoolId === ctx.schoolId && (await paymentOfRecipient(tx, paid.paymentId, r))) out.receiptFor = paid.paymentId;
        }
      } else {
        // An older plain text: blanks in order, and the "Open receipt" line as the first button.
        const parts = whatsappParts(v.body);
        const button = parts.button ? receiptKeyIn(values[parts.button.blank] ?? "") : null;
        out.whatsappTemplate = { name: v.whatsappName, language, params: parts.variables.map(fill), ...(button ? { buttons: [{ index: 0, value: button }] } : {}) };
      }
    }
  }
  if (r.channel === "email" && r.message.attachmentFileIds.length) {
    let files = c.attachments.get(r.messageId);
    if (!files) {
      files = [];
      const rows = await tx.storedFile.findMany({ where: { id: { in: r.message.attachmentFileIds } } });
      for (const f of rows) {
        const content = await fileStore().get(f.storageKey);
        if (content) files.push({ filename: f.fileName, content, contentType: f.contentType });
      }
      c.attachments.set(r.messageId, files);
    }
    out.attachments = files;
  }
  return out;
}

/**
 * The parent copy of a payment's receipt as a PDF, the same one /r/ opens
 * (src/lib/fees/documents.ts), made once per delivery run. Null when it cannot be made.
 */
function receiptPdf(ctx: SchoolContext, c: Context, paymentId: string) {
  let p = c.receipts.get(paymentId);
  if (!p) {
    p = (async () => {
      try {
        const { renderReceipt } = await import("../fees/documents");
        return await withSchool(ctx, async (tx) => {
          const doc = await renderReceipt(tx, ctx, paymentId, "parent");
          return { content: await doc.pdf(), filename: doc.fileName };
        }, { timeout: 60_000 });
      } catch (e) {
        console.error(JSON.stringify({ level: "error", event: "whatsapp-receipt-pdf-failed", school: ctx.schoolId, payment: paymentId, error: e instanceof Error ? e.message : String(e) }));
        return null;
      }
    })();
    c.receipts.set(paymentId, p);
  }
  return p;
}

async function inPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Marks recipients whose result was lost as Failed, and returns the credit. */
async function clearStale(ctx: SchoolContext, messageId: string, now: Date) {
  await withSchool(ctx, async (tx) => {
    const stale = await tx.messageRecipient.findMany({ where: { messageId, status: "SENDING", lockedAt: { lt: new Date(now.getTime() - STALE_MS) } } });
    for (const r of stale) {
      await tx.messageRecipient.update({
        where: { id: r.id },
        data: { status: "FAILED", failedAt: now, lockedAt: null, failReason: "We could not confirm this was sent. Check with the person before retrying.", history: historyWith(r.history, { at: now.toISOString(), status: "FAILED", note: "Result lost" }) },
      });
    }
  });
}

/**
 * Sends one message's queued recipients for up to a few seconds, then queues
 * itself again for the rest. Returns what it did.
 */
export async function deliverMessage(tx: Tx, ctx: SchoolContext, payload: { messageId: string; round: string; chunk: number }) {
  const started = Date.now();
  const msg = await tx.message.findUnique({ where: { id: payload.messageId } });
  if (!msg || msg.status === "CANCELLED") return { skipped: "cancelled" };
  if (msg.status === "SCHEDULED") {
    if (msg.scheduledAt && msg.scheduledAt.getTime() > Date.now() + 5_000) return { skipped: "not yet" };
    await withSchool(ctx, (t) => t.message.updateMany({ where: { id: msg.id, status: "SCHEDULED" }, data: { status: "QUEUED" } }));
  }
  await clearStale(ctx, msg.id, new Date());
  const c = await loadContext(ctx);
  let sent = 0;
  let failed = 0;

  while (Date.now() - started < RUN_BUDGET_MS) {
    // 1. Claim a batch and save the claim before calling anyone.
    const batch = await withSchool(ctx, async (t) => {
      const rows = await t.messageRecipient.findMany({ where: { messageId: msg.id, status: "QUEUED" }, take: BATCH, orderBy: { queuedAt: "asc" }, include: { message: { select: { title: true, attachmentFileIds: true, messageType: true } } } });
      const now = new Date();
      const mine: Claimed[] = [];
      for (const r of rows) {
        // A one-time code is cleared as it is picked up: it goes to the provider once, and is never kept (QA SEC-01).
        const got = await t.messageRecipient.updateMany({ where: { id: r.id, status: "QUEUED" }, data: { status: "SENDING", lockedAt: now, attempts: { increment: 1 }, sealedCode: null } });
        if (got.count === 1) mine.push(r);
      }
      return mine;
    });
    if (batch.length === 0) break;

    // 2. Call the providers, outside any transaction. A one-time code that was already
    // picked up once, or is older than its 10 minutes, is not sent: the person asks for a new one.
    const prepared = await withSchool(ctx, async (t) => Promise.all(batch.map(async (r) => {
      const isCode = isCodeMessage(r.message);
      const code = isCode ? unsealCode(r.sealedCode) : null;
      const refuse = !isCode ? null : !code ? CODE_NOT_RESENT : Date.now() - r.queuedAt.getTime() > CODE_SEND_WINDOW_MS ? CODE_EXPIRED : null;
      return { r, isCode, refuse, out: r.channel === "app" || refuse ? null : await outgoingFor(t, ctx, r, c, code) };
    })));
    const results = await inPool(prepared, IN_FLIGHT, async ({ r, out, refuse }): Promise<SendResult> => {
      if (refuse) return { ok: false, retryable: false, reason: refuse };
      if (!out) return { ok: true, providerMessageId: `app-${r.id}`, status: "DELIVERED" };
      if (out.refuse) return { ok: false, retryable: false, reason: out.refuse };
      const provider = c.providers[r.channel as ProviderChannel];
      if (!provider) return { ok: false, retryable: false, reason: `${CHANNEL_LABEL[r.channel as Channel] ?? r.channel} is not connected.` };
      // The fee receipt card: its PDF is made once (outside any transaction) and goes to WhatsApp as the header.
      const head = out.whatsappTemplate?.header;
      if (head?.type === "document" && provider.key !== "sandbox") {
        const pdf = out.receiptFor ? await receiptPdf(ctx, c, out.receiptFor) : null;
        if (!pdf) return { ok: false, retryable: true, reason: "The receipt PDF could not be made. It will be tried again." };
        out.whatsappTemplate = { ...out.whatsappTemplate!, header: { type: "document", filename: pdf.filename, file: { content: pdf.content } } };
      }
      // Test mode sends nothing: on a tester's computer the personal links it would have sent go to the server log.
      if (provider.key === "sandbox" && testModeCarriesCodes()) for (const l of linksIn(r.text)) logTestModeLink({ to: r.address, what: l.what, url: l.url });
      try {
        return await provider.send(out);
      } catch {
        return { ok: false, retryable: true, reason: "The provider could not be reached. It will be tried again." };
      }
    });

    // 3. Save what each provider said.
    await withSchool(ctx, async (t) => {
      const now = new Date();
      for (let i = 0; i < prepared.length; i++) {
        const { r, isCode } = prepared[i];
        const res = results[i];
        if (res.ok) {
          sent++;
          // Test mode sent nothing, so it uses no credits (COMM-04). Credits taken while the channel was live
          // (it was switched to test mode before this went) come back.
          const test = c.providers[r.channel as ProviderChannel]?.key === "sandbox";
          if (test && PAID_CHANNELS.has(r.channel as Channel) && r.credits > 0) await returnCredits(t, ctx, r.channel as Channel, r.credits, `Returned: test mode, not sent to ${r.name}`, r.messageId);
          await t.messageRecipient.update({
            where: { id: r.id },
            data: {
              status: res.status,
              providerMessageId: res.providerMessageId,
              provider: c.providers[r.channel as ProviderChannel]?.key ?? "app",
              sentAt: now,
              deliveredAt: res.status === "DELIVERED" ? now : null,
              lockedAt: null,
              failReason: null,
              ...(test ? { credits: 0 } : {}),
              history: historyWith(r.history, { at: now.toISOString(), status: res.status, ...(test ? { note: "Test mode: not really sent" } : {}) }),
            },
          });
          if (r.channel === "app" && r.userLoginId) {
            await notify(t, { schoolId: ctx.schoolId, userId: null }, {
              to: r.userLoginId,
              type: "message",
              text: r.message.title ? `${r.message.title}: ${r.text}`.slice(0, 300) : r.text.slice(0, 300),
              link: "/messages",
            });
          }
        } else if (res.retryable && r.attempts < 3 && !isCode) {
          await t.messageRecipient.update({ where: { id: r.id }, data: { status: "QUEUED", lockedAt: null, failReason: res.reason, history: historyWith(r.history, { at: now.toISOString(), status: "QUEUED", note: res.reason }) } });
        } else {
          failed++;
          await t.messageRecipient.update({
            where: { id: r.id },
            data: { status: "FAILED", failReason: res.reason, failedAt: now, lockedAt: null, history: historyWith(r.history, { at: now.toISOString(), status: "FAILED", note: res.reason }) },
          });
          // A message the provider never accepted costs nothing.
          if (PAID_CHANNELS.has(r.channel as Channel) && r.credits > 0) {
            await returnCredits(t, ctx, r.channel as Channel, r.credits, `Returned: not accepted for ${r.name}`, r.messageId);
            await t.messageRecipient.update({ where: { id: r.id }, data: { credits: 0 } });
          }
        }
      }
    });
    // A retryable failure waits for the next run instead of looping now.
    if (results.some((x) => !x.ok && x.retryable)) break;
  }

  const left = await tx.messageRecipient.count({ where: { messageId: msg.id, status: { in: ["QUEUED", "SENDING"] } } });
  if (left > 0) {
    const retryLater = await tx.messageRecipient.count({ where: { messageId: msg.id, status: "QUEUED", failReason: { not: null } } });
    await enqueue(tx, ctx, DELIVER_JOB, `deliver:${msg.id}:${payload.round}:${payload.chunk + 1}`, { messageId: msg.id, round: payload.round, chunk: payload.chunk + 1 }, new Date(Date.now() + (retryLater ? 60_000 : 0)));
  } else {
    const done = await tx.message.updateMany({ where: { id: msg.id, status: { in: ["QUEUED", "SCHEDULED"] } }, data: { status: "SENT", sentAt: new Date() } });
    if (done.count === 1) await tellSenderAboutFailures(tx, ctx, msg.id);
  }
  return { sent, failed, left };
}

/**
 * When a message has finished going and some people did not get it (the
 * provider refused it, or no channel could carry it), the person who sent it
 * is told, with a link to the message where they can retry or resend (G07).
 * Messages the software sends by itself show on the Dashboard instead
 * ("Messages not delivered").
 */
export async function tellSenderAboutFailures(tx: Tx, ctx: SchoolContext, messageId: string) {
  const m = await tx.message.findUnique({ where: { id: messageId }, select: { id: true, sentById: true, title: true, trigger: true, audienceLabel: true, sourceType: true } });
  // A copy of a notification that failed must not make another notification.
  if (!m?.sentById || m.sourceType === "Notification") return null;
  const [failed, total] = await Promise.all([
    tx.messageRecipient.count({ where: { messageId, isBackup: false, status: "FAILED", NOT: { failReason: CANCELLED_REASON } } }),
    tx.messageRecipient.count({ where: { messageId, isBackup: false } }),
  ]);
  if (!failed) return null;
  const what = m.title ?? m.trigger ?? m.audienceLabel;
  return notify(tx, { schoolId: ctx.schoolId, userId: null }, {
    to: m.sentById,
    type: "message-failed",
    key: "{failed} of {total} not delivered: {what}. Open it to retry, or resend by another channel.",
    values: { failed, total, what: word(what.slice(0, 200)) },
    link: `/communication/history/${m.id}`,
    groupKey: `message-failed:${m.id}`,
  });
}

/** The channels that are switched on but in test mode: what goes on them is only recorded. */
async function testModeChannels(tx: Tx, ctx: SchoolContext): Promise<Set<Channel>> {
  const setups = await channelSetups(tx, ctx);
  return new Set<Channel>(PROVIDER_CHANNELS.filter((ch) => inTestMode(setups[ch])));
}

/** Status changes from providers only move forward (Read never goes back to Delivered). */
export async function applyStatus(tx: Tx, ctx: SchoolContext, providerMessageId: string, status: "SENT" | "DELIVERED" | "READ" | "FAILED", at: Date, reason?: string | null) {
  const r = await tx.messageRecipient.findFirst({ where: { schoolId: ctx.schoolId, providerMessageId } });
  if (!r) return null;
  if (status !== "FAILED" && RANK[status] <= RANK[r.status] && r.status !== "FAILED") return r;
  if (status === "FAILED" && (r.status === "DELIVERED" || r.status === "READ")) return r;
  const data: Prisma.MessageRecipientUpdateInput = { status, history: historyWith(r.history, { at: at.toISOString(), status, note: reason ?? null }) };
  if (status === "DELIVERED") data.deliveredAt = at;
  if (status === "READ") { data.readAt = at; data.deliveredAt = r.deliveredAt ?? at; }
  if (status === "FAILED") { data.failedAt = at; data.failReason = reason ?? "Not delivered."; }
  if (status === "SENT") data.sentAt = r.sentAt ?? at;
  const updated = await tx.messageRecipient.update({ where: { id: r.id }, data });
  // A WhatsApp read receipt on a notice counts as "Seen by" that guardian.
  if (status === "READ" && r.guardianId) {
    const m = await tx.message.findUnique({ where: { id: r.messageId }, select: { sourceType: true, sourceId: true } });
    if (m?.sourceType === "Notice" && m.sourceId) {
      await tx.noticeGuardianView.upsert({
        where: { noticeId_guardianId: { noticeId: m.sourceId, guardianId: r.guardianId } },
        create: { schoolId: ctx.schoolId, noticeId: m.sourceId, guardianId: r.guardianId, via: "whatsapp", firstSeenAt: at },
        update: {},
      });
    }
  }
  return updated;
}

/** Cancels a scheduled message before it goes. The credits come back. */
export async function cancelScheduled(tx: Tx, ctx: SchoolContext, messageId: string) {
  const msg = await tx.message.findUnique({ where: { id: messageId } });
  if (!msg) throw new MessagingProblem("This message was not found.");
  const changed = await tx.message.updateMany({ where: { id: messageId, status: "SCHEDULED" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: ctx.userId } });
  if (changed.count === 0) throw new MessagingProblem("This message has already gone, so it cannot be cancelled. Send a correction message instead.");
  const rows = await tx.messageRecipient.findMany({ where: { messageId, status: "QUEUED" }, select: { channel: true, credits: true } });
  const back: Record<string, number> = {};
  for (const r of rows) back[r.channel] = (back[r.channel] ?? 0) + r.credits;
  for (const [ch, n] of Object.entries(back)) await returnCredits(tx, ctx, ch as Channel, n, `Cancelled: ${msg.title ?? msg.audienceLabel}`, messageId);
  await tx.messageRecipient.updateMany({ where: { messageId, status: "QUEUED" }, data: { status: "FAILED", failReason: CANCELLED_REASON, failedAt: new Date(), credits: 0 } });
  await writeAudit(tx, ctx, { action: "cancelled-message", recordType: "Message", recordId: messageId, before: { status: "SCHEDULED", scheduledAt: msg.scheduledAt?.toISOString() ?? null }, after: { status: "CANCELLED" } });
}

/**
 * Failed recipients that may still be retried on the same channel. People
 * no channel could carry it to ("Not sent") are not among them: the same
 * channel still cannot carry it, so they are resent by the best channel.
 */
export async function retryableFailures(tx: Tx, ctx: SchoolContext, messageId: string) {
  const { retryLimit } = await messageSettings(tx, ctx);
  // A one-time code is never sent again (QA SEC-01).
  const m = await tx.message.findUnique({ where: { id: messageId }, select: { messageType: true } });
  if (m && isCodeMessage(m)) return { retryLimit, rows: [], overLimit: 0, notSent: 0 };
  const rows = await tx.messageRecipient.findMany({ where: { messageId, status: "FAILED", NOT: [{ failReason: CANCELLED_REASON }, { failReason: { startsWith: NOT_SENT } }] } });
  const notSent = await tx.messageRecipient.count({ where: { messageId, status: "FAILED", failReason: { startsWith: NOT_SENT } } });
  return { retryLimit, rows: rows.filter((r) => r.attempts <= retryLimit), overLimit: rows.filter((r) => r.attempts > retryLimit).length, notSent };
}

/** Retry failed: puts failed recipients back in the queue, up to the retry limit. */
export async function retryFailed(tx: Tx, ctx: SchoolContext, messageId: string) {
  const msg = await tx.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.status === "CANCELLED") throw new MessagingProblem("This message was cancelled, so it cannot be retried.");
  if (isCodeMessage(msg)) throw new MessagingProblem(CODE_NOT_RESENT);
  const { rows, retryLimit } = await retryableFailures(tx, ctx, messageId);
  if (rows.length === 0) throw new MessagingProblem(`Nothing to retry. Failed messages can be retried up to ${retryLimit} times (Message Settings). People who were not sent it can be resent by another channel.`);
  // A channel in test mode sends nothing and uses no credits.
  const testOn = await testModeChannels(tx, ctx);
  const cost = (r: { channel: string; text: string }) => (testOn.has(r.channel as Channel) ? 0 : creditsFor(r.channel as Channel, r.text));
  const needs: Record<string, number> = {};
  for (const r of rows) if (PAID_CHANNELS.has(r.channel as Channel) && cost(r)) needs[r.channel] = (needs[r.channel] ?? 0) + cost(r);
  const have = await creditBalances(tx, ctx);
  for (const [ch, n] of Object.entries(needs)) {
    if (n > have[ch as "sms" | "whatsapp"]) throw new MessagingProblem(`Retrying needs ${n} ${ch === "sms" ? "SMS" : "WhatsApp"} credits. You have ${have[ch as "sms" | "whatsapp"]}. Buy more from DREAM TEAM support.`);
  }
  const now = new Date();
  for (const r of rows) {
    await tx.messageRecipient.update({
      where: { id: r.id },
      data: { status: "QUEUED", failReason: null, failedAt: null, queuedAt: now, credits: cost(r), history: historyWith(r.history, { at: now.toISOString(), status: "QUEUED", note: "Retry" }) },
    });
  }
  for (const [ch, n] of Object.entries(needs)) await spendCredits(tx, ctx, ch as Channel, n, `Retry: ${msg.title ?? msg.audienceLabel}`, msg.id);
  await tx.message.update({ where: { id: msg.id }, data: { status: "QUEUED" } });
  const round = `r${now.getTime()}`;
  await enqueue(tx, ctx, DELIVER_JOB, `deliver:${msg.id}:${round}:0`, { messageId: msg.id, round, chunk: 0 });
  await writeAudit(tx, ctx, { action: "retried-message", recordType: "Message", recordId: msg.id, after: { recipients: rows.length } });
  return rows.length;
}

/**
 * SMS backup (00-global.md §8): a fee, attendance or result message that
 * failed, or was not read within the wait time, goes once more by SMS.
 * At most once per message per person (backupOfId is unique). Skipped when
 * credits run out.
 */
export async function runSmsBackup(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const settings = await messageSettings(tx, ctx);
  const since = new Date(now.getTime() - 3 * 24 * 3600_000);
  const messages = await tx.message.findMany({ where: { schoolId: ctx.schoolId, smsBackup: true, status: { in: ["QUEUED", "SENT"] }, createdAt: { gte: since }, backupTemplateId: { not: null } } });
  let made = 0;
  // SMS in test mode sends nothing, so the backup SMS uses no credits.
  const smsTest = messages.length ? (await testModeChannels(tx, ctx)).has("sms") : false;
  for (const m of messages) {
    const type = m.messageType as BackupType;
    const rule = settings.smsBackup[type];
    // A rule turned off later still honours what the sender asked for at the time.
    const waitMs = (rule?.waitMinutes ?? 120) * 60_000;
    const versions = (await currentVersions(tx, ctx, m.backupTemplateId!)).filter((v) => v.dltTemplateId);
    if (!versions.length) continue;
    const due = await tx.messageRecipient.findMany({
      where: {
        messageId: m.id,
        isBackup: false,
        channel: { not: "sms" },
        recipientType: "guardian",
        OR: [
          { status: "FAILED", NOT: [{ failReason: CANCELLED_REASON }, { failReason: { startsWith: NOT_SENT } }] },
          { status: { in: ["SENT", "DELIVERED"] }, sentAt: { lt: new Date(now.getTime() - waitMs) } },
        ],
      },
    });
    if (!due.length) continue;
    const already = new Set((await tx.messageRecipient.findMany({ where: { backupOfId: { in: due.map((d) => d.id) } }, select: { backupOfId: true } })).map((x) => x.backupOfId));
    let balance = (await creditBalances(tx, ctx)).sms;
    for (const r of due) {
      if (already.has(r.id)) continue;
      const phone = r.address.replace(/\D/g, "");
      const target = r.channel === "whatsapp" ? phone : (await tx.guardian.findUnique({ where: { id: r.guardianId! }, select: { phone: true } }))?.phone ?? "";
      if (!/^\d{10}$/.test(target)) continue;
      const v = versions.find((x) => x.language === r.language) ?? versions.find((x) => x.language === "en") ?? versions[0];
      const out = render(v.body, r.values as Record<string, string>);
      if (!out.ok) continue;
      const cost = smsTest ? 0 : creditsFor("sms", out.text);
      if (cost > balance) break;
      balance -= cost;
      const reason = r.status === "FAILED" ? `${CHANNEL_LABEL[r.channel as Channel]} failed: ${r.failReason ?? "not delivered"}` : `Not read within ${Math.round(waitMs / 60_000)} minutes`;
      await tx.messageRecipient.create({
        data: {
          schoolId: ctx.schoolId, messageId: m.id, recipientType: r.recipientType, guardianId: r.guardianId, studentId: r.studentId, staffId: r.staffId,
          name: r.name, description: r.description, channel: "sms", address: target, language: v.language, templateVersionId: v.id, values: r.values ?? {},
          text: out.text, credits: cost, isBackup: true, backupOfId: r.id, backupReason: reason,
          history: [{ at: now.toISOString(), status: "QUEUED", note: `Sent by SMS backup: ${reason}` }],
        },
      });
      await spendCredits(tx, ctx, "sms", cost, `SMS backup for ${r.name}`, m.id);
      made++;
    }
    const round = `b${Math.floor(now.getTime() / 60_000)}`;
    await enqueue(tx, ctx, DELIVER_JOB, `deliver:${m.id}:${round}:0`, { messageId: m.id, round, chunk: 0 });
  }
  return made;
}
