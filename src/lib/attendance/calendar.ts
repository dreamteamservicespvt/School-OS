// Which days attendance is taken on (04-data-model.md rule 18, automation
// A11): Sundays and School Calendar holidays and vacations are off, unless an
// entry for that date has "allow attendance" on. Every %, report and register
// total leaves the off days out.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { eachDay, isoDay, isoWeekday } from "../staff/dates";
import { formatDate } from "../format";

export type DayInfo = { on: boolean; reason: "sunday" | "holiday" | null; title: string | null };

export type SchoolDays = {
  /** Is attendance taken on this date? */
  info: (d: Date) => DayInfo;
  /** Working days in the range, oldest first. */
  working: Date[];
};

/** Loads the School Calendar once for a date range and answers for each day. */
export async function schoolDays(tx: Tx, ctx: SchoolContext, from: Date, to: Date, campusId?: string | null): Promise<SchoolDays> {
  const entries = await tx.calendarEntry.findMany({
    where: {
      schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: to }, endDate: { gte: from },
      ...(campusId ? { OR: [{ campusId: null }, { campusId }] } : {}),
    },
    select: { type: true, title: true, startDate: true, endDate: true, attendanceOn: true },
    orderBy: { startDate: "asc" },
  });
  // Saturdays the school has off (Events Settings, Weekends).
  const weekends = await tx.eventsSetting.findUnique({ where: { schoolId: ctx.schoolId }, select: { secondSaturdayOff: true, fourthSaturdayOff: true } });
  const off = new Map<string, string>();
  const allowed = new Set<string>();
  for (const e of entries) {
    const isOff = ["holiday", "vacation"].includes(e.type) && !e.attendanceOn;
    for (const d of eachDay(e.startDate < from ? from : e.startDate, e.endDate > to ? to : e.endDate)) {
      const k = isoDay(d);
      if (e.attendanceOn) allowed.add(k);
      else if (isOff && !off.has(k)) off.set(k, e.title);
    }
  }
  const info = (d: Date): DayInfo => {
    const k = isoDay(d);
    if (allowed.has(k)) return { on: true, reason: null, title: null };
    if (off.has(k)) return { on: false, reason: "holiday", title: off.get(k)! };
    if (isoWeekday(d) === 7) return { on: false, reason: "sunday", title: "Sunday" };
    if (isoWeekday(d) === 6 && weekends) {
      const n = Math.ceil(d.getUTCDate() / 7);
      if (n === 2 && weekends.secondSaturdayOff) return { on: false, reason: "holiday", title: "Second Saturday" };
      if (n === 4 && weekends.fourthSaturdayOff) return { on: false, reason: "holiday", title: "Fourth Saturday" };
    }
    return { on: true, reason: null, title: null };
  };
  const working = from <= to ? eachDay(from, to).filter((d) => info(d).on) : [];
  return { info, working };
}

export async function dayInfo(tx: Tx, ctx: SchoolContext, date: Date, campusId?: string | null) {
  return (await schoolDays(tx, ctx, date, date, campusId)).info(date);
}

/** "Holiday: Gandhi Jayanti. Attendance is off for 02-10-2026." */
export function offDayMessage(info: DayInfo, date: Date) {
  if (info.reason === "holiday") return `Holiday: ${info.title}. Attendance is off for ${formatDate(date, "UTC")}.`;
  return `${formatDate(date, "UTC")} is a Sunday. Attendance is off for this date.`;
}

export class OffDayError extends Error {
  field = "date";
  constructor(info: DayInfo, date: Date) {
    super(`${offDayMessage(info, date)} If the school opens that day, turn on "allow attendance" for the date in the School Calendar.`);
    this.name = "OffDayError";
  }
}
