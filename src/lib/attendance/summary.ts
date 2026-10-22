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

  const marks = ids.length === 0 || to < opts.from ? [] : await packedMarks(tx, side, ids, opts.from, to, "sectionId" in opts ? opts.sectionId : null);
  const grouped = new Map<string, Map<string, DayMark[]>>();
  for (const m of marks) {
    const pid = m.pid;
    const k = m.day;
    if (!workingFor(placeOf(pid)).keys.has(k)) continue;
    if (book && "sectionId" in opts && !book.has(opts.sectionId, pid, k)) continue;
    const byDay = grouped.get(pid) ?? new Map<string, DayMark[]>();
    const arr = byDay.get(k) ?? [];
    arr.push(m);
    byDay.set(k, arr);
    grouped.set(pid, byDay);
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
    people.set(id, finish(s));
    dayMap.set(id, statusByDay);
  }
  return {
    workingDays: main.dates.length, workingDates: main.dates, workingOf: (id) => workingFor(placeOf(id)).dates,
    overall: finish(overall), people, days: dayMap,
  };
}

type PackedMark = { pid: string; day: string; periodNo: number; statusKey: string };
const DAY = 86_400_000;

/**
 * Every mark of these people between two dates (inclusive), not archived, in
 * the section when one is given. The database sends one row per person with
 * their marks packed in one text (day number, period and status apart by
 * the control character 31, marks by 30, which no key holds), not one row
 * per mark: a whole school's year is about 250,000 marks, and turning each
 * into its own row took the database client seconds (gap list G37).
 */
async function packedMarks(tx: Tx, side: "student" | "staff", ids: string[], from: Date, to: Date, sectionId: string | null): Promise<PackedMark[]> {
  const fromDay = isoDay(from);
  const toDay = isoDay(to);
  const rows = side === "student"
    ? await tx.$queryRaw<{ pid: string; packed: string }[]>`
        SELECT student_id::text AS pid, string_agg((date - DATE '1970-01-01') || chr(31) || period_no || chr(31) || status_key, chr(30)) AS packed
        FROM attendance_mark
        WHERE archived_at IS NULL AND student_id = ANY(${ids}::uuid[]) AND date BETWEEN ${fromDay}::date AND ${toDay}::date
          AND (${sectionId}::uuid IS NULL OR section_id = ${sectionId}::uuid)
        GROUP BY student_id`
    : await tx.$queryRaw<{ pid: string; packed: string }[]>`
        SELECT staff_id::text AS pid, string_agg((date - DATE '1970-01-01') || chr(31) || period_no || chr(31) || status_key, chr(30)) AS packed
        FROM attendance_mark
        WHERE archived_at IS NULL AND staff_id = ANY(${ids}::uuid[]) AND date BETWEEN ${fromDay}::date AND ${toDay}::date
          AND (${sectionId}::uuid IS NULL OR section_id = ${sectionId}::uuid)
        GROUP BY staff_id`;
  const out: PackedMark[] = [];
  // Dates come as days since 1 January 1970: a few hundred different ones, each turned into "YYYY-MM-DD" once.
  const days = new Map<string, string>();
  const dayOf = (n: string) => {
    let d = days.get(n);
    if (!d) days.set(n, (d = new Date(Number(n) * DAY).toISOString().slice(0, 10)));
    return d;
  };
  for (const r of rows) {
    for (const one of r.packed.split("\u001e")) {
      const a = one.indexOf("\u001f");
      const b = one.indexOf("\u001f", a + 1);
      out.push({ pid: r.pid, day: dayOf(one.slice(0, a)), periodNo: Number(one.slice(a + 1, b)), statusKey: one.slice(b + 1) });
    }
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
