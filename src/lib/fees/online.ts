// Online fee payments (06 §2 Collect Fee, A8): payment links sent by message,
// the Pay button on Parent Link, and the UPI QR at the counter all make a
// Payment Link. The parent pays through Razorpay Checkout. A payment is
// posted only when the gateway confirms it: the Checkout signature or the
// signed webhook, whichever comes first. The gateway's payment id is unique,
// so a second confirmation for the same payment does nothing.
import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { PaymentSource } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { createOrder, verifyPaymentSignature, type RazorpayCredentials } from "../payments/razorpay";
import { linkedAccountFor, razorpayCredentials } from "../payments/gateways";
import { addDays, todayIn } from "../staff/dates";
import { MoneyProblem } from "./problem";
import { DUE_WINDOW_DAYS, lockDues, openDues, studentCard } from "./dues";
import { featureOn, feeSettings, gatewayFor } from "./settings";
import { allocate, finishPosting, notifyOnlinePayment } from "./collect";
import { feeMessageInput, planMessage, sendMessage } from "./notify-parents";
import { appUrl } from "../parent-link/token";
import { mainBankAccount } from "../finance/settings";

const ZERO = BigInt(0);

/** A link is good for 7 days (inferred). */
export const LINK_DAYS = 7;
/** Online payments not confirmed within this time are flagged on the Fee Dashboard (A8, inferred 30 minutes). */
export const CONFIRM_WITHIN_MS = 30 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function payPath(schoolId: string, token: string) {
  return `/pay/${schoolId}/${token}`;
}

/**
 * Makes a payment link for chosen rows of a student. The gateway is the one
 * set for the student's class in Fee Settings. Returns the secret token
 * (shown once, in the link) and the link record.
 */
export async function createPaymentLink(
  tx: Tx,
  ctx: SchoolContext,
  input: { studentId: string; dueIds: string[]; guardianId?: string | null; source: PaymentSource; channel?: string | null },
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
  if (!gateway) throw new MoneyProblem("No payment gateway is switched on. Connect Razorpay in Settings, Payment Gateways.", undefined, { href: "/settings/payment-gateways", label: "Open Payment Gateways" });
  const token = randomBytes(24).toString("base64url");
  const link = await tx.paymentLink.create({
    data: {
      schoolId: ctx.schoolId,
      studentId: input.studentId,
      guardianId: input.guardianId ?? card.primaryGuardian?.id ?? null,
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
  return { link, token, card, amount };
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
  if (!link || link.gatewayOrderId !== input.orderId) throw new MoneyProblem("This payment could not be matched to the link. If money was taken, the school will see it once Razorpay confirms it.");
  const creds = deps.creds ?? (await razorpayCredentials(tx, link.gatewayAccountId));
  if (!creds || !verifyPaymentSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature }, creds.keySecret)) {
    await writeAudit(tx, ctx, { action: "checkout-refused", recordType: "Payment Link", recordId: link.id, after: { reason: "Signature did not match", paymentId: input.paymentId } });
    throw new MoneyProblem("Waiting for the gateway to confirm. If money was taken, the receipt appears here once Razorpay confirms it.");
  }
  return confirmGatewayPayment(tx, ctx, { gatewayAccountId: link.gatewayAccountId, gatewayPaymentId: input.paymentId, orderId: input.orderId, amountPaise: null, event: "checkout.verified" });
}

/**
 * A8: a verified confirmation from the gateway. Posts the payment against the
 * link's rows, once per gateway payment id. Money for rows already paid
 * meanwhile is held as advance. Records every confirmation for reconciliation.
 */
export async function confirmGatewayPayment(
  tx: Tx,
  ctx: SchoolContext,
  input: { gatewayAccountId: string; gatewayPaymentId: string; orderId: string | null; amountPaise: number | null; event: string },
) {
  const log = async (outcome: string, paymentId: string | null) =>
    tx.gatewayTransaction.create({
      data: { schoolId: ctx.schoolId, gatewayAccountId: input.gatewayAccountId, event: input.event, gatewayPaymentId: input.gatewayPaymentId, gatewayOrderId: input.orderId, amountPaise: input.amountPaise === null ? null : BigInt(input.amountPaise), outcome, paymentId },
    });
  const done = await tx.payment.findFirst({ where: { mode: "GATEWAY", reference: input.gatewayPaymentId, status: { not: "FAILED" } } });
  if (done) {
    await log("already-posted", done.id);
    const receipt = await tx.receipt.findUnique({ where: { paymentId: done.id } });
    return { paymentId: done.id, receiptNo: receipt?.number ?? null, created: false };
  }
  const existing = await tx.payment.findFirst({ where: { gatewayPaymentId: input.gatewayPaymentId } });
  const link = input.orderId ? await tx.paymentLink.findFirst({ where: { gatewayOrderId: input.orderId } }) : null;
  if (!link) {
    await log("unmatched", null);
    return { paymentId: null, receiptNo: null, created: false };
  }
  const amount = input.amountPaise !== null ? BigInt(input.amountPaise) : link.amountPaise;
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
    note: link.source === "PARENT_LINK" ? "Paid from Parent Link" : "Paid by payment link",
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
  await tx.paymentLink.update({ where: { id: link.id }, data: { status: "PAID", paymentId: payment.id } });
  await log("posted", payment.id);
  const card = await studentCard(tx, ctx, link.studentId);
  await notifyOnlinePayment(tx, ctx, payment, card?.name ?? "a student", link.source);
  return { paymentId: payment.id, receiptNo: posted.receiptNo, created: true };
}

/** A8: the gateway reported a failed payment. Recorded with no receipt and listed on the Fee Dashboard. */
export async function recordGatewayFailure(tx: Tx, ctx: SchoolContext, input: { gatewayAccountId: string; gatewayPaymentId: string; orderId: string | null; amountPaise: number | null; reason: string | null }) {
  const existing = await tx.payment.findFirst({ where: { gatewayPaymentId: input.gatewayPaymentId } });
  const link = input.orderId ? await tx.paymentLink.findFirst({ where: { gatewayOrderId: input.orderId } }) : null;
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

/** Failed online payments and attempts not confirmed within 30 minutes, for the Fee Dashboard. */
export async function failedOnline(tx: Tx, since: Date) {
  const failed = await tx.payment.findMany({ where: { status: "FAILED", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 50 });
  const stuck = await tx.paymentLink.findMany({
    where: { status: { in: ["SENT", "FAILED"] }, attempts: { gt: 0 }, lastAttemptAt: { lt: new Date(Date.now() - CONFIRM_WITHIN_MS), gte: since }, paymentId: null },
    orderBy: { lastAttemptAt: "desc" },
    take: 50,
  });
  const failedLinkIds = new Set(failed.map((f) => f.paymentLinkId));
  return { failed, stuck: stuck.filter((l) => !failedLinkIds.has(l.id)) };
}
