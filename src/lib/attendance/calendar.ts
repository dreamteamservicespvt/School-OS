// Which days attendance is taken on (04-data-model.md rule 18, automation
// A11). The rule itself is the school's one rule for a school day
// (src/lib/calendar/school-days.ts): the campus's working days, the Saturdays
// off, School Calendar holidays and vacations, and "allow attendance on this
// date" typed into the School Calendar. Every %, report and register total
// leaves the off days out.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import { isSchoolDay, offDayWords, schoolCalendar, type DayOpts, type SchoolDayInfo } from "../calendar/school-days";

export type DayInfo = Pick<SchoolDayInfo, "on" | "reason" | "title"> & Partial<Omit<SchoolDayInfo, "on" | "reason" | "title">>;

export type SchoolDays = {
  /** Is attendance taken on this date (for the class, when given)? */
  info: (d: Date, opts?: DayOpts) => SchoolDayInfo;
  /** Working days in the range, oldest first. */
  working: Date[];
};

/** Loads the School Calendar once for a date range and answers for each day of a campus (and class). */
export async function schoolDays(tx: Tx, ctx: SchoolContext, from: Date, to: Date, campusId?: string | null, opts: DayOpts = {}): Promise<SchoolDays> {
  const cal = await schoolCalendar(tx, ctx, from, to, campusId);
  return { info: (d, o) => cal.info(d, o ?? opts), working: from <= to ? cal.working(opts) : [] };
}

export async function dayInfo(tx: Tx, ctx: SchoolContext, date: Date, campusId?: string | null, opts: DayOpts = {}): Promise<SchoolDayInfo> {
  return isSchoolDay(tx, ctx, date, { campusId, classId: opts.classId ?? null });
}

/** "Holiday: Gandhi Jayanti. Attendance is off for 02-10-2026." */
export function offDayMessage(info: DayInfo, date: Date) {
  if (info.reason === "holiday") return `Holiday: ${info.title}. Attendance is off for ${formatDate(date, "UTC")}.`;
  if (info.reason === "weekend") return `${formatDate(date, "UTC")} is ${offDayWords(info)}, not a working day. Attendance is off for this date.`;
  return `${formatDate(date, "UTC")} is a Sunday. Attendance is off for this date.`;
}

export class OffDayError extends Error {
  field = "date";
  constructor(info: DayInfo, date: Date) {
    super(`${offDayMessage(info, date)} If the school opens that day, turn on "allow attendance" for the date in the School Calendar.`);
    this.name = "OffDayError";
  }
}
