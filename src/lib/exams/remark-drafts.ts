// Remark suggestions for report cards (08 §2 Report Cards, gap G30; the
// teacher assistant). A remark is built only from evidence in the school's own
// records: the marks of the report card's period, their change since the exam
// before and against the class average, attendance, homework handed in and
// co-scholastic grades. Every sentence carries the source it came from, so the
// teacher can check it. The words come from the school's phrase bank
// (./remark-phrases.ts); the numbers never do.
// A student with no marks for the period gets no suggestion: there is nothing
// to say about them that the records support (00-global.md §2.1 rules 1 to 3).
// Rules only, no outside AI service, so it works with AI switched off.
// Pure, so every rule is tested directly.

import { formatDate } from "../format";
import { wordList } from "../academic/common";
import { DEFAULT_PHRASES, fillPhrase, type PhraseBank, type PhraseKey } from "./remark-phrases";

export type PeriodKind = "exam" | "term" | "year";

/** One subject's real marks in one exam (absent and medical leave papers are left out). */
export type SubjectMarks = { name: string; marks: number; max: number };

/** One exam of the student, with only the papers they wrote. */
export type ExamMarks = { title: string; subjects: SubjectMarks[]; notWritten: string[] };

/** A subject's class average for the period: the mean of each student's own percentage. */
export type ClassAverage = { subject: string; average: number; students: number };

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
  /** The section's average per subject for the period, when enough students wrote it. */
  classAverages?: ClassAverage[];
  /** The school's phrase bank; the defaults when left out. */
  phrases?: PhraseBank;
};

/** One sentence and where it comes from. `fact` says which rule wrote it. */
export type RemarkLine = { text: string; source: string; fact?: PhraseKey };
/** One way of putting the remark: its sentences, each with its source. */
export type RemarkOption = { id: string; label: string; text: string; lines: RemarkLine[]; byAi?: boolean };
/** `text` and `lines` are the fullest option; `options` are the 1 to 3 to choose from. */
export type RemarkDraft = { studentId: string; firstName: string; text: string | null; lines: RemarkLine[]; options: RemarkOption[]; why: string };

/** A change of this many percentage points in a subject since the exam before is worth saying. */
export const TREND_POINTS = 10;
/** So is a subject this many points above or below the class average. */
export const CLASS_POINTS = 10;
/** A class average needs at least this many students with marks in the subject. */
export const CLASS_MIN = 3;
/** Homework is worth a sentence once this many were due. */
export const HOMEWORK_MIN = 3;
/** The longest remark the report card takes. */
export const REMARK_MAX = 500;

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
export function bySubject(exams: ExamMarks[]) {
  const m = new Map<string, { marks: number; max: number }>();
  for (const e of exams) for (const s of e.subjects) {
    const cur = m.get(s.name) ?? { marks: 0, max: 0 };
    m.set(s.name, { marks: cur.marks + s.marks, max: cur.max + s.max });
  }
  return [...m.entries()].map(([name, x]) => ({ name, p: percentOf(x.marks, x.max) }));
}

/** The class average per subject from each student's own exams of the period; subjects with too few students are left out. */
export function classAverages(students: ExamMarks[][]): ClassAverage[] {
  const m = new Map<string, number[]>();
  for (const exams of students) for (const s of bySubject(exams)) m.set(s.name, [...(m.get(s.name) ?? []), s.p]);
  return [...m.entries()].filter(([, ps]) => ps.length >= CLASS_MIN).map(([subject, ps]) => ({ subject, average: ps.reduce((a, b) => a + b, 0) / ps.length, students: ps.length }));
}

function examPercent(e: ExamMarks) {
  const marks = e.subjects.reduce((a, s) => a + s.marks, 0);
  const max = e.subjects.reduce((a, s) => a + s.max, 0);
  return { marks, max, p: max > 0 ? percentOf(marks, max) : null };
}

/** Sentences that say what went well, best first, and what to work on next, most pressing first. */
const GOOD: PhraseKey[] = ["improved", "overallUp", "strong", "aboveClass", "coScholastic", "homeworkGood", "attendanceGood"];
const WORK: PhraseKey[] = ["dropped", "overallDown", "weak", "belowClass", "homeworkLow", "attendanceLow"];

const join = (lines: RemarkLine[]) => lines.map((l) => l.text).join(" ");

/** The fullest remark that fits on the report card: the first sentences, as many as fit. */
function fit(lines: RemarkLine[]) {
  const out: RemarkLine[] = [];
  for (const l of lines) if (join([...out, l]).length <= REMARK_MAX) out.push(l);
  return out;
}

/** The suggestion for one student, or the reason there is none. */
export function draftRemark(ev: RemarkEvidence): RemarkDraft {
  const words = periodWords(ev.period);
  const bank = ev.phrases ?? DEFAULT_PHRASES;
  const say = (key: PhraseKey, values: Record<string, string> = {}) => fillPhrase(pick(ev.studentId, bank[key]), { name: ev.firstName, period: words.in, ...values });
  const exams = ev.exams.filter((e) => e.subjects.length > 0);
  if (exams.length === 0) {
    return {
      studentId: ev.studentId, firstName: ev.firstName, text: null, lines: [], options: [],
      why: ev.waiting ? `The marks for ${words.this} are not all in yet: write your own remark, or suggest again once they are.` : `No marks for ${words.this}: write your own remark.`,
    };
  }
  const lines: RemarkLine[] = [];
  const titles = wordList(exams.map((e) => e.title));
  const marks = exams.reduce((a, e) => a + e.subjects.reduce((b, s) => b + s.marks, 0), 0);
  const max = exams.reduce((a, e) => a + e.subjects.reduce((b, s) => b + s.max, 0), 0);
  const overall = percentOf(marks, max);
  const notWritten = [...new Set(exams.flatMap((e) => e.notWritten))];

  // 1. How the marks went, in words for the period.
  const level: PhraseKey = overall >= 85 ? "levelExcellent" : overall >= 65 ? "levelGood" : overall >= ev.passOverall ? "levelFair" : "levelSupport";
  lines.push({
    text: say(level), fact: level,
    source: `Marks in ${titles}: ${num(marks)} of ${num(max)} (${pct(overall)})${overall < ev.passOverall ? `, pass mark ${ev.passOverall}%` : ""}${notWritten.length ? `; ${wordList(notWritten)} not written, left out` : ""}`,
  });

  // 2. Strong and weak subjects, when there is more than one to compare.
  const subjects = bySubject(exams);
  if (subjects.length > 1) {
    const strong = subjects.filter((s) => s.p >= 75 && s.p >= overall).sort((a, b) => b.p - a.p).slice(0, 2);
    const weak = subjects.filter((s) => !strong.includes(s) && (s.p < ev.passSubject || (s.p < 60 && s.p <= overall - 15))).sort((a, b) => a.p - b.p).slice(0, 2);
    if (strong.length) lines.push({ text: say("strong", { subjects: wordList(strong.map((s) => s.name)) }), fact: "strong", source: `Marks in ${titles}: ${strong.map((s) => `${s.name} ${pct(s.p)}`).join(", ")}` });
    if (weak.length) lines.push({ text: say("weak", { subjects: wordList(weak.map((s) => s.name)) }), fact: "weak", source: `Marks in ${titles}: ${weak.map((s) => `${s.name} ${pct(s.p)}`).join(", ")}${weak.some((s) => s.p < ev.passSubject) ? `, pass mark ${ev.passSubject}%` : ""}` });
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
    if (up.length) lines.push({ text: say("improved", { subjects: wordList(up.map((x) => x.name)), before: prev.title }), fact: "improved", source: `Marks: ${change(up)}` });
    if (down.length) lines.push({ text: say("dropped", { subjects: wordList(down.map((x) => x.name)), before: prev.title }), fact: "dropped", source: `Marks: ${change(down)}` });
    if (!both.length) {
      const a = examPercent(prev).p;
      const b = examPercent(latest).p;
      if (a !== null && b !== null && Math.abs(b - a) >= TREND_POINTS) {
        const key = b > a ? "overallUp" : "overallDown";
        lines.push({ text: say(key, { before: prev.title }), fact: key, source: `Marks: ${pct(a)} in ${prev.title}, ${pct(b)} in ${latest.title}` });
      }
    }
  }

  // 4. Against the class average for the period, where enough of the class wrote the subject.
  const avg = new Map((ev.classAverages ?? []).filter((c) => c.students >= CLASS_MIN).map((c) => [c.subject, c]));
  const vs = subjects.flatMap((s) => { const c = avg.get(s.name); return c ? [{ name: s.name, p: s.p, c }] : []; });
  const above = vs.filter((x) => x.p - x.c.average >= CLASS_POINTS).sort((x, y) => (y.p - y.c.average) - (x.p - x.c.average)).slice(0, 2);
  const below = vs.filter((x) => x.c.average - x.p >= CLASS_POINTS).sort((x, y) => (y.c.average - y.p) - (x.c.average - x.p)).slice(0, 2);
  const versus = (list: typeof vs) => list.map((x) => `${x.name} ${pct(x.p)}, class average ${pct(x.c.average)} (${x.c.students} students)`).join("; ");
  if (above.length) lines.push({ text: say("aboveClass", { subjects: wordList(above.map((x) => x.name)) }), fact: "aboveClass", source: `Marks in ${titles}: ${versus(above)}` });
  if (below.length) lines.push({ text: say("belowClass", { subjects: wordList(below.map((x) => x.name)) }), fact: "belowClass", source: `Marks in ${titles}: ${versus(below)}` });

  // 5. Co-scholastic grades: the areas with the top grade.
  const best = ev.coScholastic.filter((g) => g.best).slice(0, 2);
  if (best.length) lines.push({ text: say("coScholastic", { areas: wordList(best.map((g) => g.area)) }), fact: "coScholastic", source: `Co-scholastic grades: ${best.map((g) => `${g.area} ${g.grade}`).join(", ")}` });

  // 6. Homework handed in.
  const hw = ev.homework;
  if (hw && hw.given >= HOMEWORK_MIN) {
    const share = (hw.done / hw.given) * 100;
    const source = `Homework due ${day(hw.from)} to ${day(hw.to)}: ${hw.done} of ${hw.given} handed in (${pct(share)})`;
    if (share >= 90) lines.push({ text: say("homeworkGood"), fact: "homeworkGood", source });
    else if (share < 60) lines.push({ text: say("homeworkLow"), fact: "homeworkLow", source });
  }

  // 7. Attendance.
  const att = ev.attendance;
  if (att && att.working > 0) {
    const share = (att.present / att.working) * 100;
    const source = att.fromRegister
      ? `Attendance register, ${day(att.from)} to ${day(att.to)}: ${att.present} of ${att.working} days (${pct(share)})`
      : `Attendance typed on this report card: ${att.present} of ${att.working} days (${pct(share)})`;
    if (share >= 95) lines.push({ text: say("attendanceGood"), fact: "attendanceGood", source });
    else if (share < ev.attendanceThreshold) lines.push({ text: say("attendanceLow"), fact: "attendanceLow", source: `${source}, below ${ev.attendanceThreshold}%` });
  }

  const full = fit(lines);
  return { studentId: ev.studentId, firstName: ev.firstName, text: join(full), lines: full, options: remarkOptions(full), why: "Each sentence shows where it comes from. Check it before you keep it." };
}

/** Two or three ways of putting the remark from the same sentences: everything, short, and with a next step. */
export function remarkOptions(lines: RemarkLine[]): RemarkOption[] {
  if (!lines.length) return [];
  const [level, ...facts] = lines;
  const first = (keys: PhraseKey[]) => keys.map((k) => facts.find((f) => f.fact === k)).find(Boolean);
  const good = first(GOOD);
  const work = first(WORK);
  const candidates: RemarkOption[] = [
    { id: "full", label: "Full", text: "", lines },
    // Short: how it went and the best thing to say; just how it went when that is all there is besides.
    { id: "short", label: "Short", text: "", lines: lines.length > 2 && good ? [level, good] : [level] },
    { id: "next", label: "With a next step", text: "", lines: work ? [level, ...(good ? [good] : []), work] : [] },
  ];
  const out: RemarkOption[] = [];
  for (const o of candidates) {
    if (!o.lines.length) continue;
    const text = join(o.lines);
    if (out.some((x) => x.text === text)) continue;
    out.push({ ...o, text });
  }
  return out;
}
