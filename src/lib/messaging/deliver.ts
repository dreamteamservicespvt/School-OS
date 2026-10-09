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
import { CHANNEL_LABEL, channelSecrets, channelSetups, type Channel, type ProviderChannel } from "./channels";
import { creditBalances, creditsFor, PAID_CHANNELS, returnCredits, useCredits } from "./credits";
import { providerFor, type Outgoing, type Provider, type SendResult } from "./providers";
import { DELIVER_JOB, MessagingProblem } from "./send";
import { messageSettings, type BackupType } from "./settings";
import { currentVersions, render } from "./templates";

/** Stop starting new sends after this long, so a job always finishes within its transaction time. */
const RUN_BUDGET_MS = 6_000;
const BATCH = 25;
const IN_FLIGHT = 8;
/** A recipient left in Sending longer than this lost its result. */
const STALE_MS = 10 * 60_000;

const RANK: Record<DeliveryStatus, number> = { QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4, FAILED: 5 };

type HistoryLine = { at: string; status: string; note?: string | null };
const historyWith = (h: unknown, line: HistoryLine) => [...((Array.isArray(h) ? h : []) as HistoryLine[]), line].slice(-30) as unknown as Prisma.InputJsonValue;

type Claimed = Prisma.MessageRecipientGetPayload<{ include: { message: { select: { title: true; attachmentFileIds: true } } } }>;

type Context = {
  providers: Partial<Record<ProviderChannel, Provider>>;
  dlt: { entityId: string | null; header: string | null };
  versions: Map<string, { whatsappName: string | null; whatsappStatus: string | null; variables: string[]; dltTemplateId: string | null }>;
  attachments: Map<string, { filename: string; content: Buffer; contentType: string }[]>;
};

async function loadContext(ctx: SchoolContext): Promise<Context> {
  return withSchool(ctx, async (tx) => {
    const setups = await channelSetups(tx, ctx);
    const providers: Context["providers"] = {};
    for (const c of ["whatsapp", "sms", "email"] as const) providers[c] = providerFor(setups[c], await channelSecrets(tx, ctx, c));
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
    return { providers, dlt: { entityId: school.smsDltEntityId, header: school.smsSenderHeader }, versions: new Map(), attachments: new Map() };
  });
}

async function outgoingFor(tx: Tx, ctx: SchoolContext, r: Claimed, c: Context): Promise<Outgoing> {
  let v = r.templateVersionId ? c.versions.get(r.templateVersionId) : undefined;
  if (r.templateVersionId && !v) {
    const row = await tx.templateVersion.findUnique({ where: { id: r.templateVersionId }, select: { whatsappName: true, whatsappStatus: true, variables: true, dltTemplateId: true } });
    if (row) { v = row; c.versions.set(r.templateVersionId, row); }
  }
  const values = (r.values ?? {}) as Record<string, string>;
  const out: Outgoing = { channel: r.channel as Outgoing["channel"], to: r.address, text: r.text, subject: r.message.title };
  if (r.channel === "sms") Object.assign(out, { dltTemplateId: v?.dltTemplateId ?? null, dltEntityId: c.dlt.entityId, senderHeader: c.dlt.header });
  if (r.channel === "whatsapp" && v?.whatsappStatus === "APPROVED" && v.whatsappName) {
    out.whatsappTemplate = { name: v.whatsappName, language: r.language, params: v.variables.map((k) => values[k] ?? "") };
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
      const rows = await t.messageRecipient.findMany({ where: { messageId: msg.id, status: "QUEUED" }, take: BATCH, orderBy: { queuedAt: "asc" }, include: { message: { select: { title: true, attachmentFileIds: true } } } });
      const now = new Date();
      const mine: Claimed[] = [];
      for (const r of rows) {
        const got = await t.messageRecipient.updateMany({ where: { id: r.id, status: "QUEUED" }, data: { status: "SENDING", lockedAt: now, attempts: { increment: 1 } } });
        if (got.count === 1) mine.push(r);
      }
      return mine;
    });
    if (batch.length === 0) break;

    // 2. Call the providers, outside any transaction.
    const prepared = await withSchool(ctx, async (t) => Promise.all(batch.map(async (r) => ({ r, out: r.channel === "app" ? null : await outgoingFor(t, ctx, r, c) }))));
    const results = await inPool(prepared, IN_FLIGHT, async ({ r, out }): Promise<SendResult> => {
      if (!out) return { ok: true, providerMessageId: `app-${r.id}`, status: "DELIVERED" };
      const provider = c.providers[r.channel as ProviderChannel];
      if (!provider) return { ok: false, retryable: false, reason: `${CHANNEL_LABEL[r.channel as Channel] ?? r.channel} is not connected.` };
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
        const { r } = prepared[i];
        const res = results[i];
        if (res.ok) {
          sent++;
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
              history: historyWith(r.history, { at: now.toISOString(), status: res.status }),
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
        } else if (res.retryable && r.attempts < 3) {
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
    await tx.message.updateMany({ where: { id: msg.id, status: { in: ["QUEUED", "SCHEDULED"] } }, data: { status: "SENT", sentAt: new Date() } });
  }
  return { sent, failed, left };
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
  await tx.messageRecipient.updateMany({ where: { messageId, status: "QUEUED" }, data: { status: "FAILED", failReason: "Cancelled before it was sent.", failedAt: new Date(), credits: 0 } });
  await writeAudit(tx, ctx, { action: "cancelled-message", recordType: "Message", recordId: messageId, before: { status: "SCHEDULED", scheduledAt: msg.scheduledAt?.toISOString() ?? null }, after: { status: "CANCELLED" } });
}

/** Failed recipients that may still be retried on the same channel. */
export async function retryableFailures(tx: Tx, ctx: SchoolContext, messageId: string) {
  const { retryLimit } = await messageSettings(tx, ctx);
  const rows = await tx.messageRecipient.findMany({ where: { messageId, status: "FAILED", NOT: { failReason: "Cancelled before it was sent." } } });
  return { retryLimit, rows: rows.filter((r) => r.attempts <= retryLimit), overLimit: rows.filter((r) => r.attempts > retryLimit).length };
}

/** Retry failed: puts failed recipients back in the queue, up to the retry limit. */
export async function retryFailed(tx: Tx, ctx: SchoolContext, messageId: string) {
  const msg = await tx.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.status === "CANCELLED") throw new MessagingProblem("This message was cancelled, so it cannot be retried.");
  const { rows, retryLimit } = await retryableFailures(tx, ctx, messageId);
  if (rows.length === 0) throw new MessagingProblem(`Nothing to retry. Failed messages can be retried up to ${retryLimit} times (Message Settings).`);
  const needs: Record<string, number> = {};
  for (const r of rows) if (PAID_CHANNELS.has(r.channel as Channel)) needs[r.channel] = (needs[r.channel] ?? 0) + creditsFor(r.channel as Channel, r.text);
  const have = await creditBalances(tx, ctx);
  for (const [ch, n] of Object.entries(needs)) {
    if (n > have[ch as "sms" | "whatsapp"]) throw new MessagingProblem(`Retrying needs ${n} ${ch === "sms" ? "SMS" : "WhatsApp"} credits. You have ${have[ch as "sms" | "whatsapp"]}. Top up in Settings, SMS, WhatsApp & Email.`);
  }
  const now = new Date();
  for (const r of rows) {
    await tx.messageRecipient.update({
      where: { id: r.id },
      data: { status: "QUEUED", failReason: null, failedAt: null, queuedAt: now, credits: creditsFor(r.channel as Channel, r.text), history: historyWith(r.history, { at: now.toISOString(), status: "QUEUED", note: "Retry" }) },
    });
  }
  for (const [ch, n] of Object.entries(needs)) await useCredits(tx, ctx, ch as Channel, n, `Retry: ${msg.title ?? msg.audienceLabel}`, msg.id);
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
          { status: "FAILED", NOT: { failReason: "Cancelled before it was sent." } },
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
      const cost = creditsFor("sms", out.text);
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
      await useCredits(tx, ctx, "sms", cost, `SMS backup for ${r.name}`, m.id);
      made++;
    }
    const round = `b${Math.floor(now.getTime() / 60_000)}`;
    await enqueue(tx, ctx, DELIVER_JOB, `deliver:${m.id}:${round}:0`, { messageId: m.id, round, chunk: 0 });
  }
  return made;
}
