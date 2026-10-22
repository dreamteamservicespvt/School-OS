// Attendance totals and % (05 §2 Attendance Register, §7, rule 18). Every
// total leaves out the days that are not school days for the person's campus
// and class (src/lib/calendar/school-days.ts: Sundays, days that are not
// working days, Saturdays off, holidays), and days with no mark or a "not
// counted" status are not in the %. Used by the register, reports, report
// cards, salary, the Dashboard, the Student Profile and Parent Link.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { isoDay } from "../staff/dates";
import { loadSchoolCalendar } from "../calendar/school-days";
import { attendanceSettings, statusList, statusMap, weightOf, type StatusInfo } from "./settings";
import { registerBook, type RegisterBook } from "./on-register";
import { coveredBy, openingsFor, type Opening } from "./opening-totals";

export type DayMark = { statusKey: string; periodNo: number; lateMinutes?: number | null };

export type PersonSummary = {
  /** Working days in the range (up to today). */
  workingDays: number;
  /** Working days with a mark. */
  markedDays: number;
  /** Days that count in the % (marked, and the status is counted). */
  countedDays: number;
  /** Present days, a half day counting 0.5. */
  present: number;
  absent: number;
  late: number;
  leave: number;
  /** Days per status key. */
  byStatus: Record<string, number>;
  /** Present ÷ counted × 100, one decimal; null when nothing counted yet. */
  percent: number | null;
  /**
   * Attendance so far brought in from the old software (./opening.ts), already
   * added to the days above: the days the school met and was present, up to
   * the day before the school started on School OS.
   */
  broughtIn?: { met: number; present: number; upTo: Date };
};

const emptySummary = (workingDays: number): PersonSummary => ({ workingDays, markedDays: 0, countedDays: 0, present: 0, absent: 0, late: 0, leave: 0, byStatus: {}, percent: null });

/**
 * One status for a day from that day's marks. A whole-day mark wins. With
 * period-wise attendance the day is present if present in any period ("any"),
 * or in at least half of them ("most").
 */
export function dayStatus(marks: DayMark[], statuses: Map<string, StatusInfo>, rule: "any" | "most" = "any"): string | null {
  if (marks.length === 0) return null;
  const whole = marks.find((m) => m.periodNo === 0);
  if (whole) return whole.statusKey;
  const sorted = [...marks].sort((a, b) => a.periodNo - b.periodNo);
  const weighted = sorted.map((m) => ({ m, w: weightOf(statuses.get(m.statusKey)) }));
  if (rule === "most") {
    const counted = weighted.filter((x) => x.w !== null);
    if (counted.length === 0) return sorted[0].statusKey;
    const presentish = counted.filter((x) => (x.w ?? 0) > 0);
    if (presentish.length * 2 >= counted.length) return presentish.find((x) => x.w === 1)?.m.statusKey ?? presentish[0].m.statusKey;
    return counted.find((x) => x.w === 0)?.m.statusKey ?? counted[0].m.statusKey;
  }
  let best = weighted[0];
  for (const x of weighted) if ((x.w ?? -1) > (best.w ?? -1)) best = x;
  return best.m.statusKey;
}

export function addDay(s: PersonSummary, statusKey: string | null, statuses: Map<string, StatusInfo>) {
  if (!statusKey) return;
  s.markedDays++;
  s.byStatus[statusKey] = (s.byStatus[statusKey] ?? 0) + 1;
  const st = statuses.get(statusKey);
  const w = weightOf(st);
  if (statusKey === "late") s.late++;
  if (statusKey === "leave") s.leave++;
  if (w === null) return;
  s.countedDays++;
  s.present += w;
  if (w === 0) s.absent++;
}

export function finish(s: PersonSummary): PersonSummary {
  s.percent = s.countedDays > 0 ? Math.round((s.present / s.countedDays) * 1000) / 10 : null;
  return s;
}

export type SummaryTarget = { studentId: string } | { sectionId: string } | { staffId: string } | { studentIds: string[] } | { staffIds: string[] };

export type SummaryResult = {
  /** School days in the range for the campus asked for (or the section's class). */
  workingDays: number;
  workingDates: Date[];
  /** One person's school days: their own campus and class. */
  workingOf: (id: string) => Date[];
  /** Everyone together. */
  overall: PersonSummary;
  /** Per student or staff id. */
  people: Map<string, PersonSummary>;
  /** Day status per person per date (YYYY-MM-DD). */
  days: Map<string, Map<string, string>>;
  /** For narrowSummary: the totals brought in that the range holds, and the day statuses on their days (not counted here). */
  openings?: Map<string, Opening[]>;
  coveredDays?: Map<string, Map<string, string>>;
};

/**
 * Attendance totals for a student, a section, a staff member or a list of
 * them, between two dates (inclusive). Days after `today` are not counted.
 * For Dashboard, Reports, Student Profile and Parent Link.
 */
export async function attendanceSummary(
  tx: Tx, ctx: SchoolContext,
  opts: SummaryTarget & { from: Date; to: Date; today?: Date; campusId?: string | null },
): Promise<SummaryResult> {
  const to = opts.today && opts.today < opts.to ? opts.today : opts.to;
  const [settings, list, calendar] = await Promise.all([attendanceSettings(tx, ctx), statusList(tx, ctx, { includeArchived: true }), loadSchoolCalendar(tx, ctx, opts.from, to)]);
  const statuses = statusMap(list);

  let ids: string[] = [];
  let side: "student" | "staff" = "student";
  if ("studentId" in opts) ids = [opts.studentId];
  else if ("studentIds" in opts) ids = opts.studentIds;
  else if ("staffId" in opts) { ids = [opts.staffId]; side = "staff"; }
  else if ("staffIds" in opts) { ids = opts.staffIds; side = "staff"; }
  // A section: today's register plus anyone with marks in the section in the
  // range; only the marks taken in this section on days the student was on its
  // register count (./on-register.ts), so a student who left or moved keeps
  // their history without adding days after they went.
  let book: RegisterBook | null = null;
  let sectionPlace: Place | null = null;
  if ("sectionId" in opts) {
    book = await registerBook(tx, [opts.sectionId]);
    const rows = await tx.attendanceMark.findMany({ where: { sectionId: opts.sectionId, date: { gte: opts.from, lte: to }, archivedAt: null, studentId: { not: null } }, select: { studentId: true }, distinct: ["studentId"] });
    ids = [...new Set([...rows.map((r) => r.studentId!), ...book.current(opts.sectionId)])];
    const sec = await tx.section.findFirst({ where: { id: opts.sectionId }, select: { classId: true, schoolClass: { select: { campusId: true } } } });
    sectionPlace = sec ? { campusId: sec.schoolClass.campusId, classId: sec.classId } : null;
  }

  // Each person's school days come from their own campus (and class).
  const places = sectionPlace ? null : await placesOf(tx, ids, side, opts.from, to);
  const fallback: Place = sectionPlace ?? { campusId: opts.campusId ?? null, classId: null };
  const workingBy = new Map<string, { dates: Date[]; keys: Set<string> }>();
  const workingFor = (p: Place) => {
    const k = `${p.campusId ?? ""}:${p.classId ?? ""}`;
    let w = workingBy.get(k);
    if (!w) {
      const dates = opts.from <= to ? calendar.campus(p.campusId).working({ classId: p.classId }) : [];
      w = { dates, keys: new Set(dates.map(isoDay)) };
      workingBy.set(k, w);
    }
    return w;
  };
  const placeOf = (id: string): Place => places?.get(id) ?? fallback;
  const main = workingFor(fallback);

  const packed = ids.length === 0 || to < opts.from ? [] : await packedMarks(tx, side, ids, opts.from, to, "sectionId" in opts ? opts.sectionId : null);
  // Attendance so far brought in for a student (a school that started part way through the year):
  // added when the range holds all of it; a mark on one of its days is not counted again.
  const openings = side === "student" ? await openingsFor(tx, ids, opts.from, to) : new Map<string, Opening[]>();
  const grouped = new Map<string, Map<string, DayMark[]>>();
  // Marks on days a total brought in covers, kept apart: a shorter range that does not hold that total counts them (narrowSummary).
  const coveredMarks = new Map<string, Map<string, DayMark[]>>();
  const inBook = book && "sectionId" in opts ? { book, sectionId: opts.sectionId } : null;
  for (const r of packed) {
    const pid = r.pid;
    const working = workingFor(placeOf(pid)).keys;
    const brought = openings.get(pid);
    let byDay = grouped.get(pid);
    for (const one of r.packed.split("\u001e")) {
      const a = one.indexOf("\u001f");
      const b = one.indexOf("\u001f", a + 1);
      const n = one.slice(0, a);
      const k = dayOf(n);
      if (!working.has(k)) continue;
      if (inBook && !inBook.book.has(inBook.sectionId, pid, k)) continue;
      const m: DayMark = { statusKey: one.slice(b + 1), periodNo: Number(one.slice(a + 1, b)) };
      let into: Map<string, DayMark[]>;
      if (brought && coveredBy(brought, new Date(Number(n) * DAY))) {
        let c = coveredMarks.get(pid);
        if (!c) coveredMarks.set(pid, (c = new Map<string, DayMark[]>()));
        into = c;
      } else {
        if (!byDay) grouped.set(pid, (byDay = new Map<string, DayMark[]>()));
        into = byDay;
      }
      const arr = into.get(k);
      if (arr) arr.push(m);
      else into.set(k, [m]);
    }
  }
  const rule = settings.periodDayRule === "most" ? "most" : "any";
  const people = new Map<string, PersonSummary>();
  const dayMap = new Map<string, Map<string, string>>();
  const overall = emptySummary(main.dates.length);
  for (const id of ids) {
    const s = emptySummary(workingFor(placeOf(id)).dates.length);
    const statusByDay = new Map<string, string>();
    for (const [k, dm] of grouped.get(id) ?? []) {
      const st = dayStatus(dm, statuses, rule);
      if (st) statusByDay.set(k, st);
      addDay(s, st, statuses);
      addDay(overall, st, statuses);
    }
    const brought = openings.get(id);
    if (brought) {
      // The register's own school days in those weeks give way to the old register's count.
      const covered = workingFor(placeOf(id)).dates.filter((d) => coveredBy(brought, d)).length;
      let met = 0, present = 0, upTo = brought[0].upTo;
      for (const o of brought) { met += o.met; present += o.present; if (o.upTo > upTo) upTo = o.upTo; }
      for (const x of [s, overall]) { x.markedDays += met; x.countedDays += met; x.present += present; x.absent += met - present; }
      s.workingDays += met - covered;
      s.broughtIn = { met, present, upTo };
    }
    people.set(id, finish(s));
    dayMap.set(id, statusByDay);
  }
  const coveredDays = new Map<string, Map<string, string>>();
  for (const [id, byDay] of coveredMarks) {
    const out = new Map<string, string>();
    for (const [k, dm] of byDay) {
      const st = dayStatus(dm, statuses, rule);
      if (st) out.set(k, st);
    }
    coveredDays.set(id, out);
  }
  return {
    workingDays: main.dates.length, workingDates: main.dates, workingOf: (id) => workingFor(placeOf(id)).dates,
    overall: finish(overall), people, days: dayMap, openings, coveredDays,
  };
}

const DAY = 86_400_000;
/** Days since 1 January 1970 as "YYYY-MM-DD": a few hundred different ones, each worked out once. */
const DAYS = new Map<string, string>();
function dayOf(n: string) {
  let d = DAYS.get(n);
  if (!d) {
    d = new Date(Number(n) * DAY).toISOString().slice(0, 10);
    if (DAYS.size < 20_000) DAYS.set(n, d);
  }
  return d;
}

/**
 * Every mark of these people between two dates (inclusive), not archived, in
 * the section when one is given. The database sends one row per person with
 * their marks packed in one text (day number, period and status apart by
 * the control character 31, marks by 30, which no key holds), not one row
 * per mark: a whole school's year is about 250,000 marks, and turning each
 * into its own row took the database client seconds (gap list G37).
 */
async function packedMarks(tx: Tx, side: "student" | "staff", ids: string[], from: Date, to: Date, sectionId: string | null) {
  const fromDay = isoDay(from);
  const toDay = isoDay(to);
  return side === "student"
    ? tx.$queryRaw<{ pid: string; packed: string }[]>`
        SELECT student_id::text AS pid, string_agg((date - DATE '1970-01-01') || chr(31) || period_no || chr(31) || status_key, chr(30)) AS packed
        FROM attendance_mark
        WHERE archived_at IS NULL AND student_id = ANY(${ids}::uuid[]) AND date BETWEEN ${fromDay}::date AND ${toDay}::date
          AND (${sectionId}::uuid IS NULL OR section_id = ${sectionId}::uuid)
        GROUP BY student_id`
    : tx.$queryRaw<{ pid: string; packed: string }[]>`
        SELECT staff_id::text AS pid, string_agg((date - DATE '1970-01-01') || chr(31) || period_no || chr(31) || status_key, chr(30)) AS packed
        FROM attendance_mark
        WHERE archived_at IS NULL AND staff_id = ANY(${ids}::uuid[]) AND date BETWEEN ${fromDay}::date AND ${toDay}::date
          AND (${sectionId}::uuid IS NULL OR section_id = ${sectionId}::uuid)
        GROUP BY staff_id`;
}

/**
 * The same people's totals for a shorter range inside the one summed, from
 * its day statuses (a day's status does not depend on the range): no second
 * read of the marks (G37). `statuses`: statusMap() of every status, archived too.
 */
export function narrowSummary(sum: SummaryResult, from: Date, to: Date, statuses: Map<string, StatusInfo>): Map<string, PersonSummary> {
  const a = isoDay(from);
  const b = isoDay(to);
  const out = new Map<string, PersonSummary>();
  for (const [id, byDay] of sum.days) {
    const working = sum.workingOf(id).filter((d) => d >= from && d <= to);
    const s = emptySummary(working.length);
    for (const [k, st] of byDay) if (k >= a && k <= b) addDay(s, st, statuses);
    // Totals brought in count only when this range holds all of them (openingsFor); the marks on the days of
    // the others count as marks, as a summary of this range alone would count them.
    const all = sum.openings?.get(id) ?? [];
    const inside = all.filter((o) => o.from >= from && o.upTo <= to);
    for (const [k, st] of sum.coveredDays?.get(id) ?? []) {
      if (k >= a && k <= b && !coveredBy(inside, new Date(`${k}T00:00:00Z`))) addDay(s, st, statuses);
    }
    if (inside.length) {
      const covered = working.filter((d) => coveredBy(inside, d)).length;
      let met = 0, present = 0, upTo = inside[0].upTo;
      for (const o of inside) { met += o.met; present += o.present; if (o.upTo > upTo) upTo = o.upTo; }
      s.markedDays += met; s.countedDays += met; s.present += present; s.absent += met - present;
      s.workingDays += met - covered;
      s.broughtIn = { met, present, upTo };
    }
    out.set(id, finish(s));
  }
  return out;
}

export type Place = { campusId: string | null; classId: string | null };

/**
 * Where each person is, for their school days: a student's class and campus
 * in the year the range ends in (or the latest one before it), a staff
 * member's campus.
 */
export async function placesOf(tx: Tx, ids: string[], side: "student" | "staff", from: Date, to: Date): Promise<Map<string, Place>> {
  const out = new Map<string, Place>();
  if (ids.length === 0) return out;
  if (side === "staff") {
    const staff = await tx.staff.findMany({ where: { id: { in: ids } }, select: { id: true, campusId: true } });
    for (const s of staff) out.set(s.id, { campusId: s.campusId, classId: null });
    return out;
  }
  const enrols = await tx.enrolment.findMany({ where: { studentId: { in: ids }, archivedAt: null }, select: { studentId: true, academicYearId: true, classId: true } });
  if (enrols.length === 0) return out;
  const [years, classes] = await Promise.all([
    tx.academicYear.findMany({ where: { id: { in: [...new Set(enrols.map((e) => e.academicYearId))] } }, select: { id: true, startDate: true, endDate: true } }),
    tx.schoolClass.findMany({ where: { id: { in: [...new Set(enrols.map((e) => e.classId))] } }, select: { id: true, campusId: true } }),
  ]);
  const yearOf = new Map(years.map((y) => [y.id, y]));
  const end = to < from ? from : to;
  // The year holding the end of the range wins; else the latest year that started before it; else the earliest after.
  const score = (yearId: string) => {
    const y = yearOf.get(yearId);
    if (!y) return -Number.MAX_VALUE;
    if (y.startDate <= end && y.endDate >= end) return Number.MAX_VALUE;
    if (y.startDate <= end) return y.startDate.getTime();
    return -y.startDate.getTime();
  };
  const best = new Map<string, (typeof enrols)[number]>();
  for (const e of enrols) {
    const b = best.get(e.studentId);
    if (!b || score(e.academicYearId) > score(b.academicYearId)) best.set(e.studentId, e);
  }
  for (const [id, e] of best) {
    const campusId = classes.find((c) => c.id === e.classId)?.campusId;
    if (campusId) out.set(id, { campusId, classId: e.classId });
  }
  return out;
}

/** "92.5%" or "Not marked yet" */
export function percentText(p: number | null) {
  return p === null ? "Not marked yet" : `${p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}%`;
}
