// One rule for "is this a school day?" (04-data-model.md rule 18, automations
// A10 and A11), used by every module: Take Attendance and the register, every
// attendance %, student and staff leave days, the Time Table and
// substitutions, homework due dates, syllabus plans, salary working days,
// PTMs, the datesheet and the dashboards. Per campus and per date it puts
// together:
//
// 1. the campus's working days (Academic Settings, 04 §6; default Monday to
//    Saturday), so a Monday-to-Friday campus has no school on Saturdays;
// 2. the Saturdays the school has off (Events Settings, Weekends, 18 §6);
// 3. holidays and vacations on the School Calendar for the whole school or
//    that campus;
// 4. "allow attendance on this date" on an entry a person typed into the
//    School Calendar: the only thing that makes a closed day a school day
//    (for chosen classes, only for those classes). Entries made by the
//    datesheet, an event, a PTM or an admission test never open or close a
//    day;
// 5. exam days from published datesheets (for the classes sitting them) and
//    half days (Academic Settings), which do not change whether it is a
//    school day but are told to the Time Table.
import "server-only";

import type { SchoolContext, Tx } from "../db";

const CLOSING = ["holiday", "vacation"];
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DEFAULT_WORKING = [1, 2, 3, 4, 5, 6];
const DAY_MS = 86_400_000;

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
/** 1 = Monday ... 7 = Sunday. */
const weekdayOf = (d: Date) => (d.getUTCDay() === 0 ? 7 : d.getUTCDay());

export type OffReason = "sunday" | "weekend" | "holiday";

export type SchoolDayInfo = {
  /** Is it a school day (attendance taken, periods held)? */
  on: boolean;
  /** Why not: a Sunday, another day that is not a working day (a Saturday off), or a holiday or vacation. */
  reason: OffReason | null;
  /** The holiday's name, "Sunday", "Saturday", "Second Saturday"... */
  title: string | null;
  /** The School Calendar entry that makes this closed day a school day ("allow attendance on this date"). */
  opened: string | null;
  /** An exam day from the datesheet, for this class (or any class when no class is given). */
  exam: { title: string; classIds: string[] } | null;
  /** The early end time on a half day ("12:30"), from Academic Settings. */
  halfDayEnd: string | null;
};

export type DayOpts = { classId?: string | null };

export type CampusCalendar = {
  campusId: string | null;
  info: (d: Date, opts?: DayOpts) => SchoolDayInfo;
  /** School days in the loaded range, oldest first. */
  working: (opts?: DayOpts) => Date[];
  /** Days in the range that are not school days, YYYY-MM-DD → why. */
  offDays: (opts?: DayOpts) => Map<string, SchoolDayInfo>;
};

type Entry = { type: string; title: string; startDate: Date; endDate: Date; attendanceOn: boolean; source: string | null; campusId: string | null; classIds: string[] };
type Timing = { workingDays: number[]; halfDays: number[]; halfDayEnd: string | null };

export type SchoolCalendarBook = {
  from: Date;
  to: Date;
  /** The rule for one campus. No campus: the main campus. */
  campus: (campusId: string | null | undefined) => CampusCalendar;
};

function eachDay(from: Date, to: Date) {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) out.push(new Date(t));
  return out;
}

/** "Second Saturday" for the 2nd Saturday of the month, when the school has it off. */
function saturdayOff(d: Date, w: { secondSaturdayOff: boolean; fourthSaturdayOff: boolean } | null): string | null {
  if (!w || weekdayOf(d) !== 6) return null;
  const n = Math.ceil(d.getUTCDate() / 7);
  if (n === 2 && w.secondSaturdayOff) return "Second Saturday";
  if (n === 4 && w.fourthSaturdayOff) return "Fourth Saturday";
  return null;
}

/**
 * Loads the School Calendar, the Saturdays off and every campus's working
 * days once for a date range, and answers for each day and campus. Callers
 * that loop over days use this; single-day callers use isSchoolDay.
 */
export async function loadSchoolCalendar(tx: Tx, ctx: SchoolContext, from: Date, to: Date): Promise<SchoolCalendarBook> {
  const [entries, weekends, timings, campuses] = await Promise.all([
    from <= to ? tx.calendarEntry.findMany({
      where: { schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: to }, endDate: { gte: from } },
      select: { type: true, title: true, startDate: true, endDate: true, attendanceOn: true, source: true, campusId: true, classIds: true },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }) : Promise.resolve([] as Entry[]),
    tx.eventsSetting.findUnique({ where: { schoolId: ctx.schoolId }, select: { secondSaturdayOff: true, fourthSaturdayOff: true } }),
    tx.academicSettings.findMany({ where: { schoolId: ctx.schoolId }, select: { campusId: true, workingDays: true, halfDays: true, halfDayEnd: true } }),
    tx.campus.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true, isMain: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const mainId = (campuses.find((c) => c.isMain) ?? campuses[0])?.id ?? null;
  const cache = new Map<string, CampusCalendar>();

  const campus = (asked: string | null | undefined): CampusCalendar => {
    const campusId = asked ?? mainId;
    const key = campusId ?? "";
    const hit = cache.get(key);
    if (hit) return hit;
    const row = timings.find((t) => t.campusId === campusId);
    const timing: Timing = row ? { workingDays: row.workingDays.length ? row.workingDays : DEFAULT_WORKING, halfDays: row.halfDays, halfDayEnd: row.halfDayEnd } : { workingDays: DEFAULT_WORKING, halfDays: [], halfDayEnd: null };
    // A campus's own entries and the whole school's; never another campus's.
    const mine = (entries as Entry[]).filter((e) => e.campusId === null || e.campusId === campusId);
    const covering = (d: Date) => mine.filter((e) => e.startDate <= d && e.endDate >= d);
    const forClass = (e: Entry, classId: string | null | undefined) => e.classIds.length === 0 || (classId ? e.classIds.includes(classId) : false);

    const info = (d: Date, opts: DayOpts = {}): SchoolDayInfo => {
      const here = covering(d);
      const examEntry = here.find((e) => e.type === "exam_day" && (opts.classId ? forClass(e, opts.classId) : true));
      const exam = examEntry ? { title: examEntry.title, classIds: examEntry.classIds } : null;
      const wd = weekdayOf(d);
      const halfDayEnd = timing.halfDays.includes(wd) ? timing.halfDayEnd : null;
      // 4. A person allowed attendance on this date in the School Calendar.
      const opener = here.find((e) => !e.source && e.attendanceOn && forClass(e, opts.classId));
      if (opener) return { on: true, reason: null, title: null, opened: opener.title, exam, halfDayEnd };
      // 3. A holiday or vacation.
      const closed = here.find((e) => CLOSING.includes(e.type) && !e.attendanceOn);
      if (closed) return { on: false, reason: "holiday", title: closed.title, opened: null, exam, halfDayEnd: null };
      // 1. Not a working day of the campus.
      if (!timing.workingDays.includes(wd)) return { on: false, reason: wd === 7 ? "sunday" : "weekend", title: DAY_NAMES[wd], opened: null, exam, halfDayEnd: null };
      // 2. A Saturday the school has off.
      const sat = saturdayOff(d, weekends);
      if (sat) return { on: false, reason: "weekend", title: sat, opened: null, exam, halfDayEnd: null };
      return { on: true, reason: null, title: null, opened: null, exam, halfDayEnd };
    };
    const days = eachDay(from, to);
    const cal: CampusCalendar = {
      campusId,
      info,
      working: (opts) => days.filter((d) => info(d, opts).on),
      offDays: (opts) => {
        const out = new Map<string, SchoolDayInfo>();
        for (const d of days) {
          const i = info(d, opts);
          if (!i.on) out.set(isoOf(d), i);
        }
        return out;
      },
    };
    cache.set(key, cal);
    return cal;
  };
  return { from, to, campus };
}

/** The rule for one campus over a date range. */
export async function schoolCalendar(tx: Tx, ctx: SchoolContext, from: Date, to: Date, campusId: string | null | undefined): Promise<CampusCalendar> {
  return (await loadSchoolCalendar(tx, ctx, from, to)).campus(campusId);
}

/** Is this one date a school day for the campus (and class)? */
export async function isSchoolDay(tx: Tx, ctx: SchoolContext, date: Date, opts: { campusId: string | null | undefined; classId?: string | null }): Promise<SchoolDayInfo> {
  return (await schoolCalendar(tx, ctx, date, date, opts.campusId)).info(date, { classId: opts.classId ?? null });
}

/** "a second Saturday", "a Saturday", "a Sunday", for sentences. */
export function offDayWords(info: Pick<SchoolDayInfo, "reason" | "title">): string {
  if (info.reason === "holiday") return `a holiday (${info.title})`;
  const t = info.title ?? "Sunday";
  return `a ${t.replace(/^(Second|Fourth) /, (m) => m.toLowerCase())}`;
}
