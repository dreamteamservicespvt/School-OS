// How strong an Early Warning is (19 §2: Watch or Act now). "Act now" is kept
// for strong evidence, so a school where most families owe fees does not see
// nearly every child as "Act now" (alarm fatigue, the lead's review of the demo
// school, 18 Oct 2026):
// - attendance below the threshold and falling lately, or well below it;
// - a fail in two or more subjects of the latest exam;
// - concerns in two areas at once (attendance and marks).
// Fees alone are never "Act now": overdue fees are an accounts matter, followed
// up from Fee Defaulters; Early Warnings is about a child who may need help.
// Pure functions, so every rule is tested on its own.

/** Points under the threshold that are "well below" it, Act now even when steady. */
export const FAR_BELOW = 10;
/** Points the last 30 days must be under the year so far to count as falling. */
export const FALLING_BY = 2;
/** Failed subjects in the latest exam that make a marks flag Act now. */
export const FAILS_FOR_ACT_NOW = 2;

export type Strength = "WATCH" | "ACT_NOW";

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/**
 * Attendance below the threshold: Act now when it is falling (the last 30 days
 * lower than the year so far) or well below the threshold; else Watch. `line`
 * is a reason line to add (the falling number), `note` words for the basis.
 */
export function belowThresholdStrength(x: { percent: number; recent: number | null; threshold: number }): { strength: Strength; line: string | null; note: string | null } {
  if (x.percent >= x.threshold) return { strength: "WATCH", line: null, note: null };
  if (x.recent !== null && x.recent <= x.percent - FALLING_BY) return { strength: "ACT_NOW", line: `Falling: ${pct(x.recent)} in the last 30 days`, note: null };
  if (x.percent < x.threshold - FAR_BELOW) return { strength: "ACT_NOW", line: null, note: `Act now: more than ${FAR_BELOW} points below the threshold` };
  return { strength: "WATCH", line: null, note: x.recent !== null ? `Watch: not falling lately (${pct(x.recent)} in the last 30 days)` : "Watch: just below the threshold" };
}

/** A marks flag from the latest exam: Act now only for fails in two or more subjects. */
export function marksStrength(failedSubjects: number, fell: boolean): Strength | null {
  if (failedSubjects >= FAILS_FOR_ACT_NOW) return "ACT_NOW";
  if (failedSubjects > 0 || fell) return "WATCH";
  return null;
}

type SignalLike = { studentId: string; area: string; strength: Strength; reason: string; basis: string };

const TWO_AREAS_BASIS = "Concerns in two areas at once (attendance and marks) are a stronger sign";

/**
 * Concerns in two areas at once: a student with both an attendance and a marks
 * concern gets Act now on both, with a line naming the other area. Attendance
 * concerns that live on an open Attendance Flag count (`attendanceElsewhere`).
 * Fee signals never count and never change.
 */
export function withTwoAreas<S extends SignalLike>(signals: S[], attendanceElsewhere: ReadonlySet<string>): S[] {
  const areas = new Map<string, Set<string>>();
  for (const s of signals) if (s.area !== "fees") areas.set(s.studentId, (areas.get(s.studentId) ?? new Set()).add(s.area));
  for (const id of attendanceElsewhere) if (areas.has(id)) areas.get(id)!.add("attendance");
  return signals.map((s) => {
    const a = areas.get(s.studentId);
    if (s.area === "fees" || !a || !(a.has("attendance") && a.has("marks"))) return s;
    const other = s.area === "marks" ? "attendance" : "marks";
    return { ...s, strength: "ACT_NOW", reason: `${s.reason}\nAlso a concern: ${other}`, basis: `${s.basis}\n${TWO_AREAS_BASIS}` };
  });
}

/** The same rule for an attendance row built from Attendance Flags, when the student also has an open marks flag. */
export function attendanceRowWithMarks<R extends { strength: Strength; reason: string; basis: string }>(r: R, marksOpen: boolean): R {
  if (!marksOpen) return r;
  return { ...r, strength: "ACT_NOW", reason: `${r.reason}\nAlso a concern: marks`, basis: `${r.basis}\n${TWO_AREAS_BASIS}` };
}

export type CloserLook = { students: number; attendance: number; marks: number; both: number };

/**
 * The Dashboard's Early Warnings count: students (once each) with an Act now
 * row, split into attendance only, marks only, and both. Fee rows are never
 * counted, so fee defaulters are not lumped into the number.
 */
export function closerLook(rows: { studentId: string; area: string; strength: string }[]): CloserLook {
  const by = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.strength !== "ACT_NOW" || r.area === "fees") continue;
    by.set(r.studentId, (by.get(r.studentId) ?? new Set()).add(r.area));
  }
  let attendance = 0, marks = 0, both = 0;
  for (const a of by.values()) {
    if (a.has("attendance") && a.has("marks")) both++;
    else if (a.has("marks")) marks++;
    else attendance++;
  }
  return { students: by.size, attendance, marks, both };
}

/** "12 students need a closer look: 5 attendance, 4 marks, 3 in two areas". */
export function closerLookWords(c: CloserLook) {
  const parts = [
    c.attendance ? `${c.attendance} attendance` : null,
    c.marks ? `${c.marks} marks` : null,
    c.both ? `${c.both} in two areas` : null,
  ].filter(Boolean);
  return `${c.students} ${c.students === 1 ? "student needs" : "students need"} a closer look${parts.length ? `: ${parts.join(", ")}` : ""}`;
}
