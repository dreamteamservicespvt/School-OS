// Corrections of an earlier month (10 §2 step 11, §5 "Changing an approved or
// locked payroll", Done when 7; 04 rule 13). An approved salary month never
// changes. When leave is approved, cancelled or changed, or attendance is
// corrected, after a month's salary was worked out and approved (or days after
// its calculation date come in), the next salary still being prepared carries
// the difference as one adjustment per person and month: Arrears when loss of
// pay is given back, a Deduction when more loss of pay is found, each with its
// reason and the month it belongs to. The PF and ESI on it are worked out by
// that month's rules (Salary Settings, the rates the month was approved with).
//
// It is worked out again on every calculation and never made twice: what other
// salaries already carry for that month, and corrections the Accountant
// removed, are taken off first. Lines worked out before 18 October 2026 have
// no half_days or leave_lop_days and are left alone (a manual adjustment, as
// before).
import "server-only";

import type { PayrollAdjustment, PayrollLine, PayrollRun, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { staffMonthForSalary, type SalaryAttendance } from "../attendance/staff";
import { lateLop, workOutPay, type Carried } from "./calc";
import { asStatutory, statutoryFor } from "./settings";
import { fromStored } from "./structures";
import { addMonths, adjustmentLabel, dayNum, daysWord, lastOfMonth, monthName } from "./words";

const ZERO = BigInt(0);
const FROZEN = ["APPROVED", "PAID", "LOCKED"] as const;
/** How many months back a late change is looked for. */
export const LOOK_BACK_MONTHS = 12;

const n = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const half = (x: number) => Math.round(x * 2) / 2;
const abs = (v: bigint) => (v < ZERO ? -v : v);

type Facts = { absent: number; half: number; leave: number; unpaid: number; beyond: number; late: number };
const factsOfLine = (l: PayrollLine): Facts => ({
  absent: n(l.absentDays), half: l.halfDays ?? 0, leave: half(n(l.leaveDays) - n(l.unpaidLeaveDays) - n(l.leaveLopDays)),
  unpaid: n(l.unpaidLeaveDays), beyond: n(l.leaveLopDays), late: l.lateMarks,
});
const factsOfMonth = (a: SalaryAttendance): Facts => ({
  absent: a.absentDays, half: a.halfDays, leave: half(a.leaveDays - a.unpaidLeaveDays - a.leaveLopDays),
  unpaid: a.unpaidLeaveDays, beyond: a.leaveLopDays, late: a.lateMarks,
});
const WORDS: [keyof Facts, string][] = [["absent", "absent"], ["half", "half days"], ["leave", "leave"], ["unpaid", "leave without pay"], ["beyond", "leave beyond the balance"], ["late", "late marks"]];

/** "absent 2 → 0 days, leave 0 → 2 days" */
export function changeWords(before: Facts, after: Facts) {
  return WORDS.filter(([k]) => before[k] !== after[k])
    .map(([k, w]) => (k === "late" ? `${w} ${before[k]} → ${after[k]}` : `${w} ${dayNum(before[k])} → ${daysWord(after[k])}`))
    .join(", ");
}

/** "September 2026 salary: 2 days of loss of pay given back. Leave or attendance changed after that salary was worked out: absent 2 → 0 days, leave 0 → 2 days." */
export function correctionReason(month: Date, lopChange: number, changes: string) {
  const head = lopChange < 0 ? `${daysWord(-lopChange)} of loss of pay given back` : `${daysWord(lopChange)} more loss of pay`;
  return `${monthName(month)} salary: ${head}. Leave or attendance changed after that salary was worked out${changes ? `: ${changes}` : ""}.`;
}


/** Did anything that reaches salary change for these people in that month since it was worked out? */
async function worthLooking(tx: Tx, m: Pick<PayrollRun, "month" | "calculatedAt" | "calculatedUpTo">, staffIds: string[]) {
  const end = lastOfMonth(m.month);
  if (!m.calculatedAt || !m.calculatedUpTo || m.calculatedUpTo < end) return true;
  const since = m.calculatedAt;
  const marks = await tx.attendanceMark.count({ where: { staffId: { in: staffIds }, date: { gte: m.month, lte: end }, updatedAt: { gte: since } } });
  if (marks > 0) return true;
  return (await tx.leaveRequest.count({ where: { staffId: { in: staffIds }, fromDate: { lte: end }, toDate: { gte: m.month }, updatedAt: { gte: since } } })) > 0;
}

type Next = { type: "ARREARS" | "DEDUCTION"; amountPaise: bigint; lopDays: number; reason: string } & Carried;

const sameAs = (a: PayrollAdjustment, b: Next) =>
  a.type === b.type && a.amountPaise === b.amountPaise && n(a.lopDays) === b.lopDays && a.reason === b.reason
  && a.pfWagePaise === b.pfWagePaise && a.pfPaise === b.pfPaise && a.erPfPaise === b.erPfPaise
  && a.esiWagePaise === b.esiWagePaise && a.esiPaise === b.esiPaise && a.erEsiPaise === b.erEsiPaise;

const moneyWords = (x: Next | PayrollAdjustment) => ({
  type: adjustmentLabel(x.type), amount: formatRupees(x.amountPaise), lopDays: n(x.lopDays),
  pf: formatRupees(x.pfPaise), esi: formatRupees(x.esiPaise), employerPf: formatRupees(x.erPfPaise), employerEsi: formatRupees(x.erEsiPaise), reason: x.reason,
});

/**
 * Salary Management, working out a run: for each person paid in it, checks
 * the last months whose salary is approved, paid or locked, and puts any
 * difference on this run as a correction (made, changed or, when no longer
 * needed, archived). Every money change is in the audit log. Returns how many
 * corrections were made or changed.
 */
export async function carryCorrections(tx: Tx, ctx: SchoolContext, run: Pick<PayrollRun, "id" | "month">, staffIds: string[], today: Date, lateMarksPerHalfDay: number) {
  if (staffIds.length === 0) return 0;
  const lines = await tx.payrollLine.findMany({
    where: {
      staffId: { in: staffIds }, included: true, structureId: { not: null }, halfDays: { not: null }, leaveLopDays: { not: null },
      run: { status: { in: [...FROZEN] }, month: { lt: run.month, gte: addMonths(run.month, -LOOK_BACK_MONTHS) } },
    },
    include: { run: { select: { id: true, month: true, campusId: true, statutoryId: true, calculatedAt: true, calculatedUpTo: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (lines.length === 0) return 0;
  const made = await tx.payrollAdjustment.findMany({ where: { staffId: { in: staffIds }, fromRunId: { in: [...new Set(lines.map((l) => l.runId))] } } });
  const names = new Map((await tx.staff.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.staffId))] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  const byRun = new Map<string, typeof lines>();
  for (const l of lines) byRun.set(l.runId, [...(byRun.get(l.runId) ?? []), l]);

  let changed = 0;
  for (const group of byRun.values()) {
    const m = group[0].run;
    const ids = group.map((l) => l.staffId);
    const here = made.filter((a) => a.fromRunId === m.id && a.runId === run.id && !a.archivedAt);
    if (!here.length && !(await worthLooking(tx, m, ids))) continue;
    const end = lastOfMonth(m.month);
    const att = await staffMonthForSalary(tx, ctx, { staffIds: ids, from: m.month, to: end < today ? end : today, campusId: m.campusId });
    const stat = (m.statutoryId ? await tx.statutorySetting.findFirst({ where: { id: m.statutoryId } }) : null) ?? (await statutoryFor(tx, ctx, m.month));
    const structures = await tx.salaryStructure.findMany({ where: { id: { in: group.map((l) => l.structureId!) } } });

    for (const l of group) {
      const a = att.find((x) => x.staffId === l.staffId);
      const st = structures.find((x) => x.id === l.structureId);
      if (!a || !st) continue;
      const current = here.find((x) => x.staffId === l.staffId) ?? null;
      const before = factsOfLine(l);
      const after = factsOfMonth(a);
      // Late marks: the rule the month was worked out with stays, unless the late marks themselves changed.
      const lateBefore = half(n(l.lopDays) - before.absent - before.unpaid - before.beyond - before.half * 0.5);
      const lateAfter = after.late === before.late ? lateBefore : lateLop(after.late, lateMarksPerHalfDay);
      const target = half(after.absent + after.unpaid + after.beyond + after.half * 0.5 + lateAfter);
      // Already carried by another salary, or removed by the Accountant (not to come back).
      const done = made
        .filter((x) => x.fromRunId === m.id && x.staffId === l.staffId && x.id !== current?.id && (!x.archivedAt || x.archivedById !== null))
        .reduce((s, x) => s + n(x.lopDays), 0);
      const base = half(n(l.lopDays) + done);
      const pending = half(target - base);

      let next: Next | null = null;
      if (pending !== 0) {
        const common = {
          lines: fromStored(st.lines), pfApplies: st.pfApplies, esiApplies: st.esiApplies, tdsPaise: ZERO,
          daysInMonth: l.daysInMonth, notEmployedDays: Math.max(0, l.daysInMonth - n(l.lopDays) - n(l.paidDays)), overtimePaise: l.overtimePaise,
          statutory: asStatutory(stat), ptSlabs: [], month: m.month.getUTCMonth() + 1,
        };
        const was = workOutPay({ ...common, lopDays: base });
        const now = workOutPay({ ...common, lopDays: base + pending });
        const carried: Carried = {
          pfWagePaise: now.pfWage - was.pfWage, pfPaise: now.pf - was.pf, erPfPaise: now.erPf - was.erPf,
          esiWagePaise: now.esiWage - was.esiWage, esiPaise: now.esi - was.esi, erEsiPaise: now.erEsi - was.erEsi,
        };
        const diff = now.earned - was.earned;
        if (diff !== ZERO || Object.values(carried).some((v) => v !== ZERO)) {
          next = { type: pending < 0 ? "ARREARS" : "DEDUCTION", amountPaise: abs(diff), lopDays: pending, reason: correctionReason(m.month, pending, changeWords(before, after)), ...carried };
        }
      }

      const staff = names.get(l.staffId) ?? "Staff";
      if (!next) {
        if (current) {
          await tx.payrollAdjustment.update({ where: { id: current.id }, data: { archivedAt: new Date(), archivedById: null } });
          await writeAudit(tx, ctx, { action: "payroll-adjustment-archived", recordType: "Payroll Adjustment", recordId: current.id, before: { staff, for: monthName(m.month), ...moneyWords(current) }, after: { why: `Not needed any more: ${monthName(m.month)} leave and attendance are back to what was paid` } });
          changed++;
        }
        continue;
      }
      if (current && sameAs(current, next)) continue;
      if (current) {
        await tx.payrollAdjustment.update({ where: { id: current.id }, data: next });
        await writeAudit(tx, ctx, { action: "payroll-adjustment-changed", recordType: "Payroll Adjustment", recordId: current.id, before: { staff, for: monthName(m.month), ...moneyWords(current) }, after: { staff, for: monthName(m.month), ...moneyWords(next) } });
      } else {
        const adj = await tx.payrollAdjustment.create({ data: { schoolId: ctx.schoolId, runId: run.id, staffId: l.staffId, forMonth: m.month, fromRunId: m.id, createdById: ctx.userId, ...next } });
        await writeAudit(tx, ctx, { action: "payroll-adjustment-added", recordType: "Payroll Adjustment", recordId: adj.id, after: { month: monthName(run.month), staff, for: monthName(m.month), from: `${monthName(m.month)} salary, changed after approval`, ...moneyWords(next) } });
      }
      changed++;
    }
  }
  return changed;
}
