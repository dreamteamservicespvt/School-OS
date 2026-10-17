// Staff Leave (09 §2 Staff Leave, §5 rules, automation A5): applying,
// balances, decisions, cancelling, adjustments and carry-forward. Each
// balance is its own Leave Balance record (one per staff member, leave type
// and leave year); days taken are worked out from approved Leave Requests.
import "server-only";

import { Prisma, type LeaveRequest, type LeaveType, type LeaveTypeRule, type Staff } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { requestApproval } from "../approvals";
import { formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { headLoginFor, ensureHrDefaults } from "./settings";
import { addDays, eachDay, isoDay, isoWeekday } from "./dates";

export class LeaveProblem extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "LeaveProblem";
  }
}

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
/** "1 day", "2.5 days" */
export const daysText = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;

type Adjustment = { days: number; reason: string; byId: string | null; at: string; kind?: "manual" | "carry-forward"; fromYearId?: string };

// ---------------------------------------------------------------- days

/** Holidays and vacations on the School Calendar between two dates, as YYYY-MM-DD. */
export async function holidaySet(tx: Tx, ctx: SchoolContext, from: Date, to: Date, campusId?: string | null): Promise<Set<string>> {
  const entries = await tx.calendarEntry.findMany({
    where: {
      schoolId: ctx.schoolId, archivedAt: null, attendanceOn: false, type: { in: ["holiday", "vacation"] },
      startDate: { lte: to }, endDate: { gte: from },
      ...(campusId ? { OR: [{ campusId: null }, { campusId }] } : {}),
    },
    select: { startDate: true, endDate: true },
  });
  const out = new Set<string>();
  for (const e of entries) for (const d of eachDay(e.startDate < from ? from : e.startDate, e.endDate > to ? to : e.endDate)) out.add(isoDay(d));
  return out;
}

export const isWorkingDay = (d: Date, holidays: Set<string>) => isoWeekday(d) !== 7 && !holidays.has(isoDay(d));

/**
 * Leave days between two dates. Sundays and School Calendar holidays inside
 * the range are not counted unless the leave type counts them (09 Apply for
 * leave, "To date" note). A half day counts 0.5.
 */
export function countLeaveDays(from: Date, to: Date, holidays: Set<string>, opts: { countsHolidays?: boolean; halfDay?: boolean } = {}) {
  if (to < from) return 0;
  const days = eachDay(from, to).filter((d) => opts.countsHolidays || isWorkingDay(d, holidays)).length;
  if (opts.halfDay) return days > 0 ? 0.5 : 0;
  return days;
}

// ---------------------------------------------------------------- balances

/** The leave year: the academic year of the staff member's campus holding the date. */
export async function leaveYearFor(tx: Tx, ctx: SchoolContext, date: Date, campusId: string) {
  return tx.academicYear.findFirst({
    where: { schoolId: ctx.schoolId, campusId, archivedAt: null, startDate: { lte: date }, endDate: { gte: date } },
  });
}

export function quotaFor(type: Pick<LeaveType, "daysPerYear">, rule: Pick<LeaveTypeRule, "quotaByGroup"> | null, staff: Pick<Staff, "employmentType">) {
  const byGroup = (rule?.quotaByGroup ?? {}) as Record<string, number>;
  const v = byGroup[staff.employmentType];
  return typeof v === "number" && v >= 0 ? v : num(type.daysPerYear);
}

/** Makes a staff member's Leave Balance rows for a year with the yearly quota. Safe to run twice. */
export async function ensureBalances(tx: Tx, ctx: SchoolContext, staffIds: string[], academicYearId: string) {
  if (staffIds.length === 0) return 0;
  const [types, rules, staff, existing] = await Promise.all([
    tx.leaveType.findMany({ where: { schoolId: ctx.schoolId, forWhom: "staff", archivedAt: null, paid: true } }),
    tx.leaveTypeRule.findMany({ where: { schoolId: ctx.schoolId } }),
    tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, employmentType: true } }),
    tx.leaveBalance.findMany({ where: { academicYearId, staffId: { in: staffIds } }, select: { staffId: true, leaveTypeId: true } }),
  ]);
  const have = new Set(existing.map((b) => `${b.staffId}:${b.leaveTypeId}`));
  const data: Prisma.LeaveBalanceCreateManyInput[] = [];
  for (const s of staff) {
    for (const t of types) {
      if (have.has(`${s.id}:${t.id}`)) continue;
      const quota = quotaFor(t, rules.find((r) => r.leaveTypeId === t.id) ?? null, s);
      if (quota <= 0 && num(t.daysPerYear) <= 0) continue;
      data.push({ schoolId: ctx.schoolId, academicYearId, staffId: s.id, leaveTypeId: t.id, daysGiven: quota });
    }
  }
  if (data.length) await tx.leaveBalance.createMany({ data, skipDuplicates: true });
  return data.length;
}

export type BalanceRow = {
  type: LeaveType;
  rule: LeaveTypeRule | null;
  balanceId: string | null;
  given: number;
  adjusted: number;
  adjustments: Adjustment[];
  used: number;
  waiting: number;
  /** Allocated plus adjustments minus used. */
  left: number;
  /** Unpaid types have no balance. */
  limited: boolean;
};

/** Days of each leave type taken (approved) and waiting, from the Leave Requests, minus loss-of-pay days. */
async function usedDays(tx: Tx, staffIds: string[], academicYearId: string) {
  const requests = await tx.leaveRequest.findMany({
    where: { staffId: { in: staffIds }, academicYearId, archivedAt: null, status: { in: ["APPROVED", "WAITING"] } },
    select: { id: true, staffId: true, leaveTypeId: true, days: true, status: true },
  });
  const details = await tx.staffLeaveDetail.findMany({ where: { leaveRequestId: { in: requests.map((r) => r.id) } } });
  const lop = new Map(details.map((d) => [d.leaveRequestId, num(d.lopDays)]));
  const out = new Map<string, { used: number; waiting: number }>();
  for (const r of requests) {
    const key = `${r.staffId}:${r.leaveTypeId}`;
    const row = out.get(key) ?? { used: 0, waiting: 0 };
    const counted = num(r.days) - (lop.get(r.id) ?? 0);
    if (r.status === "APPROVED") row.used += counted;
    else row.waiting += counted;
    out.set(key, row);
  }
  return out;
}

export async function balancesFor(tx: Tx, ctx: SchoolContext, staffIds: string[], academicYearId: string): Promise<Map<string, BalanceRow[]>> {
  await ensureBalances(tx, ctx, staffIds, academicYearId);
  const [types, rules, balances, used] = await Promise.all([
    tx.leaveType.findMany({ where: { schoolId: ctx.schoolId, forWhom: "staff", archivedAt: null }, orderBy: { name: "asc" } }),
    tx.leaveTypeRule.findMany({ where: { schoolId: ctx.schoolId } }),
    tx.leaveBalance.findMany({ where: { academicYearId, staffId: { in: staffIds }, archivedAt: null } }),
    usedDays(tx, staffIds, academicYearId),
  ]);
  const out = new Map<string, BalanceRow[]>();
  for (const staffId of staffIds) {
    out.set(staffId, types.map((type) => {
      const b = balances.find((x) => x.staffId === staffId && x.leaveTypeId === type.id) ?? null;
      const adjustments = ((b?.adjustments ?? []) as Adjustment[]);
      const adjusted = adjustments.reduce((s, a) => s + Number(a.days || 0), 0);
      const given = num(b?.daysGiven);
      const u = used.get(`${staffId}:${type.id}`) ?? { used: 0, waiting: 0 };
      return {
        type, rule: rules.find((r) => r.leaveTypeId === type.id) ?? null, balanceId: b?.id ?? null,
        given, adjusted, adjustments, used: u.used, waiting: u.waiting, left: given + adjusted - u.used, limited: type.paid,
      };
    }));
  }
  return out;
}

// ---------------------------------------------------------------- teacher periods (A5)

export type PeriodNeed = { date: Date; periodId: string; periodNo: number; sectionId: string; startTime: string };

/**
 * The teacher's periods on the published Time Table during the leave, leaving
 * out Sundays and School Calendar holidays. For a half day, the first or
 * second half of the day's periods.
 */
export async function teacherPeriods(tx: Tx, ctx: SchoolContext, staff: { id: string; campusId: string }, from: Date, to: Date, halfDayPart: string | null = null): Promise<PeriodNeed[]> {
  const versions = await tx.timetableVersion.findMany({
    where: { schoolId: ctx.schoolId, campusId: staff.campusId, status: "PUBLISHED", archivedAt: null },
    orderBy: [{ effectiveFrom: "desc" }, { publishedAt: "desc" }],
    select: { id: true, effectiveFrom: true },
  });
  if (versions.length === 0) return [];
  const periods = await tx.timetablePeriod.findMany({
    where: { versionId: { in: versions.map((v) => v.id) }, staffId: staff.id, isBreak: false, archivedAt: null },
    select: { id: true, versionId: true, dayOfWeek: true, periodNo: true, sectionId: true, startTime: true },
    orderBy: { periodNo: "asc" },
  });
  if (periods.length === 0) return [];
  const holidays = await holidaySet(tx, ctx, from, to, staff.campusId);
  const out: PeriodNeed[] = [];
  for (const date of eachDay(from, to)) {
    if (!isWorkingDay(date, holidays)) continue;
    const version = versions.find((v) => !v.effectiveFrom || v.effectiveFrom <= date);
    if (!version) continue;
    let todays = periods.filter((p) => p.versionId === version.id && p.dayOfWeek === isoWeekday(date));
    if (halfDayPart && todays.length) {
      const all = await tx.timetablePeriod.aggregate({ where: { versionId: version.id, dayOfWeek: isoWeekday(date), isBreak: false, archivedAt: null }, _max: { periodNo: true } });
      const middle = Math.ceil((all._max.periodNo ?? 8) / 2);
      todays = todays.filter((p) => (halfDayPart === "first" ? p.periodNo <= middle : p.periodNo > middle));
    }
    for (const p of todays) out.push({ date, periodId: p.id, periodNo: p.periodNo, sectionId: p.sectionId, startTime: p.startTime });
  }
  return out;
}

/** Substitution rows (status Needed) for every period of an approved teacher leave. Safe to run twice. */
export async function raiseSubstitutions(tx: Tx, ctx: SchoolContext, leave: Pick<LeaveRequest, "id" | "fromDate" | "toDate">, staff: { id: string; campusId: string }, halfDayPart: string | null) {
  const needs = await teacherPeriods(tx, ctx, staff, leave.fromDate, leave.toDate, halfDayPart);
  if (needs.length === 0) return 0;
  const existing = await tx.substitution.findMany({ where: { leaveRequestId: leave.id, archivedAt: null }, select: { periodId: true, date: true } });
  const have = new Set(existing.map((e) => `${e.periodId}:${isoDay(e.date)}`));
  const data = needs
    .filter((n) => !have.has(`${n.periodId}:${isoDay(n.date)}`))
    .map((n) => ({ schoolId: ctx.schoolId, date: n.date, periodId: n.periodId, absentStaffId: staff.id, leaveRequestId: leave.id, status: "NEEDED" as const, createdById: ctx.userId }));
  if (data.length) await tx.substitution.createMany({ data });
  return data.length;
}

// ---------------------------------------------------------------- applying

export type ApplyInput = {
  staffId: string;
  leaveTypeId: string;
  from: Date;
  to: Date;
  halfDayPart: "first" | "second" | null;
  reason: string;
  documentFileId: string | null;
  /** HR applying for someone else. */
  onBehalf: boolean;
};

export type ApplyPreview = { days: number; lopDays: number; periods: number; available: number | null; typeName: string };

async function loadForApply(tx: Tx, ctx: SchoolContext, input: Pick<ApplyInput, "staffId" | "leaveTypeId">) {
  await ensureHrDefaults(tx, ctx);
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!staff) throw new LeaveProblem("This staff member was not found.", "staffId");
  if (["RESIGNED", "RETIRED", "TERMINATED"].includes(staff.status)) throw new LeaveProblem(`${staff.fullName} has left the school, so leave cannot be added.`, "staffId");
  const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, forWhom: "staff", archivedAt: null } });
  if (!type) throw new LeaveProblem("Choose a leave type.", "leaveTypeId");
  const rule = await tx.leaveTypeRule.findUnique({ where: { leaveTypeId: type.id } });
  return { staff, type, rule };
}

/** Works out the days, loss-of-pay days and affected periods, and checks every rule. Throws LeaveProblem in plain words. */
export async function checkLeave(tx: Tx, ctx: SchoolContext, input: ApplyInput, opts: { ignoreRequestId?: string } = {}) {
  const { staff, type, rule } = await loadForApply(tx, ctx, input);
  const who = input.onBehalf ? `${staff.fullName} already has` : "You already have";
  if (input.to < input.from) throw new LeaveProblem("To date is before the from date. Choose a to date on or after the from date.", "to");
  if (input.halfDayPart) {
    if (rule && !rule.halfDayAllowed) throw new LeaveProblem(`${type.name} cannot be taken as a half day (HR Settings).`, "halfDay");
    if (isoDay(input.from) !== isoDay(input.to)) throw new LeaveProblem("A half day is for one date. Make the from and to dates the same.", "to");
  }
  if (input.reason.trim().length < 3) throw new LeaveProblem("Reason is needed.", "reason");

  const year = await leaveYearFor(tx, ctx, input.from, staff.campusId);
  if (!year) throw new LeaveProblem(`There is no academic year for ${formatDate(input.from)}. Leave can only be applied inside an academic year.`, "from");
  if (input.to > year.endDate) throw new LeaveProblem(`Leave cannot cross into the next academic year (${year.name} ends ${formatDate(year.endDate)}). Apply in two parts.`, "to");
  await assertYearOpen(tx, year.id);

  // No overlapping leave (09 §5).
  const overlapping = await tx.leaveRequest.findMany({
    where: {
      staffId: staff.id, archivedAt: null, status: { in: ["WAITING", "APPROVED"] },
      fromDate: { lte: input.to }, toDate: { gte: input.from },
      ...(opts.ignoreRequestId ? { id: { not: opts.ignoreRequestId } } : {}),
    },
    orderBy: { fromDate: "asc" },
  });
  if (overlapping.length) {
    const halves = overlapping.length === 1 && overlapping[0].halfDay && input.halfDayPart
      ? (await tx.staffLeaveDetail.findUnique({ where: { leaveRequestId: overlapping[0].id } }))?.halfDayPart : null;
    if (!(halves && halves !== input.halfDayPart)) {
      const first = overlapping[0].fromDate > input.from ? overlapping[0].fromDate : input.from;
      throw new LeaveProblem(`${who} leave on ${formatDate(first)}. Change the dates, or cancel the existing leave first.`, "from");
    }
  }

  const holidays = await holidaySet(tx, ctx, input.from, input.to, staff.campusId);
  const days = countLeaveDays(input.from, input.to, holidays, { countsHolidays: rule?.countsHolidays ?? false, halfDay: Boolean(input.halfDayPart) });
  if (days <= 0) throw new LeaveProblem("These dates are all Sundays or holidays on the School Calendar, so no leave is needed.", "from");

  const needsDoc = (rule?.documentRequired ?? false) || (type.needsDocAfter !== null && days > type.needsDocAfter);
  if (needsDoc && !input.documentFileId) {
    throw new LeaveProblem(rule?.documentRequired ? `${type.name} needs a document. Upload it to apply.` : `${type.name} of more than ${daysText(type.needsDocAfter ?? 0)} needs a document, such as a doctor's note.`, "document");
  }

  let lopDays = 0;
  let available: number | null = null;
  if (type.paid) {
    const rows = (await balancesFor(tx, ctx, [staff.id], year.id)).get(staff.id) ?? [];
    const row = rows.find((r) => r.type.id === type.id);
    available = Math.max(0, (row?.left ?? 0) - (row?.waiting ?? 0));
    if (days > available) {
      if (rule?.lossOfPay) lopDays = days - available;
      else throw new LeaveProblem(`${type.name} left: ${daysText(available)}. ${input.onBehalf ? "They asked" : "You asked"} for ${daysText(days)}. Choose another leave type or fewer days.`, "leaveTypeId");
    }
  }

  const periods = staff.staffType === "Teaching" ? (await teacherPeriods(tx, ctx, staff, input.from, input.to, input.halfDayPart)).length : 0;
  return { staff, type, rule, year, days, lopDays, available, periods };
}

export function leaveSummary(typeName: string, staffName: string, from: Date, to: Date, days: number) {
  const dates = isoDay(from) === isoDay(to) ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
  return `${typeName}: ${staffName}, ${dates} (${daysText(days)})`;
}

/** Applies for leave: saves the Leave Request and sends it for approval (head of department first, then the rule). */
export async function applyLeave(tx: Tx, ctx: SchoolContext, input: ApplyInput) {
  const c = await checkLeave(tx, ctx, input);
  const request = await tx.leaveRequest.create({
    data: {
      schoolId: ctx.schoolId, academicYearId: c.year.id, staffId: c.staff.id, leaveTypeId: c.type.id,
      fromDate: input.from, toDate: input.to, halfDay: Boolean(input.halfDayPart), days: c.days,
      reason: input.reason.trim(), documentFileId: input.documentFileId, recordedById: ctx.userId,
    },
  });
  await tx.staffLeaveDetail.create({
    data: { leaveRequestId: request.id, schoolId: ctx.schoolId, halfDayPart: input.halfDayPart, lopDays: c.lopDays, onBehalf: input.onBehalf, periodsAffected: c.periods },
  });
  const head = await headLoginFor(tx, c.staff.departmentId);
  const summary = leaveSummary(c.type.name, c.staff.fullName, input.from, input.to, c.days)
    + (c.lopDays > 0 ? `, ${daysText(c.lopDays)} loss of pay` : "")
    + (c.periods > 0 ? `, ${c.periods} period${c.periods === 1 ? "" : "s"} need substitutes` : "");
  const approval = await requestApproval(tx, ctx, {
    type: "staff-leave", recordType: "Leave Request", recordId: request.id, summary, reason: input.reason.trim(),
    firstApproverId: head && head.staffId !== c.staff.id ? head.userLoginId : null,
    aboutUserIds: [c.staff.userLoginId],
  });
  await tx.leaveRequest.update({ where: { id: request.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, {
    action: "created", recordType: "Leave Request", recordId: request.id,
    after: { staff: c.staff.fullName, type: c.type.name, from: isoDay(input.from), to: isoDay(input.to), days: c.days, lopDays: c.lopDays, onBehalf: input.onBehalf },
  });
  if (input.onBehalf && c.staff.userLoginId) {
    await notify(tx, ctx, { to: c.staff.userLoginId, type: "staff-leave", text: `Leave was applied for you: ${summary}`, link: "/staff-hr-management/leave" });
  }
  return { request, days: c.days, lopDays: c.lopDays, periods: c.periods, approval };
}

// ---------------------------------------------------------------- decisions (A5)

/** What happens to a staff leave when its approval is decided. Listed in src/lib/approval-handlers.ts. */
export async function onLeaveDecision(tx: Tx, ctx: SchoolContext, approval: { id: string }, decision: "approve" | "reject" | "ask-change" | "withdraw", note: string | null) {
  const requests = await tx.leaveRequest.findMany({ where: { approvalId: approval.id, status: "WAITING", archivedAt: null } });
  for (const r of requests) {
    const status = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "CANCELLED" : "REJECTED";
    await tx.leaveRequest.update({
      where: { id: r.id },
      data: { status, decidedById: decision === "withdraw" ? null : ctx.userId, decidedAt: new Date(), decisionReason: note },
    });
    await writeAudit(tx, ctx, { action: `leave-${decision}`, recordType: "Leave Request", recordId: r.id, before: { status: r.status }, after: { status, note } });
    const staff = r.staffId ? await tx.staff.findUnique({ where: { id: r.staffId } }) : null;
    if (!staff) continue;
    if (decision === "approve") {
      const detail = await tx.staffLeaveDetail.findUnique({ where: { leaveRequestId: r.id } });
      const raised = await raiseSubstitutions(tx, ctx, r, staff, detail?.halfDayPart ?? null);
      if (raised > 0) {
        const arrangers = await tx.schoolAccess.findMany({
          where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: { in: ["principal", "academic-head", "vice-principal"] }, isEnabled: true } } } },
          select: { userLoginId: true },
        });
        for (const a of new Set(arrangers.map((x) => x.userLoginId))) {
          await notify(tx, ctx, {
            to: a, type: "substitution", text: `${raised} period${raised === 1 ? "" : "s"} of ${staff.fullName} need a substitute (leave from ${formatDate(r.fromDate)})`,
            link: "/academic-management", groupKey: "substitutions-needed", mergedText: (n) => `${n} approved leaves have periods that need substitutes`,
          });
        }
      }
    }
    // The staff member hears the decision even when HR applied for them (decide() tells the requester).
    const asker = (await tx.approval.findUnique({ where: { id: approval.id }, select: { askedById: true } }))?.askedById;
    if (staff.userLoginId && staff.userLoginId !== asker && decision !== "withdraw") {
      const words = decision === "approve" ? "approved" : "not approved";
      await notify(tx, ctx, { to: staff.userLoginId, type: "staff-leave", text: `Your leave from ${formatDate(r.fromDate)} was ${words}${note ? `. Reason: ${note}` : "."}`, link: "/staff-hr-management/leave" });
    }
  }
}

// ---------------------------------------------------------------- cancelling

/**
 * Cancels or withdraws leave (09 Staff Leave actions). Waiting leave is
 * withdrawn. Approved leave can be cancelled only before it ends: the days
 * not yet taken come back to the balance and their substitutions are
 * cancelled. After it ends, HR adjusts the balance with a reason.
 */
export async function cancelLeave(tx: Tx, ctx: SchoolContext, requestId: string, reason: string, today: Date) {
  const r = await tx.leaveRequest.findFirst({ where: { id: requestId, staffId: { not: null }, archivedAt: null } });
  if (!r) throw new LeaveProblem("This leave was not found.");
  if (r.status === "CANCELLED" || r.status === "REJECTED") throw new LeaveProblem("This leave is already closed.");
  if (r.academicYearId) await assertYearOpen(tx, r.academicYearId);
  if (reason.trim().length < 3) throw new LeaveProblem("Give a short reason for cancelling.", "reason");

  if (r.status === "WAITING") {
    if (r.approvalId) {
      const approval = await tx.approval.findUnique({ where: { id: r.approvalId } });
      if (approval && ["WAITING", "ESCALATED"].includes(approval.status)) {
        const history = [...((approval.history as object[]) ?? []), { at: new Date().toISOString(), by: ctx.userId, action: "withdraw", note: reason }];
        await tx.approval.update({ where: { id: approval.id }, data: { status: "WITHDRAWN", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: reason, history } });
        await tx.notification.updateMany({ where: { link: `/approvals/${approval.id}`, doneAt: null }, data: { doneAt: new Date() } });
        await writeAudit(tx, ctx, { action: "approval-withdraw", recordType: "Approval", recordId: approval.id, before: { status: approval.status }, after: { status: "WITHDRAWN", note: reason } });
      }
    }
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decisionReason: reason, decidedAt: new Date() } });
    await writeAudit(tx, ctx, { action: "leave-withdrawn", recordType: "Leave Request", recordId: r.id, before: { status: r.status }, after: { status: "CANCELLED", reason } });
    return { kind: "withdrawn" as const };
  }

  // Approved.
  if (r.toDate < today) throw new LeaveProblem("This leave has ended. Ask HR to adjust the balance.");
  const staff = await tx.staff.findUniqueOrThrow({ where: { id: r.staffId! } });
  const detail = await tx.staffLeaveDetail.findUnique({ where: { leaveRequestId: r.id } });
  let kind: "cancelled" | "shortened";
  if (r.fromDate >= today) {
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decisionReason: reason } });
    kind = "cancelled";
  } else {
    // Already started: keep the days taken, give back the rest.
    const newTo = addDays(today, -1);
    const rule = await tx.leaveTypeRule.findUnique({ where: { leaveTypeId: r.leaveTypeId } });
    const holidays = await holidaySet(tx, ctx, r.fromDate, newTo, staff.campusId);
    const days = countLeaveDays(r.fromDate, newTo, holidays, { countsHolidays: rule?.countsHolidays ?? false });
    const lop = Math.min(num(detail?.lopDays), days);
    await tx.leaveRequest.update({ where: { id: r.id }, data: { toDate: newTo, days } });
    if (detail) await tx.staffLeaveDetail.update({ where: { leaveRequestId: r.id }, data: { lopDays: lop } });
    kind = "shortened";
  }
  const subs = await tx.substitution.updateMany({
    where: { leaveRequestId: r.id, date: { gte: today }, status: { not: "CANCELLED" }, archivedAt: null },
    data: { status: "CANCELLED", note: "Leave cancelled" },
  });
  await writeAudit(tx, ctx, {
    action: kind === "cancelled" ? "leave-cancelled" : "leave-shortened", recordType: "Leave Request", recordId: r.id,
    before: { status: r.status, to: isoDay(r.toDate), days: num(r.days) }, after: { reason, substitutionsCancelled: subs.count },
  });
  if (staff.userLoginId) await notify(tx, ctx, { to: staff.userLoginId, type: "staff-leave", text: `Your leave from ${formatDate(r.fromDate)} was ${kind === "cancelled" ? "cancelled" : "ended early"}. The days not taken are back in your balance.`, link: "/staff-hr-management/leave" });
  return { kind, substitutionsCancelled: subs.count };
}

// ---------------------------------------------------------------- adjustments and carry-forward

/** HR adjusts a balance with a reason (09 §2 Balances). Days can be negative; halves allowed. */
export async function adjustBalance(tx: Tx, ctx: SchoolContext, input: { staffId: string; leaveTypeId: string; academicYearId: string; days: number; reason: string }) {
  if (!Number.isFinite(input.days) || input.days === 0 || Math.abs(input.days) > 365 || Math.round(input.days * 2) !== input.days * 2) {
    throw new LeaveProblem("Days must be a number like 2, -1 or 0.5, and not 0.", "days");
  }
  if (input.reason.trim().length < 5) throw new LeaveProblem("Give a reason of at least 5 characters, so the change can be understood later.", "reason");
  await assertYearOpen(tx, input.academicYearId);
  const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, forWhom: "staff", archivedAt: null } });
  if (!type) throw new LeaveProblem("Choose a leave type.", "leaveTypeId");
  if (!type.paid) throw new LeaveProblem(`${type.name} is unpaid and has no balance to adjust.`, "leaveTypeId");
  await ensureBalances(tx, ctx, [input.staffId], input.academicYearId);
  const existing = await tx.leaveBalance.findFirst({ where: { academicYearId: input.academicYearId, staffId: input.staffId, leaveTypeId: type.id } });
  const balance = existing ?? await tx.leaveBalance.create({ data: { schoolId: ctx.schoolId, academicYearId: input.academicYearId, staffId: input.staffId, leaveTypeId: type.id, daysGiven: 0 } });
  const before = (balance.adjustments as Adjustment[]) ?? [];
  const row: Adjustment = { days: input.days, reason: input.reason.trim(), byId: ctx.userId, at: new Date().toISOString(), kind: "manual" };
  await tx.leaveBalance.update({ where: { id: balance.id }, data: { adjustments: [...before, row] as unknown as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, { action: "leave-balance-adjusted", recordType: "Leave Balance", recordId: balance.id, before: { adjustments: before.length }, after: row as unknown as Prisma.InputJsonValue });
  return balance.id;
}

/**
 * Carries the days left at the end of a year into the next year, for leave
 * types with carry-forward on, up to their maximum. Safe to run twice: a
 * balance that already has this year's carry-forward is skipped.
 */
export async function carryForward(tx: Tx, ctx: SchoolContext, fromYearId: string) {
  const from = await tx.academicYear.findFirst({ where: { id: fromYearId, archivedAt: null } });
  if (!from) throw new LeaveProblem("This academic year was not found.");
  const next = await tx.academicYear.findFirst({ where: { schoolId: ctx.schoolId, campusId: from.campusId, archivedAt: null, startDate: { gt: from.endDate } }, orderBy: { startDate: "asc" } });
  if (!next) throw new LeaveProblem(`There is no academic year after ${from.name} yet. Add it in Academic Management first.`);
  await assertYearOpen(tx, next.id);
  const types = await tx.leaveType.findMany({ where: { schoolId: ctx.schoolId, forWhom: "staff", archivedAt: null, carryForward: true, paid: true } });
  if (types.length === 0) throw new LeaveProblem("No leave type carries forward. Switch carry-forward on for a leave type in HR Settings.");
  const staff = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId: from.campusId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, select: { id: true } });
  const ids = staff.map((s) => s.id);
  const balances = await balancesFor(tx, ctx, ids, from.id);
  await ensureBalances(tx, ctx, ids, next.id);
  let moved = 0;
  let people = 0;
  for (const s of ids) {
    let any = false;
    for (const t of types) {
      const row = balances.get(s)?.find((r) => r.type.id === t.id);
      const days = Math.min(Math.max(0, row?.left ?? 0), num(t.maxCarry) > 0 ? num(t.maxCarry) : Infinity);
      if (days <= 0) continue;
      const target = await tx.leaveBalance.findFirst({ where: { academicYearId: next.id, staffId: s, leaveTypeId: t.id } })
        ?? await tx.leaveBalance.create({ data: { schoolId: ctx.schoolId, academicYearId: next.id, staffId: s, leaveTypeId: t.id, daysGiven: 0 } });
      const adj = (target.adjustments as Adjustment[]) ?? [];
      if (adj.some((a) => a.kind === "carry-forward" && a.fromYearId === from.id)) continue;
      await tx.leaveBalance.update({
        where: { id: target.id },
        data: { adjustments: [...adj, { days, reason: `Carried forward from ${from.name}`, byId: ctx.userId, at: new Date().toISOString(), kind: "carry-forward", fromYearId: from.id }] as unknown as Prisma.InputJsonValue },
      });
      moved += days;
      any = true;
    }
    if (any) people++;
  }
  await writeAudit(tx, ctx, { action: "leave-carried-forward", recordType: "Leave Balance", recordId: null, after: { from: from.name, to: next.name, days: moved, staff: people } });
  return { moved, people, nextYear: next.name };
}

// ---------------------------------------------------------------- who is on leave

/** Staff on approved leave on a date. */
export async function onLeaveOn(tx: Tx, ctx: SchoolContext, date: Date, staffIds?: string[]) {
  const rows = await tx.leaveRequest.findMany({
    where: { schoolId: ctx.schoolId, status: "APPROVED", archivedAt: null, staffId: staffIds ? { in: staffIds } : { not: null }, fromDate: { lte: date }, toDate: { gte: date } },
    select: { staffId: true },
  });
  return new Set(rows.map((r) => r.staffId!));
}

/**
 * The shared leave calendar shows the leave type only to the staff member,
 * the people who decide their leave, and those who look after all staff
 * (HR, the Principal). Sensitive types show only "On leave" to everyone
 * else (09 Done when 10).
 */
export function calendarLabel(opts: { typeName: string; sensitive: boolean; viewerIsHr: boolean; viewerIsStaff: boolean; viewerIsApprover: boolean }) {
  if (!opts.sensitive || opts.viewerIsHr || opts.viewerIsStaff || opts.viewerIsApprover) return opts.typeName;
  return "On leave";
}
