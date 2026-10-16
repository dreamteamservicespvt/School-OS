// A staff member's library fine taken from salary (13 Fines: "for staff,
// collected here or recovered from salary", inferred). The librarian sends a
// due fine to salary; the next salary worked out in Salary Management (a
// Payroll Run still being prepared, for a month from the one the fine was
// sent in) carries it as a one-time deduction (a Payroll Adjustment) with the
// fine's number in the reason. When that salary is approved the fine is
// Paid ("from salary"). It is collected once only: a fine on its way to
// salary cannot be collected at the desk, and a paid one cannot be waived.
// The accountant may take the deduction off the salary; the fine is then due
// at the desk again and the librarian is told.
import "server-only";

import type { LibraryFine, PayrollRun } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatRupees } from "../format";
import { LibraryProblem } from "./problem";
import { FINE_REASON } from "./words";

const ZERO = BigInt(0);
/** Runs whose amounts can still change (Salary Management, Generate Salary). */
const EDITABLE = ["OPEN", "CALCULATED"];
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthWords = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** The words on the salary deduction, so the slip and the run say what it is. */
export function fineDeductionReason(f: Pick<LibraryFine, "fineNo" | "reason" | "lateDays">, title: string) {
  const why = f.reason === "LATE" ? `late return${f.lateDays ? ` (${f.lateDays} day${f.lateDays === 1 ? "" : "s"})` : ""}` : `${FINE_REASON[f.reason].toLowerCase()} book`;
  return `Library fine ${f.fineNo}: ${why}, “${title}”`.slice(0, 200);
}

/**
 * Sends a staff member's due fine to their next salary. Only a due staff
 * fine not already on its way, of someone with a salary structure.
 */
export async function sendFineToSalary(tx: Tx, ctx: SchoolContext, fineId: string, now = new Date()) {
  const f = await tx.libraryFine.findFirst({ where: { id: fineId } });
  if (!f) throw new LibraryProblem("This fine was not found.");
  if (!f.staffId) throw new LibraryProblem("Only a staff member's fine can be taken from salary. A student's fine is paid with the fees or at the desk.");
  if (f.status !== "DUE") throw new LibraryProblem(f.status === "WAITING" ? "This charge is waiting for approval. It can go to salary once it is approved." : "This fine is not due.");
  if (f.salaryAt) throw new LibraryProblem("This fine is already going to be taken from salary.");
  const staff = await tx.staff.findFirst({ where: { id: f.staffId }, select: { id: true, fullName: true, userLoginId: true, archivedAt: true, status: true, leavingDate: true } });
  if (!staff || staff.archivedAt) throw new LibraryProblem("This staff member was not found. Collect the fine here.");
  const working = ["ACTIVE", "ON_LEAVE", "SUSPENDED"].includes(staff.status) || (staff.leavingDate !== null && staff.leavingDate >= monthStart(now));
  if (!working) throw new LibraryProblem(`${staff.fullName} has left, so no salary is coming. Collect the fine here.`);
  const structure = await tx.salaryStructure.findFirst({ where: { staffId: staff.id, archivedAt: null }, select: { id: true } });
  if (!structure) throw new LibraryProblem(`${staff.fullName} has no salary structure in Salary Management, so the fine cannot be taken from salary. Collect it here.`);
  const updated = await tx.libraryFine.update({ where: { id: f.id }, data: { salaryAt: now, salaryById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "sent-to-salary", recordType: "Library Fine", recordId: f.id, before: { where: "Collect here or from salary" }, after: { where: "From salary", staff: staff.fullName, amount: formatRupees(f.amountPaise) } });
  if (staff.userLoginId) {
    await notify(tx, ctx, { to: staff.userLoginId, type: "library", text: `Library fine ${f.fineNo} of ${formatRupees(f.amountPaise)} will be taken from your next salary`, link: "/salary-management/slips?mine=1" });
  }
  return { fine: updated, staff };
}

/**
 * Stops taking a fine from salary (to collect it at the desk, or before a
 * waiver). A fine already on a salary waiting for approval cannot be taken
 * off here; on a salary still being prepared, the deduction is archived and
 * that salary is worked out again.
 */
export async function stopFineFromSalary(tx: Tx, ctx: SchoolContext, fineId: string, why: string, recalculate: (runId: string) => Promise<unknown>) {
  const f = await tx.libraryFine.findFirst({ where: { id: fineId } });
  if (!f) throw new LibraryProblem("This fine was not found.");
  if (f.status !== "DUE" || !f.salaryAt) throw new LibraryProblem(f.status === "PAID" ? "This fine is already paid." : "This fine is not going to salary.");
  let run: PayrollRun | null = null;
  if (f.adjustmentId && f.runId) {
    run = await tx.payrollRun.findFirst({ where: { id: f.runId } });
    if (run && !EDITABLE.includes(run.status)) {
      throw new LibraryProblem(run.status === "WAITING"
        ? `The fine is in the ${monthWords(run.month)} salary, which is waiting for approval. Ask the accountant to take that salary back first.`
        : `The fine is in the ${monthWords(run.month)} salary, which is already approved.`);
    }
    const adj = await tx.payrollAdjustment.findFirst({ where: { id: f.adjustmentId, archivedAt: null } });
    if (adj) {
      await tx.payrollAdjustment.update({ where: { id: adj.id }, data: { archivedAt: new Date(), archivedById: ctx.userId } });
      await writeAudit(tx, ctx, { action: "payroll-adjustment-archived", recordType: "Payroll Adjustment", recordId: adj.id, before: { type: "Deduction", amount: formatRupees(adj.amountPaise), reason: adj.reason }, after: { why: `Library fine ${f.fineNo}: ${why}` } });
    }
  }
  await tx.libraryFine.update({ where: { id: f.id }, data: { salaryAt: null, salaryById: null, adjustmentId: null, runId: null } });
  await writeAudit(tx, ctx, { action: "salary-stopped", recordType: "Library Fine", recordId: f.id, before: { where: "From salary", run: run ? monthWords(run.month) : null }, after: { where: "Collect here or from salary", why } });
  if (run && f.adjustmentId) await recalculate(run.id);
  return { fine: f, run };
}

/**
 * Salary Management, working out a run: puts each fine sent to salary on the
 * run as a one-time deduction (once; a fine already on another run stays
 * there). Only for people paid in this run with a salary structure, and for
 * a run of the month the fine was sent in or later.
 */
export async function attachFinesToRun(tx: Tx, ctx: SchoolContext, run: Pick<PayrollRun, "id" | "month" | "status">, staffIds: string[]) {
  if (!EDITABLE.includes(run.status) || !staffIds.length) return 0;
  const fines = await tx.libraryFine.findMany({ where: { staffId: { in: staffIds }, status: "DUE", salaryAt: { not: null }, adjustmentId: null }, orderBy: { createdAt: "asc" } });
  let added = 0;
  for (const f of fines) {
    if (monthStart(f.salaryAt!) > run.month) continue;
    if (f.amountPaise <= ZERO) continue;
    const book = await tx.book.findFirst({ where: { id: f.bookId }, select: { title: true } });
    const reason = fineDeductionReason(f, book?.title ?? "Book");
    const adj = await tx.payrollAdjustment.create({ data: { schoolId: ctx.schoolId, runId: run.id, staffId: f.staffId!, type: "DEDUCTION", amountPaise: f.amountPaise, reason, createdById: ctx.userId } });
    await tx.libraryFine.update({ where: { id: f.id }, data: { adjustmentId: adj.id, runId: run.id } });
    await writeAudit(tx, ctx, { action: "payroll-adjustment-added", recordType: "Payroll Adjustment", recordId: adj.id, after: { month: monthWords(run.month), type: "Deduction", amount: formatRupees(f.amountPaise), reason, from: `Library fine ${f.fineNo}` } });
    added++;
  }
  return added;
}

/**
 * Salary Management, a run approved: fines whose deduction was taken are
 * Paid from salary. A fine whose person was left out of the run goes back to
 * wait for the next salary.
 */
export async function finesPaidBySalary(tx: Tx, ctx: SchoolContext, run: Pick<PayrollRun, "id" | "month">, includedStaffIds: Set<string>, now = new Date()) {
  const fines = await tx.libraryFine.findMany({ where: { runId: run.id, status: "DUE" } });
  let paid = 0;
  for (const f of fines) {
    const adj = f.adjustmentId ? await tx.payrollAdjustment.findFirst({ where: { id: f.adjustmentId, archivedAt: null } }) : null;
    if (!adj || !includedStaffIds.has(f.staffId!)) {
      await tx.libraryFine.update({ where: { id: f.id }, data: { adjustmentId: null, runId: null } });
      await writeAudit(tx, ctx, { action: "salary-moved", recordType: "Library Fine", recordId: f.id, after: { why: `Not taken in the ${monthWords(run.month)} salary; waits for the next one` } });
      continue;
    }
    await tx.libraryFine.update({ where: { id: f.id }, data: { status: "PAID", paidHow: "salary", paidAt: now } });
    await writeAudit(tx, ctx, { action: "paid-from-salary", recordType: "Library Fine", recordId: f.id, before: { status: "DUE" }, after: { status: "PAID", amount: formatRupees(f.amountPaise), salary: monthWords(run.month) } });
    paid++;
  }
  return paid;
}

/**
 * Salary Management, the accountant archives a deduction: when it was a
 * library fine, the fine is due at the desk again and the librarian is told.
 */
export async function releaseFineAdjustment(tx: Tx, ctx: SchoolContext, adjustmentId: string, month: Date) {
  const f = await tx.libraryFine.findFirst({ where: { adjustmentId, status: "DUE" } });
  if (!f) return null;
  await tx.libraryFine.update({ where: { id: f.id }, data: { salaryAt: null, salaryById: null, adjustmentId: null, runId: null } });
  await writeAudit(tx, ctx, { action: "salary-stopped", recordType: "Library Fine", recordId: f.id, before: { where: "From salary" }, after: { where: "Collect here or from salary", why: `Taken off the ${monthWords(month)} salary in Salary Management` } });
  const tell = new Set<string>();
  if (f.salaryById) tell.add(f.salaryById);
  for (const id of tell) {
    await notify(tx, ctx, { to: id, type: "library", text: `Library fine ${f.fineNo} (${formatRupees(f.amountPaise)}) was taken off the ${monthWords(month)} salary. Collect it at the desk.`, link: `/library-management/fines?fine=${f.id}` });
  }
  return f;
}

/** Words for a fine on its way to salary: "From the October 2026 salary" or "From the next salary". */
export function salaryWords(run: Pick<PayrollRun, "month" | "status"> | null) {
  if (!run) return "From the next salary";
  return `From the ${monthWords(run.month)} salary${run.status === "WAITING" ? " (waiting for approval)" : ""}`;
}
