// Fees due before go-live (02-workflows.md, workflow 15, steps 5, 6 and 9; gap
// list G14). A school that starts part way through the year sets the whole
// year's fee structure, so each student's plan has installments due before the
// go-live date. Those months belong to the old software:
//
// - past receipts brought in pay them first, oldest first (fees/import.ts);
// - what is still unpaid on them is either inside the old dues brought in
//   ("the amount still unpaid from before School OS") or was collected in the
//   old software and not brought in as receipts.
//
// Either way it must not be billed a second time. The school says which with
// "Settle": the unpaid part of every plan installment due before go-live is
// taken off as settled in the old software, for the students who have old dues
// brought in, or for every student. It is an adjustment with that reason, so the
// row stays on the ledger with its history and is no longer owed; an unpaid late
// fee on it comes off too. "Undo" puts the amounts back. Nothing is deleted and
// nothing reaches the Day Book.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { currentYears } from "../academic/years";
import { lockDues, refreshBalances } from "./dues";
import { MoneyProblem } from "./problem";
import { moveInGoLive } from "../move-in/live";

const ZERO = BigInt(0);

/** The start of every settle adjustment's reason, so they can be found and undone. */
export const SETTLED_REASON = "Settled in the old software before go-live";
/** The reason on the adjustment that undoes one. */
export const SETTLED_UNDONE = "Settle before go-live undone";

export type SettleScope = "old-dues" | "all";

type Owed = { rows: number; students: number; paise: bigint };

export type BeforeGoLive = {
  goLive: Date;
  /** Plan installments due before go-live still owed: past receipts did not pay them. */
  owed: Owed;
  /** Of those, the students who also have old dues brought in: the same months may be counted twice. */
  withOldDues: Owed;
  /** Already settled in the old software (and not undone). */
  settled: Owed;
};

/** Plan installments (not charges, late fees or old dues) of this year due before go-live with something still to pay. */
async function owedRows(tx: Tx, ctx: SchoolContext, goLive: Date, studentIds?: string[]) {
  const years = (await currentYears(tx, ctx)).map((y) => y.id);
  if (!years.length) return [];
  return tx.studentFeeDue.findMany({
    where: { academicYearId: { in: years }, kind: "FEE", broughtIn: false, state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lt: goLive }, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    select: { id: true, studentId: true, balancePaise: true },
  });
}

/** Students with old dues brought in (still on their ledger, paid or not). */
async function oldDuesStudents(tx: Tx) {
  const rows = await tx.studentFeeDue.findMany({ where: { kind: "OLD_DUES", broughtIn: true, state: "OPEN" }, select: { studentId: true }, distinct: ["studentId"] });
  return new Set(rows.map((r) => r.studentId));
}

const owedOf = (rows: { studentId: string; balancePaise: bigint }[]): Owed => ({
  rows: rows.length,
  students: new Set(rows.map((r) => r.studentId)).size,
  paise: rows.reduce((s, r) => s + r.balancePaise, ZERO),
});

/** Net settle adjustment per row (negative while settled and not undone). */
async function settledByRow(tx: Tx) {
  const adj = await tx.feeAdjustment.findMany({
    where: { OR: [{ reason: { startsWith: SETTLED_REASON } }, { reason: { startsWith: SETTLED_UNDONE } }] },
    select: { dueId: true, studentId: true, amountPaise: true },
  });
  const net = new Map<string, { studentId: string; paise: bigint }>();
  for (const a of adj) {
    const n = net.get(a.dueId) ?? { studentId: a.studentId, paise: ZERO };
    n.paise += a.amountPaise;
    net.set(a.dueId, n);
  }
  return [...net].filter(([, n]) => n.paise < ZERO).map(([dueId, n]) => ({ dueId, studentId: n.studentId, paise: -n.paise }));
}

/** What is due before go-live and still owed, for the go-live check and the Settle card. */
export async function beforeGoLive(tx: Tx, ctx: SchoolContext, goLive: Date): Promise<BeforeGoLive> {
  const [rows, withOld, settled] = await Promise.all([owedRows(tx, ctx, goLive), oldDuesStudents(tx), settledByRow(tx)]);
  return {
    goLive,
    owed: owedOf(rows),
    withOldDues: owedOf(rows.filter((r) => withOld.has(r.studentId))),
    settled: { rows: settled.length, students: new Set(settled.map((s) => s.studentId)).size, paise: settled.reduce((s, r) => s + r.paise, ZERO) },
  };
}

/**
 * Settles what is still unpaid on plan installments due before go-live: for
 * the students with old dues brought in ("old-dues"), or for every student
 * ("all"). Safe to run again: rows already settled have nothing left to pay.
 */
export async function settleBeforeGoLive(tx: Tx, ctx: SchoolContext, input: { scope: SettleScope; goLive: Date }) {
  if (input.scope !== "old-dues" && input.scope !== "all") throw new MoneyProblem("Choose whose fees to settle.", "scope");
  const withOld = input.scope === "old-dues" ? [...(await oldDuesStudents(tx))] : undefined;
  if (withOld && !withOld.length) throw new MoneyProblem("No student has old dues brought in yet.");
  const found = await owedRows(tx, ctx, input.goLive, withOld);
  if (!found.length) throw new MoneyProblem(`Nothing is owed on fees due before ${formatDate(input.goLive)}.`);
  const ids = found.map((r) => r.id);
  // Locked and read again, so a payment at the counter cannot slip in between.
  await lockDues(tx, ids);
  const rows = await tx.studentFeeDue.findMany({ where: { id: { in: ids }, state: "OPEN", balancePaise: { gt: 0 } }, select: { id: true, studentId: true, balancePaise: true } });
  const reason = `${SETTLED_REASON} on ${formatDate(input.goLive)}`;
  await tx.feeAdjustment.createMany({ data: rows.map((r) => ({ schoolId: ctx.schoolId, studentId: r.studentId, dueId: r.id, amountPaise: -r.balancePaise, reason, createdById: ctx.userId })) });
  const done = rows.map((r) => r.id);
  await tx.$executeRaw`UPDATE student_fee_due SET adjustment_paise = adjustment_paise - balance_paise WHERE id = ANY(${done}::uuid[]) AND balance_paise > 0`;
  await refreshBalances(tx, done);
  // An unpaid late fee on a settled row comes off with it.
  const late = await tx.studentFeeDue.findMany({ where: { parentDueId: { in: done }, kind: "LATE_FEE", state: "OPEN", paidPaise: 0 }, select: { id: true } });
  if (late.length) {
    await tx.studentFeeDue.updateMany({ where: { id: { in: late.map((l) => l.id) } }, data: { state: "REMOVED", removedReason: `Row ${SETTLED_REASON.toLowerCase()}`, removedById: ctx.userId, removedAt: new Date() } });
  }
  const total = owedOf(rows);
  await writeAudit(tx, ctx, {
    action: "settled-before-go-live", recordType: "Student Fee Due", recordId: null,
    after: { scope: input.scope === "all" ? "every student" : "students with old dues brought in", goLive: formatDate(input.goLive), rows: total.rows, students: total.students, amount: formatRupees(total.paise), lateFeesRemoved: late.length },
  });
  return { ...total, lateFeesRemoved: late.length };
}

/** Undo: puts back every amount settled before go-live, as an adjustment the other way. */
export async function undoSettleBeforeGoLive(tx: Tx, ctx: SchoolContext) {
  const settled = await settledByRow(tx);
  const open = await tx.studentFeeDue.findMany({ where: { id: { in: settled.map((s) => s.dueId) }, state: "OPEN" }, select: { id: true } });
  const ids = new Set(open.map((o) => o.id));
  const rows = settled.filter((s) => ids.has(s.dueId));
  if (!rows.length) throw new MoneyProblem("Nothing is settled before go-live.");
  await lockDues(tx, rows.map((r) => r.dueId));
  await tx.feeAdjustment.createMany({ data: rows.map((r) => ({ schoolId: ctx.schoolId, studentId: r.studentId, dueId: r.dueId, amountPaise: r.paise, reason: SETTLED_UNDONE, createdById: ctx.userId })) });
  for (const r of rows) await tx.studentFeeDue.update({ where: { id: r.dueId }, data: { adjustmentPaise: { increment: r.paise } } });
  await refreshBalances(tx, rows.map((r) => r.dueId));
  const paise = rows.reduce((s, r) => s + r.paise, ZERO);
  const students = new Set(rows.map((r) => r.studentId)).size;
  await writeAudit(tx, ctx, { action: "settled-before-go-live-undone", recordType: "Student Fee Due", recordId: null, after: { rows: rows.length, students, amount: formatRupees(paise) } });
  return { rows: rows.length, students, paise };
}

/** The same, in words and rupees for the screens. */
export type BeforeGoLiveView = { goLive: string | null; owed: OwedView; withOldDues: OwedView; settled: OwedView };
type OwedView = { rows: number; students: number; amount: string };

const NONE: OwedView = { rows: 0, students: 0, amount: formatRupees(ZERO) };

export function viewOf(b: BeforeGoLive | null): BeforeGoLiveView {
  if (!b) return { goLive: null, owed: NONE, withOldDues: NONE, settled: NONE };
  const v = (o: Owed): OwedView => ({ rows: o.rows, students: o.students, amount: formatRupees(o.paise) });
  return { goLive: formatDate(b.goLive), owed: v(b.owed), withOldDues: v(b.withOldDues), settled: v(b.settled) };
}

/** For a school that moved in through Switching to School OS (a Move-in Plan): what is due before go-live. Null for any other school. */
export async function beforeGoLiveView(tx: Tx, ctx: SchoolContext): Promise<BeforeGoLiveView | null> {
  const plan = await tx.moveInPlan.findUnique({ where: { schoolId: ctx.schoolId }, select: { schoolId: true } });
  if (!plan) return null;
  const goLive = await moveInGoLive(tx, ctx);
  return viewOf(goLive ? await beforeGoLive(tx, ctx, goLive) : null);
}
