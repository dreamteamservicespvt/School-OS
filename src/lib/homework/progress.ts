// Learning Progress (17 §2): homework done, homework scores, quizzes and
// lessons for each student of a class, for a subject or all subjects, over
// any dates; per student over time; which quiz questions and lessons students
// struggle with; and course certificates for finishing a learning path.
// Every number comes from the same records the other pages show.
import "server-only";

import type { Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { nextNumber, formatNumber } from "../sequences";
import { HomeworkProblem } from "./access";
import { requireDesk, mayRead, onCampus, type HomeworkScope } from "./scope";
import { sectionStudents } from "./homework";
import { HANDED_IN, pct } from "./words";

const DAY = 86_400_000;

export type ProgressRow = {
  id: string; name: string; admissionNo: string; rollNo: number | null;
  given: number; done: number; missing: number; scorePct: number | null; quizzes: number; quizPct: number | null; lessonsDone: number;
};

/** Each student's homework, quizzes and lessons in one section, for a subject (or every subject) and dates. */
export async function classProgress(tx: Tx, s: HomeworkScope, sectionId: string, subjectId: string | null, from: Date | null, to: Date | null, today: Date) {
  const section = await tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: { select: { name: true } } } });
  // Another campus's class is not found for a person limited to one campus.
  if (!section || !onCampus(s, section.id)) return null;
  const allowedSubjects = subjectsReadable(s, sectionId);
  if (allowedSubjects === "none") return null;
  if (subjectId && allowedSubjects !== "all" && !allowedSubjects.includes(subjectId)) return null;
  const subjectFilter = subjectId ? { subjectId } : allowedSubjects === "all" ? {} : { subjectId: { in: allowedSubjects } };
  const range = from && to ? { startDate: { lte: to }, dueDate: { gte: from } } : {};
  const students = await sectionStudents(tx, section.academicYearId, sectionId);
  const homework = await tx.homework.findMany({ where: { sectionId, archivedAt: null, startDate: { lte: today }, ...subjectFilter, ...range }, select: { id: true, maxMarks: true, dueDate: true } });
  const subs = await tx.submission.findMany({ where: { homeworkId: { in: homework.map((h) => h.id) }, archivedAt: null }, select: { studentId: true, homeworkId: true, status: true, score: true } });
  const max = new Map(homework.map((h) => [h.id, h.maxMarks]));
  const pastDue = new Set(homework.filter((h) => h.dueDate < today).map((h) => h.id));
  const quizzes = await tx.quiz.findMany({ where: { sectionId, archivedAt: null, status: { not: "DRAFT" }, ...subjectFilter, ...(from && to ? { createdAt: { gte: from, lt: new Date(to.getTime() + DAY) } } : {}) }, select: { id: true } });
  const attempts = await tx.quizAttempt.findMany({ where: { quizId: { in: quizzes.map((q) => q.id) }, submittedAt: { not: null } }, select: { quizId: true, studentId: true, score: true, maxScore: true } });
  const courses = await tx.course.findMany({ where: { sectionId, archivedAt: null, ...subjectFilter }, select: { id: true } });
  const lessons = await tx.lesson.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, archivedAt: null, visible: true }, select: { id: true } });
  const views = await tx.lessonView.findMany({ where: { lessonId: { in: lessons.map((l) => l.id) }, doneAt: { not: null } }, select: { studentId: true } });

  const rows: ProgressRow[] = students.map((st) => {
    const mine = subs.filter((x) => x.studentId === st.id && x.status !== "EXCUSED");
    const done = handedIn(mine);
    const scored = mine.filter((x) => x.score !== null);
    const scorePct = scored.length ? Math.round(scored.reduce((a, x) => a + (x.score! / (max.get(x.homeworkId) ?? 100)) * 100, 0) / scored.length) : null;
    const best = new Map<string, { score: number; max: number }>();
    for (const a of attempts.filter((x) => x.studentId === st.id && x.score !== null)) {
      const b = best.get(a.quizId);
      if (!b || a.score! > b.score) best.set(a.quizId, { score: a.score!, max: a.maxScore });
    }
    const q = [...best.values()];
    return {
      id: st.id, name: st.name, admissionNo: st.admissionNo, rollNo: st.rollNo,
      given: mine.length, done, missing: mine.filter((x) => x.status === "MISSING" || (x.status === "ASSIGNED" && pastDue.has(x.homeworkId))).length, scorePct,
      quizzes: q.length, quizPct: q.length ? Math.round(q.reduce((a, x) => a + (x.max ? (x.score / x.max) * 100 : 0), 0) / q.length) : null,
      lessonsDone: views.filter((v) => v.studentId === st.id).length,
    };
  });
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return {
    section: { id: section.id, label: `${section.schoolClass.name.replace(/^Class\s+/i, "")} ${section.name}` },
    rows,
    totals: {
      homework: homework.length,
      donePct: pct(rows.reduce((a, r) => a + r.done, 0), rows.reduce((a, r) => a + r.given, 0)),
      donePerStudent: rows.length ? Math.round((rows.reduce((a, r) => a + r.done, 0) / rows.length) * 10) / 10 : 0,
      givenPerStudent: rows.length ? Math.round((rows.reduce((a, r) => a + r.given, 0) / rows.length) * 10) / 10 : 0,
      scorePct: avg(rows.map((r) => r.scorePct)),
      quizPct: avg(rows.map((r) => r.quizPct)),
      quizzesPerStudent: rows.length ? Math.round((rows.reduce((a, r) => a + r.quizzes, 0) / rows.length) * 10) / 10 : 0,
      lessons: lessons.length,
      lessonsPerStudent: rows.length ? Math.round((rows.reduce((a, r) => a + r.lessonsDone, 0) / rows.length) * 10) / 10 : 0,
    },
  };
}

/** How many of these submissions were handed in (Submitted, Late or Graded). Excused work is left out before counting. */
const handedIn = (subs: { status: string }[]) => subs.filter((x) => (HANDED_IN as readonly string[]).includes(x.status)).length;

/**
 * Homework done for each student over a school year, as Learning Progress
 * counts it: homework set up to today, excused work left out, handed in out
 * of given. Used outside Homework & Learning (the PTM cards and meeting view),
 * so it has no reach of its own: callers show it only to people who may see
 * those students.
 */
export async function homeworkDone(tx: Tx, studentIds: string[], academicYearId: string, today: Date) {
  const out = new Map<string, { given: number; done: number; pct: number | null }>();
  if (!studentIds.length) return out;
  const subs = await tx.submission.findMany({
    where: { studentId: { in: studentIds }, archivedAt: null, status: { not: "EXCUSED" }, homework: { academicYearId, archivedAt: null, startDate: { lte: today } } },
    select: { studentId: true, status: true },
  });
  for (const id of studentIds) {
    const mine = subs.filter((x) => x.studentId === id);
    out.set(id, { given: mine.length, done: handedIn(mine), pct: mine.length ? pct(handedIn(mine), mine.length) : null });
  }
  return out;
}

/** Subjects of a section this person may read progress for: every subject (full, class teacher), or their own. */
function subjectsReadable(s: HomeworkScope, sectionId: string): "all" | "none" | string[] {
  if (!onCampus(s, sectionId)) return "none";
  if (s.level === "full") return "all";
  if (s.level !== "own") return "none";
  if (s.ctSections.includes(sectionId)) return "all";
  const mine = s.pairs.filter((p) => p.sectionId === sectionId).map((p) => p.subjectId);
  return mine.length ? mine : "none";
}

/** Where students struggle: quiz questions with the fewest right answers, and lessons the fewest finished. */
export async function struggles(tx: Tx, s: HomeworkScope, sectionId: string, subjectId: string | null, from: Date | null, to: Date | null) {
  const readable = subjectsReadable(s, sectionId);
  if (readable === "none") return [];
  const subjectFilter = subjectId ? { subjectId } : readable === "all" ? {} : { subjectId: { in: readable } };
  const quizzes = await tx.quiz.findMany({
    where: { sectionId, archivedAt: null, status: { not: "DRAFT" }, ...subjectFilter, ...(from && to ? { createdAt: { gte: from, lt: new Date(to.getTime() + DAY) } } : {}) },
    include: { questions: { where: { archivedAt: null, kind: { not: "SHORT" } } }, attempts: { where: { submittedAt: { not: null } }, select: { answers: true } } },
  });
  const out: { key: string; label: string; quiz: string; pct: number; href: string }[] = [];
  for (const q of quizzes) {
    if (q.attempts.length < 3) continue;
    for (const qn of q.questions) {
      const right = q.attempts.filter((a) => (a.answers as Record<string, unknown>)[qn.id] === qn.correctIndex).length;
      out.push({ key: qn.id, label: qn.text.length > 60 ? `${qn.text.slice(0, 57)}…` : qn.text, quiz: q.title, pct: Math.round((right / q.attempts.length) * 100), href: `/homework-learning/quizzes?open=${q.id}` });
    }
  }
  return out.sort((a, b) => a.pct - b.pct).slice(0, 6);
}

/** One student's homework over time, newest first: each homework with its status and score. */
export async function studentHomework(tx: Tx, studentId: string, yearId: string | null, limit = 50) {
  const subs = await tx.submission.findMany({
    where: { studentId, archivedAt: null, homework: { archivedAt: null, ...(yearId ? { academicYearId: yearId } : {}) } },
    include: { homework: { select: { id: true, title: true, subjectId: true, dueDate: true, maxMarks: true, sectionId: true, startDate: true, teacherId: true } } },
    orderBy: { homework: { dueDate: "desc" } }, take: limit,
  });
  const subjects = await tx.subject.findMany({ where: { id: { in: [...new Set(subs.map((x) => x.homework.subjectId))] } }, select: { id: true, name: true } });
  const sub = new Map(subjects.map((x) => [x.id, x.name]));
  return subs.map((x) => ({ ...x, subject: sub.get(x.homework.subjectId) ?? "" }));
}

// ---------------------------------------------------------------- course certificates

/** Students of the course who finished every visible lesson and have no certificate yet. */
export async function certificateCandidates(tx: Tx, s: HomeworkScope, courseId: string) {
  const c = await tx.course.findFirst({ where: { id: courseId, archivedAt: null } });
  if (!c || !mayRead(s, c) || s.level === "student") return null;
  const lessons = await tx.lesson.findMany({ where: { courseId, archivedAt: null, visible: true }, select: { id: true } });
  const students = await sectionStudents(tx, c.academicYearId, c.sectionId);
  const [views, issued] = await Promise.all([
    tx.lessonView.findMany({ where: { lessonId: { in: lessons.map((l) => l.id) }, doneAt: { not: null } }, select: { studentId: true, lessonId: true } }),
    tx.courseCertificate.findMany({ where: { courseId }, select: { studentId: true, number: true, issuedAt: true, id: true } }),
  ]);
  const has = new Set(issued.map((x) => x.studentId));
  const finished = lessons.length ? students.filter((st) => views.filter((v) => v.studentId === st.id).length >= lessons.length) : [];
  return { course: c, lessons: lessons.length, finished, ready: finished.filter((st) => !has.has(st.id)), issued };
}

/** Issues course certificates to every student who finished the learning path. Numbers are never reused. */
export async function issueCertificates(tx: Tx, s: HomeworkScope, courseId: string) {
  requireDesk(s, "learning-progress");
  const cand = await certificateCandidates(tx, s, courseId);
  if (!cand) throw new HomeworkProblem("This course was not found.");
  if (s.level === "own" && !s.pairs.some((p) => p.sectionId === cand.course.sectionId && p.subjectId === cand.course.subjectId) && cand.course.teacherId !== s.staffId) {
    throw new HomeworkProblem("Only the course's teacher issues its certificates.");
  }
  if (!cand.lessons) throw new HomeworkProblem("This course has no visible lessons yet.");
  if (!cand.ready.length) throw new HomeworkProblem("No student has finished every lesson since the last certificates.");
  const year = new Date().getUTCFullYear();
  const made = [];
  for (const st of cand.ready) {
    const n = await nextNumber(tx, s.ctx, `course-certificate:${year}`);
    const cert = await tx.courseCertificate.create({ data: { schoolId: s.ctx.schoolId, courseId, studentId: st.id, number: formatNumber(`CRS/${year}/`, n), issuedById: s.ctx.userId } });
    made.push(cert);
    if (st.userLoginId) await notify(tx, s.ctx, { to: st.userLoginId, type: "course-certificate", text: "You finished a course. Your certificate is in Study Material.", link: "/homework-learning/study-material", groupKey: "course-certificate" });
  }
  await writeAudit(tx, s.ctx, { action: "certificates-issued", recordType: "Course", recordId: courseId, after: { count: made.length, numbers: made.map((m) => m.number) } });
  return made;
}
