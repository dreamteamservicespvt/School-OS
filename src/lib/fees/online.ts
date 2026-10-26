// Online fee payments (06 §2 Collect Fee, A8): payment links sent by message,
// the Pay button on Parent Link, and the UPI QR at the counter all make a
// Payment Link. The parent pays through Razorpay Checkout. A payment is
// posted only when the gateway confirms it: the Checkout signature or the
// signed webhook, whichever comes first. The gateway's payment id is unique,
// so a second confirmation for the same payment does nothing.
import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PaymentLink, PaymentLinkOrder, PaymentSource } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { notify } from "../notifications";
import { requestApproval } from "../approvals";
import { createOrder, fetchOrderPayments, notesOf, RazorpayProblem, verifyPaymentSignature, type RazorpayCredentials } from "../payments/razorpay";
import { linkedAccountFor, razorpayCredentials } from "../payments/gateways";
import { addDays, DAY_MS, todayIn } from "../staff/dates";
import { MoneyProblem } from "./problem";
import { DUE_WINDOW_DAYS, lockDues, openDues, studentCard } from "./dues";
import { featureOn, feeSettings, gatewayFor } from "./settings";
import { allocate, finishPosting, notifyOnlinePayment } from "./collect";
import { feeMessageInput, planMessage, sendMessage } from "./notify-parents";
import { appUrl, payLinkTokenFor } from "../parent-link/token";
import { mainBankAccount } from "../finance/settings";

const ZERO = BigInt(0);

/** A link is good for 7 days (inferred). */
export const LINK_DAYS = 7;
/** An open Parent Link payment is used again for the same fees only while it has at least this long left (inferred: 1 hour). */
export const REUSE_LEFT_MS = 60 * 60 * 1000;
/** Online payments not confirmed within this time are flagged on the Fee Dashboard (A8, inferred 30 minutes). */
export const CONFIRM_WITHIN_MS = 30 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gateway events and checks that mean the money was taken (payment.authorized does not: it may never be captured). */
export const CONFIRMED_EVENTS = ["payment.captured", "order.paid", "checkout.verified", "reconcile.captured", "matched-by-hand"];

type Payer = { contact: string | null; email: string | null; method: string | null };

/**
 * The Payment Link a gateway order belongs to: any order ever made for it
 * (Payment Link Order), the order it holds now, or else our own reference in
 * the order's notes (school_os_link), only for this school.
 */
export async function linkForOrder(tx: Tx, ctx: SchoolContext, orderId: string | null, notes?: Record<string, string>): Promise<{ link: PaymentLink; order: PaymentLinkOrder | null } | null> {
  if (orderId) {
    const order = await tx.paymentLinkOrder.findFirst({ where: { gatewayOrderId: orderId } });
    const byOrder = order ? await tx.paymentLink.findFirst({ where: { id: order.paymentLinkId } }) : null;
    if (byOrder) return { link: byOrder, order };
    const current = await tx.paymentLink.findFirst({ where: { gatewayOrderId: orderId } });
    if (current) return { link: current, order: null };
  }
  const ref = notes?.school_os_link;
  if (ref && UUID.test(ref) && (!notes?.school_os_school || notes.school_os_school === ctx.schoolId)) {
    const link = await tx.paymentLink.findFirst({ where: { id: ref } });
    if (link) return { link, order: null };
  }
  return null;
}

/** People who look after online fee payments: the Accountants (the same people told about each online payment). */
export async function feeDesk(tx: Tx, ctx: SchoolContext) {
  const people = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: "accountant", isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  });
  return [...new Set(people.map((p) => p.userLoginId))];
}

export function payPath(schoolId: string, token: string) {
  return `/pay/${schoolId}/${token}`;
}

/**
 * Makes a payment link for chosen rows of a student. The gateway is the one
 * set for the student's class in Fee Settings. Returns the secret token
 * (shown once, in the link) and the link record.
 *
 * With reuseOpen (the Pay button on Parent Link), the guardian's open link
 * for exactly the same rows and amount is used again instead of making a new
 * one each tap. Its secret is worked out from its id with the server key
 * (like the Parent Link's own), so it can be given again; only its hash is kept.
 */
export async function createPaymentLink(
  tx: Tx,
  ctx: SchoolContext,
  input: { studentId: string; dueIds: string[]; guardianId?: string | null; source: PaymentSource; channel?: string | null; reuseOpen?: boolean },
) {
  const card = await studentCard(tx, ctx, input.studentId);
  if (!card) throw new MoneyProblem("This student was not found.");
  const open = await openDues(tx, input.studentId);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const horizon = addDays(todayIn(school.timeZone), DUE_WINDOW_DAYS);
  const chosen = input.dueIds.length ? open.filter((d) => input.dueIds.includes(d.id)) : open.filter((d) => d.dueDate <= horizon);
  if (!chosen.length) throw new MoneyProblem("Nothing is due on the chosen rows.", "dueIds");
  const amount = chosen.reduce((s, d) => s + d.balancePaise, ZERO);
  if (amount < BigInt(100)) throw new MoneyProblem("An online payment must be at least ₹1.", "dueIds");
  const gateway = await gatewayFor(tx, ctx, card.classId);
  if (!gateway) throw Object.assign(new MoneyProblem("No payment gateway is switched on. DREAM TEAM connects Razorpay for the school; tell DREAM TEAM support.", undefined, { href: "/settings/payment-gateways", label: "Open Payment Gateways" }), { code: "no-gateway" });
  const guardianId = input.guardianId ?? card.primaryGuardian?.id ?? null;
  if (input.reuseOpen && guardianId) {
    const rows = chosen.map((d) => d.id).sort().join(",");
    const open = await tx.paymentLink.findMany({
      where: {
        studentId: input.studentId, guardianId, source: input.source, status: { in: ["SENT", "FAILED"] }, paymentId: null,
        amountPaise: amount, gatewayAccountId: gateway.id, expiresAt: { gt: new Date(Date.now() + REUSE_LEFT_MS) },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    // Only a link whose secret can be worked out again (links made before this could not).
    const same = open.find((l) => [...l.dueIds].sort().join(",") === rows && l.tokenHash === hashToken(payLinkTokenFor(l.id)));
    if (same) return { link: same, token: payLinkTokenFor(same.id), card, amount, reused: true };
  }
  const id = randomUUID();
  const token = input.reuseOpen ? payLinkTokenFor(id) : randomBytes(24).toString("base64url");
  const link = await tx.paymentLink.create({
    data: {
      id,
      schoolId: ctx.schoolId,
      studentId: input.studentId,
      guardianId,
      dueIds: chosen.map((d) => d.id),
      amountPaise: amount,
      gatewayAccountId: gateway.id,
      tokenHash: hashToken(token),
      source: input.source,
      channel: input.channel ?? null,
      expiresAt: new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000),
      createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Payment Link", recordId: link.id, after: { student: card.name, amount: formatRupees(amount), rows: chosen.length, source: input.source } });
  return { link, token, card, amount, reused: false };
}

/** Sends a payment link to the parent by WhatsApp or SMS. Returns what happened. */
export async function sendPaymentLink(tx: Tx, ctx: SchoolContext, input: { studentId: string; dueIds: string[]; channel: string }) {
  if (input.channel !== "whatsapp" && input.channel !== "email") throw new MoneyProblem("Send payment links by WhatsApp or email. SMS needs an approved template; use Fee reminders with the link instead.", "channel");
  const made = await createPaymentLink(tx, ctx, { studentId: input.studentId, dueIds: input.dueIds, source: "LINK", channel: input.channel });
  const url = `${appUrl()}${payPath(ctx.schoolId, made.token)}`;
  const send = feeMessageInput({
    studentIds: [input.studentId],
    channel: input.channel,
    templateId: null,
    text: `Dear {guardian_name}, please pay {due_amount} school fees for {student_name} ({class}) online: {link} . The link works for ${LINK_DAYS} days. - {school_name}`,
    perStudent: { [input.studentId]: { due_amount: formatRupees(made.amount), link: url } },
    trigger: "Payment link",
    source: { type: "Payment Link", id: made.link.id },
    idempotencyKey: `payment-link:${made.link.id}`,
  });
  const plan = await planMessage(tx, ctx, send);
  if (plan.problems.length) throw new MoneyProblem(plan.problems[0]);
  if (plan.creditProblem) throw new MoneyProblem(plan.creditProblem);
  if (!plan.rows.length) {
    const why = plan.skipped.map((s) => s.reason.toLowerCase()).join(", ") || "no parent to send to";
    throw new MoneyProblem(`The link could not be sent to ${made.card.name}'s parents: ${why}. Copy the link and share it yourself, or fix the contact in Student Management.`);
  }
  const result = await sendMessage(tx, ctx, send);
  await tx.paymentLink.update({ where: { id: made.link.id }, data: { sentTo: plan.rows.map((r) => r.address).join(", ").slice(0, 200) } });
  return { ...made, url, result, people: plan.people };
}

/** Finds a link by its secret token. */
export async function linkByToken(tx: Tx, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return tx.paymentLink.findUnique({ where: { tokenHash: hashToken(token) } });
}

/** What the public pay page shows. */
export async function payPageData(tx: Tx, ctx: SchoolContext, token: string) {
  const link = await linkByToken(tx, token);
  if (!link) return null;
  const card = await studentCard(tx, ctx, link.studentId);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, logoFileId: true, phone: true, timeZone: true } });
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: link.dueIds } }, orderBy: { dueDate: "asc" } });
  const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } } });
  const stillDue = dues.filter((d) => d.state === "OPEN").reduce((s, d) => s + (d.balancePaise > ZERO ? d.balancePaise : ZERO), ZERO);
  const payment = link.paymentId ? await tx.payment.findUnique({ where: { id: link.paymentId } }) : null;
  const receipt = payment ? await tx.receipt.findUnique({ where: { paymentId: payment.id } }) : null;
  const expired = link.expiresAt < new Date() && link.status === "SENT";
  return {
    link,
    school,
    student: card ? { name: card.name, classSection: card.classSection, admissionNo: card.admissionNo } : null,
    rows: dues.map((d) => ({ id: d.id, head: heads.find((h) => h.id === d.feeHeadId)?.name ?? "Fees", label: d.label, dueDate: d.dueDate, balance: d.balancePaise, paid: d.balancePaise <= ZERO || d.state !== "OPEN" })),
    stillDue,
    payment,
    receipt,
    expired,
  };
}

/** Splits an online payment to the bank accounts of its fee heads (Razorpay Route) when fees go into different accounts. */
async function transfersFor(tx: Tx, ctx: SchoolContext, gatewayId: string, dueIds: string[]) {
  if (!(await featureOn(tx, ctx, "fee-bank-accounts"))) return undefined;
  const main = await mainBankAccount(tx, ctx);
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: dueIds }, state: "OPEN" } });
  const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } } });
  const byAccount = new Map<string, bigint>();
  for (const d of dues) {
    const acc = heads.find((h) => h.id === d.feeHeadId)?.bankAccountId ?? main.id;
    if (acc === main.id || d.balancePaise <= ZERO) continue;
    byAccount.set(acc, (byAccount.get(acc) ?? ZERO) + d.balancePaise);
  }
  const transfers: { account: string; amountPaise: bigint; notes: Record<string, string> }[] = [];
  for (const [acc, amount] of byAccount) {
    const linked = await linkedAccountFor(tx, gatewayId, acc);
    if (linked) transfers.push({ account: linked.linkedAccountId, amountPaise: amount, notes: { school_os_bank_account: acc } });
  }
  return transfers.length ? transfers : undefined;
}

export type CheckoutStart = { keyId: string; orderId: string; amountPaise: number; schoolName: string; description: string; prefill: { name: string; contact: string } };

/**
 * Starts Checkout for a link: makes the Razorpay order the first time (or
 * again when the amount changed) and returns what Checkout needs. Never the secret.
 */
export async function startCheckout(tx: Tx, ctx: SchoolContext, token: string, deps: { creds?: RazorpayCredentials; fetchImpl?: typeof fetch } = {}): Promise<CheckoutStart> {
  const link = await linkByToken(tx, token);
  if (!link) throw new MoneyProblem("This payment link is not valid. Ask the school for a new one.");
  if (link.status === "PAID") throw new MoneyProblem("This link is already paid. Thank you.");
  if (link.status === "CANCELLED") throw new MoneyProblem("This payment link was cancelled by the school. Ask the school for a new one.");
  if (link.expiresAt < new Date()) throw new MoneyProblem("This payment link has expired. Ask the school for a new one.");
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: link.dueIds }, state: "OPEN" } });
  const amount = dues.reduce((s, d) => s + (d.balancePaise > ZERO ? d.balancePaise : ZERO), ZERO);
  if (amount <= ZERO) throw new MoneyProblem("These fees are already paid. Nothing more is due on this link.");
  const creds = deps.creds ?? (await razorpayCredentials(tx, link.gatewayAccountId));
  if (!creds) throw new MoneyProblem("Online payment is not set up at the school right now. Please pay at the school office.");
  const card = await studentCard(tx, ctx, link.studentId);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true } });
  let orderId = link.gatewayOrderId;
  if (!orderId || amount !== link.amountPaise) {
    const order = await createOrder(creds, {
      amountPaise: amount,
      receipt: `link_${link.id.slice(0, 30)}`,
      notes: { school_os_school: ctx.schoolId, school_os_link: link.id, student: card?.name ?? "" },
      transfers: await transfersFor(tx, ctx, link.gatewayAccountId, link.dueIds),
    }, deps.fetchImpl);
    orderId = order.id;
    // Every order is kept: a payment on an older one (an old tab) still finds this link.
    await tx.paymentLinkOrder.create({ data: { schoolId: ctx.schoolId, paymentLinkId: link.id, gatewayOrderId: order.id, amountPaise: amount } });
  }
  await tx.paymentLink.update({ where: { id: link.id }, data: { gatewayOrderId: orderId, amountPaise: amount, attempts: { increment: 1 }, lastAttemptAt: new Date() } });
  return {
    keyId: creds.keyId,
    orderId,
    amountPaise: Number(amount),
    schoolName: school.name,
    description: card ? `School fees for ${card.name} (${card.classSection})` : "School fees",
    prefill: { name: card?.primaryGuardian?.name ?? "", contact: card?.primaryGuardian?.phone ?? "" },
  };
}

/** After Checkout: checks the signature, then posts the payment (once). */
export async function confirmCheckout(tx: Tx, ctx: SchoolContext, token: string, input: { paymentId: string; orderId: string; signature: string }, deps: { creds?: RazorpayCredentials } = {}) {
  const link = await linkByToken(tx, token);
  // Any order made for this link counts, not only the newest one.
  const order = link ? await tx.paymentLinkOrder.findFirst({ where: { paymentLinkId: link.id, gatewayOrderId: input.orderId } }) : null;
  if (!link || (!order && link.gatewayOrderId !== input.orderId)) throw new MoneyProblem("This payment could not be matched to the link. If money was taken, the school will see it once Razorpay confirms it.");
  const creds = deps.creds ?? (await razorpayCredentials(tx, link.gatewayAccountId));
  if (!creds || !verifyPaymentSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature }, creds.keySecret)) {
    await writeAudit(tx, ctx, { action: "checkout-refused", recordType: "Payment Link", recordId: link.id, after: { reason: "Signature did not match", paymentId: input.paymentId } });
    throw new MoneyProblem("Waiting for the gateway to confirm. If money was taken, the receipt appears here once Razorpay confirms it.");
  }
  // The amount is the order's (what Checkout charged), so the reconciliation log has it too.
  const amount = order?.amountPaise ?? link.amountPaise;
  return confirmGatewayPayment(tx, ctx, { gatewayAccountId: link.gatewayAccountId, gatewayPaymentId: input.paymentId, orderId: input.orderId, amountPaise: Number(amount), event: "checkout.verified" });
}

/**
 * A8: a verified confirmation from the gateway. Posts the payment against the
 * link's rows, once per gateway payment id. Money for rows already paid
 * meanwhile is held as advance. Records every confirmation for reconciliation.
 */
export async function confirmGatewayPayment(
  tx: Tx,
  ctx: SchoolContext,
  input: {
    gatewayAccountId: string; gatewayPaymentId: string; orderId: string | null; amountPaise: number | null; event: string;
    notes?: Record<string, string>; payer?: Payer;
    /** Matched by hand to this link (the office chose the student). */
    linkId?: string;
  },
) {
  const details = input.payer && (input.payer.contact || input.payer.email || input.payer.method) ? { contact: input.payer.contact, email: input.payer.email, method: input.payer.method } : undefined;
  const log = async (outcome: string, paymentId: string | null) =>
    tx.gatewayTransaction.create({
      data: { schoolId: ctx.schoolId, gatewayAccountId: input.gatewayAccountId, event: input.event, gatewayPaymentId: input.gatewayPaymentId, gatewayOrderId: input.orderId, amountPaise: input.amountPaise === null ? null : BigInt(input.amountPaise), outcome, paymentId, details },
    });
  const alreadyPosted = async () => {
    const done = await tx.payment.findFirst({ where: { mode: "GATEWAY", reference: input.gatewayPaymentId, status: { not: "FAILED" } } });
    if (!done) return null;
    await log("already-posted", done.id);
    const receipt = await tx.receipt.findUnique({ where: { paymentId: done.id } });
    return { paymentId: done.id, receiptNo: receipt?.number ?? null, created: false };
  };
  const before = await alreadyPosted();
  if (before) return before;
  const found = input.linkId
    ? { link: await tx.paymentLink.findFirst({ where: { id: input.linkId } }), order: null }
    : await linkForOrder(tx, ctx, input.orderId, input.notes);
  const link = found?.link ?? null;
  if (!link) {
    await log("unmatched", null);
    // The money was taken but nobody knows for whom: the office matches it on the Fee Dashboard.
    for (const to of await feeDesk(tx, ctx)) {
      await notify(tx, ctx, {
        to, type: "fee-online", link: "/fee-management/dashboard#online-check", groupKey: "fee-online-unmatched",
        text: `An online payment of ${input.amountPaise === null ? "an unknown amount" : formatRupees(input.amountPaise)} came in from Razorpay and could not be matched to a student. Post it on the Fee Dashboard.`,
        mergedText: (n) => `${n} online payments could not be matched to a student. Post them on the Fee Dashboard.`,
      });
    }
    return { paymentId: null, receiptNo: null, created: false };
  }
  // Razorpay sends payment.captured and order.paid together, and retries: a second
  // confirmation waits here for the first, then finds it posted. (After a failed
  // attempt the confirmation has no unique gateway id, so this is the only guard.)
  await tx.$queryRaw`SELECT id FROM payment_link WHERE id = ${link.id}::uuid FOR UPDATE`;
  const waited = await alreadyPosted();
  if (waited) return waited;
  const existing = await tx.payment.findFirst({ where: { gatewayPaymentId: input.gatewayPaymentId } });
  // Read again under the lock: a link another payment already paid (two tabs, or paying again later).
  const paidTwice = Boolean((await tx.paymentLink.findUnique({ where: { id: link.id }, select: { paymentId: true } }))?.paymentId);
  const order = found?.order ?? null;
  const amount = input.amountPaise !== null ? BigInt(input.amountPaise) : order?.amountPaise ?? link.amountPaise;
  // The money taken is what is posted; a difference from the order is noted for the office.
  if (order && amount !== order.amountPaise) {
    await writeAudit(tx, ctx, { action: "amount-differs", recordType: "Payment Link", recordId: link.id, after: { gatewayPaymentId: input.gatewayPaymentId, order: formatRupees(order.amountPaise), paid: formatRupees(amount) } });
  }
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const now = new Date();
  await lockDues(tx, link.dueIds);
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: link.dueIds }, state: "OPEN" }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  const { lines, extra } = allocate(amount, dues);
  const total = dues.reduce((s, d) => s + (d.balancePaise > ZERO ? d.balancePaise : ZERO), ZERO);
  const data = {
    schoolId: ctx.schoolId,
    studentId: link.studentId,
    academicYearId: dues[0]?.academicYearId ?? null,
    amountPaise: amount,
    lateFeePaise: lines.filter((l) => dues.find((d) => d.id === l.dueId)?.kind === "LATE_FEE").reduce((s, l) => s + l.amountPaise, ZERO),
    advancePaise: extra,
    mode: "GATEWAY" as const,
    reference: input.gatewayPaymentId,
    paidAt: now,
    paymentDate: todayIn(school.timeZone, now),
    status: "POSTED" as const,
    source: link.source,
    isPartial: amount < total,
    gatewayAccountId: input.gatewayAccountId,
    gatewayPaymentId: input.gatewayPaymentId,
    gatewayOrderId: input.orderId,
    paymentLinkId: link.id,
    note: paidTwice ? "Paid twice: this payment link was already paid. The extra is held as advance; refund it from Concessions & Refunds if the parent asks."
      : link.channel === "matched" ? "Online payment, matched to the student by hand" : link.source === "PARENT_LINK" ? "Paid from Parent Link" : "Paid by payment link",
  };
  // A failed attempt with this id is replaced by its confirmation (it cannot be edited, so a new record is kept).
  const payment = existing
    ? await tx.payment.create({ data: { ...data, gatewayPaymentId: null, reference: input.gatewayPaymentId } })
    : await tx.payment.create({ data });
  if (lines.length) {
    const splitOn = await featureOn(tx, ctx, "fee-bank-accounts");
    const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } } });
    await tx.paymentAllocation.createMany({
      data: lines.map((l) => {
        const headId = dues.find((d) => d.id === l.dueId)!.feeHeadId;
        return { schoolId: ctx.schoolId, paymentId: payment.id, dueId: l.dueId, feeHeadId: headId, amountPaise: l.amountPaise, bankAccountId: splitOn ? heads.find((h) => h.id === headId)?.bankAccountId ?? null : null };
      }),
    });
  }
  const posted = await finishPosting(tx, ctx, payment.id, { settings: await feeSettings(tx, ctx), holdExtraAsAdvance: true });
  // A second payment on a link already paid (two tabs) is posted too, held as advance; the link keeps its first.
  await tx.paymentLink.updateMany({ where: { id: link.id, paymentId: null }, data: { status: "PAID", paymentId: payment.id } });
  await log("posted", payment.id);
  const card = await studentCard(tx, ctx, link.studentId);
  await notifyOnlinePayment(tx, ctx, payment, card?.name ?? "a student", link.source);
  if (paidTwice) {
    // Kept quietly as advance, a parent's double payment was easy to miss (docs/research/school-owner-pain-points.md, P0 item 3).
    for (const to of await feeDesk(tx, ctx)) {
      await notify(tx, ctx, {
        to, type: "fee-online", link: `/fee-management/payments/${payment.id}`, groupKey: `fee-paid-twice-${payment.id}`,
        text: `${card?.name ?? "A student"}'s fees were paid twice online: ${formatRupees(payment.amountPaise)} more came in on a link that was already paid. It is held as advance. Refund it from Concessions & Refunds if the parent asks.`,
      });
    }
    await log("paid-twice", payment.id);
  }
  return { paymentId: payment.id, receiptNo: posted.receiptNo, created: true };
}

/** A8: the gateway reported a failed payment. Recorded with no receipt and listed on the Fee Dashboard. */
export async function recordGatewayFailure(tx: Tx, ctx: SchoolContext, input: { gatewayAccountId: string; gatewayPaymentId: string; orderId: string | null; amountPaise: number | null; reason: string | null; notes?: Record<string, string> }) {
  const existing = await tx.payment.findFirst({ where: { gatewayPaymentId: input.gatewayPaymentId } });
  const link = (await linkForOrder(tx, ctx, input.orderId, input.notes))?.link ?? null;
  await tx.gatewayTransaction.create({
    data: { schoolId: ctx.schoolId, gatewayAccountId: input.gatewayAccountId, event: "payment.failed", gatewayPaymentId: input.gatewayPaymentId, gatewayOrderId: input.orderId, amountPaise: input.amountPaise === null ? null : BigInt(input.amountPaise), outcome: existing ? "ignored" : link ? "failed-recorded" : "unmatched", paymentId: existing?.id ?? null },
  });
  if (existing || !link) return null;
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const now = new Date();
  const failed = await tx.payment.create({
    data: {
      schoolId: ctx.schoolId, studentId: link.studentId, amountPaise: input.amountPaise === null ? link.amountPaise : BigInt(input.amountPaise), mode: "GATEWAY",
      reference: input.gatewayPaymentId, paidAt: now, paymentDate: todayIn(school.timeZone, now), status: "FAILED", source: link.source,
      gatewayAccountId: input.gatewayAccountId, gatewayPaymentId: input.gatewayPaymentId, gatewayOrderId: input.orderId, paymentLinkId: link.id,
      failureReason: input.reason?.slice(0, 300) ?? "The bank or card did not go through.",
    },
  });
  if (link.status === "SENT") await tx.paymentLink.update({ where: { id: link.id }, data: { status: "FAILED" } });
  await writeAudit(tx, ctx, { action: "failed", recordType: "Payment", recordId: failed.id, after: { gatewayPaymentId: input.gatewayPaymentId, reason: failed.failureReason } });
  return failed;
}

/** Marks links past their expiry as expired. */
export async function expireLinks(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const r = await tx.paymentLink.updateMany({ where: { schoolId: ctx.schoolId, status: { in: ["SENT", "FAILED"] }, expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  return r.count;
}

/** The school's own cancel of a link (e.g. sent for the wrong rows). */
export async function cancelLink(tx: Tx, ctx: SchoolContext, linkId: string) {
  const link = await tx.paymentLink.findFirst({ where: { id: linkId } });
  if (!link) throw new MoneyProblem("This payment link was not found.");
  if (link.status === "PAID") throw new MoneyProblem("This link is already paid. Cancel the payment instead.");
  await tx.paymentLink.update({ where: { id: link.id }, data: { status: "CANCELLED" } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Payment Link", recordId: link.id });
}

/**
 * Failed online payments and attempts not confirmed within 30 minutes, for the
 * Fee Dashboard. Checkouts opened where the gateway says no payment was made
 * (the parent closed it) are counted, not listed; failed attempts are listed
 * once, as failed payments.
 */
export async function failedOnline(tx: Tx, since: Date, only: { studentId?: { in: string[] } } = {}) {
  // `only`: the students of one campus (feeStudentFilter), for a person limited to one.
  const failed = await tx.payment.findMany({ where: { ...only, status: "FAILED", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 50 });
  const links = await tx.paymentLink.findMany({
    where: { ...only, status: { in: ["SENT", "FAILED"] }, attempts: { gt: 0 }, lastAttemptAt: { lt: new Date(Date.now() - CONFIRM_WITHIN_MS), gte: since }, paymentId: null },
    orderBy: { lastAttemptAt: "desc" },
    take: 100,
  });
  const failedLinkIds = new Set(failed.map((f) => f.paymentLinkId));
  const open = links.filter((l) => !failedLinkIds.has(l.id));
  const quiet = (l: { gatewayStatus: string | null }) => l.gatewayStatus === "no-payment" || l.gatewayStatus === "failed";
  return { failed, stuck: open.filter((l) => !quiet(l)).slice(0, 50), started: open.filter(quiet).length };
}

// ---------------------------------------------------------------- reconciliation (A8, 06 §3)

/** The reconcile job asks the gateway about a link this long after the last Checkout, then hourly, for 3 days. */
export const RECONCILE_AFTER_MS = 10 * 60 * 1000;
export const RECONCILE_AGAIN_MS = 60 * 60 * 1000;
export const RECONCILE_FOR_DAYS = 3;
/** Links asked about in one run (each question to Razorpay can take up to 10 seconds). */
export const RECONCILE_BATCH = 10;

type ReconcileDeps = { fetchImpl?: typeof fetch; creds?: RazorpayCredentials };

/**
 * Automatic reconciliation of online payments: for links where Checkout was
 * opened and no confirmation came, asks Razorpay what happened on each of the
 * link's orders. A captured payment is posted through the same posting as a
 * webhook (once per gateway payment id); a failed one is recorded with no
 * receipt; an authorised one waits for Razorpay to capture it. A link Razorpay
 * could not be asked about is tried again later, and one bad link never stops
 * the others.
 */
export async function reconcileOnlinePayments(tx: Tx, ctx: SchoolContext, now = new Date(), deps: ReconcileDeps = {}) {
  const links = await tx.paymentLink.findMany({
    where: {
      attempts: { gt: 0 },
      paymentId: null,
      status: { not: "PAID" },
      lastAttemptAt: { lt: new Date(now.getTime() - RECONCILE_AFTER_MS), gte: new Date(now.getTime() - RECONCILE_FOR_DAYS * DAY_MS) },
      OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - RECONCILE_AGAIN_MS) } }],
    },
    orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }, { lastAttemptAt: "asc" }],
    take: RECONCILE_BATCH,
  });
  const out = { checked: 0, posted: 0, notReached: 0 };
  for (const link of links) {
    await tx.$executeRawUnsafe("SAVEPOINT reconcile_link");
    try {
      const r = await reconcileLink(tx, ctx, link, deps);
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT reconcile_link");
      out.checked++;
      out.posted += r.posted;
    } catch (e) {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT reconcile_link");
      out.notReached++;
      await tx.paymentLink.update({ where: { id: link.id }, data: { checkedAt: now, gatewayStatus: "not-reached" } });
      if (!(e instanceof RazorpayProblem)) console.error(JSON.stringify({ level: "error", event: "gateway-reconcile-failed", linkId: link.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return out;
}

const STATUS_RANK: Record<string, number> = { "no-payment": 0, failed: 1, authorized: 2, posted: 3 };

async function reconcileLink(tx: Tx, ctx: SchoolContext, link: PaymentLink, deps: ReconcileDeps) {
  const creds = deps.creds ?? (await razorpayCredentials(tx, link.gatewayAccountId));
  if (!creds) throw new RazorpayProblem("This payment gateway is no longer set up.", "keys");
  const orders = await tx.paymentLinkOrder.findMany({ where: { paymentLinkId: link.id }, orderBy: { createdAt: "asc" } });
  const orderIds = [...new Set([...orders.map((o) => o.gatewayOrderId), ...(link.gatewayOrderId ? [link.gatewayOrderId] : [])])];
  let status = "no-payment";
  let posted = 0;
  const saw = (s: string) => { if (STATUS_RANK[s] > STATUS_RANK[status]) status = s; };
  for (const orderId of orderIds) {
    for (const p of await fetchOrderPayments(creds, orderId, deps.fetchImpl)) {
      if (p.status === "captured") {
        const done = await tx.payment.findFirst({ where: { mode: "GATEWAY", reference: p.id, status: { not: "FAILED" } }, select: { id: true } });
        if (!done) {
          const r = await confirmGatewayPayment(tx, ctx, {
            gatewayAccountId: link.gatewayAccountId, gatewayPaymentId: p.id, orderId, amountPaise: p.amount, event: "reconcile.captured", linkId: link.id,
            notes: notesOf(p.notes), payer: { contact: p.contact ?? null, email: p.email ?? null, method: p.method ?? null },
          });
          if (r.created) posted++;
        }
        saw("posted");
      } else if (p.status === "authorized") {
        saw("authorized");
      } else if (p.status === "failed") {
        const known = await tx.payment.findFirst({ where: { gatewayPaymentId: p.id }, select: { id: true } });
        if (!known) await recordGatewayFailure(tx, ctx, { gatewayAccountId: link.gatewayAccountId, gatewayPaymentId: p.id, orderId, amountPaise: p.amount, reason: p.error_description ?? null });
        saw("failed");
      }
    }
  }
  await tx.paymentLink.update({ where: { id: link.id }, data: { checkedAt: new Date(), gatewayStatus: status } });
  return { posted };
}

// ---------------------------------------------------------------- payments that matched no link

type GatewayDetails = { contact?: string | null; email?: string | null; method?: string | null; reference?: string | null; kind?: string | null };
export const detailsOf = (raw: unknown): GatewayDetails => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as GatewayDetails) : {});

/**
 * Online payments Razorpay confirmed that matched no Payment Link (and are not
 * admission fees), not posted since: the short list the Accountant posts by
 * hand on the Fee Dashboard. One row per gateway payment, newest first.
 */
export async function unmatchedOnline(tx: Tx, since: Date, take = 20) {
  const rows = await tx.gatewayTransaction.findMany({
    where: { outcome: "unmatched", event: { in: CONFIRMED_EVENTS }, receivedAt: { gte: since }, gatewayPaymentId: { not: null } },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  const payIds = [...new Set(rows.map((r) => r.gatewayPaymentId!))];
  const posted = new Set((await tx.payment.findMany({ where: { mode: "GATEWAY", reference: { in: payIds }, status: { not: "FAILED" } }, select: { reference: true } })).map((p) => p.reference));
  const orderIds = [...new Set(rows.map((r) => r.gatewayOrderId).filter((x): x is string => Boolean(x)))];
  const admission = new Set((await tx.applicationFeePayment.findMany({ where: { gatewayOrderId: { in: orderIds } }, select: { gatewayOrderId: true } })).map((a) => a.gatewayOrderId));
  const byPayment = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const id = r.gatewayPaymentId!;
    if (posted.has(id) || (r.gatewayOrderId && admission.has(r.gatewayOrderId))) continue;
    const had = byPayment.get(id);
    // Keep the row that says most: an amount and the payer's details (payment.captured has them, order.paid may not).
    if (!had || (had.amountPaise === null && r.amountPaise !== null) || (!had.details && r.details)) byPayment.set(id, r);
  }
  return [...byPayment.values()].slice(0, take).map((r) => ({ ...r, payer: detailsOf(r.details) }));
}

/** Students whose parent's phone is the one the payer used on Razorpay (a suggestion for matching by hand). */
export async function studentsForPayer(tx: Tx, contact: string | null | undefined) {
  const digits = (contact ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return [];
  const rows = await tx.student.findMany({
    where: { archivedAt: null, guardians: { some: { archivedAt: null, guardian: { phone: { endsWith: digits } } } } },
    select: { id: true, fullName: true, admissionNo: true },
    orderBy: { fullName: "asc" },
    take: 6,
  });
  return rows;
}

/**
 * Posts an online payment that matched no link to the student the office
 * chose, through the normal posting: receipt, dues, Day Book and the parent's
 * message, once per gateway payment id, with an audit entry. The money pays the
 * student's oldest dues first; anything over is held as advance.
 */
export async function postUnmatchedToStudent(tx: Tx, ctx: SchoolContext, input: { transactionId: string; studentId: string }) {
  const row = await tx.gatewayTransaction.findFirst({ where: { id: input.transactionId } });
  if (!row || row.outcome !== "unmatched" || !row.gatewayPaymentId || !CONFIRMED_EVENTS.includes(row.event)) throw new MoneyProblem("This online payment was not found, or Razorpay has not confirmed it.");
  if (row.amountPaise === null || row.amountPaise <= ZERO) throw new MoneyProblem("Razorpay did not say how much was paid, so it cannot be posted here. Check the payment in the Razorpay Dashboard.");
  const done = await tx.payment.findFirst({ where: { mode: "GATEWAY", reference: row.gatewayPaymentId, status: { not: "FAILED" } } });
  if (done) {
    const receipt = await tx.receipt.findUnique({ where: { paymentId: done.id } });
    throw new MoneyProblem(`This payment is already posted${receipt ? `, receipt ${receipt.number}` : ""}.`);
  }
  if (row.gatewayOrderId) {
    if (await tx.applicationFeePayment.count({ where: { gatewayOrderId: row.gatewayOrderId } })) throw new MoneyProblem("This is an admission application fee. It is in Admission Management, not in fees.");
    if (await linkForOrder(tx, ctx, row.gatewayOrderId)) throw new MoneyProblem("This payment's link has been found, so it is posted to that student automatically within 15 minutes.");
  }
  const card = await studentCard(tx, ctx, input.studentId);
  if (!card) throw new MoneyProblem("Choose the student this payment is for.", "studentId");
  const open = await openDues(tx, input.studentId);
  const link = await tx.paymentLink.create({
    data: {
      schoolId: ctx.schoolId, studentId: input.studentId, guardianId: card.primaryGuardian?.id ?? null, dueIds: open.map((d) => d.id), amountPaise: row.amountPaise,
      gatewayAccountId: row.gatewayAccountId, tokenHash: hashToken(randomBytes(24).toString("base64url")), source: "LINK", channel: "matched", expiresAt: new Date(), createdById: ctx.userId,
    },
  });
  if (row.gatewayOrderId) await tx.paymentLinkOrder.create({ data: { schoolId: ctx.schoolId, paymentLinkId: link.id, gatewayOrderId: row.gatewayOrderId, amountPaise: row.amountPaise } });
  const r = await confirmGatewayPayment(tx, ctx, { gatewayAccountId: row.gatewayAccountId, gatewayPaymentId: row.gatewayPaymentId, orderId: row.gatewayOrderId, amountPaise: Number(row.amountPaise), event: "matched-by-hand", linkId: link.id });
  if (!r.paymentId) throw new MoneyProblem("This payment could not be posted. Nothing was changed.");
  await writeAudit(tx, ctx, { action: "matched-by-hand", recordType: "Payment", recordId: r.paymentId, after: { gatewayPaymentId: row.gatewayPaymentId, orderId: row.gatewayOrderId, student: card.name, amount: formatRupees(row.amountPaise) } });
  return { paymentId: r.paymentId, receiptNo: r.receiptNo, amountPaise: row.amountPaise, student: card.name };
}

// ---------------------------------------------------------------- refunds and disputes made at the gateway

const REVERSAL_OUTCOMES = ["refund-reported", "dispute-reported"];

/**
 * A refund made in the Razorpay Dashboard, or a parent's bank disputing a
 * payment. Nothing is cancelled by itself (payments are cancelled only by a
 * person, with a reason): the event is kept for the office to check, the
 * Accountants are told, and on the Fee Dashboard one tap asks to cancel the
 * payment through Approvals. Each event is kept once, however often it comes.
 */
export async function recordGatewayReversal(tx: Tx, ctx: SchoolContext, input: { gatewayAccountId: string; event: string; kind: "refund" | "dispute"; gatewayPaymentId: string; orderId: string | null; reference: string | null; amountPaise: number | null }) {
  const seen = await tx.gatewayTransaction.findFirst({
    where: { event: input.event, gatewayPaymentId: input.gatewayPaymentId, outcome: { in: [...REVERSAL_OUTCOMES, "reversal-unmatched"] }, ...(input.reference ? { details: { path: ["reference"], equals: input.reference } } : {}) },
  });
  if (seen) return null;
  const payment = await tx.payment.findFirst({ where: { mode: "GATEWAY", reference: input.gatewayPaymentId, status: { in: ["POSTED", "CANCELLED"] } }, orderBy: { createdAt: "desc" } });
  const row = await tx.gatewayTransaction.create({
    data: {
      schoolId: ctx.schoolId, gatewayAccountId: input.gatewayAccountId, event: input.event, gatewayPaymentId: input.gatewayPaymentId, gatewayOrderId: input.orderId,
      amountPaise: input.amountPaise === null ? null : BigInt(input.amountPaise), outcome: !payment ? "reversal-unmatched" : input.kind === "refund" ? "refund-reported" : "dispute-reported",
      paymentId: payment?.id ?? null, details: { reference: input.reference, kind: input.kind },
    },
  });
  if (!payment || payment.status !== "POSTED") return row;
  const amount = input.amountPaise === null ? "money" : formatRupees(input.amountPaise);
  await writeAudit(tx, ctx, { action: input.kind === "refund" ? "refunded-at-gateway" : "disputed-at-gateway", recordType: "Payment", recordId: payment.id, after: { event: input.event, reference: input.reference, amount } });
  const card = await studentCard(tx, ctx, payment.studentId);
  const receipt = await tx.receipt.findUnique({ where: { paymentId: payment.id } });
  const what = input.kind === "refund" ? `Razorpay refunded ${amount} of` : `A parent's bank disputed ${amount} of`;
  for (const to of await feeDesk(tx, ctx)) {
    await notify(tx, ctx, {
      to, type: "fee-online", link: "/fee-management/dashboard#online-check",
      text: `${what} ${card?.name ?? "a student"}'s online payment${receipt ? ` (receipt ${receipt.number})` : ""}. The receipt still stands: check it on the Fee Dashboard.`,
    });
  }
  return row;
}

/** Refunds and disputes made at the gateway on payments that still stand, newest first, one per payment. */
export async function reversalsToCheck(tx: Tx, since: Date) {
  const rows = await tx.gatewayTransaction.findMany({ where: { outcome: { in: REVERSAL_OUTCOMES }, receivedAt: { gte: since }, paymentId: { not: null } }, orderBy: { receivedAt: "desc" }, take: 50 });
  const payments = await tx.payment.findMany({ where: { id: { in: rows.map((r) => r.paymentId!) }, status: "POSTED" } });
  const seen = new Set<string>();
  const out = [];
  for (const r of rows) {
    const p = payments.find((x) => x.id === r.paymentId);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    const d = detailsOf(r.details);
    out.push({
      id: r.id, kind: d.kind === "dispute" ? ("dispute" as const) : ("refund" as const), reference: d.reference ?? null, amountPaise: r.amountPaise, at: r.receivedAt,
      paymentId: p.id, studentId: p.studentId, paymentPaise: p.amountPaise, asked: Boolean(p.cancelApprovalId),
      /** A refund of only part of the payment is recorded as a refund, not a cancellation. */
      partial: d.kind !== "dispute" && r.amountPaise !== null && r.amountPaise < p.amountPaise,
    });
  }
  return out;
}

/** "Ask to cancel": a refund or dispute made at the gateway becomes a payment cancellation request in Approvals. */
export async function askToCancelReversed(tx: Tx, ctx: SchoolContext, transactionId: string) {
  const row = await tx.gatewayTransaction.findFirst({ where: { id: transactionId, outcome: { in: REVERSAL_OUTCOMES } } });
  if (!row?.paymentId) throw new MoneyProblem("This refund or dispute was not found.");
  const p = await tx.payment.findFirst({ where: { id: row.paymentId } });
  if (!p || p.status !== "POSTED") throw new MoneyProblem("This payment is already cancelled.");
  if (p.cancelApprovalId) throw new MoneyProblem("Cancelling this payment is already waiting for approval.");
  const refunds = await tx.refund.count({ where: { paymentId: p.id, status: { in: ["WAITING", "APPROVED", "REFUNDED"] } } });
  if (refunds) throw new MoneyProblem("A refund is already recorded for this payment, so it cannot be cancelled.");
  const d = detailsOf(row.details);
  if (d.kind !== "dispute" && row.amountPaise !== null && row.amountPaise < p.amountPaise) throw new MoneyProblem(`Razorpay refunded only ${formatRupees(row.amountPaise)} of ${formatRupees(p.amountPaise)}. Record it as a refund on Concessions & Refunds instead.`);
  const card = await studentCard(tx, ctx, p.studentId);
  const receipt = await tx.receipt.findUnique({ where: { paymentId: p.id } });
  const note = `${d.kind === "dispute" ? "Disputed at the parent's bank" : "Refunded at Razorpay"}${row.amountPaise !== null ? `: ${formatRupees(row.amountPaise)}` : ""}${d.reference ? ` (${d.reference})` : ""}`;
  const approval = await requestApproval(tx, ctx, {
    type: "payment-cancellation",
    recordType: "Payment",
    recordId: p.id,
    summary: `Cancel ${formatRupees(p.amountPaise)} online payment by ${card?.name ?? "a student"} on ${formatDate(p.paymentDate)}${receipt ? `, receipt ${receipt.number}` : ""}: ${note}`,
    amountPaise: p.amountPaise,
    reason: note,
  });
  await tx.payment.update({ where: { id: p.id }, data: { cancelApprovalId: approval.id, cancelReason: "Other", cancelNote: note } });
  await writeAudit(tx, ctx, { action: "asked-cancel", recordType: "Payment", recordId: p.id, after: { reason: "Other", note, from: row.event } });
  return { approvalId: approval.id, receiptNo: receipt?.number ?? null };
}
