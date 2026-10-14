// Submissions & Grading (17 §2): students hand in work online (late after the
// due date and grace time), teachers mark it Complete or Incorrect with a
// score out of the homework's own maximum, a grade and feedback; bulk
// "Mark Complete" with a preview and Undo; hand in again when allowed; the
// discussion thread between teacher and student; and Missing after the due date.
import "server-only";

import type { Submission } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { saveFile, DOCUMENT_TYPES, FileProblem } from "../files";
import { formatDate } from "../format";
import { HomeworkProblem } from "./access";
import { requireStaff, requireWork, type HomeworkScope } from "./scope";
import { homeworkSettings, lateAfter } from "./settings";
import { gradeFor, isPastDue, plural, scoreProblem } from "./words";
import { tellParentsPending } from "./notify-parents";

async function homeworkFor(tx: Tx, s: HomeworkScope, homeworkId: string) {
  const hw = await tx.homework.findFirst({ where: { id: homeworkId, archivedAt: null } });
  if (!hw) throw new HomeworkProblem("This homework was not found. It may have been archived.");
  requireWork(s, hw, "the marking of this homework", "submissions");
  const year = await tx.academicYear.findUnique({ where: { id: hw.academicYearId }, select: { status: true } });
  if (year?.status === "CLOSED") throw new HomeworkProblem("This academic year is closed, so its homework can only be read.");
  return hw;
}

export type GradeInput = { result: "COMPLETE" | "INCORRECT"; score: string; grade: string; feedback: string; allowResubmit: boolean; resubmitUntil: Date | null; fromSuggestion?: boolean };

/** Marks one student's work (17 §2, Form fields: Grade). A score above the homework's own maximum is refused (rule 5). */
export async function gradeSubmission(tx: Tx, s: HomeworkScope, submissionId: string, input: GradeInput, today: Date) {
  const sub = await tx.submission.findFirst({ where: { id: submissionId, archivedAt: null } });
  if (!sub) throw new HomeworkProblem("This submission was not found.");
  const hw = await homeworkFor(tx, s, sub.homeworkId);
  const problem = scoreProblem(input.score, hw.maxMarks);
  if (problem) throw new HomeworkProblem(problem, "score");
  const score = input.score.trim() === "" ? null : Number(input.score);
  const settings = await homeworkSettings(tx, s.ctx);
  const grade = input.grade.trim() || (score !== null && settings.gradingShow !== "scores" ? gradeFor(score, hw.maxMarks, settings.gradeBands) : null);
  if (grade && grade.length > 10) throw new HomeworkProblem("A grade is at most 10 characters, like A or B+.", "grade");
  if (input.feedback.length > 2000) throw new HomeworkProblem("Feedback can be at most 2,000 characters.", "feedback");
  if (input.allowResubmit && input.resubmitUntil && input.resubmitUntil.getTime() < today.getTime()) throw new HomeworkProblem("The last day to hand in again is in the past.", "resubmitUntil");
  const before = { status: sub.status, result: sub.checkResult, score: sub.score, grade: sub.grade, feedback: sub.feedback };
  const updated = await tx.submission.update({
    where: { id: sub.id },
    data: {
      status: "GRADED", checkResult: input.result, score, grade, feedback: input.feedback.trim() || null,
      resubmitAllowed: input.allowResubmit, resubmitUntil: input.allowResubmit ? input.resubmitUntil : null,
      gradedById: s.ctx.userId, gradedAt: new Date(),
    },
  });
  const student = await tx.student.findUnique({ where: { id: sub.studentId }, select: { fullName: true, userLoginId: true } });
  await writeAudit(tx, s.ctx, {
    action: "graded", recordType: "Submission", recordId: sub.id, before,
    after: { homework: hw.title, student: student?.fullName ?? "", status: "GRADED", result: input.result, score, outOf: hw.maxMarks, grade, feedback: input.feedback.trim() || null, handInAgain: input.allowResubmit },
    actorNote: input.fromSuggestion ? "Feedback drafted by the teacher assistant, checked by the teacher" : null,
  });
  if (student?.userLoginId) {
    await notify(tx, s.ctx, { to: student.userLoginId, type: "homework-checked", text: input.allowResubmit ? `${hw.title}: your teacher asks you to hand in again.` : `${hw.title} is checked.`, link: "/homework-learning?tab=checked", groupKey: "homework-checked", mergedText: (n) => `${n} homework checked` });
  }
  return updated;
}

/** Who a bulk "Mark Complete" would change (the preview, rule 6). Only students the teacher may mark; Excused stays. */
export async function bulkPreview(tx: Tx, s: HomeworkScope, homeworkId: string, studentIds: string[]) {
  const hw = await homeworkFor(tx, s, homeworkId);
  const subs = await tx.submission.findMany({ where: { homeworkId, studentId: { in: studentIds }, archivedAt: null } });
  const change = subs.filter((x) => x.status !== "EXCUSED" && !(x.status === "GRADED" && x.checkResult === "COMPLETE"));
  return { hw, change, skipped: subs.length - change.length };
}

/**
 * Marks the chosen students Complete in one go (for work checked in class).
 * Returns the audit entry id: Undo puts each student back exactly as before.
 */
export async function bulkComplete(tx: Tx, s: HomeworkScope, homeworkId: string, studentIds: string[]) {
  if (!studentIds.length) throw new HomeworkProblem("Choose at least one student.");
  if (studentIds.length > 500) throw new HomeworkProblem("Choose at most 500 students at a time.");
  const { hw, change, skipped } = await bulkPreview(tx, s, homeworkId, studentIds);
  if (!change.length) throw new HomeworkProblem("Everyone chosen is already marked Complete.");
  const now = new Date();
  for (const x of change) {
    await tx.submission.update({ where: { id: x.id }, data: { status: "GRADED", checkResult: "COMPLETE", submittedAt: x.submittedAt ?? now, gradedById: s.ctx.userId, gradedAt: now } });
  }
  const entry = await writeAudit(tx, s.ctx, {
    action: "bulk-complete", recordType: "Homework", recordId: hw.id,
    before: change.map((x) => ({ id: x.id, status: x.status, checkResult: x.checkResult, submittedAt: x.submittedAt?.toISOString() ?? null, gradedById: x.gradedById, gradedAt: x.gradedAt?.toISOString() ?? null })),
    after: { homework: hw.title, students: change.length, skipped, status: "GRADED", result: "COMPLETE" },
  });
  return { count: change.length, skipped, undoId: entry.id, title: hw.title };
}

type BulkBefore = { id: string; status: Submission["status"]; checkResult: Submission["checkResult"]; submittedAt: string | null; gradedById: string | null; gradedAt: string | null };

/** Undo of a bulk Complete: each student back as they were, unless someone marked them again since. */
export async function undoBulkComplete(tx: Tx, s: HomeworkScope, auditId: string) {
  const entry = await tx.auditLogEntry.findFirst({ where: { id: auditId, action: "bulk-complete", recordType: "Homework" } });
  if (!entry || !entry.recordId) throw new HomeworkProblem("This change cannot be undone.");
  if (entry.userLoginId !== s.ctx.userId) throw new HomeworkProblem("Only the person who made this change can undo it.");
  await homeworkFor(tx, s, entry.recordId);
  const before = (entry.before ?? []) as BulkBefore[];
  let restored = 0;
  for (const b of before) {
    const now = await tx.submission.findFirst({ where: { id: b.id, homeworkId: entry.recordId } });
    // Someone marked this student again since: keep their marking.
    if (!now || now.status !== "GRADED" || now.checkResult !== "COMPLETE" || now.gradedById !== entry.userLoginId || (now.gradedAt && now.gradedAt.getTime() > entry.at.getTime() + 60_000)) continue;
    await tx.submission.update({ where: { id: b.id }, data: { status: b.status, checkResult: b.checkResult, submittedAt: b.submittedAt ? new Date(b.submittedAt) : null, gradedById: b.gradedById, gradedAt: b.gradedAt ? new Date(b.gradedAt) : null } });
    restored++;
  }
  await writeAudit(tx, s.ctx, { action: "undone", recordType: "Homework", recordId: entry.recordId, after: { undid: "Mark Complete", students: restored } });
  return restored;
}

/** Excuse a student from a homework (not counted as missing), or give it back. */
export async function setExcused(tx: Tx, s: HomeworkScope, submissionId: string, excused: boolean) {
  const sub = await tx.submission.findFirst({ where: { id: submissionId, archivedAt: null } });
  if (!sub) throw new HomeworkProblem("This submission was not found.");
  const hw = await homeworkFor(tx, s, sub.homeworkId);
  if (excused && sub.status === "GRADED") throw new HomeworkProblem("This work is already checked. Change its marks instead.");
  const status = excused ? "EXCUSED" : sub.submittedAt ? "SUBMITTED" : "ASSIGNED";
  await tx.submission.update({ where: { id: sub.id }, data: { status } });
  await writeAudit(tx, s.ctx, { action: excused ? "excused" : "unexcused", recordType: "Submission", recordId: sub.id, before: { status: sub.status }, after: { status, homework: hw.title } });
}

/** Accept a late hand-in as on time (rule: "Teacher can accept"). */
export async function acceptLate(tx: Tx, s: HomeworkScope, submissionId: string) {
  const sub = await tx.submission.findFirst({ where: { id: submissionId, archivedAt: null, status: "LATE" } });
  if (!sub) throw new HomeworkProblem("This hand-in is not late.");
  const hw = await homeworkFor(tx, s, sub.homeworkId);
  await tx.submission.update({ where: { id: sub.id }, data: { status: "SUBMITTED" } });
  await writeAudit(tx, s.ctx, { action: "accepted-late", recordType: "Submission", recordId: sub.id, before: { status: "LATE" }, after: { status: "SUBMITTED", homework: hw.title } });
}

// ---------------------------------------------------------------- students

/** May the student hand in (or hand in again) now? */
export function handInState(sub: Pick<Submission, "status" | "resubmitAllowed" | "resubmitUntil">, hw: { onlineSubmission: boolean; dueDate: Date }, today: Date, onlineOn: boolean) {
  if (!onlineOn || !hw.onlineSubmission) return { can: false, why: "Hand this in to your teacher in class." } as const;
  if (sub.status === "EXCUSED") return { can: false, why: "Your teacher has excused you from this homework." } as const;
  if (sub.status === "ASSIGNED" || sub.status === "MISSING") return { can: true, again: false, late: isPastDue(hw.dueDate, today) } as const;
  if (sub.resubmitAllowed && (!sub.resubmitUntil || sub.resubmitUntil.getTime() >= today.getTime())) return { can: true, again: true, late: false } as const;
  return { can: false, why: sub.status === "GRADED" ? "Your teacher has checked this work." : "You have handed this in." } as const;
}

/** A student hands in work online: photos or PDFs and a note. After the due time it is marked Late (17 §2). */
export async function submitWork(tx: Tx, s: HomeworkScope, homeworkId: string, input: { files: File[]; note: string }, now: Date, today: Date, timeZone: string) {
  if (s.level !== "student" || !s.student) throw new HomeworkProblem("Only students hand in homework online.");
  const hw = await tx.homework.findFirst({ where: { id: homeworkId, archivedAt: null } });
  const sub = hw ? await tx.submission.findFirst({ where: { homeworkId, studentId: s.student.id, archivedAt: null } }) : null;
  if (!hw || !sub) throw new HomeworkProblem("This homework was not found.");
  const settings = await homeworkSettings(tx, s.ctx);
  const state = handInState(sub, hw, today, settings.onlineSubmission);
  if (!state.can) throw new HomeworkProblem(state.why);
  const files = input.files.filter((f) => f && f.size > 0);
  const note = input.note.trim();
  if (!files.length && !note) throw new HomeworkProblem("Add a photo of your work, a PDF, or type your answer.", "files");
  if (files.length > 10) throw new HomeworkProblem("Hand in at most 10 files.", "files");
  if (note.length > 4000) throw new HomeworkProblem("Your answer can be at most 4,000 characters.", "note");
  const max = settings.maxFileMb * 1024 * 1024;
  const ids: string[] = [];
  for (const f of files) {
    if (f.size > max) throw new HomeworkProblem(`${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB. Files can be at most ${settings.maxFileMb} MB.`, "files");
    try {
      const stored = await saveFile(tx, s.ctx, { file: f, purpose: "homework-submission", allowed: DOCUMENT_TYPES, maxImageWidth: 1800 });
      ids.push(stored.id);
    } catch (e) {
      if (e instanceof FileProblem) throw new HomeworkProblem(e.message, "files");
      throw e;
    }
  }
  const late = now.getTime() > lateAfter(hw.dueDate, timeZone, settings.graceMinutes).getTime();
  const status = late ? "LATE" : "SUBMITTED";
  await tx.submission.update({
    where: { id: sub.id },
    data: { status, submittedAt: now, note: note || null, fileIds: ids, handIns: { increment: 1 }, resubmitAllowed: false, resubmitUntil: null, ...(state.again ? { checkResult: null, score: null, grade: null } : {}) },
  });
  await writeAudit(tx, s.ctx, { action: state.again ? "handed-in-again" : "handed-in", recordType: "Submission", recordId: sub.id, before: { status: sub.status }, after: { homework: hw.title, status, files: ids.length, late } });
  // The teacher hears about work to check (17 §4, Notifications).
  if (hw.teacherId) {
    const teacher = await tx.staff.findUnique({ where: { id: hw.teacherId }, select: { userLoginId: true } });
    if (teacher?.userLoginId) await notify(tx, s.ctx, { to: teacher.userLoginId, type: "homework-handed-in", text: `${s.student.name} handed in ${hw.title}${late ? " (late)" : ""}.`, link: `/homework-learning/submissions?hw=${hw.id}`, groupKey: `homework-handed-in:${hw.id}`, mergedText: (n) => `${n} students handed in ${hw.title}` });
  }
  return { status, late, files: ids.length };
}

// ---------------------------------------------------------------- discussion thread

export async function addComment(tx: Tx, s: HomeworkScope, submissionId: string, body: string) {
  const text = body.trim();
  if (!text) throw new HomeworkProblem("Type a comment.", "body");
  if (text.length > 1000) throw new HomeworkProblem("A comment can be at most 1,000 characters.", "body");
  const settings = await homeworkSettings(tx, s.ctx);
  if (!settings.discussionOn) throw new HomeworkProblem("Comments on homework are switched off in Homework Settings.");
  const sub = await tx.submission.findFirst({ where: { id: submissionId, archivedAt: null } });
  if (!sub) throw new HomeworkProblem("This submission was not found.");
  const hw = await tx.homework.findFirst({ where: { id: sub.homeworkId, archivedAt: null } });
  if (!hw) throw new HomeworkProblem("This homework was not found.");
  const fromStudent = s.level === "student";
  if (fromStudent) {
    if (s.student?.id !== sub.studentId) throw new HomeworkProblem("You can comment only on your own work.");
  } else requireWork(s, hw, "comments on this homework", "submissions");
  const c = await tx.homeworkComment.create({ data: { schoolId: s.ctx.schoolId, homeworkId: hw.id, studentId: sub.studentId, authorId: s.ctx.userId, authorName: s.name, fromStudent, body: text } });
  await writeAudit(tx, s.ctx, { action: "commented", recordType: "Homework Comment", recordId: c.id, after: { homework: hw.title, fromStudent } });
  // Tell the other side.
  if (fromStudent && hw.teacherId) {
    const t = await tx.staff.findUnique({ where: { id: hw.teacherId }, select: { userLoginId: true } });
    if (t?.userLoginId) await notify(tx, s.ctx, { to: t.userLoginId, type: "homework-comment", text: `${s.name} commented on ${hw.title}.`, link: `/homework-learning/submissions?hw=${hw.id}&open=${sub.id}`, groupKey: `homework-comment:${hw.id}` });
  } else if (!fromStudent) {
    const st = await tx.student.findUnique({ where: { id: sub.studentId }, select: { userLoginId: true } });
    if (st?.userLoginId) await notify(tx, s.ctx, { to: st.userLoginId, type: "homework-comment", text: `Your teacher commented on ${hw.title}.`, link: `/homework-learning?open=${hw.id}`, groupKey: `homework-comment:${hw.id}` });
  }
  return c;
}

/** Hide a comment with a reason (nothing is deleted); only the teacher of the homework or Full reach. */
export async function hideComment(tx: Tx, s: HomeworkScope, commentId: string, reason: string, hide: boolean) {
  requireStaff(s);
  const c = await tx.homeworkComment.findFirst({ where: { id: commentId } });
  if (!c) throw new HomeworkProblem("This comment was not found.");
  const hw = await tx.homework.findFirst({ where: { id: c.homeworkId } });
  if (!hw) throw new HomeworkProblem("This homework was not found.");
  requireWork(s, hw, "comments on this homework", "submissions");
  if (hide && !reason.trim()) throw new HomeworkProblem("Say why it is hidden, so the student understands.", "reason");
  await tx.homeworkComment.update({ where: { id: c.id }, data: hide ? { hiddenAt: new Date(), hiddenReason: reason.trim().slice(0, 200) } : { hiddenAt: null, hiddenReason: null } });
  await writeAudit(tx, s.ctx, { action: hide ? "hidden" : "unhidden", recordType: "Homework Comment", recordId: c.id, after: { reason: hide ? reason.trim() : null } });
}

// ---------------------------------------------------------------- missing

/**
 * After the due date: work not handed in becomes Missing, and parents get the
 * pending-homework message once (17 §2, Done when 7). Runs from the daily job;
 * safe to run again.
 */
export async function markMissing(tx: Tx, ctx: SchoolContext, today: Date) {
  const settings = await homeworkSettings(tx, ctx);
  const due = await tx.homework.findMany({ where: { archivedAt: null, missingMarkedAt: null, dueDate: { lt: today }, closedAt: null }, take: 500 });
  let students = 0;
  for (const hw of due) {
    const open = await tx.submission.findMany({ where: { homeworkId: hw.id, archivedAt: null, status: "ASSIGNED" }, select: { id: true, studentId: true } });
    if (settings.missingOn && open.length) {
      await tx.submission.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status: "MISSING" } });
      students += open.length;
    }
    await tx.homework.update({ where: { id: hw.id }, data: { missingMarkedAt: new Date() } });
    if (open.length) {
      await writeAudit(tx, ctx, { action: "marked-missing", recordType: "Homework", recordId: hw.id, after: { homework: hw.title, students: open.length, due: formatDate(hw.dueDate, "UTC") }, actorNote: "Marked by School OS after the due date" });
      await tellParentsPending(tx, ctx, hw, open.map((o) => o.studentId));
    }
  }
  return { homework: due.length, students, words: plural(students, "student") };
}
