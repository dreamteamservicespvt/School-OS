// Shared words and small helpers for Examination & Results.
import type { ExamPattern, ExamStatus, MarksPaperStatus, ReportCardStatus } from "@prisma/client";
import { minutes, time12 } from "../academic/common";

/** A rule from 08 §5 stopped the change. The message is shown as it is. */
export class ExamRuleError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "ExamRuleError";
  }
}

export const PATTERNS: { value: ExamPattern; label: string; help: string }[] = [
  { value: "PERCENTAGE", label: "Percentage", help: "Marks, total and percentage, with the grade." },
  { value: "GRADING", label: "Grading", help: "Grades shown on the report card instead of marks." },
  { value: "CGPA", label: "CGPA", help: "Grade points per subject and the average (CGPA)." },
];
export const patternLabel = (p: string | null | undefined) => PATTERNS.find((x) => x.value === p)?.label ?? "Percentage";

/** Shown status of an exam (08 §2 Datesheet): Draft, Published, Ongoing, Completed, Results published. */
export type ShownExamStatus = "Draft" | "Published" | "Ongoing" | "Completed" | "Results published";

export function shownExamStatus(exam: { status: ExamStatus; startDate: Date; endDate: Date }, today: Date): ShownExamStatus {
  if (exam.status === "DRAFT") return "Draft";
  if (exam.status === "RESULTS_PUBLISHED") return "Results published";
  if (today < exam.startDate) return "Published";
  if (today <= exam.endDate) return "Ongoing";
  return "Completed";
}

export const EXAM_STATUS_TONE: Record<ShownExamStatus, "neutral" | "brand" | "warning" | "success"> = {
  Draft: "neutral",
  Published: "brand",
  Ongoing: "warning",
  Completed: "neutral",
  "Results published": "success",
};

export const PAPER_STATUS_WORDS: Record<MarksPaperStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  LOCKED: "Locked",
};
export const PAPER_STATUS_TONE: Record<MarksPaperStatus, "neutral" | "warning" | "brand" | "success"> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "warning",
  SUBMITTED: "brand",
  LOCKED: "success",
};

export const REPORT_STATUS_WORDS: Record<ReportCardStatus, string> = { NOT_READY: "Not ready", READY: "Ready", PRINTED: "Printed", SENT: "Sent" };

/** "9:30 AM to 12:30 PM" from a start time and a duration. */
export function timeRange(start: string, durationMin: number) {
  return `${time12(start)} to ${time12(endTime(start, durationMin))}`;
}

export function endTime(start: string, durationMin: number) {
  const end = minutes(start) + durationMin;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

/** Two sittings on one date overlap when one starts before the other ends. */
export function overlaps(a: { date: Date; startTime: string; durationMin: number }, b: { date: Date; startTime: string; durationMin: number }) {
  if (a.date.getTime() !== b.date.getTime()) return false;
  const as = minutes(a.startTime);
  const bs = minutes(b.startTime);
  return as < bs + b.durationMin && bs < as + a.durationMin;
}

export function durationWords(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

/** Marks shown with up to one decimal place: 37, 37.5. */
export function showMarks(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function showPercent(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return `${n.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Report card periods: one exam, a term (all its exams) or the whole year. */
export type Period = { kind: "exam"; examId: string } | { kind: "term"; termId: string } | { kind: "year" };

export function parsePeriod(raw: string | null | undefined): Period | null {
  if (!raw) return null;
  if (raw === "year") return { kind: "year" };
  const m = /^(exam|term):([0-9a-f-]{36})$/i.exec(raw);
  if (!m) return null;
  return m[1] === "exam" ? { kind: "exam", examId: m[2] } : { kind: "term", termId: m[2] };
}

export function periodKey(p: Period) {
  return p.kind === "year" ? "year" : p.kind === "exam" ? `exam:${p.examId}` : `term:${p.termId}`;
}

export const examKey = (examId: string) => `exam:${examId}`;
export const finalKey = (yearId: string) => `final:${yearId}`;
