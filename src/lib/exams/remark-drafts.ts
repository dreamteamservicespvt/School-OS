// Remark suggestions for report cards (08 §2 Report Cards, gap G30; the AI
// teacher assistant). A remark is built only from evidence in the school's own
// records: the marks of the report card's period and their change since the
// exam before, attendance, homework handed in and co-scholastic grades. Every
// sentence carries the source it came from, so the teacher can check it.
// A student with no marks for the period gets no suggestion: there is nothing
// to say about them that the records support (00-global.md §2.1 rules 1 to 3).
// Rules only, no outside AI service. Pure, so every rule is tested directly.

import { formatDate } from "../format";
import { wordList } from "../academic/common";

export type PeriodKind = "exam" | "term" | "year";

/** One subject's real marks in one exam (absent and medical leave papers are left out). */
export type SubjectMarks = { name: string; marks: number; max: number };

/** One exam of the student, with only the papers they wrote. */
export type ExamMarks = { title: string; subjects: SubjectMarks[]; notWritten: string[] };

export type RemarkEvidence = {
  studentId: string;
  firstName: string;
  period: { kind: PeriodKind; examTitle?: string };
  /** The period's exams the student wrote papers in, oldest first. */
  exams: ExamMarks[];
  /** Some of the period's marks are not all in yet. */
  waiting?: boolean;
  /** The exam before the latest one above, for the change since then. */
  previous: ExamMarks | null;
  passOverall: number;
  passSubject: number;
  attendance: { present: number; working: number; fromRegister: boolean; from: Date; to: Date } | null;
  attendanceThreshold: number;
  homework: { given: number; done: number; from: Date; to: Date } | null;
  /** Co-scholastic grades of the period; `best` when it is the area's top grade. */
  coScholastic: { area: string; grade: string; best: boolean }[];
};

export type RemarkLine = { text: string; source: string };
export type RemarkDraft = { studentId: string; text: string | null; lines: RemarkLine[]; why: string };

/** A change of this many percentage points in a subject since the exam before is worth saying. */
export const TREND_POINTS = 10;
/** Homework is worth a sentence once this many were due. */
export const HOMEWORK_MIN = 3;

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const num = (n: number) => String(Math.round(n * 100) / 100);
const day = (d: Date) => formatDate(d, "UTC");
const percentOf = (marks: number, max: number) => (max > 0 ? (marks / max) * 100 : 0);

function periodWords(p: RemarkEvidence["period"]) {
  if (p.kind === "exam") return { in: p.examTitle ? `in ${p.examTitle}` : "in this exam", this: "this exam" };
  return p.kind === "term" ? { in: "this term", this: "this term" } : { in: "this year", this: "this year" };
}

/** The same student always gets the same wording; two students at the same level do not always. */
function pick(studentId: string, options: string[]) {
  let h = 0;
  for (const c of studentId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

/** A subject's marks over several exams: total marks over total maximum. */
function bySubject(exams: ExamMarks[]) {
  const m = new Map<string, { marks: number; max: number }>();
  for (const e of exams) for (const s of e.subjects) {
    const cur = m.get(s.name) ?? { marks: 0, max: 0 };
    m.set(s.name, { marks: cur.marks + s.marks, max: cur.max + s.max });
  }
  return [...m.entries()].map(([name, x]) => ({ name, p: percentOf(x.marks, x.max) }));
}

function examPercent(e: ExamMarks) {
  const marks = e.subjects.reduce((a, s) => a + s.marks, 0);
  const max = e.subjects.reduce((a, s) => a + s.max, 0);
  return { marks, max, p: max > 0 ? percentOf(marks, max) : null };
}

/** The suggestion for one student, or the reason there is none. */
export function draftRemark(ev: RemarkEvidence): RemarkDraft {
  const words = periodWords(ev.period);
  const exams = ev.exams.filter((e) => e.subjects.length > 0);
  if (exams.length === 0) {
    return {
      studentId: ev.studentId, text: null, lines: [],
      why: ev.waiting ? `The marks for ${words.this} are not all in yet: write your own remark, or suggest again once they are.` : `No marks for ${words.this}: write your own remark.`,
    };
  }
  const f = ev.firstName;
  const lines: RemarkLine[] = [];
  const titles = wordList(exams.map((e) => e.title));
  const marks = exams.reduce((a, e) => a + e.subjects.reduce((b, s) => b + s.marks, 0), 0);
  const max = exams.reduce((a, e) => a + e.subjects.reduce((b, s) => b + s.max, 0), 0);
  const overall = percentOf(marks, max);
  const notWritten = [...new Set(exams.flatMap((e) => e.notWritten))];

  // 1. How the marks went, in words for the period.
  const level = overall >= 85 ? [`${f} has done very well ${words.in}.`, `${f} has done excellent work ${words.in}.`]
    : overall >= 65 ? [`${f} has done well ${words.in}.`, `${f} has done good work ${words.in}.`]
    : overall >= ev.passOverall ? [`${f} has done fairly ${words.in} and can do better with regular practice.`, `${f} can do better with regular practice; the marks ${words.in} are fair.`]
    : [`${f} needs more support and regular practice to reach the pass mark.`, `${f} needs regular practice and extra help to reach the pass mark.`];
  lines.push({
    text: pick(ev.studentId, level),
    source: `Marks in ${titles}: ${num(marks)} of ${num(max)} (${pct(overall)})${overall < ev.passOverall ? `, pass mark ${ev.passOverall}%` : ""}${notWritten.length ? `; ${wordList(notWritten)} not written, left out` : ""}`,
  });

  // 2. Strong and weak subjects, when there is more than one to compare.
  const subjects = bySubject(exams);
  if (subjects.length > 1) {
    const strong = subjects.filter((s) => s.p >= 75 && s.p >= overall).sort((a, b) => b.p - a.p).slice(0, 2);
    const weak = subjects.filter((s) => !strong.includes(s) && (s.p < ev.passSubject || (s.p < 60 && s.p <= overall - 15))).sort((a, b) => a.p - b.p).slice(0, 2);
    if (strong.length) lines.push({ text: `Strong in ${wordList(strong.map((s) => s.name))}.`, source: `Marks in ${titles}: ${strong.map((s) => `${s.name} ${pct(s.p)}`).join(", ")}` });
    if (weak.length) lines.push({ text: `Should give more time to ${wordList(weak.map((s) => s.name))}.`, source: `Marks in ${titles}: ${weak.map((s) => `${s.name} ${pct(s.p)}`).join(", ")}${weak.some((s) => s.p < ev.passSubject) ? `, pass mark ${ev.passSubject}%` : ""}` });
  }

  // 3. The change since the exam before, subject by subject where both have marks.
  const latest = exams[exams.length - 1];
  const prev = ev.previous && ev.previous.subjects.length ? ev.previous : null;
  if (prev) {
    const now = new Map(latest.subjects.map((s) => [s.name, percentOf(s.marks, s.max)]));
    const before = new Map(prev.subjects.map((s) => [s.name, percentOf(s.marks, s.max)]));
    const both = [...now.keys()].filter((k) => before.has(k)).map((name) => ({ name, a: before.get(name)!, b: now.get(name)! }));
    const up = both.filter((x) => x.b - x.a >= TREND_POINTS).sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, 2);
    const down = both.filter((x) => x.a - x.b >= TREND_POINTS).sort((x, y) => (y.a - y.b) - (x.a - x.b)).slice(0, 2);
    const change = (list: typeof both) => list.map((x) => `${x.name} ${pct(x.a)} in ${prev.title}, ${pct(x.b)} in ${latest.title}`).join("; ");
    if (up.length) lines.push({ text: `Has improved in ${wordList(up.map((x) => x.name))} since ${prev.title}.`, source: `Marks: ${change(up)}` });
    if (down.length) lines.push({ text: `Needs to work on ${wordList(down.map((x) => x.name))}, where the marks have come down since ${prev.title}.`, source: `Marks: ${change(down)}` });
    if (!both.length) {
      const a = examPercent(prev).p;
      const b = examPercent(latest).p;
      if (a !== null && b !== null && Math.abs(b - a) >= TREND_POINTS) {
        lines.push({ text: b > a ? `The marks have gone up since ${prev.title}.` : `The marks have come down since ${prev.title}.`, source: `Marks: ${pct(a)} in ${prev.title}, ${pct(b)} in ${latest.title}` });
      }
    }
  }

  // 4. Co-scholastic grades: the areas with the top grade.
  const best = ev.coScholastic.filter((g) => g.best).slice(0, 2);
  if (best.length) lines.push({ text: `Does well in ${wordList(best.map((g) => g.area))}.`, source: `Co-scholastic grades: ${best.map((g) => `${g.area} ${g.grade}`).join(", ")}` });

  // 5. Homework handed in.
  const hw = ev.homework;
  if (hw && hw.given >= HOMEWORK_MIN) {
    const share = (hw.done / hw.given) * 100;
    const source = `Homework due ${day(hw.from)} to ${day(hw.to)}: ${hw.done} of ${hw.given} handed in (${pct(share)})`;
    if (share >= 90) lines.push({ text: "Hands in homework regularly.", source });
    else if (share < 60) lines.push({ text: "Should hand in homework more regularly.", source });
  }

  // 6. Attendance.
  const att = ev.attendance;
  if (att && att.working > 0) {
    const share = (att.present / att.working) * 100;
    const source = att.fromRegister
      ? `Attendance register, ${day(att.from)} to ${day(att.to)}: ${att.present} of ${att.working} days (${pct(share)})`
      : `Attendance typed on this report card: ${att.present} of ${att.working} days (${pct(share)})`;
    if (share >= 95) lines.push({ text: "Regular in attendance.", source });
    else if (share < ev.attendanceThreshold) lines.push({ text: "Attendance is low and needs to improve.", source: `${source}, below ${ev.attendanceThreshold}%` });
  }

  return { studentId: ev.studentId, text: lines.map((l) => l.text).join(" "), lines, why: "Each sentence shows where it comes from. Check it before you keep it." };
}
