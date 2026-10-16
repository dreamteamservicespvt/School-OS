// Quizzes (17 §2): quizzes that mark themselves for practice and class tests.
// Multiple choice and true or false questions mark themselves; short answers
// wait for the teacher. Questions can come from the Question Papers bank.
// A quiz opens and closes at set times (default now to 7 days), with a time
// limit and a number of attempts; students take it in the app and see their
// score at once, with the answers when the teacher allows it.
import "server-only";

import type { Prisma, QuizQuestionKind } from "@prisma/client";
import type { Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { HomeworkProblem } from "./access";
import { mayRead, requireDesk, requireWork, requireYearOpen, shortSection, workSections, workSubjects, type HomeworkScope } from "./scope";
import { sectionStudents } from "./homework";
import { markAttempt, quizWord } from "./words";

export type QuestionInput = { kind: QuizQuestionKind; text: string; options: string[]; correctIndex: number | null; marks: number };

export type QuizInput = {
  sectionId: string; subjectId: string; title: string; questions: QuestionInput[];
  opensAt: Date; closesAt: Date; timeLimitMin: number | null; attemptsAllowed: number; showAnswers: boolean;
};

const DAY = 86_400_000;

export function checkQuestions(qs: QuestionInput[], forOpen: boolean) {
  if (qs.length > 100) throw new HomeworkProblem("A quiz can have at most 100 questions.", "questions");
  if (forOpen && !qs.length) throw new HomeworkProblem("Add at least one question before opening the quiz.", "questions");
  qs.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) throw new HomeworkProblem(`Question ${n} has no text.`, "questions");
    if (q.text.length > 1000) throw new HomeworkProblem(`Question ${n} is too long (at most 1,000 characters).`, "questions");
    if (!Number.isInteger(q.marks) || q.marks < 1 || q.marks > 20) throw new HomeworkProblem(`Question ${n}: marks must be from 1 to 20.`, "questions");
    if (q.kind === "SHORT") return;
    const opts = q.options.map((o) => o.trim());
    if (q.kind === "TRUE_FALSE" && (opts.length !== 2)) throw new HomeworkProblem(`Question ${n}: true or false needs the two choices True and False.`, "questions");
    if (q.kind === "CHOICE" && (opts.length < 2 || opts.length > 6)) throw new HomeworkProblem(`Question ${n}: give 2 to 6 choices.`, "questions");
    if (opts.some((o) => !o)) throw new HomeworkProblem(`Question ${n} has an empty choice.`, "questions");
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) throw new HomeworkProblem(`Question ${n} has the same choice twice.`, "questions");
    if (q.correctIndex === null || q.correctIndex < 0 || q.correctIndex >= opts.length) throw new HomeworkProblem(`Question ${n}: tick the right answer.`, "questions");
  });
}

function checkQuiz(input: QuizInput, forOpen: boolean) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new HomeworkProblem("Give the quiz a title.", "title");
  if (title.length > 160) throw new HomeworkProblem("The title can be at most 160 characters.", "title");
  if (input.closesAt.getTime() <= input.opensAt.getTime()) throw new HomeworkProblem("The quiz closes before it opens. Fix the closing time.", "closesAt");
  if (input.timeLimitMin !== null && (input.timeLimitMin < 1 || input.timeLimitMin > 180)) throw new HomeworkProblem("Time limit can be from 1 to 180 minutes, or none.", "timeLimitMin");
  if (!Number.isInteger(input.attemptsAllowed) || input.attemptsAllowed < 1 || input.attemptsAllowed > 5) throw new HomeworkProblem("Attempts can be from 1 to 5.", "attemptsAllowed");
  checkQuestions(input.questions, forOpen);
  return title;
}

async function writeQuestions(tx: Tx, s: HomeworkScope, quizId: string, qs: QuestionInput[]) {
  await tx.quizQuestion.updateMany({ where: { quizId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (qs.length) await tx.quizQuestion.createMany({ data: qs.map((q, i) => ({ schoolId: s.ctx.schoolId, quizId, sortOrder: i, kind: q.kind, text: q.text.trim(), options: q.kind === "SHORT" ? [] : q.options.map((o) => o.trim()), correctIndex: q.kind === "SHORT" ? null : q.correctIndex, marks: q.marks })) });
}

/** Creates a quiz, as a draft or open at once. Students with logins are told when it opens. */
export async function createQuiz(tx: Tx, s: HomeworkScope, input: QuizInput, open: boolean, now: Date, today: Date) {
  requireDesk(s, "quizzes");
  requireYearOpen(s);
  const title = checkQuiz(input, open);
  const section = (await workSections(tx, s, "quizzes")).find((x) => x.id === input.sectionId);
  if (!section) throw new HomeworkProblem("Choose one of your classes that has students.", "sectionId");
  const subject = (await workSubjects(tx, s, section.id, section.classId, today)).find((x) => x.id === input.subjectId);
  if (!subject) throw new HomeworkProblem(`You do not teach this subject to ${section.label}.`, "subjectId");
  const q = await tx.quiz.create({
    data: {
      schoolId: s.ctx.schoolId, academicYearId: s.yearId!, sectionId: section.id, classId: section.classId, subjectId: subject.id, teacherId: s.staffId, title,
      status: open ? "OPEN" : "DRAFT", opensAt: input.opensAt, closesAt: input.closesAt, timeLimitMin: input.timeLimitMin, attemptsAllowed: input.attemptsAllowed, showAnswers: input.showAnswers, createdById: s.ctx.userId,
    },
  });
  await writeQuestions(tx, s, q.id, input.questions);
  await writeAudit(tx, s.ctx, { action: "created", recordType: "Quiz", recordId: q.id, after: { title, section: section.label, subject: subject.name, questions: input.questions.length, status: q.status } });
  if (open) await tellOpen(tx, s, q, subject.name, now);
  return { quiz: q, section: section.label, students: section.students };
}

async function quizFor(tx: Tx, s: HomeworkScope, id: string) {
  const q = await tx.quiz.findFirst({ where: { id, archivedAt: null } });
  if (!q) throw new HomeworkProblem("This quiz was not found. It may have been archived.");
  requireWork(s, q, "this quiz", "quizzes");
  return q;
}

/** Edits a draft quiz (questions, times, limits). An open quiz with attempts keeps its questions. */
export async function editQuiz(tx: Tx, s: HomeworkScope, id: string, input: Omit<QuizInput, "sectionId" | "subjectId">) {
  const q = await quizFor(tx, s, id);
  const attempts = await tx.quizAttempt.count({ where: { quizId: id } });
  const title = checkQuiz({ ...input, sectionId: q.sectionId, subjectId: q.subjectId }, q.status === "OPEN");
  if (attempts > 0) {
    await tx.quiz.update({ where: { id }, data: { title, closesAt: input.closesAt, showAnswers: input.showAnswers } });
  } else {
    await tx.quiz.update({ where: { id }, data: { title, opensAt: input.opensAt, closesAt: input.closesAt, timeLimitMin: input.timeLimitMin, attemptsAllowed: input.attemptsAllowed, showAnswers: input.showAnswers } });
    await writeQuestions(tx, s, id, input.questions);
  }
  await writeAudit(tx, s.ctx, { action: "changed", recordType: "Quiz", recordId: id, before: { title: q.title }, after: { title, questionsKept: attempts > 0 } });
  return { title, questionsKept: attempts > 0 };
}

export async function openQuiz(tx: Tx, s: HomeworkScope, id: string, now: Date) {
  const q = await quizFor(tx, s, id);
  if (q.status !== "DRAFT") throw new HomeworkProblem("This quiz is already open or closed.");
  const qs = await tx.quizQuestion.count({ where: { quizId: id, archivedAt: null } });
  if (!qs) throw new HomeworkProblem("Add at least one question before opening the quiz.");
  const opensAt = q.opensAt && q.opensAt > now ? q.opensAt : now;
  const closesAt = q.closesAt && q.closesAt > opensAt ? q.closesAt : new Date(opensAt.getTime() + 7 * DAY);
  const updated = await tx.quiz.update({ where: { id }, data: { status: "OPEN", opensAt, closesAt } });
  await writeAudit(tx, s.ctx, { action: "opened", recordType: "Quiz", recordId: id, after: { title: q.title, closes: closesAt.toISOString() } });
  const subject = await tx.subject.findUnique({ where: { id: q.subjectId }, select: { name: true } });
  await tellOpen(tx, s, updated, subject?.name ?? "", now);
  return updated;
}

export async function closeQuiz(tx: Tx, s: HomeworkScope, id: string, now: Date) {
  const q = await quizFor(tx, s, id);
  if (quizWord(q, now) === "Closed") throw new HomeworkProblem("This quiz is already closed.");
  if (q.status === "DRAFT") throw new HomeworkProblem("This quiz is a draft. Archive it instead.");
  await tx.quiz.update({ where: { id }, data: { status: "CLOSED", closedAt: now, closesAt: q.closesAt && q.closesAt < now ? q.closesAt : now } });
  await writeAudit(tx, s.ctx, { action: "closed", recordType: "Quiz", recordId: id, before: { status: q.status }, after: { status: "CLOSED", title: q.title } });
  return q;
}

export async function archiveQuiz(tx: Tx, s: HomeworkScope, id: string) {
  const q = await quizFor(tx, s, id);
  await tx.quiz.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, s.ctx, { action: "archived", recordType: "Quiz", recordId: id, before: { title: q.title } });
  return q;
}

async function tellOpen(tx: Tx, s: HomeworkScope, q: { id: string; sectionId: string; academicYearId: string; title: string; closesAt: Date | null }, subject: string, now: Date) {
  const students = await sectionStudents(tx, q.academicYearId, q.sectionId);
  for (const st of students) {
    if (st.userLoginId) await notify(tx, s.ctx, { to: st.userLoginId, type: "quiz-open", text: `New quiz in ${subject}: ${q.title}.`, link: "/homework-learning/quizzes", groupKey: "quiz-open", mergedText: (n) => `${n} new quizzes` }, now);
  }
}

/** Questions from the Question Papers bank that mark themselves (multiple choice, true or false), for the class and subject. */
export async function bankQuestions(tx: Tx, classId: string, subjectId: string) {
  const rows = await tx.question.findMany({ where: { classId, subjectId, archivedAt: null, type: { in: ["mcq", "true-false"] } }, orderBy: { createdAt: "desc" }, take: 60 });
  return rows.flatMap((r) => {
    const options = r.type === "true-false" ? ["True", "False"] : r.options.map((o) => o.trim()).filter(Boolean);
    const ans = (r.answer ?? "").trim().toLowerCase();
    let correct = options.findIndex((o) => o.toLowerCase() === ans);
    if (correct < 0 && /^[a-f]$/.test(ans)) correct = ans.charCodeAt(0) - 97;
    if (correct < 0 && /^\d$/.test(ans)) correct = Number(ans) - 1;
    if (options.length < 2 || correct < 0 || correct >= options.length) return [];
    return [{ id: r.id, kind: (r.type === "true-false" ? "TRUE_FALSE" : "CHOICE") as QuizQuestionKind, text: r.text, options, correctIndex: correct, marks: Math.min(20, Math.max(1, r.marks)) }];
  });
}

export type QuizRow = {
  id: string; title: string; sectionId: string; subjectId: string; sectionLabel: string; subject: string; teacher: string; questions: number; maxScore: number;
  timeLimitMin: number | null; attemptsAllowed: number; taken: number; students: number; avg: number | null; word: ReturnType<typeof quizWord>; opensAt: Date | null; closesAt: Date | null; createdAt: Date; toMark: number;
};

/** The quizzes this person may read, newest first, with taken and average. */
export async function listQuizzes(tx: Tx, s: HomeworkScope, now: Date, f: { from?: Date | null; to?: Date | null; q?: string } = {}) {
  const where: Prisma.QuizWhereInput = {
    archivedAt: null, academicYearId: s.yearId ?? undefined,
    ...(s.level === "student" ? { sectionId: s.student?.sectionId ?? "00000000-0000-0000-0000-000000000000", status: { not: "DRAFT" } } : {}),
    ...(s.level === "own" ? { OR: [...s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId })), ...(s.staffId ? [{ teacherId: s.staffId }] : []), ...(s.ctSections.length ? [{ sectionId: { in: s.ctSections } }] : [])] } : {}),
    ...(f.from && f.to ? { createdAt: { gte: f.from, lt: new Date(f.to.getTime() + DAY) } } : {}),
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" as const } } : {}),
  };
  if (s.level === "own" && !(where.OR as unknown[]).length) where.OR = [{ id: "00000000-0000-0000-0000-000000000000" }];
  const rows = await tx.quiz.findMany({ where, orderBy: { createdAt: "desc" }, include: { questions: { where: { archivedAt: null }, select: { marks: true } }, attempts: { where: { submittedAt: { not: null } }, select: { studentId: true, score: true, maxScore: true, needsMarking: true } } } });
  const [sections, subjects, staff, counts] = await Promise.all([
    tx.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, include: { schoolClass: { select: { name: true } } } }),
    tx.subject.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.subjectId))] } }, select: { id: true, name: true } }),
    tx.staff.findMany({ where: { id: { in: rows.map((r) => r.teacherId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
    tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: s.yearId ?? undefined, archivedAt: null, status: "STUDYING", sectionId: { in: [...new Set(rows.map((r) => r.sectionId))] } }, _count: true }),
  ]);
  const sec = new Map(sections.map((x) => [x.id, shortSection(x.schoolClass.name, x.name)]));
  const sub = new Map(subjects.map((x) => [x.id, x.name]));
  const who = new Map(staff.map((x) => [x.id, x.fullName]));
  const n = new Map(counts.map((c) => [c.sectionId, c._count]));
  return rows.map((q): QuizRow => {
    const best = bestByStudent(q.attempts);
    const scored = [...best.values()].filter((a) => a.score !== null);
    return {
      id: q.id, title: q.title, sectionId: q.sectionId, subjectId: q.subjectId, sectionLabel: sec.get(q.sectionId) ?? "", subject: sub.get(q.subjectId) ?? "", teacher: q.teacherId ? who.get(q.teacherId) ?? "" : "",
      questions: q.questions.length, maxScore: q.questions.reduce((a, x) => a + x.marks, 0), timeLimitMin: q.timeLimitMin, attemptsAllowed: q.attemptsAllowed,
      taken: best.size, students: n.get(q.sectionId) ?? 0, avg: scored.length ? Math.round((scored.reduce((a, x) => a + (x.score ?? 0), 0) / scored.length) * 10) / 10 : null,
      word: quizWord(q, now), opensAt: q.opensAt, closesAt: q.closesAt, createdAt: q.createdAt, toMark: q.attempts.filter((a) => a.needsMarking).length,
    };
  });
}

function bestByStudent<T extends { studentId: string; score: number | null }>(attempts: T[]) {
  const best = new Map<string, T>();
  for (const a of attempts) {
    const b = best.get(a.studentId);
    if (!b || (a.score ?? -1) > (b.score ?? -1)) best.set(a.studentId, a);
  }
  return best;
}

/** Results of one quiz: each student's best score and answers, and correct answers per question. */
export async function quizResults(tx: Tx, s: HomeworkScope, id: string) {
  const q = await tx.quiz.findFirst({ where: { id, archivedAt: null }, include: { questions: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } });
  if (!q || !mayRead(s, q) || s.level === "student") return null;
  const [attempts, students] = await Promise.all([
    tx.quizAttempt.findMany({ where: { quizId: id, submittedAt: { not: null } }, orderBy: { submittedAt: "asc" } }),
    sectionStudents(tx, q.academicYearId, q.sectionId),
  ]);
  const best = bestByStudent(attempts);
  const perQuestion = q.questions.map((x, i) => {
    const taken = [...best.values()];
    const right = taken.filter((a) => {
      const ans = (a.answers as Record<string, unknown>)[x.id];
      if (x.kind === "SHORT") { const m = (a.manualMarks as Record<string, number>)[x.id]; return typeof m === "number" && m >= x.marks / 2; }
      return typeof ans === "number" && ans === x.correctIndex;
    }).length;
    return { id: x.id, no: i + 1, text: x.text, pct: taken.length ? Math.round((right / taken.length) * 100) : 0 };
  });
  return { quiz: q, students, best, perQuestion, attempts };
}

/** The teacher marks short answers of one attempt; the score is worked out again. */
export async function markShortAnswers(tx: Tx, s: HomeworkScope, attemptId: string, marks: Record<string, number>) {
  const a = await tx.quizAttempt.findFirst({ where: { id: attemptId }, include: { quiz: { include: { questions: { where: { archivedAt: null } } } } } });
  if (!a) throw new HomeworkProblem("This attempt was not found.");
  requireWork(s, a.quiz, "this quiz", "quizzes");
  const manual: Record<string, number> = { ...(a.manualMarks as Record<string, number>) };
  for (const qn of a.quiz.questions.filter((x) => x.kind === "SHORT")) {
    if (!(qn.id in marks)) continue;
    const v = marks[qn.id];
    if (!Number.isInteger(v) || v < 0) throw new HomeworkProblem("Marks must be whole numbers, 0 or more.", "marks");
    if (v > qn.marks) throw new HomeworkProblem(`Out of ${qn.marks}. ${v} is too high.`, "marks");
    manual[qn.id] = v;
  }
  const res = markAttempt(a.quiz.questions, a.answers as Record<string, unknown>, manual);
  await tx.quizAttempt.update({ where: { id: attemptId }, data: { manualMarks: manual, score: res.score, maxScore: res.max, needsMarking: res.waiting } });
  await writeAudit(tx, s.ctx, { action: "marked", recordType: "Quiz Attempt", recordId: attemptId, after: { quiz: a.quiz.title, score: res.score, of: res.max } });
  return res;
}

// ---------------------------------------------------------------- students

/** May the student start (or start again) this quiz now? */
export async function studentQuizState(tx: Tx, s: HomeworkScope, quizId: string, now: Date) {
  if (s.level !== "student" || !s.student) throw new HomeworkProblem("Only students take quizzes.");
  const q = await tx.quiz.findFirst({ where: { id: quizId, archivedAt: null, sectionId: s.student.sectionId }, include: { questions: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } });
  if (!q || q.status === "DRAFT") throw new HomeworkProblem("This quiz was not found.");
  const attempts = await tx.quizAttempt.findMany({ where: { quizId, studentId: s.student.id }, orderBy: { attemptNo: "asc" } });
  const running = attempts.find((a) => !a.submittedAt);
  const done = attempts.filter((a) => a.submittedAt);
  const word = quizWord(q, now);
  return { quiz: q, attempts, running, done, word, canStart: word === "Open" && !running && done.length < q.attemptsAllowed };
}

export async function startAttempt(tx: Tx, s: HomeworkScope, quizId: string, now: Date) {
  const st = await studentQuizState(tx, s, quizId, now);
  if (st.running) return st.running;
  if (st.word !== "Open") throw new HomeworkProblem(st.word === "Scheduled" ? "This quiz has not opened yet." : "This quiz is closed.");
  if (st.done.length >= st.quiz.attemptsAllowed) throw new HomeworkProblem(`You have used all ${st.quiz.attemptsAllowed === 1 ? "your attempt" : `${st.quiz.attemptsAllowed} attempts`} for this quiz.`);
  const a = await tx.quizAttempt.create({ data: { schoolId: s.ctx.schoolId, quizId, studentId: s.student!.id, attemptNo: st.done.length + 1, startedAt: now, maxScore: st.quiz.questions.reduce((x, q) => x + q.marks, 0) } });
  await writeAudit(tx, s.ctx, { action: "started", recordType: "Quiz Attempt", recordId: a.id, after: { quiz: st.quiz.title, attempt: a.attemptNo } });
  return a;
}

/** Hands in an attempt; the quiz marks itself. After the time limit (and a minute's grace) it is still taken as it stands. */
export async function submitAttempt(tx: Tx, s: HomeworkScope, attemptId: string, answers: Record<string, number | string>, now: Date) {
  if (s.level !== "student" || !s.student) throw new HomeworkProblem("Only students take quizzes.");
  const a = await tx.quizAttempt.findFirst({ where: { id: attemptId, studentId: s.student.id }, include: { quiz: { include: { questions: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } } } });
  if (!a) throw new HomeworkProblem("This attempt was not found.");
  if (a.submittedAt) throw new HomeworkProblem("These answers are already handed in.");
  const clean: Record<string, number | string> = {};
  for (const q of a.quiz.questions) {
    const v = answers[q.id];
    if (q.kind === "SHORT" && typeof v === "string" && v.trim()) clean[q.id] = v.trim().slice(0, 2000);
    if (q.kind !== "SHORT" && typeof v === "number" && Number.isInteger(v) && v >= 0 && v < q.options.length) clean[q.id] = v;
  }
  const overTime = a.quiz.timeLimitMin !== null && now.getTime() > a.startedAt.getTime() + (a.quiz.timeLimitMin + 1) * 60_000;
  const res = markAttempt(a.quiz.questions, clean);
  await tx.quizAttempt.update({ where: { id: a.id }, data: { answers: clean, submittedAt: now, score: res.score, maxScore: res.max, needsMarking: res.waiting } });
  await writeAudit(tx, s.ctx, { action: "submitted", recordType: "Quiz Attempt", recordId: a.id, after: { quiz: a.quiz.title, score: res.score, of: res.max, overTime } });
  if (res.waiting && a.quiz.teacherId) {
    const t = await tx.staff.findUnique({ where: { id: a.quiz.teacherId }, select: { userLoginId: true } });
    if (t?.userLoginId) await notify(tx, s.ctx, { to: t.userLoginId, type: "quiz-to-mark", text: `${a.quiz.title}: short answers to mark.`, link: `/homework-learning/quizzes?open=${a.quiz.id}`, groupKey: `quiz-to-mark:${a.quiz.id}`, mergedText: (n) => `${a.quiz.title}: ${n} attempts with short answers to mark` });
  }
  return { ...res, quiz: a.quiz, answers: clean };
}
