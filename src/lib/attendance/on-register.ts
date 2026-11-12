// Who is on a section's register on a date (05 §2 Take Attendance, Attendance
// Register). One rule for every count of student attendance, so Take
// Attendance, the register, the class-wise view, Attendance Reports, Reports &
// Analytics and the Dashboard count the same students:
//
// - Today's register is the students Take Attendance lists: enrolment
//   Studying in the section, student Active or Admitted (see `roster`).
// - A student who has since left (transferred, withdrawn...) was on the
//   register on the days before their leaving date. The leaving date is the
//   day the status changes, and from that day Take Attendance no longer lists
//   them, so it is not counted. With no leaving date we cannot tell, so their
//   marks are not counted.
// - A student who finished the year in the section (promoted or held back)
//   was on it for the whole year.
// - A student moved to another section was on this one until the day of the
//   move, and is on the new one from the day of the move (self-test B7: the
//   new section's register showed the days before as "not marked").
//
// Marks are never removed: a mark saved for a day the student was not on the
// register stays stored (and in the audit log); it is only left out of counts.
import "server-only";

import type { StudentStatus } from "@prisma/client";
import type { Tx } from "../db";
import { isoDay } from "../staff/dates";

/** Student statuses that put a Studying enrolment on today's register (Take Attendance). */
export const ON_REGISTER_STATUSES: StudentStatus[] = ["ACTIVE", "ADMITTED"];

type Span = { from: string | null; until: string | null };

export type RegisterBook = {
  /** Was this student on this section's register on this day (YYYY-MM-DD)? */
  has(sectionId: string, studentId: string, day: string): boolean;
  /** How many students were on this section's register on this day. */
  countOn(sectionId: string, day: string): number;
  /** Students on the section's register today. */
  current(sectionId: string): Set<string>;
  /** The first day of the student's present stay on this section's register (the day they moved in), or null for the whole year. */
  onFrom(sectionId: string, studentId: string): string | null;
};

/**
 * Reads the enrolments, leaving dates and section moves of these sections
 * once, and answers "was this student on the register that day" for each.
 */
export async function registerBook(tx: Tx, sectionIds: string[]): Promise<RegisterBook> {
  const ids = [...new Set(sectionIds)];
  const [enrolments, moves] = ids.length === 0 ? [[], []] : await Promise.all([
    tx.enrolment.findMany({
      where: { sectionId: { in: ids } },
      select: { sectionId: true, studentId: true, status: true, archivedAt: true, student: { select: { status: true, archivedAt: true, leavingDate: true } } },
    }),
    tx.sectionChange.findMany({
      where: { OR: [{ fromSectionId: { in: ids } }, { toSectionId: { in: ids } }], undoneAt: null },
      select: { fromSectionId: true, toSectionId: true, studentId: true, createdAt: true, enrolmentId: true },
    }),
  ]);
  // Days a student moved into a section, so a stay starts there (the latest move in on or before its end).
  const movedIn = new Map<string, string[]>();
  for (const m of moves) {
    const k = `${m.toSectionId}|${m.studentId}`;
    movedIn.set(k, [...(movedIn.get(k) ?? []), isoDay(m.createdAt)]);
  }
  const fromFor = (sectionId: string, studentId: string, until: string | null) => {
    let best: string | null = null;
    for (const day of movedIn.get(`${sectionId}|${studentId}`) ?? []) if ((until === null || day <= until) && (best === null || day > best)) best = day;
    return best;
  };
  // Per section: student -> the stays on its register (from the day they moved in, or the whole year, to the last day).
  const spans = new Map<string, Map<string, Span[]>>();
  const put = (sectionId: string, studentId: string, until: string | null) => {
    const m = spans.get(sectionId) ?? new Map<string, Span[]>();
    m.set(studentId, [...(m.get(studentId) ?? []), { from: fromFor(sectionId, studentId, until), until }]);
    spans.set(sectionId, m);
  };
  const leftOn = new Map<string, string | null>();
  for (const e of enrolments) {
    const s = e.student;
    leftOn.set(e.studentId, s.leavingDate ? isoDay(s.leavingDate) : null);
    if (e.archivedAt) continue;
    const onNow = e.status === "STUDYING" && !s.archivedAt && ON_REGISTER_STATUSES.includes(s.status);
    const finishedYear = e.status === "PROMOTED" || e.status === "HELD_BACK";
    if (onNow || finishedYear) { put(e.sectionId, e.studentId, null); continue; }
    // Left: on the register on the days before the leaving date.
    if (s.leavingDate) put(e.sectionId, e.studentId, dayBefore(isoDay(s.leavingDate)));
  }
  for (const m of moves) {
    if (!ids.includes(m.fromSectionId)) continue;
    // Moved out: on this section's register up to the day of the move (the
    // mark of that day belongs to whichever section it was taken in).
    let until = isoDay(m.createdAt);
    const left = leftOn.get(m.studentId);
    if (left && dayBefore(left) < until) until = dayBefore(left);
    put(m.fromSectionId, m.studentId, until);
  }

  const covers = (span: Span, day: string) => (span.from === null || day >= span.from) && (span.until === null || day <= span.until);
  const has = (sectionId: string, studentId: string, day: string) => (spans.get(sectionId)?.get(studentId) ?? []).some((span) => covers(span, day));
  return {
    has,
    countOn(sectionId, day) {
      let n = 0;
      for (const list of spans.get(sectionId)?.values() ?? []) if (list.some((span) => covers(span, day))) n++;
      return n;
    },
    current(sectionId) {
      const out = new Set<string>();
      for (const [id, list] of spans.get(sectionId) ?? []) if (list.some((span) => span.until === null)) out.add(id);
      return out;
    },
    onFrom(sectionId, studentId) {
      return (spans.get(sectionId)?.get(studentId) ?? []).find((span) => span.until === null)?.from ?? null;
    },
  };
}

function dayBefore(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoDay(d);
}
