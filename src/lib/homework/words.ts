// Words, tones and small calculations shared by the Homework & Learning
// screens, exports and tests. No database, so browser code may use them too.

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";

/** Homework status (17 §2, inferred): Current until the due date, then Past due while work is left to check, then Closed. */
export type HomeworkStatus = "Current" | "Past due" | "Closed";
export const HW_TONE: Record<HomeworkStatus, Tone> = { Current: "brand", "Past due": "warn", Closed: "neutral" };

/** A submission's status as shown: Assigned work becomes Missing once the due date has passed. */
export type SubmissionWord = "Assigned" | "Submitted" | "Late" | "Graded" | "Missing" | "Excused";
export const SUB_TONE: Record<SubmissionWord, Tone> = { Assigned: "neutral", Submitted: "info", Late: "warn", Graded: "ok", Missing: "bad", Excused: "neutral" };
const SUB_WORD: Record<string, SubmissionWord> = { ASSIGNED: "Assigned", SUBMITTED: "Submitted", LATE: "Late", GRADED: "Graded", MISSING: "Missing", EXCUSED: "Excused" };

export function submissionWord(status: string, pastDue: boolean): SubmissionWord {
  if (status === "ASSIGNED" && pastDue) return "Missing";
  return SUB_WORD[status] ?? "Assigned";
}

/** Handed in (online or checked in class): counts for "submitted". */
export const HANDED_IN = ["SUBMITTED", "LATE", "GRADED"] as const;
export const TO_CHECK = ["SUBMITTED", "LATE"] as const;

export const isPastDue = (dueDate: Date, today: Date) => dueDate.getTime() < today.getTime();

export function homeworkStatus(h: { dueDate: Date; closedAt?: Date | null }, today: Date, counts: { toCheck: number }): HomeworkStatus {
  if (h.closedAt) return "Closed";
  if (!isPastDue(h.dueDate, today)) return "Current";
  return counts.toCheck > 0 ? "Past due" : "Closed";
}

export type GradeBand = { grade: string; from: number };
export const DEFAULT_BANDS: GradeBand[] = [{ grade: "A", from: 80 }, { grade: "B", from: 60 }, { grade: "C", from: 40 }, { grade: "D", from: 0 }];

export function readBands(raw: unknown): GradeBand[] {
  if (!Array.isArray(raw)) return DEFAULT_BANDS;
  const bands = raw.filter((b): b is GradeBand => !!b && typeof b === "object" && typeof (b as GradeBand).grade === "string" && typeof (b as GradeBand).from === "number");
  return bands.length ? [...bands].sort((a, b) => b.from - a.from) : DEFAULT_BANDS;
}

/** The grade for a score out of a maximum, from the school's homework grade bands. */
export function gradeFor(score: number, max: number, bands: GradeBand[] = DEFAULT_BANDS) {
  if (max <= 0) return null;
  const pct = (score / max) * 100;
  return [...bands].sort((a, b) => b.from - a.from).find((b) => pct >= b.from)?.grade ?? bands[bands.length - 1]?.grade ?? null;
}

/** "Out of 20. 25 is too high." (17 §5) */
export function scoreProblem(raw: string, max: number): string | null {
  const v = raw.trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return "Type a whole number.";
  const n = Number(v);
  if (n > max) return `Out of ${max}. ${n} is too high.`;
  return null;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 9 Oct" for a date-only value. */
export const dayDate = (d: Date) => `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
/** "9 Oct". */
export const shortDay = (d: Date) => `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;

/** A moment in the school's zone as "Thu 8 Oct, 6:07 PM". */
export function momentWords(at: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")}, ${g("hour")}:${g("minute")} ${g("dayPeriod").toUpperCase()}`;
}

/** "6:07 PM" in the school's zone. */
export function clockWords(at: Date, timeZone: string) {
  return at.toLocaleTimeString("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Subject icon and tone, as in the prototype (mod-homework.jsx SUB_ICON / SUB_TONE); others get a book. */
export function subjectLook(name: string): { icon: "Calculator" | "FlaskConical" | "BookOpen" | "Languages" | "Globe" | "Monitor" | "Palette" | "Dumbbell" | "Music"; tone: Tone } {
  const n = name.toLowerCase();
  if (/math/.test(n)) return { icon: "Calculator", tone: "brand" };
  if (/science|physics|chemistry|biology|evs|environment/.test(n)) return { icon: "FlaskConical", tone: "ok" };
  if (/english/.test(n)) return { icon: "BookOpen", tone: "info" };
  if (/telugu|hindi|sanskrit|tamil|kannada|urdu|french|language/.test(n)) return { icon: "Languages", tone: "warn" };
  if (/social|history|geography|civics/.test(n)) return { icon: "Globe", tone: "neutral" };
  if (/computer/.test(n)) return { icon: "Monitor", tone: "info" };
  if (/art|draw/.test(n)) return { icon: "Palette", tone: "warn" };
  if (/physical|sport|games|pe\b/.test(n)) return { icon: "Dumbbell", tone: "ok" };
  if (/music/.test(n)) return { icon: "Music", tone: "brand" };
  return { icon: "BookOpen", tone: "neutral" };
}

export const QUIZ_TONE: Record<string, Tone> = { Open: "ok", Draft: "neutral", Closed: "info", Scheduled: "brand" };
export const OC_TONE: Record<string, Tone> = { Scheduled: "info", Live: "bad", Done: "ok", Cancelled: "neutral" };

/** A quiz is Open between its opening and closing time; before it opens it reads "Scheduled". */
export function quizWord(q: { status: string; opensAt: Date | null; closesAt: Date | null }, now: Date): "Draft" | "Scheduled" | "Open" | "Closed" {
  if (q.status === "DRAFT") return "Draft";
  if (q.status === "CLOSED") return "Closed";
  if (q.closesAt && q.closesAt.getTime() <= now.getTime()) return "Closed";
  if (q.opensAt && q.opensAt.getTime() > now.getTime()) return "Scheduled";
  return "Open";
}

/** An online class is Live from its start to its end, then Done. */
export function sessionWord(s: { status: string; startsAt: Date; lengthMin: number }, now: Date): "Scheduled" | "Live" | "Done" | "Cancelled" {
  if (s.status === "CANCELLED") return "Cancelled";
  const start = s.startsAt.getTime();
  const end = start + s.lengthMin * 60_000;
  if (now.getTime() >= end) return "Done";
  if (now.getTime() >= start) return "Live";
  return "Scheduled";
}

/** Marks a quiz attempt: choice and true or false questions mark themselves; short answers wait for the teacher. */
export function markAttempt(questions: { id: string; kind: string; correctIndex: number | null; marks: number }[], answers: Record<string, unknown>, manual: Record<string, number> = {}) {
  let score = 0;
  let max = 0;
  let waiting = false;
  for (const q of questions) {
    max += q.marks;
    if (q.kind === "SHORT") {
      if (typeof manual[q.id] === "number") score += Math.min(q.marks, Math.max(0, manual[q.id]));
      else if (typeof answers[q.id] === "string" && String(answers[q.id]).trim()) waiting = true;
      continue;
    }
    if (typeof answers[q.id] === "number" && answers[q.id] === q.correctIndex) score += q.marks;
  }
  return { score, max, waiting };
}
