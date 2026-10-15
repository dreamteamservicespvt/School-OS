"use server";

import { redirect } from "next/navigation";
import { str } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { archiveQuiz, closeQuiz, createQuiz, editQuiz, markShortAnswers, openQuiz, startAttempt, submitAttempt, type QuestionInput } from "@/lib/homework/quizzes";
import { hwForm, hwQuick, localMoment } from "../_lib/action";
import { BASE, UUID } from "../_lib/page";

const DAY = 86_400_000;
const uuid = (fd: FormData, key: string, what: string) => {
  const v = str(fd, key);
  if (!UUID.test(v)) throw new HomeworkProblem(`Choose the ${what}.`, key);
  return v;
};

/** The questions typed in the Create quiz sheet, sent as one JSON field. */
function questions(fd: FormData): QuestionInput[] {
  let raw: unknown;
  try { raw = JSON.parse(str(fd, "questions") || "[]"); } catch { throw new HomeworkProblem("The questions could not be read. Please try again.", "questions"); }
  if (!Array.isArray(raw)) throw new HomeworkProblem("The questions could not be read. Please try again.", "questions");
  return raw.map((q) => {
    const x = q as Record<string, unknown>;
    const kind = x.kind === "TRUE_FALSE" || x.kind === "SHORT" ? x.kind : "CHOICE";
    return {
      kind, text: String(x.text ?? ""), options: kind === "SHORT" ? [] : Array.isArray(x.options) ? x.options.map((o) => String(o ?? "")) : [],
      correctIndex: kind === "SHORT" ? null : Number.isInteger(x.correctIndex) ? Number(x.correctIndex) : null, marks: Number.isInteger(x.marks) ? Number(x.marks) : 1,
    };
  });
}

function moment(fd: FormData, key: string, label: string, fallback: Date, tz: string) {
  const v = str(fd, key);
  if (!v) return fallback;
  const d = localMoment(v, tz);
  if (!d) throw new HomeworkProblem(`${label} is not a real date and time.`, key);
  return d;
}

function settings(fd: FormData, now: Date, tz: string) {
  const opensAt = moment(fd, "opensAt", "Opens", now, tz);
  const limit = str(fd, "timeLimit");
  const tries = Number(str(fd, "attempts") || "1");
  return {
    title: str(fd, "title"), questions: questions(fd), opensAt, closesAt: moment(fd, "closesAt", "Closes", new Date(opensAt.getTime() + 7 * DAY), tz),
    timeLimitMin: limit && limit !== "none" ? Number(limit) : null, attemptsAllowed: tries, showAnswers: str(fd, "showAnswers") === "on",
  };
}

/** Create quiz: "Open for 7 B" opens it at once (students hear); "Save draft" keeps it for later. */
export async function createQuizAction(_prev: unknown, fd: FormData) {
  const open = str(fd, "intent") !== "draft";
  return hwForm("create", fd, async ({ tx, s, now, today, tz }) => {
    const id = str(fd, "id");
    if (UUID.test(id)) {
      const r = await editQuiz(tx, s, id, settings(fd, now, tz));
      if (open) await openQuiz(tx, s, id, now);
      return { title: r.title, label: str(fd, "label"), students: 0, opened: open, kept: r.questionsKept };
    }
    const r = await createQuiz(tx, s, { ...settings(fd, now, tz), sectionId: uuid(fd, "sectionId", "class"), subjectId: uuid(fd, "subjectId", "subject") }, open, now, today);
    return { title: r.quiz.title, label: r.section, students: r.students, opened: open, kept: false };
  }, (r) => r.opened
    ? `${r.title} is open for ${r.label}.${r.students ? ` ${r.students} students notified.` : " Students are notified."}`
    : `${r.title} saved as a draft. Open it when you are ready.${r.kept ? " Its questions were kept because students have taken it." : ""}`);
}

export async function openQuizAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s, now }) => openQuiz(tx, s, uuid(fd, "id", "quiz"), now), (q) => `${q.title} is open. Students are notified.`);
}

export async function closeQuizAction(fd: FormData) {
  return hwQuick("edit", async ({ tx, s, now }) => closeQuiz(tx, s, uuid(fd, "id", "quiz"), now), (q) => `${q.title} closed. Students who did not take it can no longer start it.`);
}

export async function archiveQuizAction(_prev: unknown, fd: FormData) {
  return hwForm("archive", fd, async ({ tx, s }) => archiveQuiz(tx, s, uuid(fd, "id", "quiz")), (q) => `Archived: ${q.title}. Scores already taken are kept.`);
}

/** Marks for the short answers of one attempt. */
export async function markShortAction(_prev: unknown, fd: FormData) {
  return hwForm("edit", fd, async ({ tx, s }) => {
    const marks: Record<string, number> = {};
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("m_") || typeof v !== "string" || v.trim() === "") continue;
      if (!/^\d{1,2}$/.test(v.trim())) throw new HomeworkProblem("Marks must be whole numbers, 0 or more.", "marks");
      marks[k.slice(2)] = Number(v);
    }
    return markShortAnswers(tx, s, uuid(fd, "attemptId", "attempt"), marks);
  }, (r) => `Saved. Score ${r.score} of ${r.max}.`);
}

/** A student starts (or carries on with) a quiz. */
export async function startQuizAction(fd: FormData) {
  const id = str(fd, "id");
  const problem = await hwQuick("edit", async ({ tx, s, now }) => startAttempt(tx, s, uuid(fd, "id", "quiz"), now), () => "Quiz started. Good luck!");
  if (problem) return problem;
  redirect(`${BASE}/quizzes/${id}`);
}

/** A student hands in their answers; the quiz marks itself at once. */
export async function submitQuizAction(attemptId: string, answers: Record<string, number | string>): Promise<{ problem?: string }> {
  const problem = await hwQuick("edit", async ({ tx, s, now }) => {
    if (!UUID.test(attemptId)) throw new HomeworkProblem("This attempt was not found.");
    return submitAttempt(tx, s, attemptId, answers, now);
  }, (r) => (r.waiting ? `Handed in. ${r.score} of ${r.max} so far; your teacher marks the written answers.` : `Handed in. You scored ${r.score} of ${r.max}.`));
  return problem ? { problem } : {};
}
