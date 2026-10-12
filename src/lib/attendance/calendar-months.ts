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

/** The first day of the academic year before the current one (or of the current one when there is none before it). */
export async function previousYearStart(tx: Tx, today: Date): Promise<Date | null> {
  const years = await tx.academicYear.findMany({ where: { archivedAt: null, startDate: { lte: today } }, orderBy: { startDate: "desc" }, select: { startDate: true, endDate: true }, take: 3 });
  const current = years.find((y) => y.endDate >= today) ?? years[0] ?? null;
  if (!current) return null;
  return years.find((y) => y.startDate < current.startDate)?.startDate ?? current.startDate;
}

/** From the later of the previous academic year's first month and the person's first record, to this month. */
function bounds(prevStart: Date | null, firstRecord: Date | null, today: Date): MonthBounds {
  const max = monthKey(today);
  const starts = [prevStart, firstRecord].filter((d): d is Date => Boolean(d));
  const min = starts.length ? monthKey(new Date(Math.max(...starts.map((d) => d.getTime())))) : max;
  return { min: min > max ? max : min, max };
}

/**
 * A student's calendar bounds (approved CalendarMonth): from the first month
 * of the previous academic year, or the student's first record when that is
 * later (the first year they were enrolled in, or their first mark), to this month.
 */
export async function studentBounds(tx: Tx, studentId: string, today: Date): Promise<MonthBounds> {
  const enrol = await tx.enrolment.findMany({ where: { studentId, archivedAt: null }, select: { academicYearId: true } });
  const [firstYear, firstMark, prev] = await Promise.all([
    tx.academicYear.findFirst({ where: { id: { in: enrol.map((e) => e.academicYearId) } }, select: { startDate: true }, orderBy: { startDate: "asc" } }),
    tx.attendanceMark.findFirst({ where: { studentId, archivedAt: null }, orderBy: { date: "asc" }, select: { date: true } }),
    previousYearStart(tx, today),
  ]);
  const first = [firstYear?.startDate, firstMark?.date].filter((d): d is Date => Boolean(d));
  return bounds(prev, first.length ? new Date(Math.min(...first.map((d) => d.getTime()))) : null, today);
}

/** One month of a student's calendar, kept inside the bounds. */
export async function studentCalendar(tx: Tx, ctx: SchoolContext, studentId: string, month: Date | null, today: Date): Promise<CalendarData> {
  const bounds = await studentBounds(tx, studentId, today);
  const m = clampMonth(month ?? today, bounds);
  const student = await tx.student.findFirst({ where: { id: studentId }, select: { campusId: true } });
  const [view, list] = await Promise.all([studentMonth(tx, ctx, studentId, m, today, student?.campusId), statusList(tx, ctx)]);
  return { view, statuses: list.map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone })), bounds };
}

/**
 * Bounds for a staff member's month (attendance or leave): from the first
 * month of the previous academic year, or their joining or first mark when
 * that is later, to this month. Without a staff member: the school's range.
 */
export async function staffBounds(tx: Tx, staffId: string | null, today: Date): Promise<MonthBounds> {
  const prev = await previousYearStart(tx, today);
  if (!staffId) return bounds(prev, null, today);
  const [staff, first] = await Promise.all([
    tx.staff.findFirst({ where: { id: staffId }, select: { joiningDate: true } }),
    tx.attendanceMark.findFirst({ where: { staffId, archivedAt: null }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const starts = [first?.date, staff?.joiningDate].filter((d): d is Date => Boolean(d));
  return bounds(prev, starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null, today);
}

/** The school's month range for class and register calendars: the previous academic year's first month to this month. */
export async function schoolBounds(tx: Tx, today: Date): Promise<MonthBounds> {
  return bounds(await previousYearStart(tx, today), null, today);
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
  return studentCalendar(tx, ctx, studentId, month, today);
}
