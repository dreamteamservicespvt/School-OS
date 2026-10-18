// What other modules read from Attendance (05 §4 Sends): the Student
// Profile's Attendance tab, this month's attendance on Parent Link, the
// teacher's Take Attendance buttons on their home, and today's numbers for
// the Dashboard. Each is a plain loader; screens decide how to show it.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { eachDay, isoDay, monthEnd, monthLabel, monthStart } from "../staff/dates";
import { BASE, type AttendanceAccess } from "./access";
import { schoolDays } from "./calendar";
import { statusList, type StatusInfo } from "./settings";
import { attendanceSummary, type PersonSummary } from "./summary";
import { takeChoices } from "./marks";
import { classWise } from "./classwise";
import { flagStatusOf, OPEN_ATTENDANCE_FLAG, type AttendanceFlagStatus } from "./flags";

export type MonthCell = { date: string; day: number; weekday: number; statusKey: string | null; off: string | null; future: boolean };
export type MonthView = { label: string; month: string; summary: PersonSummary; cells: MonthCell[] };

/** One month as a calendar with the same colours and % as the register. */
export async function studentMonth(tx: Tx, ctx: SchoolContext, studentId: string, month: Date, today: Date, campusId?: string | null): Promise<MonthView> {
  const from = monthStart(month);
  const to = monthEnd(month);
  const [sum, days] = await Promise.all([
    attendanceSummary(tx, ctx, { studentId, from, to, today, campusId }),
    schoolDays(tx, ctx, from, to, campusId ?? null),
  ]);
  const byDay = sum.days.get(studentId) ?? new Map<string, string>();
  const cells = eachDay(from, to).map((d) => {
    const info = days.info(d);
    return { date: isoDay(d), day: d.getUTCDate(), weekday: d.getUTCDay(), statusKey: byDay.get(isoDay(d)) ?? null, off: info.on ? null : info.title, future: d > today };
  });
  return { label: monthLabel(from), month: isoDay(from).slice(0, 7), summary: sum.people.get(studentId)!, cells };
}

/** One staff member's month as calendar cells (Staff Attendance month view; also for Staff & HR). */
export async function staffMonth(tx: Tx, ctx: SchoolContext, staffId: string, month: Date, today: Date, campusId?: string | null): Promise<MonthView> {
  const from = monthStart(month);
  const to = monthEnd(month);
  const [sum, days] = await Promise.all([
    attendanceSummary(tx, ctx, { staffIds: [staffId], from, to, today, campusId }),
    schoolDays(tx, ctx, from, to, campusId ?? null),
  ]);
  const byDay = sum.days.get(staffId) ?? new Map<string, string>();
  const cells = eachDay(from, to).map((d) => {
    const info = days.info(d);
    return { date: isoDay(d), day: d.getUTCDate(), weekday: d.getUTCDay(), statusKey: byDay.get(isoDay(d)) ?? null, off: info.on ? null : info.title, future: d > today };
  });
  return { label: monthLabel(from), month: isoDay(from).slice(0, 7), summary: sum.people.get(staffId)!, cells };
}

export type StudentAttendanceTab = {
  year: { id: string; name: string } | null;
  yearSummary: PersonSummary | null;
  months: { month: string; label: string; summary: PersonSummary }[];
  thisMonth: MonthView;
  statuses: StatusInfo[];
  /** Open Attendance Flags, with their review in Early Warnings. */
  openFlags: { id: string; kind: string; raisedOn: Date; value: number; status: AttendanceFlagStatus; action: string | null }[];
  leave: { id: string; from: Date; to: Date; days: number; type: string; status: string }[];
  registerHref: string;
};

/**
 * Student Profile, Attendance tab (03 Student Management plugs this in):
 * the year's %, month by month, this month's calendar, open flags and leave.
 */
export async function studentAttendanceTab(tx: Tx, ctx: SchoolContext, studentId: string, today: Date): Promise<StudentAttendanceTab> {
  const student = await tx.student.findFirst({ where: { id: studentId }, select: { campusId: true } });
  const enrol = await tx.enrolment.findMany({ where: { studentId, archivedAt: null }, select: { academicYearId: true, sectionId: true } });
  const years = await tx.academicYear.findMany({ where: { id: { in: enrol.map((e) => e.academicYearId) } } });
  const year = years.find((y) => y.startDate <= today && y.endDate >= today) ?? years.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null;
  const statuses = await statusList(tx, ctx);
  const thisMonth = await studentMonth(tx, ctx, studentId, today, today, student?.campusId);
  let yearSummary: PersonSummary | null = null;
  const months: StudentAttendanceTab["months"] = [];
  if (year) {
    const sum = await attendanceSummary(tx, ctx, { studentId, from: year.startDate, to: year.endDate, today, campusId: student?.campusId });
    yearSummary = sum.people.get(studentId)!;
    for (let m = monthStart(year.startDate); m <= today && m <= year.endDate; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
      const ms = await attendanceSummary(tx, ctx, { studentId, from: m, to: monthEnd(m), today, campusId: student?.campusId });
      const s = ms.people.get(studentId)!;
      if (s.workingDays > 0) months.push({ month: isoDay(m).slice(0, 7), label: monthLabel(m), summary: s });
    }
  }
  const flags = await tx.attendanceFlag.findMany({ where: { studentId, ...OPEN_ATTENDANCE_FLAG }, orderBy: { raisedOn: "desc" } });
  const leaveRows = await tx.leaveRequest.findMany({ where: { studentId, archivedAt: null }, orderBy: { fromDate: "desc" }, take: 20 });
  const types = await tx.leaveType.findMany({ where: { id: { in: leaveRows.map((l) => l.leaveTypeId) } }, select: { id: true, name: true } });
  const section = year ? enrol.find((e) => e.academicYearId === year.id)?.sectionId : undefined;
  return {
    year: year ? { id: year.id, name: year.name } : null, yearSummary, months: months.reverse(), thisMonth, statuses,
    openFlags: flags.map((f) => ({ id: f.id, kind: f.kind, raisedOn: f.raisedOn, value: Number(f.value), status: flagStatusOf(f), action: f.action })),
    leave: leaveRows.map((l) => ({ id: l.id, from: l.fromDate, to: l.toDate, days: Number(l.days), type: types.find((t) => t.id === l.leaveTypeId)?.name ?? "Leave", status: l.status })),
    registerHref: `${BASE}/register?view=student&student=${studentId}${section ? `&section=${section}` : ""}`,
  };
}

/**
 * Parent Link, attendance this month (11 Communication owns the page;
 * read-only). Same marks and % as the register; today's marks are shown as
 * not final until the lock time.
 */
export async function parentLinkAttendance(tx: Tx, ctx: SchoolContext, studentIds: string[], today: Date, opts: { lockPassed: boolean }) {
  const statuses = await statusList(tx, ctx);
  const students = await tx.student.findMany({ where: { id: { in: studentIds }, archivedAt: null }, select: { id: true, firstName: true, fullName: true, campusId: true } });
  const out = [];
  for (const s of students) {
    const month = await studentMonth(tx, ctx, s.id, today, today, s.campusId);
    out.push({ studentId: s.id, name: s.fullName, firstName: s.firstName, month, todayFinal: opts.lockPassed });
  }
  return { statuses: statuses.map((x) => ({ key: x.key, name: x.name, letter: x.letter, tone: x.tone })), children: out };
}

/** The teacher's home: a Take Attendance button for each class today (workflow 5, step 1). */
export async function todaysClasses(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, today: Date) {
  const choices = await takeChoices(tx, ctx, access, today);
  const days = await schoolDays(tx, ctx, today, today, access.campusId);
  const info = days.info(today);
  return {
    off: info.on ? null : info.title,
    classes: choices.map((c) => ({ ...c, href: `${BASE}?section=${c.sectionId}&date=${isoDay(today)}${c.periodNo ? `&period=${c.periodNo}` : ""}` })),
  };
}

/**
 * Today for the Dashboard: students and staff present, classes not yet marked,
 * open flags. The student numbers add up the class-wise rows (./classwise.ts),
 * so the Dashboard, Attendance Reports and the class-wise view always agree.
 * With a campus (a person limited to one campus), every number is that
 * campus's: its year, sections, staff and flags.
 */
export async function attendanceToday(tx: Tx, ctx: SchoolContext, today: Date, opts: { sectionIds?: string[] | null; campusId?: string | null } = {}) {
  const campusId = opts.campusId ?? null;
  const days = await schoolDays(tx, ctx, today, today, campusId);
  const info = days.info(today);
  const years = await tx.academicYear.findMany({
    where: { archivedAt: null, status: "ACTIVE", startDate: { lte: today }, endDate: { gte: today }, ...(campusId ? { campusId } : {}) },
    select: { id: true, campusId: true },
  });
  const campusStaff = campusId && !opts.sectionIds ? (await tx.staff.findMany({ where: { campusId }, select: { id: true } })).map((s) => s.id) : null;
  const campusStudents = campusId ? (await tx.student.findMany({ where: { campusId }, select: { id: true } })).map((s) => s.id) : null;
  const [cws, staffMarks, staffCount, flags] = await Promise.all([
    // Each campus's sections by its own year and its own School Calendar.
    Promise.all(years.map((y) => classWise(tx, ctx, { yearId: y.id, from: today, to: today, today, sectionIds: opts.sectionIds ?? null, campusId: y.campusId }))),
    opts.sectionIds ? Promise.resolve([]) : tx.attendanceMark.findMany({ where: { date: today, staffId: campusStaff ? { in: campusStaff } : { not: null }, periodNo: 0, archivedAt: null }, select: { statusKey: true } }),
    opts.sectionIds ? Promise.resolve(0) : tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...(campusId ? { campusId } : {}) } }),
    tx.attendanceFlag.count({ where: { ...OPEN_ATTENDANCE_FLAG, ...(campusStudents ? { studentId: { in: campusStudents } } : {}) } }),
  ]);
  const rows = cws.flatMap((c) => c.sections).filter((s) => s.students > 0);
  const sum = (k: "marked" | "present" | "absent" | "leave" | "late" | "students" | "counted" | "weight") => rows.reduce((a, s) => a + s[k], 0);
  const count = (vals: string[], keys: string[]) => vals.filter((v) => keys.includes(v)).length;
  // The attendance % everywhere (register, reports, this tile): present ÷ days counted; leave is not counted, a half day counts half.
  const counted = sum("counted");
  return {
    off: info.on ? null : info.title,
    students: {
      marked: sum("marked"), present: sum("present"), absent: sum("absent"), leave: sum("leave"), late: sum("late"), total: sum("students"),
      /** Students the % counts: marked, leaving out those on leave. "Present of counted" agrees with the %. */
      counted,
      /** Students on the register with no mark yet (in classes that are taken or not). */
      notMarked: rows.reduce((a, s) => a + Math.max(0, s.students - s.marked), 0),
      percent: counted ? Math.round((sum("weight") / counted) * 1000) / 10 : null,
    },
    classes: {
      total: rows.length, notMarked: info.on ? rows.filter((s) => s.notMarked).length : 0, notMarkedNames: info.on ? rows.filter((s) => s.notMarked).map((s) => s.name) : [],
      /** Students in the classes not taken at all. */
      notMarkedStudents: rows.filter((s) => s.notMarked).reduce((a, s) => a + s.students, 0),
    },
    staff: { total: staffCount, marked: staffMarks.length, present: count(staffMarks.map((m) => m.statusKey), ["present", "late", "half-day"]), absent: count(staffMarks.map((m) => m.statusKey), ["absent"]), late: count(staffMarks.map((m) => m.statusKey), ["late"]) },
    openFlags: flags,
    href: BASE,
  };
}
