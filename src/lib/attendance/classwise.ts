// Attendance for every section at once (owner's prototype changes of 13 Oct
// 2026, attendance.jsx ClassWise): today or any period, each section with its
// class teacher, size and %. This is the one per-class source for attendance
// totals: the class-wise view, the Dashboard, Attendance Reports and sign-in
// all add up these same rows, so their numbers always agree.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { guessLevel, LEVELS } from "../academic/common";
import { isoDay } from "../staff/dates";
import { schoolDays } from "./calendar";
import { attendanceSettings, statusList, statusMap, weightOf } from "./settings";
import { addDay, dayStatus, finish, type DayMark, type PersonSummary } from "./summary";
import { registerBook } from "./on-register";

export type ClassGroup = { key: string; label: string; sort: number };

export type SectionAttendance = {
  sectionId: string;
  /** "Class 5 A", "LKG B". */
  name: string;
  classId: string;
  className: string;
  sort: number;
  group: ClassGroup;
  teacher: { staffId: string; name: string; userLoginId: string | null } | null;
  /** Students on the section's register on the last day of the range (today, or the date chosen). */
  students: number;
  /** For one day: students with a mark that day. For a period: student-days marked. */
  marked: number;
  /** Student-days that count in the % (marked with a counted status). */
  counted: number;
  /** Present days with a half day as half, for the % (present weight ÷ counted). */
  weight: number;
  /** For one day: no mark at all yet on a working day (the class teacher has not taken it). */
  notMarked: boolean;
  /** Student-days (one day: students) present, late counted as present. */
  present: number;
  absent: number;
  late: number;
  leave: number;
  /** Present ÷ counted × 100, one decimal (half day counts half); null when nothing is counted. */
  percent: number | null;
  /** Working days in the range up to today. */
  days: number;
};

export type ClassWise = {
  from: Date;
  to: Date;
  /** One working day (today or a chosen date). */
  oneDay: boolean;
  /** The range has no working day (Sunday or a holiday). */
  off: string | null;
  sections: SectionAttendance[];
  groups: ClassGroup[];
  totals: { students: number; markedStudents: number; present: number; absent: number; late: number; leave: number; percent: number | null; sections: number; markedSections: number; notMarkedSections: number };
};

const PRESENTISH = (w: number | null) => w !== null && w > 0;

/** "Nursery to UKG", "Classes 1 to 5", "Classes 9 and 10". */
function groupLabel(names: string[], level: string) {
  if (names.length === 0) return level;
  const bare = names.map((n) => n.replace(/^class\s+/i, ""));
  const allNumbered = names.every((n) => /^class\s+\S+$/i.test(n));
  const [a, b] = [bare[0], bare[bare.length - 1]];
  if (names.length === 1) return names[0];
  const join = names.length === 2 ? "and" : "to";
  return allNumbered ? `Classes ${a} ${join} ${b}` : `${names[0]} ${join} ${names[names.length - 1]}`;
}

type GroupClass = { id: string; name: string; sortOrder: number; level: string | null };

/** Class groups from each class's level (Pre-primary, Primary, ...), in class order. Also used by Fees by class. */
export function classGroups(list: GroupClass[]) {
  const levelOf = (c: { name: string; level: string | null }) => c.level || guessLevel(c.name) || "Other classes";
  const keyOf = (level: string) => level.toLowerCase().replace(/[^a-z]+/g, "-");
  const classes = [...new Map(list.map((c) => [c.id, c])).values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const groupNames = new Map<string, string[]>();
  for (const c of classes) groupNames.set(levelOf(c), [...(groupNames.get(levelOf(c)) ?? []), c.name]);
  const groups: ClassGroup[] = [...groupNames.entries()].map(([level, names]) => {
    const i = (LEVELS as readonly string[]).indexOf(level);
    return { key: keyOf(level), label: groupLabel(names, level), sort: i === -1 ? 99 : i };
  }).sort((a, b) => a.sort - b.sort);
  const groupOf = (c: { name: string; level: string | null }) => groups.find((g) => g.key === keyOf(levelOf(c)))!;
  return { groups, groupOf };
}

/**
 * Every section of the year (or of several years: each campus's current
 * year), or only the given ones, between two dates. Days after `today` are
 * left out; holidays and Sundays are never counted.
 */
export async function classWise(
  tx: Tx, ctx: SchoolContext,
  opts: { yearId: string | string[]; from: Date; to: Date; today: Date; sectionIds?: string[] | null; campusId?: string | null },
): Promise<ClassWise> {
  const to = opts.to > opts.today ? opts.today : opts.to;
  const [settings, list, days, sections] = await Promise.all([
    attendanceSettings(tx, ctx),
    statusList(tx, ctx, { includeArchived: true }),
    schoolDays(tx, ctx, opts.from, to < opts.from ? opts.from : to, opts.campusId ?? null),
    tx.section.findMany({
      where: { academicYearId: Array.isArray(opts.yearId) ? { in: opts.yearId } : opts.yearId, archivedAt: null, ...(opts.sectionIds ? { id: { in: opts.sectionIds } } : {}) },
      include: { schoolClass: { select: { id: true, name: true, sortOrder: true, level: true } } },
    }),
  ]);
  const statuses = statusMap(list);
  const working = to < opts.from ? [] : days.working;
  const workingKeys = new Set(working.map(isoDay));
  const ids = sections.map((s) => s.id);
  const [book, marks, teachers] = await Promise.all([
    registerBook(tx, ids),
    working.length === 0 ? Promise.resolve([]) : tx.attendanceMark.findMany({
      where: { sectionId: { in: ids }, studentId: { not: null }, archivedAt: null, date: { gte: opts.from, lte: to } },
      select: { studentId: true, sectionId: true, date: true, periodNo: true, statusKey: true },
    }),
    tx.staff.findMany({ where: { id: { in: sections.map((s) => s.classTeacherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true, userLoginId: true } }),
  ]);
  // "On roll" is the register on the last day counted (today for today): the students Take Attendance lists.
  const rollDay = isoDay(to < opts.from ? opts.from : to);
  const count = new Map(ids.map((id) => [id, book.countOn(id, rollDay)]));
  const teacherOf = new Map(teachers.map((t) => [t.id, t]));

  // One status per student per working day; the day's marks belong to the section they were taken in.
  // A mark counts only when the student was on that section's register that day
  // (./on-register.ts): a student who has left keeps their marks, but they are
  // not counted for the days after they left.
  const byDay = new Map<string, { sectionId: string; marks: DayMark[] }>();
  for (const m of marks) {
    const k = isoDay(m.date);
    if (!workingKeys.has(k) || !m.sectionId) continue;
    if (!book.has(m.sectionId, m.studentId!, k)) continue;
    const key = `${m.studentId}:${k}`;
    const e = byDay.get(key) ?? { sectionId: m.sectionId, marks: [] };
    e.marks.push(m);
    byDay.set(key, e);
  }
  const rule = settings.periodDayRule === "most" ? "most" : "any";
  const sums = new Map<string, { s: PersonSummary; present: number }>();
  const empty = (): PersonSummary => ({ workingDays: working.length, markedDays: 0, countedDays: 0, present: 0, absent: 0, late: 0, leave: 0, byStatus: {}, percent: null });
  for (const { sectionId, marks: dm } of byDay.values()) {
    const st = dayStatus(dm, statuses, rule);
    const row = sums.get(sectionId) ?? { s: empty(), present: 0 };
    addDay(row.s, st, statuses);
    if (st && PRESENTISH(weightOf(statuses.get(st)))) row.present++;
    sums.set(sectionId, row);
  }

  const { groups, groupOf } = classGroups(sections.map((s) => s.schoolClass));

  const oneDay = working.length === 1 && isoDay(opts.from) === isoDay(to);
  const rows: SectionAttendance[] = sections.map((sec) => {
    const r = sums.get(sec.id);
    const s = r ? finish(r.s) : empty();
    const t = sec.classTeacherId ? teacherOf.get(sec.classTeacherId) : undefined;
    const students = count.get(sec.id) ?? 0;
    return {
      sectionId: sec.id,
      name: `${sec.schoolClass.name} ${sec.name}`,
      classId: sec.schoolClass.id,
      className: sec.schoolClass.name,
      sort: sec.schoolClass.sortOrder,
      group: groupOf(sec.schoolClass),
      teacher: t ? { staffId: t.id, name: t.fullName, userLoginId: t.userLoginId } : null,
      students,
      marked: s.markedDays,
      counted: s.countedDays,
      weight: s.present,
      notMarked: working.length > 0 && students > 0 && s.markedDays === 0,
      present: r?.present ?? 0,
      absent: s.absent,
      late: s.late,
      leave: s.leave,
      percent: s.percent,
      days: working.length,
    };
  }).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const marked = rows.filter((r) => r.marked > 0);
  const all = { countedDays: 0, present: 0 };
  for (const r of sums.values()) { all.countedDays += r.s.countedDays; all.present += r.s.present; }
  const off = working.length === 0 ? (to < opts.from ? "Not started" : days.info(opts.from).title ?? "No school days") : null;
  return {
    from: opts.from, to, oneDay, off,
    sections: rows,
    groups,
    totals: {
      students: rows.reduce((a, r) => a + r.students, 0),
      markedStudents: oneDay ? marked.reduce((a, r) => a + r.students, 0) : marked.reduce((a, r) => a + r.marked, 0),
      present: rows.reduce((a, r) => a + r.present, 0),
      absent: rows.reduce((a, r) => a + r.absent, 0),
      late: rows.reduce((a, r) => a + r.late, 0),
      leave: rows.reduce((a, r) => a + r.leave, 0),
      percent: all.countedDays ? Math.round((all.present / all.countedDays) * 1000) / 10 : null,
      sections: rows.filter((r) => r.students > 0).length,
      markedSections: marked.length,
      notMarkedSections: rows.filter((r) => r.notMarked).length,
    },
  };
}

/** Sort for the class-wise view: lowest % first, sections not marked before everything, or class order. */
export function sortSections(rows: SectionAttendance[], by: "low" | "class") {
  if (by === "class") return rows;
  return [...rows].sort((a, b) => Number(b.notMarked) - Number(a.notMarked) || (a.percent ?? 999) - (b.percent ?? 999) || a.sort - b.sort);
}

/** Green 92% or more, amber 85% to 92%, red below 85% (the approved class-wise view). */
export function attendanceTone(percent: number | null, notMarked = false): "ok" | "warn" | "bad" {
  if (notMarked || percent === null) return "warn";
  return percent >= 92 ? "ok" : percent >= 85 ? "warn" : "bad";
}
