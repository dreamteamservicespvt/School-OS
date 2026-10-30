// Cancelling a payment (D2, rule 6): never deleted. Cancel with a reason keeps
// the payment on record as Cancelled, reopens the dues, marks the receipt and
// tax invoice cancelled, and posts a reversal in the Day Book on the cancel
// date. Cancelling a payment made before today needs approval (inferred).
//
// Payment verification (06 §2, optional): approve posts the payment and makes
// the receipt; reject records the reason and nothing is posted.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { formatDate, formatRupees } from "../format";
import { todayIn } from "../staff/dates";
import { reverseSource } from "../finance/daybook";
import { assertBooksOpen } from "../finance/years";
import { MoneyProblem } from "./problem";
import { lockDues, refreshBalances, studentCard } from "./dues";
import { feeSettings } from "./settings";
import { finishPosting } from "./collect";
import { addCharge } from "./structure";
import { cancelReasonLabel, modeLabel } from "./words";

const ZERO = BigInt(0);

export type CancelInput = { reason: string; note: string | null; bounceChargePaise?: bigint | null };

/**
 * Cancels a payment, or asks for approval when it was made before today.
 * Returns whether it is cancelled now or waiting.
 */
export async function cancelPayment(tx: Tx, ctx: SchoolContext, paymentId: string, input: CancelInput) {
  // DREAM TEAM support access can never cancel a payment (07-super-admin.md §3.4).
  if (ctx.support) throw new MoneyProblem("DREAM TEAM support access cannot cancel payments. Ask the school’s accountant.");
  if (!input.reason) throw new MoneyProblem("Choose the reason for cancelling.", "reason");
  if (input.reason === "Other" && (!input.note || input.note.length < 5)) throw new MoneyProblem("Say what happened in the note (at least 5 characters).", "note");
  // One change to a payment at a time: a second "Cancel" sent at the same moment waits here and then finds it cancelled.
  await lockPayment(tx, paymentId);
  const p = await tx.payment.findFirst({ where: { id: paymentId } });
  if (!p) throw new MoneyProblem("This payment was not found.");
  if (p.broughtIn) throw new MoneyProblem(`Brought in from old software on ${formatDate(p.createdAt)}. Not in the Day Book, so it cannot be cancelled here. Undo the whole import from the import history if it was wrong.`);
  if (p.status === "CANCELLED") throw new MoneyProblem("This payment is already cancelled.");
  if (p.status === "WAITING") throw new MoneyProblem("This payment is waiting for verification. Reject it in Approvals instead.");
  if (p.status === "FAILED") throw new MoneyProblem("This online payment failed, so there is nothing to cancel.");
  if (p.cancelApprovalId) throw new MoneyProblem("Cancelling this payment is already waiting for approval.");
  const refunds = await tx.refund.count({ where: { paymentId, status: { in: ["WAITING", "APPROVED", "REFUNDED"] } } });
  if (refunds) throw new MoneyProblem("This payment has a refund, so it cannot be cancelled. Record the correction as an adjustment instead.");

  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone);
  await assertBooksOpen(tx, ctx, today);
  const settings = await feeSettings(tx, ctx);
  if (settings.cancelPastApproval && p.paymentDate < today) {
    const card = await studentCard(tx, ctx, p.studentId);
    const approval = await requestApproval(tx, ctx, {
      type: "payment-cancellation",
      recordType: "Payment",
      recordId: p.id,
      summary: `Cancel ${formatRupees(p.amountPaise)} ${modeLabel(p.mode).toLowerCase()} paid by ${card?.name ?? "a student"} on ${formatDate(p.paymentDate)}`,
      amountPaise: p.amountPaise,
      reason: [cancelReasonLabel(input.reason), input.note].filter(Boolean).join(": "),
    });
    await tx.payment.update({ where: { id: p.id }, data: { cancelApprovalId: approval.id, cancelReason: input.reason, cancelNote: input.note } });
    await writeAudit(tx, ctx, { action: "asked-cancel", recordType: "Payment", recordId: p.id, after: { reason: input.reason, note: input.note } });
    return { cancelled: false, waiting: true };
  }
  await doCancel(tx, ctx, p.id, input, today);
  return { cancelled: true, waiting: false };
}

/**
 * Locks a payment row until the transaction ends. NO KEY UPDATE: records that only point at the
 * payment (allocations from advance, refunds) are not blocked, so it cannot deadlock with them.
 */
export async function lockPayment(tx: Tx, paymentId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) return;
  await tx.$queryRaw`SELECT id FROM payment WHERE id = ${paymentId}::uuid FOR NO KEY UPDATE`;
}

/** Takes the payment off the student's dues and the Day Book. */
async function doCancel(tx: Tx, ctx: SchoolContext, paymentId: string, input: CancelInput, today: Date) {
  // Read under the lock, so the dues are reopened once even when two cancels arrive together.
  await lockPayment(tx, paymentId);
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: true } });
  if (p.status === "CANCELLED") return;
  const dueIds = p.allocations.map((a) => a.dueId);
  await lockDues(tx, dueIds);
  for (const a of p.allocations) {
    if (a.amountPaise > ZERO && p.status === "POSTED") await tx.studentFeeDue.update({ where: { id: a.dueId }, data: { paidPaise: { decrement: a.amountPaise } } });
  }
  // Discounts and waivers given with this payment are taken off too: the dues reopen as they were.
  const given = await tx.concession.findMany({ where: { paymentId, status: "APPLIED" }, include: { lines: true } });
  for (const c of given) {
    for (const l of c.lines) await tx.studentFeeDue.update({ where: { id: l.dueId }, data: { concessionPaise: { decrement: l.amountPaise } } });
    await tx.concession.update({ where: { id: c.id }, data: { status: "REJECTED", decisionNote: "Taken off: the payment was cancelled" } });
    dueIds.push(...c.lines.map((l) => l.dueId));
  }
  await refreshBalances(tx, dueIds);
  await tx.payment.update({
    where: { id: p.id },
    data: { status: "CANCELLED", cancelReason: input.reason, cancelNote: input.note, cancelledById: ctx.userId, cancelledAt: new Date() },
  });
  await tx.receipt.updateMany({ where: { paymentId: p.id }, data: { status: "cancelled", cancelledAt: new Date() } });
  await tx.taxInvoice.updateMany({ where: { paymentId: p.id }, data: { status: "cancelled" } });
  await reverseSource(tx, ctx, { sourceType: "payment", sourceId: p.id, date: today, reversalType: "payment-cancel", note: `Payment cancelled: ${cancelReasonLabel(input.reason)}${input.note ? ` (${input.note})` : ""}` });
  if (input.reason === "Cheque bounced" && input.bounceChargePaise && input.bounceChargePaise > ZERO) {
    const head = await tx.feeHead.findFirst({ where: { archivedAt: null, OR: [{ systemKey: "late-fee" }, { kind: "miscellaneous" }] }, orderBy: { systemKey: "asc" } });
    if (head) await addCharge(tx, ctx, { studentId: p.studentId, feeHeadId: head.id, amountPaise: input.bounceChargePaise, dueDate: today, label: "Cheque bounce charge", reason: `Cheque ${p.chequeNo ?? ""} bounced`.trim() });
  }
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Payment", recordId: p.id, before: { status: p.status, amount: formatRupees(p.amountPaise) }, after: { status: "CANCELLED", reason: input.reason, note: input.note } });
}

/** Approvals decided a payment cancellation. */
export async function decideCancellation(tx: Tx, ctx: SchoolContext, paymentId: string, decision: string, note: string | null) {
  const p = await tx.payment.findFirst({ where: { id: paymentId } });
  if (!p || p.status !== "POSTED" || !p.cancelApprovalId) return;
  if (decision === "approve") {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    await doCancel(tx, ctx, p.id, { reason: p.cancelReason ?? "Other", note: p.cancelNote }, todayIn(school.timeZone));
  } else {
    await tx.payment.update({ where: { id: p.id }, data: { cancelApprovalId: null, cancelReason: null, cancelNote: null } });
    await writeAudit(tx, ctx, { action: decision === "withdraw" ? "cancel-withdrawn" : "cancel-rejected", recordType: "Payment", recordId: p.id, after: { note } });
  }
}

/** Approvals decided a payment waiting for verification. */
export async function decideVerification(tx: Tx, ctx: SchoolContext, paymentId: string, decision: string, note: string | null) {
  const p = await tx.payment.findFirst({ where: { id: paymentId } });
  if (!p || p.status !== "WAITING") return;
  if (decision === "approve") {
    await finishPosting(tx, ctx, p.id, { holdExtraAsAdvance: true });
    return;
  }
  // Rejected or withdrawn: nothing was posted; discounts given with it come off.
  const given = await tx.concession.findMany({ where: { paymentId, status: "APPLIED" }, include: { lines: true } });
  const dueIds: string[] = [];
  for (const c of given) {
    for (const l of c.lines) await tx.studentFeeDue.update({ where: { id: l.dueId }, data: { concessionPaise: { decrement: l.amountPaise } } });
    await tx.concession.update({ where: { id: c.id }, data: { status: "REJECTED", decisionNote: "Taken off: the payment was not verified" } });
    dueIds.push(...c.lines.map((l) => l.dueId));
  }
  await refreshBalances(tx, dueIds);
  await tx.payment.update({ where: { id: p.id }, data: { status: "CANCELLED", rejectReason: note ?? "Withdrawn", cancelReason: decision === "withdraw" ? "Withdrawn" : "Not verified", cancelledById: ctx.userId, cancelledAt: new Date() } });
  await writeAudit(tx, ctx, { action: "verification-rejected", recordType: "Payment", recordId: p.id, after: { reason: note } });
}
