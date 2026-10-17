// Working out results (automation A9, 08 §2 Results): totals, percentage,
// grade, points, pass or fail with grace and compartment, ranks with the tie
// rule, and the final result across exams with weights. Pure functions, so
// every rule is tested directly.

import { bandFor, type Band } from "./grades";

export type PassRules = {
  passPercentSubject: number;
  passPercentOverall: number;
  graceMarks: number;
  compartmentSubjects: number;
  /** "zero" counts an absent paper as 0; "leave-out" leaves it out of the total. */
  absentRule: string;
  /**
   * An exam a student joined too late for (Result "Joined after this exam"),
   * in the final result: "leave-out" (default) lets the exams they sat count
   * in its place; "zero" counts it as 0%.
   */
  lateJoinRule?: string;
};

export type PaperInput = {
  subjectId: string;
  name: string;
  /** 0 for grade-only subjects. */
  max: number;
  gradeOnly: boolean;
  /** null when no marks are entered yet. */
  marks: { total: number | null; absent: boolean; medical?: boolean; grade: string | null; parts?: Record<string, number> } | null;
};

export type SubjectResult = {
  subjectId: string;
  name: string;
  max: number;
  marks: number | null;
  absent: boolean;
  /** Medical leave (ML): absent, and left out of the total whatever the absent rule. */
  medical?: boolean;
  gradeOnly: boolean;
  grade: string | null;
  points: number | null;
  percent: number | null;
  passed: boolean | null;
  /** Grace marks given to reach the pass mark. */
  grace: number;
  missing: boolean;
  parts?: Record<string, number>;
};

export type ExamResult = {
  total: number;
  maxTotal: number;
  percent: number | null;
  grade: string | null;
  points: number | null;
  outcome: "Pass" | "Fail" | "Compartment" | null;
  complete: boolean;
  missing: number;
  absentPapers: number;
  subjects: SubjectResult[];
  /** "Joined after this exam": left out of it, so it never blocks publishing. */
  leftOut?: boolean;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

function meanPoints(list: (number | null)[]): number | null {
  const pts = list.filter((p): p is number => p !== null);
  return pts.length ? round2(pts.reduce((s, p) => s + p, 0) / pts.length) : null;
}

function outcomeOf(subjects: SubjectResult[], percent: number | null, rules: PassRules): ExamResult["outcome"] {
  if (percent === null) return null;
  const failed = subjects.filter((s) => s.passed === false).length;
  const overall = percent >= rules.passPercentOverall;
  if (failed === 0 && overall) return "Pass";
  if (rules.compartmentSubjects > 0 && failed > 0 && failed <= rules.compartmentSubjects && overall) return "Compartment";
  return "Fail";
}

/** One subject: its percentage, grade and pass, with grace when the school gives it. */
export function subjectResult(p: PaperInput, bands: Band[], rules: PassRules): SubjectResult {
  const base = { subjectId: p.subjectId, name: p.name, max: p.max, gradeOnly: p.gradeOnly, grace: 0, parts: p.marks?.parts };
  if (p.gradeOnly) {
    const missing = !p.marks || (!p.marks.absent && !p.marks.grade);
    const medical = Boolean(p.marks?.absent && p.marks.medical);
    return { ...base, marks: null, absent: Boolean(p.marks?.absent), medical, grade: p.marks?.absent ? (medical ? "ML" : "AB") : p.marks?.grade ?? null, points: null, percent: null, passed: null, missing };
  }
  if (!p.marks || (!p.marks.absent && p.marks.total === null)) {
    return { ...base, marks: null, absent: false, grade: null, points: null, percent: null, passed: null, missing: true };
  }
  if (p.marks.absent && p.marks.medical) {
    return { ...base, marks: null, absent: true, medical: true, grade: "ML", points: null, percent: null, passed: null, missing: false };
  }
  if (p.marks.absent) {
    const counts = rules.absentRule !== "leave-out";
    return { ...base, marks: counts ? 0 : null, absent: true, grade: "AB", points: counts ? 0 : null, percent: counts ? 0 : null, passed: counts ? false : null, missing: false };
  }
  const marks = round2(p.marks.total ?? 0);
  const percent = p.max > 0 ? round2((marks / p.max) * 100) : 0;
  const band = bandFor(percent, bands);
  let passed = percent >= rules.passPercentSubject && (band?.passing ?? true);
  let grace = 0;
  if (!passed && rules.graceMarks > 0 && p.max > 0) {
    const needed = Math.ceil((p.max * rules.passPercentSubject) / 100 - marks - 1e-9);
    if (needed > 0 && needed <= rules.graceMarks) {
      passed = true;
      grace = needed;
    }
  }
  return { ...base, marks, absent: false, grade: band?.grade ?? null, points: band?.points ?? null, percent, passed, grace, missing: false };
}

/** A student's result for one exam. Incomplete results show what is missing and have no outcome. */
export function examResult(papers: PaperInput[], bands: Band[], rules: PassRules): ExamResult {
  const subjects = papers.map((p) => subjectResult(p, bands, rules));
  const missing = subjects.filter((s) => s.missing).length;
  const scored = subjects.filter((s) => !s.gradeOnly && !s.missing && s.marks !== null);
  const total = round2(scored.reduce((s, x) => s + (x.marks ?? 0), 0));
  const maxTotal = scored.reduce((s, x) => s + x.max, 0);
  const percent = maxTotal > 0 ? round2((total / maxTotal) * 100) : null;
  const complete = missing === 0;
  const band = percent === null ? null : bandFor(percent, bands);
  return {
    total,
    maxTotal,
    percent,
    grade: band?.grade ?? null,
    points: meanPoints(scored.map((s) => s.points)),
    outcome: complete ? outcomeOf(subjects, percent, rules) : null,
    complete,
    missing,
    absentPapers: subjects.filter((s) => s.absent).length,
    subjects,
  };
}

/**
 * Ranks by percentage, then total. Tie rule "skip" (default): 1, 1, 3.
 * "dense": 1, 1, 2. Only complete results get a rank.
 */
export function rankWithTies<T extends { id: string; percent: number | null; total: number; complete: boolean }>(items: T[], rule: string): Map<string, number> {
  const ranked = items.filter((i) => i.complete && i.percent !== null).sort((a, b) => (b.percent! - a.percent!) || (b.total - a.total));
  const out = new Map<string, number>();
  let rank = 0;
  let distinct = 0;
  let prev: T | null = null;
  ranked.forEach((item, i) => {
    const same = prev && prev.percent === item.percent && prev.total === item.total;
    if (!same) {
      distinct++;
      rank = rule === "dense" ? distinct : i + 1;
    }
    out.set(item.id, rank);
    prev = item;
  });
  return out;
}

export type FinalExamInput = { examId: string; weight: number; result: ExamResult | null };

/**
 * The final result across the year's exams, using each exam's weight (for
 * example Term 1 40% and Term 2 60%). With no weights set, every exam counts
 * the same. Each subject's final percentage is weighted the same way.
 *
 * An exam the student joined too late for (result.leftOut) never blocks the
 * final result. By the school's rule it is left out, so the exams they sat
 * count in its place, or counted as 0%. A student left out of every exam that
 * counts gets a final result that is left out too.
 */
export function finalResult(exams: FinalExamInput[], bands: Band[], rules: PassRules): ExamResult & { examsCounted: number } {
  const anyWeight = exams.some((e) => e.weight > 0);
  const counts = exams.filter((e) => (anyWeight ? e.weight > 0 : true));
  const missed = (e: FinalExamInput) => Boolean(e.result?.leftOut);
  const zero = rules.lateJoinRule === "zero";
  const counted = zero ? counts : counts.filter((e) => !missed(e));
  const sat = counted.filter((e) => !missed(e));
  if (counts.length > 0 && sat.length === 0) {
    return { total: 0, maxTotal: 0, percent: null, grade: null, points: null, outcome: null, complete: false, missing: 0, absentPapers: 0, subjects: [], leftOut: true, examsCounted: 0 };
  }
  const w = (e: FinalExamInput) => (anyWeight ? e.weight : 1);
  const complete = counted.length > 0 && sat.every((e) => e.result?.complete);
  const missing = sat.reduce((n, e) => n + (e.result ? e.result.missing : 1), 0);

  const bySubject = new Map<string, { name: string; sum: number; weight: number; marks: number; max: number; absent: boolean; gradeOnly: boolean; grade: string | null }>();
  for (const e of sat) {
    for (const s of e.result?.subjects ?? []) {
      const cur = bySubject.get(s.subjectId) ?? { name: s.name, sum: 0, weight: 0, marks: 0, max: 0, absent: false, gradeOnly: s.gradeOnly, grade: null };
      if (s.gradeOnly) cur.grade = s.grade ?? cur.grade;
      else if (s.percent !== null) {
        cur.sum += s.percent * w(e);
        cur.weight += w(e);
        cur.marks += s.marks ?? 0;
        cur.max += s.max;
      }
      if (s.absent) cur.absent = true;
      bySubject.set(s.subjectId, cur);
    }
  }
  const subjects: SubjectResult[] = [...bySubject.entries()].map(([subjectId, x]) => {
    if (x.gradeOnly) return { subjectId, name: x.name, max: 0, marks: null, absent: x.absent, gradeOnly: true, grade: x.grade, points: null, percent: null, passed: null, grace: 0, missing: false };
    const percent = x.weight > 0 ? round2(x.sum / x.weight) : null;
    const band = percent === null ? null : bandFor(percent, bands);
    const passed = percent === null ? null : percent >= rules.passPercentSubject && (band?.passing ?? true);
    return { subjectId, name: x.name, max: x.max, marks: round2(x.marks), absent: x.absent, gradeOnly: false, grade: band?.grade ?? null, points: band?.points ?? null, percent, passed, grace: 0, missing: false };
  });

  // A missed exam counted as zero adds its weight with 0%.
  const withPercent = counted.filter((e) => missed(e) || (e.result?.percent !== null && e.result?.percent !== undefined));
  const totalW = withPercent.reduce((s, e) => s + w(e), 0);
  const percent = totalW > 0 ? round2(withPercent.reduce((s, e) => s + (missed(e) ? 0 : e.result!.percent ?? 0) * w(e), 0) / totalW) : null;
  const band = percent === null ? null : bandFor(percent, bands);
  return {
    total: round2(sat.reduce((s, e) => s + (e.result?.total ?? 0), 0)),
    maxTotal: sat.reduce((s, e) => s + (e.result?.maxTotal ?? 0), 0),
    percent,
    grade: band?.grade ?? null,
    points: meanPoints(subjects.filter((s) => !s.gradeOnly).map((s) => s.points)),
    outcome: complete ? outcomeOf(subjects, percent, rules) : null,
    complete,
    missing,
    absentPapers: sat.reduce((n, e) => n + (e.result?.absentPapers ?? 0), 0),
    subjects,
    examsCounted: counted.length,
  };
}

/** Is a student's mark complete: every category, or absent, or a grade for grade-only subjects. */
export function isDone(m: { absent: boolean; total: number | null; grade: string | null } | undefined | null, gradeOnly: boolean) {
  if (!m) return false;
  return m.absent || (gradeOnly ? Boolean(m.grade) : m.total !== null);
}

/** Checks one mark against its category's maximum (rule 14). Returns the problem in plain words, or null. */
export function checkMark(category: string, max: number, value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return `${category} must be a number.`;
  if (value < 0) return `${category} cannot be below 0.`;
  if (value > max) return `${category} is out of ${max}. ${value} is too high.`;
  if (Math.round(value * 2) !== value * 2) return `${category}: use whole or half marks, such as 37 or 37.5.`;
  return null;
}
