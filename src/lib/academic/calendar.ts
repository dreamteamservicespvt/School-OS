// Read helpers for the School Calendar, which Events & Calendar owns (18).
// The Time Table, Attendance and Substitutions ask here whether a day is a
// holiday or not a working day (automation A11).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { DAY_NAMES, weekday } from "./common";
import { academicSettings } from "./settings";

/** Entry types that close the school for the day. */
export const CLOSED_TYPES = ["holiday", "vacation"];

export type DayOff = { kind: "holiday" | "weekend"; title: string };

/** The holiday or vacation on a date, if attendance is off that day. */
export async function holidayOn(tx: Tx, ctx: SchoolContext, date: Date, campusId?: string | null) {
  return tx.calendarEntry.findFirst({
    where: {
      schoolId: ctx.schoolId, archivedAt: null, type: { in: CLOSED_TYPES }, attendanceOn: false,
      startDate: { lte: date }, endDate: { gte: date },
      ...(campusId ? { OR: [{ campusId: null }, { campusId }] } : {}),
    },
    orderBy: { startDate: "desc" },
  });
}

/** True when the school is closed on the date for a holiday or vacation. */
export async function isHoliday(tx: Tx, ctx: SchoolContext, date: Date, campusId?: string | null): Promise<boolean> {
  return Boolean(await holidayOn(tx, ctx, date, campusId));
}

/** Why there are no periods on a date: a holiday, or not a working day. Null on a normal school day. */
export async function dayOff(tx: Tx, ctx: SchoolContext, date: Date, campusId: string): Promise<DayOff | null> {
  const holiday = await holidayOn(tx, ctx, date, campusId);
  if (holiday) return { kind: "holiday", title: holiday.title };
  const settings = await academicSettings(tx, ctx, campusId);
  if (!settings.workingDays.includes(weekday(date))) return { kind: "weekend", title: `${DAY_NAMES[weekday(date)]} is not a working day` };
  return null;
}

/** Exam days on the calendar (from published datesheets, A10) that cover the date: the whole school's and, given a campus, that campus's. */
export async function examDayOn(tx: Tx, ctx: SchoolContext, date: Date, campusId?: string | null) {
  return tx.calendarEntry.findFirst({
    where: {
      schoolId: ctx.schoolId, archivedAt: null, type: "exam_day", startDate: { lte: date }, endDate: { gte: date },
      ...(campusId ? { OR: [{ campusId: null }, { campusId }] } : {}),
    },
  });
}

/** Holidays and vacations between two dates, for lists and reports. */
export async function holidaysBetween(tx: Tx, ctx: SchoolContext, from: Date, to: Date) {
  return tx.calendarEntry.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, type: { in: CLOSED_TYPES }, startDate: { lte: to }, endDate: { gte: from } },
    orderBy: { startDate: "asc" },
  });
}
