// What Fee Management gives other modules about one student: the fee tab of
// the Student Profile, and fee clearance for leaving (A14).
//
// Student Management uses them like this:
//
//   const fees = await withSchool(ctx, (tx) => studentFeeTab(tx, ctx, studentId));
//   const cleared = await withSchool(ctx, (tx) => feeDuesCleared(tx, ctx, studentId));
//   if (!cleared.cleared) { /* show cleared.message and cleared.balancePaise; link to /fee-management/collect/<id> */ }
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatRupees } from "../format";
import { todayIn } from "../staff/dates";
import { advanceHeld, allDues, dueStatus, totalsOf } from "./dues";

const ZERO = BigInt(0);

/**
 * Fee clearance (A14): true when nothing is left to pay (dues not yet due
 * count too, from the student's current plan). Returns the balance and a
 * plain-words message either way.
 */
export async function feeDuesCleared(tx: Tx, ctx: SchoolContext, studentId: string) {
  const dues = await allDues(tx, studentId);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone);
  const balance = dues.reduce((s, d) => s + (d.balancePaise > ZERO ? d.balancePaise : ZERO), ZERO);
  const overdue = dues.filter((d) => dueStatus(d, today) === "OVERDUE").reduce((s, d) => s + d.balancePaise, ZERO);
  const waiting = await tx.payment.count({ where: { studentId, status: "WAITING" } });
  const cleared = balance <= ZERO && waiting === 0;
  return {
    cleared,
    balancePaise: balance,
    overduePaise: overdue,
    waitingPayments: waiting,
    message: cleared
      ? "Fees cleared. Nothing is due."
      : waiting && balance <= ZERO
        ? `A payment is waiting for verification. Fees clear once it is approved.`
        : `${formatRupees(balance)} is still due${overdue > ZERO ? `, of which ${formatRupees(overdue)} is overdue` : ""}. Collect it, or remove unpaid rows with a reason, before fee clearance.`,
    link: `/fee-management/collect/${studentId}`,
  };
}

/** The Student Profile's fee tab: totals, the status of each row, and the latest payments. */
export async function studentFeeTab(tx: Tx, ctx: SchoolContext, studentId: string) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone);
  const dues = await allDues(tx, studentId);
  const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } } });
  const totals = totalsOf(dues);
  const payments = await tx.payment.findMany({ where: { studentId, status: { in: ["POSTED", "CANCELLED", "WAITING"] } }, orderBy: { paidAt: "desc" }, take: 10 });
  const receipts = await tx.receipt.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  const rows = dues.map((d) => ({
    id: d.id,
    head: heads.find((h) => h.id === d.feeHeadId)?.name ?? "Fees",
    label: d.label,
    dueDate: d.dueDate,
    amountPaise: d.amountPaise - d.concessionPaise + d.adjustmentPaise,
    paidPaise: d.paidPaise,
    balancePaise: d.balancePaise,
    status: dueStatus(d, today),
  }));
  return {
    totals,
    overduePaise: rows.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + r.balancePaise, ZERO),
    advancePaise: await advanceHeld(tx, studentId),
    hasPlan: dues.some((d) => d.kind === "FEE"),
    rows,
    payments: payments.map((p) => ({ id: p.id, date: p.paymentDate, amountPaise: p.amountPaise, mode: p.mode, status: p.status, receiptNo: receipts.find((r) => r.paymentId === p.id)?.number ?? null, broughtIn: p.broughtIn })),
    ledgerLink: `/fee-management/ledger/${studentId}`,
    collectLink: `/fee-management/collect/${studentId}`,
  };
}
