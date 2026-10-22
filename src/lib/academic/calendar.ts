// Read helpers for the School Calendar, which Events & Calendar owns (18).
// The Time Table, Substitutions, syllabus plans and homework ask here whether
// a day is a school day (automations A10 and A11). The rule is the school's
// one rule for a school day (src/lib/calendar/school-days.ts).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { isSchoolDay, type SchoolDayInfo } from "../calendar/school-days";

/** Entry types that close the school for the day. */
export const CLOSED_TYPES = ["holiday", "vacation"];

export type DayOff = { kind: "holiday" | "weekend"; title: string };

/** True when the school is closed on the date for a holiday or vacation (no campus: the main campus). */
export async function isHoliday(tx: Tx, ctx: SchoolContext, date: Date, campusId?: string | null): Promise<boolean> {
  return (await isSchoolDay(tx, ctx, date, { campusId })).reason === "holiday";
}

/** A closed day as the Time Table words it. */
export function dayOffOf(info: SchoolDayInfo): DayOff | null {
  if (info.on) return null;
  if (info.reason === "holiday") return { kind: "holiday", title: info.title ?? "Holiday" };
  if (info.title === "Second Saturday" || info.title === "Fourth Saturday") return { kind: "weekend", title: `${info.title} off` };
  return { kind: "weekend", title: `${info.title ?? "This day"} is not a working day` };
}

/** Why there are no periods on a date: a holiday, or not a working day. Null on a normal school day. */
export async function dayOff(tx: Tx, ctx: SchoolContext, date: Date, campusId: string, classId?: string | null): Promise<DayOff | null> {
  return dayOffOf(await isSchoolDay(tx, ctx, date, { campusId, classId }));
}

/** The exam day on the calendar (from published datesheets, A10) for the campus and class on a date. */
export async function examDayOn(tx: Tx, ctx: SchoolContext, date: Date, opts: { campusId?: string | null; classId?: string | null } = {}) {
  const rows = await tx.calendarEntry.findMany({
    where: {
      schoolId: ctx.schoolId, archivedAt: null, type: "exam_day", startDate: { lte: date }, endDate: { gte: date },
      ...(opts.campusId ? { OR: [{ campusId: null }, { campusId: opts.campusId }] } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.find((r) => !opts.classId || r.classIds.length === 0 || r.classIds.includes(opts.classId)) ?? null;
}

/** Holidays and vacations between two dates, for lists and reports. */
export async function holidaysBetween(tx: Tx, ctx: SchoolContext, from: Date, to: Date) {
  return tx.calendarEntry.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, type: { in: CLOSED_TYPES }, startDate: { lte: to }, endDate: { gte: from } },
    orderBy: { startDate: "asc" },
  });
}
