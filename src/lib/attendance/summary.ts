// Attendance totals and % (05 §2 Attendance Register, §7, rule 18). Every
// total leaves out Sundays and School Calendar holidays, and days with no
// mark or a "not counted" status are not in the %. Used by the register,
// reports, the Dashboard, the Student Profile and Parent Link.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { isoDay } from "../staff/dates";
import { schoolDays } from "./calendar";
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
  workingDays: number;
  workingDates: Date[];
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
  const [settings, list] = await Promise.all([attendanceSettings(tx, ctx), statusList(tx, ctx, { includeArchived: true })]);
  const statuses = statusMap(list);
  const days = await schoolDays(tx, ctx, opts.from, to, opts.campusId ?? null);
  const workingKeys = new Set(days.working.map(isoDay));

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
  if ("sectionId" in opts) {
    book = await registerBook(tx, [opts.sectionId]);
    const rows = await tx.attendanceMark.findMany({ where: { sectionId: opts.sectionId, date: { gte: opts.from, lte: to }, archivedAt: null, studentId: { not: null } }, select: { studentId: true }, distinct: ["studentId"] });
    ids = [...new Set([...rows.map((r) => r.studentId!), ...book.current(opts.sectionId)])];
  }

  const marks = ids.length === 0 || to < opts.from ? [] : await tx.attendanceMark.findMany({
    where: { archivedAt: null, date: { gte: opts.from, lte: to }, ...(side === "student" ? { studentId: { in: ids } } : { staffId: { in: ids } }), ...("sectionId" in opts ? { sectionId: opts.sectionId } : {}) },
    select: { studentId: true, staffId: true, date: true, periodNo: true, statusKey: true },
  });
  const grouped = new Map<string, Map<string, DayMark[]>>();
  for (const m of marks) {
    const pid = (side === "student" ? m.studentId : m.staffId)!;
    const k = isoDay(m.date);
    if (!workingKeys.has(k)) continue;
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
  const overall = emptySummary(days.working.length);
  for (const id of ids) {
    const s = emptySummary(days.working.length);
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
  return { workingDays: days.working.length, workingDates: days.working, overall: finish(overall), people, days: dayMap };
}

/** "92.5%" or "Not marked yet" */
export function percentText(p: number | null) {
  return p === null ? "Not marked yet" : `${p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}%`;
}
