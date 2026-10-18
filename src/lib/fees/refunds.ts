// Refunds (06 §2, rule 9): full or partial, never more than paid minus
// earlier refunds; each goes to Approvals; once approved "Mark refunded"
// records the date and reference and Finance gets the money out in the Day Book.
import "server-only";

import type { PaymentMode } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { formatDate, formatRupees } from "../format";
import { postToDayBook } from "../finance/daybook";
import { accountForMode, systemHead } from "../finance/settings";
import { assertBooksOpen, assertNotFuture } from "../finance/years";
import { MoneyProblem } from "./problem";
import { lockDues, refreshBalances, studentCard } from "./dues";
import { modeLabel } from "./words";

const ZERO = BigInt(0);

/** How much of a payment can still be refunded: paid minus refunds waiting, approved or paid. */
export async function refundable(tx: Tx, paymentId: string) {
  const p = await tx.payment.findFirst({ where: { id: paymentId } });
  if (!p) return ZERO;
  const r = await tx.refund.aggregate({ where: { paymentId, status: { in: ["WAITING", "APPROVED", "REFUNDED"] } }, _sum: { amountPaise: true } });
  return p.amountPaise - (r._sum.amountPaise ?? ZERO);
}

export async function requestRefund(tx: Tx, ctx: SchoolContext, input: { paymentId: string; amountPaise: bigint; reason: string; mode: PaymentMode }) {
  const p = await tx.payment.findFirst({ where: { id: input.paymentId } });
  if (!p) throw new MoneyProblem("Choose the payment to refund.", "paymentId");
  if (p.broughtIn) throw new MoneyProblem("Payments brought in from old software cannot be refunded here. Record the refund in Finance Management as an expense.", "paymentId");
  if (p.status !== "POSTED") throw new MoneyProblem("Only a posted payment can be refunded.", "paymentId");
  if (p.cancelApprovalId) throw new MoneyProblem("This payment is waiting to be cancelled.", "paymentId");
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  const max = await refundable(tx, p.id);
  if (input.amountPaise > max) throw new MoneyProblem(`Maximum refund ${formatRupees(max)}`, "amount");
  if (input.reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  if (!["CASH", "BANK_TRANSFER", "CHEQUE", "UPI"].includes(input.mode)) throw new MoneyProblem("Choose how the money goes back: cash, bank transfer, cheque or UPI.", "mode");
  const card = await studentCard(tx, ctx, p.studentId);
  const refund = await tx.refund.create({
    data: { schoolId: ctx.schoolId, paymentId: p.id, studentId: p.studentId, amountPaise: input.amountPaise, mode: input.mode, reason: input.reason.trim(), requestedById: ctx.userId },
  });
  const receipt = await tx.receipt.findUnique({ where: { paymentId: p.id } });
  const approval = await requestApproval(tx, ctx, {
    type: "refund",
    recordType: "Refund",
    recordId: refund.id,
    summary: `Refund ${formatRupees(input.amountPaise)} to ${card?.name ?? "a student"} from receipt ${receipt?.number ?? formatDate(p.paymentDate)}`,
    amountPaise: input.amountPaise,
    reason: input.reason,
  });
  await tx.refund.update({ where: { id: refund.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "asked", recordType: "Refund", recordId: refund.id, after: { amount: formatRupees(input.amountPaise), mode: input.mode, reason: input.reason } });
  return refund;
}

export async function decideRefund(tx: Tx, ctx: SchoolContext, refundId: string, decision: string, note: string | null) {
  const r = await tx.refund.findFirst({ where: { id: refundId } });
  if (!r || r.status !== "WAITING") return;
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  await tx.refund.update({ where: { id: r.id }, data: { status, decisionNote: note ?? (decision === "withdraw" ? "Withdrawn" : null) } });
  await writeAudit(tx, ctx, { action: status === "APPROVED" ? "approved" : "rejected", recordType: "Refund", recordId: r.id, after: { note } });
}

/**
 * Records that the money went back. First uses the advance held on the
 * payment; the rest comes off what the payment paid (newest rows first), with
 * an adjustment so those rows stay settled. Posts money out in the Day Book.
 */
export async function markRefunded(tx: Tx, ctx: SchoolContext, refundId: string, input: { date: Date; reference: string | null; accountId: string | null }) {
  const r = await tx.refund.findFirst({ where: { id: refundId } });
  if (!r) throw new MoneyProblem("This refund was not found.");
  if (r.status === "REFUNDED") throw new MoneyProblem("This refund is already marked refunded.");
  if (r.status !== "APPROVED") throw new MoneyProblem("A refund can be paid only after it is approved.");
  if (r.mode !== "CASH" && !input.reference) throw new MoneyProblem(`Enter the ${r.mode === "CHEQUE" ? "cheque number" : "transaction or UTR number"}.`, "reference");
  await assertNotFuture(tx, ctx, input.date, "date", "The date refunded");
  await assertBooksOpen(tx, ctx, input.date, "date");
  const p = await tx.payment.findUniqueOrThrow({ where: { id: r.paymentId }, include: { allocations: { orderBy: { createdAt: "desc" } } } });
  if (p.status !== "POSTED") throw new MoneyProblem("The payment was cancelled, so nothing can be refunded from it.");

  // Advance still held on this payment.
  const usedFromAdvance = p.allocations.filter((a) => a.fromAdvance).reduce((s, a) => s + a.amountPaise, ZERO);
  const earlier = await tx.refund.aggregate({ where: { paymentId: p.id, status: "REFUNDED" }, _sum: { advanceUsedPaise: true } });
  const advanceLeft = p.advancePaise - usedFromAdvance - (earlier._sum.advanceUsedPaise ?? ZERO);
  const fromAdvance = advanceLeft > ZERO ? (advanceLeft < r.amountPaise ? advanceLeft : r.amountPaise) : ZERO;
  let rest = r.amountPaise - fromAdvance;
  const touched: string[] = [];
  if (rest > ZERO) {
    const allocs = p.allocations.filter((a) => a.amountPaise > ZERO);
    await lockDues(tx, allocs.map((a) => a.dueId));
    for (const a of allocs) {
      if (rest <= ZERO) break;
      const d = await tx.studentFeeDue.findUniqueOrThrow({ where: { id: a.dueId } });
      const room = d.paidPaise < a.amountPaise ? d.paidPaise : a.amountPaise;
      const take = rest < room ? rest : room;
      if (take <= ZERO) continue;
      await tx.feeAdjustment.create({ data: { schoolId: ctx.schoolId, studentId: r.studentId, dueId: d.id, amountPaise: -take, reason: `Refunded: ${r.reason}`, createdById: ctx.userId } });
      await tx.studentFeeDue.update({ where: { id: d.id }, data: { paidPaise: { decrement: take }, adjustmentPaise: { decrement: take } } });
      touched.push(d.id);
      rest -= take;
    }
    await refreshBalances(tx, touched);
  }
  const accountId = await accountForMode(tx, ctx, r.mode, input.accountId);
  await tx.refund.update({
    where: { id: r.id },
    data: { status: "REFUNDED", refundedOn: input.date, reference: input.reference, accountId, advanceUsedPaise: fromAdvance, refundedById: ctx.userId },
  });
  const card = await studentCard(tx, ctx, r.studentId);
  await postToDayBook(tx, ctx, {
    date: input.date,
    direction: "OUT",
    amountPaise: r.amountPaise,
    mode: r.mode,
    section: "refund",
    headName: "Fee refund",
    accountHeadId: (await systemHead(tx, ctx, "refunds"))?.id ?? null,
    accountId,
    sourceType: "refund",
    sourceId: r.id,
    sourceKey: `refund:${r.id}`,
    studentId: r.studentId,
    classId: card?.classId ?? null,
    sectionId: card?.sectionId ?? null,
    partyName: card ? `${card.name} (${card.classSection})` : "Student",
    reference: input.reference,
    note: r.reason,
  });
  await writeAudit(tx, ctx, { action: "refunded", recordType: "Refund", recordId: r.id, after: { amount: formatRupees(r.amountPaise), date: formatDate(input.date), mode: modeLabel(r.mode), reference: input.reference } });
}
