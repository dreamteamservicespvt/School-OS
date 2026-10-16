// Generate Salary (10 §2, workflow 10, automation A6): one Payroll Run per
// month per campus. Open → Calculated → Waiting for approval → Approved →
// Paid → Locked. Inputs (present days, approved leave, loss of pay, late
// marks, overtime, recoveries) arrive by themselves on every calculation.
// From approval the amounts are frozen: slips are made and staff are told.
// Only when marked Paid does the salary reach the Day Book, on the date paid.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { requestApproval, decide } from "../approvals";
import { MoneyProblem } from "../fees/problem";
import { formatDate, formatRupees } from "../format";
import { isoDay } from "../staff/dates";
import { schoolDays } from "../attendance/calendar";
import { staffMonthForSalary } from "../attendance/staff";
import { postToDayBook, reverseSource } from "../finance/daybook";
import { accountForMode, systemHead } from "../finance/settings";
import { sendAutomatic } from "../messaging";
import { notEmployedDays, lopDays as lopOf, workOutPay } from "./calc";
import { asStatutory, ptSlabs, salarySettings, statutoryFor } from "./settings";
import { fromStored } from "./structures";
import { attachFinesToRun, finesPaidBySalary, releaseFineAdjustment } from "../library/salary";
import { addMonths, adjustmentLabel, firstOfMonth, lastOfMonth, monthName, payModeLabel } from "./words";

const ZERO = BigInt(0);
const n = (d: Prisma.Decimal | number) => Number(d);

export const EDITABLE = ["OPEN", "CALCULATED"] as const;
const frozen = (s: string) => ["APPROVED", "PAID", "LOCKED"].includes(s);

export async function getRun(tx: Tx, runId: string) {
  const run = await tx.payrollRun.findFirst({ where: { id: runId } });
  if (!run) throw new MoneyProblem("This salary month was not found.");
  return run;
}

/** Words for a run that may no longer change: "September 2026 is locked. Add an adjustment in October 2026." */
export function frozenWords(run: { month: Date; status: string }) {
  const word = run.status === "LOCKED" ? "locked" : run.status === "PAID" ? "paid" : "approved";
  return `${monthName(run.month)} is ${word}. Add an adjustment in ${monthName(addMonths(run.month, 1))}.`;
}

function assertEditable(run: { month: Date; status: string }) {
  if (run.status === "WAITING") throw new MoneyProblem(`${monthName(run.month)} is waiting for approval. Take it back to change it.`);
  if (frozen(run.status)) throw new MoneyProblem(frozenWords(run));
}

/** Open the month: one run per month per campus. */
export async function openRun(tx: Tx, ctx: SchoolContext, input: { campusId: string; month: Date; today: Date }) {
  const month = firstOfMonth(input.month);
  const campus = await tx.campus.findFirst({ where: { id: input.campusId, archivedAt: null } });
  if (!campus) throw new MoneyProblem("Choose the campus.", "campusId");
  if (month > addMonths(firstOfMonth(input.today), 1)) throw new MoneyProblem("You can open at most next month's salary.", "month");
  const existing = await tx.payrollRun.findFirst({ where: { campusId: campus.id, month } });
  if (existing) {
    throw new MoneyProblem(`${monthName(month)} salary already exists for ${campus.name}.`, "month", { href: `/salary-management/generate?run=${existing.id}`, label: "Open the existing one" }).withCode("exists");
  }
  const count = await tx.campus.count({ where: { archivedAt: null } });
  const number = `PAY-${month.toISOString().slice(0, 7)}${count > 1 ? `-${campus.name.slice(0, 3).toUpperCase()}` : ""}`;
  const run = await tx.payrollRun.create({ data: { schoolId: ctx.schoolId, campusId: campus.id, month, number, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "payroll-opened", recordType: "Payroll Run", recordId: run.id, after: { month: monthName(month), campus: campus.name } });
  return run;
}

/** Staff paid in a month on a campus: joined by the month's end and not gone before it started. */
export async function payrollStaff(tx: Tx, campusId: string, month: Date) {
  const end = lastOfMonth(month);
  return tx.staff.findMany({
    where: {
      campusId, archivedAt: null, joiningDate: { lte: end },
      OR: [{ status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, { leavingDate: { gte: month } }],
    },
    orderBy: [{ staffCode: "asc" }],
    select: { id: true, fullName: true, staffCode: true, designation: true, departmentId: true, joiningDate: true, leavingDate: true, userLoginId: true },
  });
}

/** Days of approved unpaid leave (Leave Without Pay) on working days in the range, per person. */
async function unpaidLeave(tx: Tx, staffIds: string[], working: Date[]) {
  const unpaidTypes = await tx.leaveType.findMany({ where: { forWhom: "staff", paid: false }, select: { id: true } });
  const out = new Map<string, number>();
  if (!unpaidTypes.length || !working.length) return out;
  const from = working[0], to = working[working.length - 1];
  const rows = await tx.leaveRequest.findMany({ where: { staffId: { in: staffIds }, status: "APPROVED", archivedAt: null, leaveTypeId: { in: unpaidTypes.map((t) => t.id) }, fromDate: { lte: to }, toDate: { gte: from } }, select: { staffId: true, fromDate: true, toDate: true, halfDay: true } });
  for (const r of rows) {
    const days = working.filter((d) => d >= r.fromDate && d <= r.toDate).length;
    out.set(r.staffId!, (out.get(r.staffId!) ?? 0) + (r.halfDay ? Math.min(0.5, days) : days));
  }
  return out;
}

/** Recoveries due this month: active, not paused advances and loans, oldest first. */
async function plannedRecoveries(tx: Tx, staffIds: string[], month: Date, runId: string) {
  const rows = await tx.salaryAdvance.findMany({ where: { staffId: { in: staffIds }, status: "ACTIVE", paused: false, startMonth: { lte: month } }, orderBy: { createdAt: "asc" }, include: { recoveries: true } });
  const out = new Map<string, { advanceId: string; amountPaise: bigint }[]>();
  for (const a of rows) {
    const taken = a.recoveries.filter((r) => r.runId !== runId).reduce((s, r) => s + r.amountPaise, ZERO);
    const left = a.amountPaise - taken;
    if (left <= ZERO) continue;
    const take = a.installmentPaise < left ? a.installmentPaise : left;
    const list = out.get(a.staffId) ?? [];
    list.push({ advanceId: a.id, amountPaise: take });
    out.set(a.staffId, list);
  }
  return out;
}

/**
 * Calculate (or recalculate) a run: every staff member's line from their
 * structure version, attendance and leave up to today, adjustments,
 * recoveries and the month's PF, ESI and Professional Tax rules.
 */
export async function calculateRun(tx: Tx, ctx: SchoolContext, runId: string, today: Date) {
  const run = await getRun(tx, runId);
  assertEditable(run);
  const month = run.month;
  const end = lastOfMonth(month);
  const [settings, stat] = await Promise.all([salarySettings(tx, ctx), statutoryFor(tx, ctx, month)]);
  const slabs = stat.ptOn ? await ptSlabs(tx, stat.ptState) : [];
  const staff = await payrollStaff(tx, run.campusId, month);
  const ids = staff.map((s) => s.id);
  const upTo = end < today ? end : today;
  const before = upTo < month;
  const att = ids.length && !before ? await staffMonthForSalary(tx, ctx, { staffIds: ids, from: month, to: upTo, campusId: run.campusId }) : [];
  const days = before ? { working: [] as Date[] } : await schoolDays(tx, ctx, month, upTo, run.campusId);
  const unpaid = await unpaidLeave(tx, ids, days.working);
  const recover = await plannedRecoveries(tx, ids, month, run.id);
  const structures = await tx.salaryStructure.findMany({ where: { staffId: { in: ids }, archivedAt: null, effectiveFrom: { lte: month } }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
  // Staff library fines sent to salary (Library Management) arrive as one-time deductions.
  await attachFinesToRun(tx, ctx, run, [...new Set(structures.map((x) => x.staffId))]);
  const adjustments = await tx.payrollAdjustment.findMany({ where: { runId: run.id, archivedAt: null } });

  const calendarDays = end.getUTCDate();
  const daysInMonth = settings.lopDays === "thirty" ? 30 : calendarDays;
  const yearlyLimit = settings.tdsReminderAbovePaise;

  const totals = { staff: 0, gross: ZERO, ded: ZERO, net: ZERO, erPf: ZERO, erEsi: ZERO };
  const seen = new Set<string>();
  for (const s of staff) {
    seen.add(s.id);
    const a = att.find((x) => x.staffId === s.id);
    const st = structures.find((x) => x.staffId === s.id) ?? null;
    const adj = adjustments.filter((x) => x.staffId === s.id);
    const unpaidDays = unpaid.get(s.id) ?? 0;
    const lop = lopOf({ absentDays: a?.absentDays ?? 0, unpaidLeaveDays: unpaidDays, halfDays: a?.halfDays ?? 0, lateMarks: a?.lateMarks ?? 0, lateMarksPerHalfDay: settings.lateMarksPerHalfDay });
    const away = notEmployedDays(month, end, s.joiningDate, s.leavingDate);
    const awayScaled = settings.lopDays === "thirty" ? Math.round((away * 30) / calendarDays) : away;
    const flags: string[] = [];
    const notes: string[] = [];
    const base = {
      daysInMonth, workingDays: a?.workingDays ?? 0, presentDays: a?.presentDays ?? 0, leaveDays: a?.leaveDays ?? 0, unpaidLeaveDays: unpaidDays,
      absentDays: a?.absentDays ?? 0, lateMarks: a?.lateMarks ?? 0, notMarkedDays: a?.notMarkedDays ?? 0, lopDays: lop.total, overtimeMinutes: a?.overtimeMinutes ?? 0,
    };
    if ((a?.notMarkedDays ?? 0) > 0) flags.push("Attendance not complete");
    if (s.leavingDate && s.leavingDate >= month && s.leavingDate <= end) flags.push(`Leaving ${s.leavingDate.getUTCDate()} ${monthName(month).slice(0, 3)}`);
    if (lop.late > 0) notes.push(`${a?.lateMarks} late marks = ${lop.late} ${lop.late === 1 ? "day" : "days"} (${settings.lateMarksPerHalfDay} late marks = half a day)`);
    if (unpaidDays > 0) notes.push(`${unpaidDays} ${unpaidDays === 1 ? "day" : "days"} of leave without pay`);
    if ((a?.absentDays ?? 0) > 0) notes.push(`Absent without leave ${a!.absentDays} ${a!.absentDays === 1 ? "day" : "days"}`);
    if (away > 0) notes.push(s.joiningDate > month ? `Joined ${formatDate(s.joiningDate)}` : `Left ${formatDate(s.leavingDate!)}`);

    let data: Omit<Prisma.PayrollLineUncheckedCreateInput, "schoolId" | "runId" | "staffId">;
    if (!st) {
      flags.unshift("No salary structure");
      data = { ...base, structureId: null, included: false, paidDays: 0, earnings: [], otherDeductions: [], recoveries: [], flags, notes };
    } else {
      const overtimePaise = settings.overtimeOn ? (settings.overtimeHourPaise * BigInt(base.overtimeMinutes)) / BigInt(60) : ZERO;
      const pay = workOutPay({
        lines: fromStored(st.lines), pfApplies: st.pfApplies, esiApplies: st.esiApplies, tdsPaise: st.tdsPaise,
        daysInMonth, notEmployedDays: awayScaled, lopDays: lop.total, overtimePaise,
        adjustments: adj.map((x) => ({ type: x.type, amountPaise: x.amountPaise })), recoveries: recover.get(s.id) ?? [],
        statutory: asStatutory(stat), ptSlabs: slabs, month: month.getUTCMonth() + 1,
      });
      if (adj.length) flags.push("Adjustment added");
      if (st.tdsPaise === ZERO && pay.fullGross * BigInt(12) > yearlyLimit) flags.push("No TDS amount");
      if (pay.recoveryReduced) {
        flags.push("Recovery reduced");
        notes.push(`Loan or advance recovery reduced to ${formatRupees(pay.recovery)} this month so net pay is not below zero; the rest moves to next month`);
      }
      totals.staff++;
      totals.gross += pay.gross; totals.ded += pay.deductions; totals.net += pay.net; totals.erPf += pay.erPf; totals.erEsi += pay.erEsi;
      data = {
        ...base, structureId: st.id, included: true, paidDays: pay.paidDays,
        earnings: pay.earnings.map((e) => ({ ...e, amountPaise: String(e.amountPaise) })), otherDeductions: pay.fixedDeductions.map((d) => ({ ...d, amountPaise: String(d.amountPaise) })),
        fullGrossPaise: pay.fullGross, lopPaise: pay.lopPaise, overtimePaise: pay.overtime, addPaise: pay.add, cutPaise: pay.cut, grossPaise: pay.gross, basicEarnedPaise: pay.basicEarned,
        pfWagePaise: pay.pfWage, pfPaise: pay.pf, esiApplies: pay.esiApplies, esiWagePaise: pay.esiWage, esiPaise: pay.esi, ptPaise: pay.pt, tdsPaise: pay.tds,
        recoveryPaise: pay.recovery, recoveries: pay.recoveries.map((r) => ({ advanceId: r.advanceId, amountPaise: String(r.amountPaise), planned: String(r.planned) })),
        deductionsPaise: pay.deductions, netPaise: pay.net, erPfPaise: pay.erPf, erEsiPaise: pay.erEsi, flags, notes,
      };
    }
    const zeroed = { fullGrossPaise: ZERO, lopPaise: ZERO, overtimePaise: ZERO, addPaise: ZERO, cutPaise: ZERO, grossPaise: ZERO, basicEarnedPaise: ZERO, pfWagePaise: ZERO, pfPaise: ZERO, esiApplies: false, esiWagePaise: ZERO, esiPaise: ZERO, ptPaise: ZERO, tdsPaise: ZERO, recoveryPaise: ZERO, deductionsPaise: ZERO, netPaise: ZERO, erPfPaise: ZERO, erEsiPaise: ZERO };
    const full = { ...zeroed, ...data };
    await tx.payrollLine.upsert({
      where: { runId_staffId: { runId: run.id, staffId: s.id } },
      create: { schoolId: ctx.schoolId, runId: run.id, staffId: s.id, ...full },
      update: full,
    });
  }
  // People no longer paid this month (left, moved campus) drop out of the run.
  const stale = await tx.payrollLine.findMany({ where: { runId: run.id, staffId: { notIn: [...seen] } }, select: { id: true } });
  if (stale.length) await tx.payrollLine.updateMany({ where: { id: { in: stale.map((x) => x.id) } }, data: { included: false, flags: ["No longer on this campus's payroll"], grossPaise: ZERO, deductionsPaise: ZERO, netPaise: ZERO, erPfPaise: ZERO, erEsiPaise: ZERO, recoveryPaise: ZERO, recoveries: [] } });

  const updated = await tx.payrollRun.update({
    where: { id: run.id },
    data: { status: "CALCULATED", staffCount: totals.staff, grossPaise: totals.gross, deductionsPaise: totals.ded, netPaise: totals.net, employerPfPaise: totals.erPf, employerEsiPaise: totals.erEsi, statutoryId: stat.id, calculatedAt: new Date() },
  });
  await writeAudit(tx, ctx, {
    action: run.status === "OPEN" ? "payroll-calculated" : "payroll-recalculated", recordType: "Payroll Run", recordId: run.id,
    before: run.status === "OPEN" ? null : { net: formatRupees(run.netPaise), staff: run.staffCount },
    after: { month: monthName(month), staff: totals.staff, gross: formatRupees(totals.gross), net: formatRupees(totals.net), upTo: isoDay(upTo) },
  });
  return updated;
}

export type AdjustmentInput = { runId: string; staffId: string; type: string; amountPaise: bigint; reason: string };

/** A bonus, arrears or one-time deduction with its reason; the run is worked out again. */
export async function addAdjustment(tx: Tx, ctx: SchoolContext, input: AdjustmentInput, today: Date) {
  const run = await getRun(tx, input.runId);
  assertEditable(run);
  const type = ["BONUS", "ARREARS", "DEDUCTION", "OTHER"].includes(input.type) ? input.type : null;
  if (!type) throw new MoneyProblem("Choose the type of adjustment.", "type");
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Enter an amount.", "amount");
  if (input.amountPaise > BigInt(100000000)) throw new MoneyProblem("More than ₹10 lakh: check the amount.", "amount");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new MoneyProblem(`Give a reason for this ${adjustmentLabel(type).toLowerCase()}.`, "reason");
  const line = await tx.payrollLine.findFirst({ where: { runId: run.id, staffId: input.staffId } });
  const staff = await tx.staff.findFirst({ where: { id: input.staffId }, select: { fullName: true } });
  if (!staff || (line && !line.included && line.flags.includes("No salary structure"))) throw new MoneyProblem(staff ? `${staff.fullName} has no salary structure. Add one first.` : "Choose the staff member.", "staffId");
  const adj = await tx.payrollAdjustment.create({ data: { schoolId: ctx.schoolId, runId: run.id, staffId: input.staffId, type, amountPaise: input.amountPaise, reason, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "payroll-adjustment-added", recordType: "Payroll Adjustment", recordId: adj.id, after: { month: monthName(run.month), staff: staff.fullName, type: adjustmentLabel(type), amount: formatRupees(input.amountPaise), reason } });
  await calculateRun(tx, ctx, run.id, today);
  return { adj, staff: staff.fullName, month: run.month };
}

/** Removes an adjustment before the run is sent (kept, archived, with who did it). */
export async function archiveAdjustment(tx: Tx, ctx: SchoolContext, adjustmentId: string, today: Date) {
  const adj = await tx.payrollAdjustment.findFirst({ where: { id: adjustmentId, archivedAt: null }, include: { run: true } });
  if (!adj) throw new MoneyProblem("This adjustment was not found.");
  assertEditable(adj.run);
  await tx.payrollAdjustment.update({ where: { id: adj.id }, data: { archivedAt: new Date(), archivedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "payroll-adjustment-archived", recordType: "Payroll Adjustment", recordId: adj.id, before: { type: adjustmentLabel(adj.type), amount: formatRupees(adj.amountPaise), reason: adj.reason } });
  // A library fine taken off the salary is due at the library desk again.
  await releaseFineAdjustment(tx, ctx, adj.id, adj.run.month);
  await calculateRun(tx, ctx, adj.runId, today);
  return adj;
}

/** Send for approval (Settings, Forms & Approvals: "Salary and payroll"). Nobody approves a run they sent. */
export async function sendForApproval(tx: Tx, ctx: SchoolContext, runId: string) {
  const run = await getRun(tx, runId);
  if (run.status === "OPEN") throw new MoneyProblem("Calculate the month first.");
  assertEditable(run);
  if (run.staffCount === 0) throw new MoneyProblem("Nobody in this month has a salary structure yet. Add structures and recalculate.");
  const left = await tx.payrollLine.count({ where: { runId: run.id, included: false, flags: { has: "No salary structure" } } });
  const approval = await requestApproval(tx, ctx, {
    type: "payroll", recordType: "Payroll Run", recordId: run.id, amountPaise: run.netPaise,
    summary: `${monthName(run.month)} salary · ${run.staffCount} staff · net ${formatRupees(run.netPaise)}`,
    reason: left ? `${left} staff left out: no salary structure.` : null,
  });
  const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: "WAITING", sentById: ctx.userId, sentAt: new Date(), approvalId: approval.id, sentBackReason: null } });
  await writeAudit(tx, ctx, { action: "payroll-sent-for-approval", recordType: "Payroll Run", recordId: run.id, before: { status: run.status }, after: { status: "WAITING", net: formatRupees(run.netPaise) } });
  return updated;
}

/** Take a run back from approval to change it (only the person who sent it). */
export async function takeBack(tx: Tx, ctx: SchoolContext, runId: string) {
  const run = await getRun(tx, runId);
  if (run.status !== "WAITING" || !run.approvalId) throw new MoneyProblem("This month is not waiting for approval.");
  if (run.sentById !== ctx.userId) throw new MoneyProblem("Only the person who sent it can take it back. Ask the approver to send it back instead.");
  await decide(tx, ctx, run.approvalId, "withdraw", null);
  return getRun(tx, runId);
}

/** What happens when the payroll request is decided (registered in handlers.ts). */
export async function decidePayroll(tx: Tx, ctx: SchoolContext, runId: string, decision: string, note: string | null) {
  const run = await getRun(tx, runId);
  if (run.status !== "WAITING") return;
  if (decision === "approve") return approveRun(tx, ctx, run.id);
  await tx.payrollRun.update({ where: { id: run.id }, data: { status: "CALCULATED", sentBackReason: decision === "withdraw" ? null : note, approvalId: null } });
  await writeAudit(tx, ctx, { action: decision === "withdraw" ? "payroll-taken-back" : "payroll-sent-back", recordType: "Payroll Run", recordId: run.id, before: { status: "WAITING" }, after: { status: "CALCULATED", reason: note } });
}

/** A6: approved. Amounts freeze, slips are made, recoveries are taken, staff are told, last month's paid run locks. */
async function approveRun(tx: Tx, ctx: SchoolContext, runId: string) {
  const run = await tx.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } });
  const lines = await tx.payrollLine.findMany({ where: { runId, included: true } });
  for (const l of lines) {
    await tx.payslip.upsert({ where: { lineId: l.id }, create: { schoolId: ctx.schoolId, runId, lineId: l.id, staffId: l.staffId, month: run.month, netPaise: l.netPaise }, update: { netPaise: l.netPaise } });
    for (const r of (l.recoveries as { advanceId: string; amountPaise: string }[]) ?? []) {
      const amount = BigInt(r.amountPaise);
      if (amount <= ZERO) continue;
      const exists = await tx.salaryRecovery.findFirst({ where: { advanceId: r.advanceId, runId } });
      if (exists) continue;
      await tx.salaryRecovery.create({ data: { schoolId: ctx.schoolId, advanceId: r.advanceId, kind: "PAYROLL", runId, date: lastOfMonth(run.month), amountPaise: amount, createdById: ctx.userId } });
      const adv = await tx.salaryAdvance.update({ where: { id: r.advanceId }, data: { recoveredPaise: { increment: amount } } });
      if (adv.recoveredPaise >= adv.amountPaise) {
        await tx.salaryAdvance.update({ where: { id: adv.id }, data: { status: "CLOSED", closedAt: new Date(), history: [...((adv.history as object[]) ?? []), { at: new Date().toISOString(), by: ctx.userId, what: "Closed: fully recovered", reason: `Last installment in ${monthName(run.month)} salary` }] } });
        await writeAudit(tx, ctx, { action: "salary-advance-closed", recordType: "Salary Advance", recordId: adv.id, after: { number: adv.number, how: "recovered from salary" } });
      }
    }
  }
  // Library fines taken in this salary are paid (Library Management).
  await finesPaidBySalary(tx, ctx, run, new Set(lines.map((l) => l.staffId)));
  // The earlier paid month locks by itself.
  const earlier = await tx.payrollRun.findMany({ where: { campusId: run.campusId, month: { lt: run.month }, status: "PAID" } });
  for (const e of earlier) {
    await tx.payrollRun.update({ where: { id: e.id }, data: { status: "LOCKED", lockedAt: new Date(), lockedById: null } });
    await writeAudit(tx, ctx, { action: "payroll-locked", recordType: "Payroll Run", recordId: e.id, before: { status: "PAID" }, after: { status: "LOCKED", how: `${monthName(run.month)} was approved` } });
  }
  const staff = await tx.staff.findMany({ where: { id: { in: lines.map((l) => l.staffId) } }, select: { id: true, userLoginId: true } });
  // The "Salary slip ready" message (Communication, automatic rules). When the rule is off
  // or cannot send, staff with a login still get the in-app notification.
  const sent = staff.length
    ? await sendAutomatic(tx, ctx, { rule: "salary-slip", event: { key: `salary-slip:${run.id}`, label: `${monthName(run.month)} salary approved` }, to: { staffIds: staff.map((s) => s.id) }, values: { month: monthName(run.month) }, source: { type: "Payroll Run", id: run.id } })
    : null;
  if (sent && sent.status !== "sent") {
    for (const s of staff) {
      if (s.userLoginId) await notify(tx, ctx, { to: s.userLoginId, type: "salary-slip", text: `Your salary slip for ${monthName(run.month)} is ready`, link: "/salary-management/slips?mine=1", groupKey: `salary-slip-${run.id}` });
    }
  }
  await writeAudit(tx, ctx, { action: "payroll-approved", recordType: "Payroll Run", recordId: run.id, before: { status: "WAITING" }, after: { status: "APPROVED", slips: lines.length, net: formatRupees(run.netPaise) } });
}

export type PayInput = { date: Date; mode: string; reference: string | null; accountId: string | null; today: Date };

/** Mark paid: only now does the salary reach the Day Book, as one entry on the date paid (D12, Done when 6 and 12). */
export async function markPaid(tx: Tx, ctx: SchoolContext, runId: string, input: PayInput) {
  const run = await getRun(tx, runId);
  if (run.status === "PAID" || run.status === "LOCKED") throw new MoneyProblem(`${monthName(run.month)} is already marked paid.`);
  if (run.status !== "APPROVED") throw new MoneyProblem(`${monthName(run.month)} is not approved yet. Salary is paid only after approval.`);
  if (!["BANK_TRANSFER", "CHEQUE", "CASH"].includes(input.mode)) throw new MoneyProblem("Choose how it was paid.", "mode");
  if (input.mode !== "CASH" && !input.reference) throw new MoneyProblem(input.mode === "CHEQUE" ? "Enter the cheque numbers." : "Enter the bank batch or UTR reference.", "reference");
  if (input.date > input.today) throw new MoneyProblem("The date paid cannot be in the future.", "date");
  if (input.date < run.month) throw new MoneyProblem(`The date paid is before ${monthName(run.month)} began.`, "date");
  const head = await systemHead(tx, ctx, "salary");
  const accountId = await accountForMode(tx, ctx, input.mode, input.accountId);
  const reversals = (run.reversals as unknown[]) ?? [];
  await postToDayBook(tx, ctx, {
    date: input.date, direction: "OUT", amountPaise: run.netPaise, mode: input.mode, section: "salary", headName: head?.name ?? "Salaries", accountHeadId: head?.id ?? null,
    accountId, sourceType: "payroll", sourceId: run.id, sourceKey: `payroll:${run.id}${reversals.length ? `:${reversals.length}` : ""}`,
    partyName: `${monthName(run.month)} salary · ${run.staffCount} staff`, reference: input.reference,
    note: `Gross ${formatRupees(run.grossPaise)} less deductions ${formatRupees(run.deductionsPaise)}.`,
  });
  const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidOn: input.date, payMode: input.mode, payReference: input.reference, payAccountId: accountId, paidById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "payroll-paid", recordType: "Payroll Run", recordId: run.id, before: { status: "APPROVED" }, after: { status: "PAID", paidOn: formatDate(input.date), mode: payModeLabel(input.mode), reference: input.reference, net: formatRupees(run.netPaise) } });
  return updated;
}

/** A payment marked by mistake: reversed in the Day Book today, with a reason. The run is approved again. Locked runs never change. */
export async function reversePayment(tx: Tx, ctx: SchoolContext, runId: string, reason: string, today: Date) {
  const run = await getRun(tx, runId);
  if (run.status === "LOCKED") throw new MoneyProblem(frozenWords(run));
  if (run.status !== "PAID") throw new MoneyProblem("Only a month marked paid can have its payment reversed.");
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  await reverseSource(tx, ctx, { sourceType: "payroll", sourceId: run.id, date: today, reversalType: "payroll-reversal", note: reason.trim() });
  const list = [...((run.reversals as object[]) ?? []), { at: new Date().toISOString(), by: ctx.userId, reason: reason.trim(), paidOn: run.paidOn ? isoDay(run.paidOn) : null }];
  const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: "APPROVED", paidOn: null, payMode: null, payReference: null, payAccountId: null, paidById: null, reversals: list } });
  await writeAudit(tx, ctx, { action: "payroll-payment-reversed", recordType: "Payroll Run", recordId: run.id, before: { status: "PAID", paidOn: run.paidOn ? formatDate(run.paidOn) : null }, after: { status: "APPROVED", reason: reason.trim(), reversedOn: formatDate(today) } });
  return updated;
}

/** Lock for good. */
export async function lockRun(tx: Tx, ctx: SchoolContext, runId: string) {
  const run = await getRun(tx, runId);
  if (run.status === "LOCKED") throw new MoneyProblem(`${monthName(run.month)} is already locked.`);
  if (run.status !== "PAID") throw new MoneyProblem("Mark the month paid before locking it.");
  const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: "LOCKED", lockedAt: new Date(), lockedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "payroll-locked", recordType: "Payroll Run", recordId: run.id, before: { status: "PAID" }, after: { status: "LOCKED" } });
  return updated;
}

/** Sum of a run's deductions by kind, for the totals card and the reports. */
export async function runBreakdown(tx: Tx, runId: string) {
  const agg = await tx.payrollLine.aggregate({ where: { runId, included: true }, _sum: { pfPaise: true, esiPaise: true, ptPaise: true, tdsPaise: true, recoveryPaise: true, cutPaise: true, addPaise: true, erPfPaise: true, erEsiPaise: true, lopPaise: true } });
  const s = agg._sum;
  const z = (v: bigint | null) => v ?? ZERO;
  const lines = await tx.payrollLine.findMany({ where: { runId, included: true }, select: { otherDeductions: true } });
  const other = lines.reduce((sum, l) => sum + ((l.otherDeductions as { amountPaise: string }[]) ?? []).reduce((x, d) => x + BigInt(d.amountPaise), ZERO), ZERO);
  return { pf: z(s.pfPaise), esi: z(s.esiPaise), pt: z(s.ptPaise), tds: z(s.tdsPaise), recovery: z(s.recoveryPaise), cut: z(s.cutPaise), add: z(s.addPaise), erPf: z(s.erPfPaise), erEsi: z(s.erEsiPaise), lop: z(s.lopPaise), other };
}

export const lineDays = (l: { paidDays: Prisma.Decimal; leaveDays: Prisma.Decimal; unpaidLeaveDays: Prisma.Decimal; lopDays: Prisma.Decimal; presentDays: Prisma.Decimal; absentDays: Prisma.Decimal }) => ({
  paid: n(l.paidDays), leave: n(l.leaveDays) - n(l.unpaidLeaveDays), unpaid: n(l.unpaidLeaveDays), lop: n(l.lopDays), present: n(l.presentDays), absent: n(l.absentDays),
});
