// Staff Attendance (05 §2): daily marks for teachers and staff, by hand or
// from devices, QR and mobile check-in; late coming by one rule for every
// method; shifts and overtime (optional). Staff on approved leave show as On
// leave. What reaches Salary is worked out by staffMonthForSalary().
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { isoDay } from "../staff/dates";
import { lopDates, offDaySet, onLeaveOn } from "../staff/leave";
import { AttendanceProblem, BASE, type AttendanceAccess } from "./access";
import { dayInfo, OffDayError } from "./calendar";
import { attendanceFeatures, attendanceSettings, statusList, statusMap, statusesFor, weightOf } from "./settings";
import { instantAt, minutesOf, schoolDateOf } from "./time";
import { LockedError, lockState } from "./marks";
import { attendanceSummary } from "./summary";

const dayText = (d: Date) => formatDate(d, "UTC");
const ACTIVE_STAFF = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;

export type ShiftRule = { shiftId: string | null; shiftName: string | null; startTime: string; endTime: string | null; lateAfterMin: number };

/** The shift each staff member works on a date, or the school's staff hours. */
export async function shiftsOn(tx: Tx, ctx: SchoolContext, staffIds: string[], date: Date): Promise<Map<string, ShiftRule>> {
  const settings = await attendanceSettings(tx, ctx);
  const features = await attendanceFeatures(tx, ctx);
  const base: ShiftRule = { shiftId: null, shiftName: null, startTime: settings.staffStartTime, endTime: null, lateAfterMin: settings.staffLateAfterMin };
  const out = new Map<string, ShiftRule>(staffIds.map((id) => [id, base]));
  if (!features.has("attendance-shifts") || staffIds.length === 0) return out;
  const rows = await tx.staffShiftAssignment.findMany({
    where: { staffId: { in: staffIds }, fromDate: { lte: date }, archivedAt: null, shift: { archivedAt: null } },
    include: { shift: true }, orderBy: { fromDate: "desc" },
  });
  for (const id of staffIds) {
    const a = rows.find((r) => r.staffId === id);
    if (a) out.set(id, { shiftId: a.shift.id, shiftName: a.shift.name, startTime: a.shift.startTime, endTime: a.shift.endTime, lateAfterMin: a.shift.lateAfterMin ?? settings.staffLateAfterMin });
  }
  return out;
}

/**
 * The one late rule used for devices, QR, mobile and manual marking (05 §5):
 * late when in after the start time plus the minutes allowed. Returns the
 * minutes late after the start time, or 0.
 */
export function minutesLate(inTime: Date, date: Date, rule: { startTime: string; lateAfterMin: number }, timeZone: string) {
  const start = instantAt(date, rule.startTime, timeZone);
  const late = Math.floor((inTime.getTime() - start.getTime()) / 60000);
  return late > rule.lateAfterMin ? late : 0;
}

/** Status from an in time: Late after the late rule, Half-day after the half-day time (staff). */
export function statusFromInTime(inTime: Date, date: Date, rule: { startTime: string; lateAfterMin: number }, halfDayAfter: string | null, timeZone: string) {
  const late = minutesLate(inTime, date, rule, timeZone);
  if (halfDayAfter && inTime.getTime() > instantAt(date, halfDayAfter, timeZone).getTime()) return { statusKey: "half-day", lateMinutes: late };
  return { statusKey: late > 0 ? "late" : "present", lateMinutes: late };
}

export type StaffDayRow = {
  staffId: string; name: string; staffCode: string; designation: string; department: string | null; departmentId: string | null; photoFileId: string | null;
  shift: ShiftRule; onLeave: boolean;
  mark: { id: string; statusKey: string; inTime: Date | null; outTime: Date | null; method: string; lateMinutes: number | null; note: string | null } | null;
  overtimeMinutes: number;
};

/** Today's list: every working staff member with their mark, leave, shift and overtime. */
export async function staffDay(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, date: Date, filters: { q?: string; departmentId?: string; status?: string } = {}): Promise<StaffDayRow[]> {
  if (access.staff === "none") return [];
  const where: Prisma.StaffWhereInput = {
    archivedAt: null, status: { in: [...ACTIVE_STAFF] }, joiningDate: { lte: date },
    ...(access.staff === "self" ? { id: access.staffId ?? "00000000-0000-0000-0000-000000000000" } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.q ? { OR: [{ fullName: { contains: filters.q, mode: "insensitive" } }, { staffCode: { contains: filters.q, mode: "insensitive" } }] } : {}),
  };
  const staff = await tx.staff.findMany({ where, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true, departmentId: true, photoFileId: true } });
  const ids = staff.map((s) => s.id);
  const [marks, leave, shifts, depts, overtime] = await Promise.all([
    tx.attendanceMark.findMany({ where: { staffId: { in: ids }, date, periodNo: 0, archivedAt: null } }),
    onLeaveOn(tx, ctx, date, ids),
    shiftsOn(tx, ctx, ids, date),
    tx.department.findMany({ select: { id: true, name: true } }),
    tx.overtimeEntry.groupBy({ by: ["staffId"], where: { staffId: { in: ids }, date, archivedAt: null }, _sum: { minutes: true } }),
  ]);
  const rows: StaffDayRow[] = staff.map((s) => {
    const m = marks.find((x) => x.staffId === s.id);
    return {
      staffId: s.id, name: s.fullName, staffCode: s.staffCode, designation: s.designation, department: depts.find((d) => d.id === s.departmentId)?.name ?? null, departmentId: s.departmentId ?? null, photoFileId: s.photoFileId,
      shift: shifts.get(s.id)!, onLeave: leave.has(s.id),
      mark: m ? { id: m.id, statusKey: m.statusKey, inTime: m.inTime, outTime: m.outTime, method: m.method, lateMinutes: m.lateMinutes, note: m.note } : null,
      overtimeMinutes: overtime.find((o) => o.staffId === s.id)?._sum.minutes ?? 0,
    };
  });
  if (filters.status === "not-marked") return rows.filter((r) => !r.mark && !r.onLeave);
  if (filters.status === "leave") return rows.filter((r) => r.onLeave || r.mark?.statusKey === "leave");
  if (filters.status) return rows.filter((r) => r.mark?.statusKey === filters.status);
  return rows;
}

export type StaffEntry = { staffId: string; statusKey: string; inTime?: string | null; outTime?: string | null; note?: string | null };

/** Saves staff attendance for a date by hand: mark all present, then the exceptions. Lock rules as for students. */
export async function saveStaffAttendance(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { date: Date; entries: StaffEntry[]; now: Date; timeZone: string }) {
  if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can mark staff attendance.");
  const today = schoolDateOf(input.now, input.timeZone);
  if (input.date > today) throw new AttendanceProblem(`${dayText(input.date)} has not come yet.`, "date");
  const info = await dayInfo(tx, ctx, input.date, access.campusId);
  if (!info.on) throw new OffDayError(info, input.date);
  if (input.entries.length === 0) throw new AttendanceProblem("Mark at least one staff member before saving.");
  const settings = await attendanceSettings(tx, ctx);
  const staffStatuses = statusesFor(await statusList(tx, ctx), "staff");
  const valid = new Set(staffStatuses.map((s) => s.key));
  const absentKeys = new Set(staffStatuses.filter((s) => s.counts === "absent").map((s) => s.key));
  const ids = [...new Set(input.entries.map((e) => e.staffId))];
  const staff = await tx.staff.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, fullName: true, campusId: true } });
  if (staff.length !== ids.length) throw new AttendanceProblem("One of the staff members was not found. Reload the page and save again.");
  const year = await tx.academicYear.findFirst({ where: { schoolId: ctx.schoolId, startDate: { lte: input.date }, endDate: { gte: input.date }, archivedAt: null, ...(access.campusId ? { campusId: access.campusId } : {}) } });
  const [existing, leave, shifts, fullDay] = await Promise.all([
    tx.attendanceMark.findMany({ where: { staffId: { in: ids }, date: input.date, periodNo: 0, archivedAt: null } }),
    onLeaveOn(tx, ctx, input.date, ids),
    shiftsOn(tx, ctx, ids, input.date),
    tx.leaveRequest.findMany({ where: { staffId: { in: ids }, status: "APPROVED", archivedAt: null, halfDay: false, fromDate: { lte: input.date }, toDate: { gte: input.date } }, select: { id: true, staffId: true } }),
  ]);
  // A full day of approved leave is Leave, even when marked absent: the day counts once, as leave.
  const fullLeave = new Map(fullDay.map((l) => [l.staffId!, l.id]));
  const lock = lockState(settings, input.date, input.now, input.timeZone);
  const parseTime = (v: string | null | undefined, label: string) => {
    if (!v) return null;
    if (!/^\d{2}:\d{2}$/.test(v)) throw new AttendanceProblem(`${label} must be a time like 08:45.`);
    return instantAt(input.date, v, input.timeZone);
  };
  const changes: { staffId: string; name: string; before: string | null; after: string; inTime: Date | null; outTime: Date | null; late: number | null; note: string | null }[] = [];
  for (const e of input.entries) {
    const s = staff.find((x) => x.id === e.staffId)!;
    let statusKey = (leave.has(e.staffId) && e.statusKey === "present") || (fullLeave.has(e.staffId) && absentKeys.has(e.statusKey)) ? "leave" : e.statusKey;
    if (!valid.has(statusKey)) throw new AttendanceProblem(`Choose a status for ${s.fullName}.`);
    const inTime = parseTime(e.inTime, `In time for ${s.fullName}`);
    const outTime = parseTime(e.outTime, `Out time for ${s.fullName}`);
    if (inTime && outTime && outTime <= inTime) throw new AttendanceProblem(`Out time for ${s.fullName} is before the in time.`);
    let late: number | null = null;
    if (inTime && ["present", "late", "half-day"].includes(statusKey)) {
      const auto = statusFromInTime(inTime, input.date, shifts.get(e.staffId)!, settings.staffHalfDayAfter, input.timeZone);
      late = auto.lateMinutes;
      if (statusKey === "present") statusKey = auto.statusKey;
    }
    const b = existing.find((x) => x.staffId === e.staffId);
    const note = e.note?.trim().slice(0, 300) || null;
    const same = b && b.statusKey === statusKey && (b.inTime?.getTime() ?? null) === (inTime?.getTime() ?? b.inTime?.getTime() ?? null) && (b.outTime?.getTime() ?? null) === (outTime?.getTime() ?? b.outTime?.getTime() ?? null) && (b.note ?? null) === note;
    if (same) continue;
    changes.push({ staffId: e.staffId, name: s.fullName, before: b?.statusKey ?? null, after: statusKey, inTime: inTime ?? b?.inTime ?? null, outTime: outTime ?? b?.outTime ?? null, late: late ?? b?.lateMinutes ?? null, note });
  }
  if (changes.length === 0) return { changed: 0 };
  if (lock.locked && !access.lockOverride && changes.some((c) => c.before !== null)) {
    throw new LockedError(input.date, lock, `${BASE}/register/correction?for=staff&date=${isoDay(input.date)}`);
  }
  for (const c of changes) {
    const b = existing.find((x) => x.staffId === c.staffId);
    const data = { statusKey: c.after, inTime: c.inTime, outTime: c.outTime, lateMinutes: c.late, note: c.note, markedById: ctx.userId, markedAt: input.now, leaveRequestId: c.after === "leave" ? fullLeave.get(c.staffId) ?? null : null };
    if (b) await tx.attendanceMark.update({ where: { id: b.id }, data: { ...data, method: b.method === "register" ? "register" : b.method } });
    else await tx.attendanceMark.create({ data: { schoolId: ctx.schoolId, academicYearId: year?.id ?? null, staffId: c.staffId, date: input.date, periodNo: 0, method: "register", ...data } });
  }
  await writeAudit(tx, ctx, {
    action: lock.locked ? "staff-attendance-changed-after-lock" : "staff-attendance-saved", recordType: "Attendance Mark", recordId: null,
    before: changes.filter((c) => c.before).map((c) => ({ staff: c.name, status: c.before })) as unknown as Prisma.InputJsonValue,
    after: { date: isoDay(input.date), changes: changes.map((c) => ({ staff: c.name, status: c.after, in: c.inTime?.toISOString() ?? null, out: c.outTime?.toISOString() ?? null })) } as unknown as Prisma.InputJsonValue,
  });
  return { changed: changes.length };
}

// ---------------------------------------------------------------- overtime and shifts

export async function recordOvertime(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { staffId: string; date: Date; minutes: number; note: string | null; today: Date }) {
  if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can record overtime.");
  if (!(await attendanceFeatures(tx, ctx)).has("attendance-overtime")) throw new AttendanceProblem("Overtime is switched off. Switch it on in Attendance Settings.");
  if (!Number.isInteger(input.minutes) || input.minutes <= 0 || input.minutes > 16 * 60) throw new AttendanceProblem("Overtime must be between 15 minutes and 16 hours.", "hours");
  if (input.date > input.today) throw new AttendanceProblem("Overtime can be recorded for today or earlier days.", "date");
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!staff) throw new AttendanceProblem("Choose the staff member.", "staffId");
  const row = await tx.overtimeEntry.create({ data: { schoolId: ctx.schoolId, staffId: staff.id, date: input.date, minutes: input.minutes, note: input.note, recordedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Overtime Entry", recordId: row.id, after: { staff: staff.fullName, date: isoDay(input.date), minutes: input.minutes, note: input.note } });
  return { row, staff };
}

export async function archiveOvertime(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string) {
  if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can change overtime.");
  const row = await tx.overtimeEntry.findFirst({ where: { id, archivedAt: null } });
  if (!row) throw new AttendanceProblem("This overtime entry was not found.");
  await tx.overtimeEntry.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Overtime Entry", recordId: id, before: { minutes: row.minutes, date: isoDay(row.date) } });
}

export async function saveShift(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { id?: string | null; name: string; startTime: string; endTime: string; lateAfterMin: number | null }) {
  if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can change shifts.");
  if (input.name.trim().length < 2) throw new AttendanceProblem("Shift name is needed.", "name");
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) throw new AttendanceProblem("Choose the start time.", "startTime");
  if (!/^\d{2}:\d{2}$/.test(input.endTime)) throw new AttendanceProblem("Choose the end time.", "endTime");
  if (minutesOf(input.endTime) <= minutesOf(input.startTime)) throw new AttendanceProblem("End time must be after the start time.", "endTime");
  const dup = await tx.staffShift.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, name: { equals: input.name.trim(), mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (dup) throw new AttendanceProblem(`A shift called "${dup.name}" already exists.`, "name");
  const data = { name: input.name.trim(), startTime: input.startTime, endTime: input.endTime, lateAfterMin: input.lateAfterMin };
  if (input.id) {
    const before = await tx.staffShift.findFirst({ where: { id: input.id, archivedAt: null } });
    if (!before) throw new AttendanceProblem("This shift was not found.");
    const row = await tx.staffShift.update({ where: { id: input.id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Staff Shift", recordId: row.id, before: { name: before.name, start: before.startTime, end: before.endTime }, after: data });
    return row;
  }
  const row = await tx.staffShift.create({ data: { schoolId: ctx.schoolId, ...data } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Staff Shift", recordId: row.id, after: data });
  return row;
}

export async function setShiftArchived(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string, archived: boolean) {
  if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can change shifts.");
  const row = await tx.staffShift.findFirst({ where: { id } });
  if (!row) throw new AttendanceProblem("This shift was not found.");
  await tx.staffShift.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await writeAudit(tx, ctx, { action: archived ? "archived" : "restored", recordType: "Staff Shift", recordId: id, before: { name: row.name } });
  return row;
}

export async function assignShift(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { staffIds: string[]; shiftId: string; fromDate: Date }) {
  if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can assign shifts.");
  if (input.staffIds.length === 0) throw new AttendanceProblem("Choose at least one staff member.", "staffIds");
  const shift = await tx.staffShift.findFirst({ where: { id: input.shiftId, archivedAt: null } });
  if (!shift) throw new AttendanceProblem("Choose the shift.", "shiftId");
  const staff = await tx.staff.findMany({ where: { id: { in: input.staffIds }, archivedAt: null }, select: { id: true, fullName: true } });
  await tx.staffShiftAssignment.createMany({ data: staff.map((s) => ({ schoolId: ctx.schoolId, staffId: s.id, shiftId: shift.id, fromDate: input.fromDate, createdById: ctx.userId })) });
  await writeAudit(tx, ctx, { action: "shift-assigned", recordType: "Staff Shift", recordId: shift.id, after: { shift: shift.name, from: isoDay(input.fromDate), staff: staff.map((s) => s.fullName) } });
  return { shift, count: staff.length };
}

// ---------------------------------------------------------------- for Salary (Done when 10)

export type SalaryAttendance = {
  staffId: string; workingDays: number; presentDays: number; absentDays: number;
  /** Every leave day: paid, unpaid and beyond the balance. */
  leaveDays: number;
  halfDays: number; lateMarks: number; overtimeMinutes: number; notMarkedDays: number;
  /** Days of approved leave of an unpaid type (Leave Without Pay). */
  unpaidLeaveDays: number;
  /** Days of approved leave beyond the balance (StaffLeaveDetail.lopDays), on the leave's last days. */
  leaveLopDays: number;
};

/**
 * A month of staff attendance for Generate Salary: present days (half days
 * count 0.5), absences, leave, late marks and overtime, one answer per day.
 * Approved leave decides the day whatever its mark, so a day marked absent
 * and then given leave counts once, as leave (09 A5, 10 §2 step 2). Half-day
 * leave covers half the day; the mark decides the other half. Unpaid leave and
 * days beyond the leave balance are counted for loss of pay.
 */
export async function staffMonthForSalary(tx: Tx, ctx: SchoolContext, input: { staffIds: string[]; from: Date; to: Date; campusId?: string | null }): Promise<SalaryAttendance[]> {
  const sum = await attendanceSummary(tx, ctx, { staffIds: input.staffIds, from: input.from, to: input.to, campusId: input.campusId });
  const statuses = statusMap(await statusList(tx, ctx, { includeArchived: true }));
  const leaves = await tx.leaveRequest.findMany({ where: { staffId: { in: input.staffIds }, status: "APPROVED", archivedAt: null, fromDate: { lte: input.to }, toDate: { gte: input.from } }, select: { id: true, staffId: true, leaveTypeId: true, fromDate: true, toDate: true, halfDay: true } });
  const typeIds = [...new Set(leaves.map((l) => l.leaveTypeId))];
  const [types, rules, details] = leaves.length
    ? await Promise.all([
        tx.leaveType.findMany({ where: { id: { in: typeIds } }, select: { id: true, paid: true } }),
        tx.leaveTypeRule.findMany({ where: { leaveTypeId: { in: typeIds } }, select: { leaveTypeId: true, countsHolidays: true } }),
        tx.staffLeaveDetail.findMany({ where: { leaveRequestId: { in: leaves.map((l) => l.id) } }, select: { leaveRequestId: true, lopDays: true } }),
      ])
    : [[], [], []];
  const paid = (l: { leaveTypeId: string }) => types.find((t) => t.id === l.leaveTypeId)?.paid ?? true;
  // Days beyond the balance are the last counted days of each leave.
  const withLop = leaves.filter((l) => paid(l) && Number(details.find((x) => x.leaveRequestId === l.id)?.lopDays ?? 0) > 0);
  // Each staff member's days off are their own campus's.
  const campusOf = new Map((await tx.staff.findMany({ where: { id: { in: input.staffIds } }, select: { id: true, campusId: true } })).map((s) => [s.id, s.campusId]));
  const offBy = new Map<string, Set<string>>();
  const offFor = async (staffId: string | null) => {
    const campusId = (staffId && campusOf.get(staffId)) || input.campusId || null;
    const key = campusId ?? "";
    if (!offBy.has(key)) {
      offBy.set(key, withLop.length
        ? await offDaySet(tx, ctx, withLop.reduce((m, l) => (l.fromDate < m ? l.fromDate : m), withLop[0].fromDate), withLop.reduce((m, l) => (l.toDate > m ? l.toDate : m), withLop[0].toDate), campusId)
        : new Set<string>());
    }
    return offBy.get(key)!;
  };
  const lopOf = new Map<string, Map<string, number>>();
  for (const l of withLop) lopOf.set(l.id, lopDates(l, Number(details.find((x) => x.leaveRequestId === l.id)!.lopDays), await offFor(l.staffId), rules.find((r) => r.leaveTypeId === l.leaveTypeId)?.countsHolidays ?? false));
  const overtime = await tx.overtimeEntry.groupBy({ by: ["staffId"], where: { staffId: { in: input.staffIds }, date: { gte: input.from, lte: input.to }, archivedAt: null }, _sum: { minutes: true } });
  const fromKey = isoDay(input.from);
  const toKey = isoDay(input.to < input.from ? input.from : input.to);
  return input.staffIds.map((id) => {
    const marked = sum.days.get(id) ?? new Map<string, string>();
    const mine = leaves.filter((l) => l.staffId === id);
    const r = { present: 0, absent: 0, leave: 0, half: 0, late: 0, notMarked: 0, unpaid: 0, beyond: 0 };
    const working = new Set<string>();
    const myWorking = sum.workingOf(id);
    for (const d of myWorking) {
      const k = isoDay(d);
      working.add(k);
      const on = mine.filter((l) => l.fromDate <= d && l.toDate >= d);
      for (const l of on) if (!paid(l)) r.unpaid += l.halfDay ? 0.5 : 1;
      const cover = Math.min(1, on.reduce((s, l) => s + (l.halfDay ? 0.5 : 1), 0));
      const st = marked.get(k) ?? null;
      r.leave += cover;
      if (cover >= 1) continue;
      if (!st) {
        if (cover === 0) r.notMarked++;
        continue;
      }
      if (st === "late") r.late++;
      if (st === "leave" && cover === 0) r.leave += 1;
      const w = weightOf(statuses.get(st));
      if (w === null) continue;
      if (cover > 0) {
        // Half a day on leave: the mark tells the other half.
        r.present += Math.min(w, 1 - cover);
        if (w === 0) r.absent += 1 - cover;
        continue;
      }
      r.present += w;
      if (w === 0) r.absent += 1;
      else if (w === 0.5) r.half += 1;
    }
    for (const l of mine) {
      for (const [k, part] of lopOf.get(l.id) ?? []) {
        if (k < fromKey || k > toKey) continue;
        r.beyond += part;
        // A loss-of-pay day the leave counts but the school is closed (for example a Saturday off) is still a leave day.
        if (!working.has(k)) r.leave += part;
      }
    }
    return {
      staffId: id, workingDays: myWorking.length, presentDays: r.present, absentDays: r.absent, leaveDays: r.leave,
      halfDays: r.half, lateMarks: r.late, overtimeMinutes: overtime.find((o) => o.staffId === id)?._sum.minutes ?? 0, notMarkedDays: r.notMarked,
      unpaidLeaveDays: r.unpaid, leaveLopDays: r.beyond,
    };
  });
}
