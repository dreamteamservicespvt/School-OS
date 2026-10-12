// How far an attendance calendar may page: back to the first month of the
// earliest academic year the person may see, forward to this month (owner's
// rule, 12 Oct 2026). Earlier months load their real marks, holidays and
// leave through studentMonth / registerMonth.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { isoDay, monthStart } from "../staff/dates";
import { studentMonth, type MonthView } from "./integrations";
import { statusList } from "./settings";
import { NotYoursError, registerSections, type AttendanceAccess } from "./access";

export type MonthBounds = { min: string; max: string };
export type CalendarStatus = { key: string; name: string; letter: string; tone: string };
export type CalendarData = { view: MonthView; statuses: CalendarStatus[]; bounds: MonthBounds };

/** "2026-10" for a date. */
export const monthKey = (d: Date) => isoDay(d).slice(0, 7);

/** "2026-10" to the first of that month, or null when it is not a month. */
export function parseMonth(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  return new Date(`${v}-01T00:00:00Z`);
}

/** Keeps a month inside the bounds. */
export function clampMonth(month: Date, b: MonthBounds): Date {
  const k = monthKey(month);
  if (k < b.min) return parseMonth(b.min)!;
  if (k > b.max) return parseMonth(b.max)!;
  return monthStart(month);
}

/**
 * A student's calendar bounds: from the first month of the earliest year they
 * were enrolled in (or only the current year, for someone who may see this
 * year's students only) to this month.
 */
export async function studentBounds(tx: Tx, studentId: string, today: Date, opts: { allYears: boolean }): Promise<MonthBounds> {
  const enrol = await tx.enrolment.findMany({ where: { studentId, archivedAt: null }, select: { academicYearId: true } });
  const years = await tx.academicYear.findMany({ where: { id: { in: enrol.map((e) => e.academicYearId) } }, select: { startDate: true, endDate: true }, orderBy: { startDate: "asc" } });
  const current = years.find((y) => y.startDate <= today && y.endDate >= today) ?? years.at(-1) ?? null;
  const first = opts.allYears ? years[0] ?? current : current;
  const max = monthKey(today);
  const min = first ? monthKey(first.startDate) : max;
  return { min: min > max ? max : min, max };
}

/** One month of a student's calendar, kept inside the bounds. */
export async function studentCalendar(tx: Tx, ctx: SchoolContext, studentId: string, month: Date | null, today: Date, opts: { allYears: boolean }): Promise<CalendarData> {
  const bounds = await studentBounds(tx, studentId, today, opts);
  const m = clampMonth(month ?? today, bounds);
  const student = await tx.student.findFirst({ where: { id: studentId }, select: { campusId: true } });
  const [view, list] = await Promise.all([studentMonth(tx, ctx, studentId, m, today, student?.campusId), statusList(tx, ctx)]);
  return { view, statuses: list.map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone })), bounds };
}

/**
 * Bounds for a staff member's own month view: from the first academic year
 * that started on or after their joining date (or the earliest year) to this month.
 */
export async function staffBounds(tx: Tx, staffId: string, today: Date): Promise<MonthBounds> {
  const staff = await tx.staff.findFirst({ where: { id: staffId }, select: { joiningDate: true } });
  const first = await tx.attendanceMark.findFirst({ where: { staffId, archivedAt: null }, orderBy: { date: "asc" }, select: { date: true } });
  const years = await tx.academicYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "asc" }, select: { startDate: true, endDate: true } });
  const starts = [first?.date, staff?.joiningDate, years.find((y) => y.startDate <= today && y.endDate >= today)?.startDate].filter((d): d is Date => Boolean(d));
  const from = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : today;
  const yearOf = years.find((y) => y.startDate <= from && y.endDate >= from);
  const max = monthKey(today);
  const min = monthKey(yearOf ? yearOf.startDate : from);
  return { min: min > max ? max : min, max };
}

/** Whether this person may see the student's attendance: everyone's, or students of their own sections this year. */
export async function mayViewStudent(tx: Tx, access: AttendanceAccess, studentId: string) {
  const allowed = registerSections(access);
  if (allowed === "all") return true;
  if (!allowed.length || !access.yearId) return false;
  return Boolean(await tx.enrolment.findFirst({ where: { studentId, academicYearId: access.yearId, archivedAt: null, sectionId: { in: allowed } }, select: { id: true } }));
}

/** A student's month for staff screens (Student Profile), checked against the person's reach. */
export async function studentCalendarFor(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, studentId: string, month: Date | null, today: Date) {
  if (!(await mayViewStudent(tx, access, studentId))) throw new NotYoursError("this student");
  return studentCalendar(tx, ctx, studentId, month, today, { allYears: access.students === "all" });
}
