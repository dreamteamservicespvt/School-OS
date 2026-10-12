// Marks Entry (08 §2, rules 14 and 22): teachers enter marks for their own
// subjects and sections only; each mark is between 0 and the category's
// maximum; absent and marks cannot both be set. Submitting closes the paper
// for the teacher; after that a change needs a reason and an approval
// (moderation), and the old and new marks stay in the history.
import "server-only";

import type { MarksPaperStatus, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { requestApproval } from "../approvals";
import { formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { plural, wordList } from "../academic/common";
import { ExamRuleError, showMarks } from "./common";
import { checkMark, round2 } from "./compute";
import { categoriesOf, type Category } from "./datesheet";
import { examSettings } from "./settings";
import { sectionStudents, sitters, type RosterStudent } from "./roster";
import { bandsFor, recomputeFinal, recomputeSection, sectionInfo } from "./results";
import { teachesPaper, type ExamScope } from "./scope";

/** `medical` is medical leave (ML): absent, and the paper is left out of the total. */
export type MarkValue = { parts: Record<string, number | null>; absent: boolean; medical?: boolean; grade: string | null; remark: string | null };

/** Loads one paper (datesheet entry in one section) with everything the marks grid needs. */
export async function loadPaper(tx: Tx, ctx: SchoolContext, entryId: string, sectionId: string) {
  const entry = await tx.datesheetEntry.findFirst({ where: { id: entryId, archivedAt: null }, include: { exam: true } });
  if (!entry || entry.exam.archivedAt) return null;
  const section = await sectionInfo(tx, sectionId);
  if (section.classId !== entry.classId) return null;
  const subject = await tx.subject.findFirstOrThrow({ where: { id: entry.subjectId } });
  const students = sitters(await sectionStudents(tx, [sectionId], entry.exam.academicYearId), subject);
  const marks = await tx.marks.findMany({ where: { entryId, sectionId } });
  const paper = await tx.marksPaper.upsert({ where: { entryId_sectionId: { entryId, sectionId } }, create: { schoolId: ctx.schoolId, entryId, sectionId }, update: {} });
  const settings = await examSettings(tx, ctx);
  const scale = await bandsFor(tx, ctx, entry.exam.gradeScaleId, section.board);
  const waiting = await tx.marksModeration.findMany({ where: { entryId, status: "waiting" } });
  return {
    entry, exam: entry.exam, section, subject, students, marks, paper,
    categories: categoriesOf(entry), gradeList: settings.gradeOnlyGrades, bands: scale.bands, waiting,
  };
}

export type PaperView = NonNullable<Awaited<ReturnType<typeof loadPaper>>>;

/** Is a student's mark complete: every category, or absent, or a grade for grade-only subjects. */
export function isDone(m: { absent: boolean; total: number | null; grade: string | null } | undefined, gradeOnly: boolean) {
  if (!m) return false;
  return m.absent || (gradeOnly ? Boolean(m.grade) : m.total !== null);
}

/** Checks one student's marks; returns the problem in plain words (08 §5), or null. */
export function checkValue(student: { name: string }, v: MarkValue, cats: Category[], gradeOnly: boolean, gradeList: string[]): string | null {
  const entered = Object.values(v.parts).some((x) => x !== null && x !== undefined);
  if (v.medical && (entered || v.grade)) return `${student.name} is marked on medical leave (ML). Remove ML to enter marks.`;
  if (v.absent && (entered || v.grade)) return `${student.name} is marked absent. Remove absent to enter marks.`;
  if (gradeOnly) {
    if (v.grade && !gradeList.includes(v.grade)) return `${student.name}: choose a grade from ${wordList(gradeList)}.`;
    return null;
  }
  for (const [name, value] of Object.entries(v.parts)) {
    const cat = cats.find((c) => c.name === name);
    if (!cat) return `${student.name}: ${name} is not a mark category of this paper. Reload the page.`;
    const problem = checkMark(cat.name === "Marks" ? "This paper" : cat.name, cat.max, value);
    if (problem) return `${student.name}: ${problem}`;
  }
  if (v.remark && v.remark.length > 200) return `${student.name}: the remark can be at most 200 characters.`;
  return null;
}

function totalOf(parts: Record<string, number | null>, cats: Category[]): number | null {
  const values = cats.map((c) => parts[c.name]);
  if (values.some((x) => x === null || x === undefined)) return null;
  return round2(values.reduce((s: number, x) => s + (x as number), 0));
}

function cleanParts(parts: Record<string, number | null>, cats: Category[]) {
  const out: Record<string, number> = {};
  for (const c of cats) {
    const v = parts[c.name];
    if (v !== null && v !== undefined) out[c.name] = v;
  }
  return out;
}

const OPEN: MarksPaperStatus[] = ["NOT_STARTED", "IN_PROGRESS"];

async function guard(tx: Tx, scope: ExamScope, paper: PaperView) {
  await assertYearOpen(tx, paper.exam.academicYearId);
  if (!teachesPaper(scope, paper.section.id, paper.subject.id)) throw new ExamRuleError(`You do not teach ${paper.subject.name} in ${paper.section.label}. Ask the Exam In-charge or the Principal.`);
  if (paper.exam.status === "DRAFT") throw new ExamRuleError("Marks can be entered once the datesheet is published.");
}

/**
 * Saves marks as they are typed (autosave). Only while the paper is open;
 * after submission a change goes through moderation. Totals, grades and ranks
 * are worked out again at once (A9).
 */
export async function saveMarks(tx: Tx, ctx: SchoolContext, scope: ExamScope, input: { entryId: string; sectionId: string; rows: ({ studentId: string } & MarkValue)[] }) {
  const paper = await loadPaper(tx, ctx, input.entryId, input.sectionId);
  if (!paper) throw new ExamRuleError("This paper was not found. It may have been archived.");
  await guard(tx, scope, paper);
  if (!OPEN.includes(paper.paper.status)) throw new ExamRuleError("Marks are submitted. Request a change?");
  const changes: { student: string; before: unknown; after: unknown }[] = [];
  for (const row of input.rows) {
    const st = paper.students.find((s) => s.studentId === row.studentId);
    if (!st) throw new ExamRuleError("A student in this save is not in this paper any more. Reload the page.");
    const problem = checkValue(st, row, paper.categories, paper.subject.gradeOnly, paper.gradeList);
    if (problem) throw new ExamRuleError(problem);
    const prev = paper.marks.find((m) => m.studentId === row.studentId);
    const absent = row.absent || Boolean(row.medical);
    const parts = paper.subject.gradeOnly || absent ? {} : cleanParts(row.parts, paper.categories);
    const data = {
      parts, absent, medical: Boolean(row.medical), total: paper.subject.gradeOnly || absent ? null : totalOf(row.parts, paper.categories),
      grade: paper.subject.gradeOnly && !absent ? row.grade : null, remark: row.remark?.trim() || null, updatedById: ctx.userId,
    };
    const same = prev && JSON.stringify(prev.parts) === JSON.stringify(data.parts) && prev.absent === data.absent && prev.medical === data.medical && prev.grade === data.grade && (prev.remark ?? null) === data.remark;
    if (same) continue;
    if (prev) await tx.marks.update({ where: { id: prev.id }, data });
    else await tx.marks.create({ data: { schoolId: ctx.schoolId, entryId: input.entryId, sectionId: input.sectionId, studentId: row.studentId, enteredById: ctx.userId, ...data } });
    changes.push({ student: st.name, before: prev ? { parts: prev.parts, absent: prev.absent, medical: prev.medical, grade: prev.grade } : null, after: { parts: data.parts, absent: data.absent, medical: data.medical, grade: data.grade } });
  }
  if (changes.length) {
    if (paper.paper.status === "NOT_STARTED") await tx.marksPaper.update({ where: { id: paper.paper.id }, data: { status: "IN_PROGRESS" } });
    await writeAudit(tx, ctx, { action: "marks-entered", recordType: "Marks", recordId: paper.paper.id, after: { paper: `${paper.exam.title}, ${paper.section.label}, ${paper.subject.name}`, changes } as unknown as Prisma.InputJsonValue });
    await recomputeSection(tx, ctx, paper.exam.id, paper.section.id);
  }
  const after = await tx.marks.findMany({ where: { entryId: input.entryId, sectionId: input.sectionId } });
  const done = paper.students.filter((s) => isDone(after.find((m) => m.studentId === s.studentId), paper.subject.gradeOnly)).length;
  return { saved: changes.length, done, of: paper.students.length };
}

/** Submits a paper when every student has marks, absent or a grade. After this the teacher cannot change marks. */
export async function submitPaper(tx: Tx, ctx: SchoolContext, scope: ExamScope, entryId: string, sectionId: string) {
  const paper = await loadPaper(tx, ctx, entryId, sectionId);
  if (!paper) throw new ExamRuleError("This paper was not found.");
  await guard(tx, scope, paper);
  if (!OPEN.includes(paper.paper.status)) throw new ExamRuleError("This paper is already submitted.");
  const missing = paper.students.filter((s) => !isDone(paper.marks.find((m) => m.studentId === s.studentId), paper.subject.gradeOnly));
  if (paper.students.length === 0) throw new ExamRuleError(`No students sit ${paper.subject.name} in ${paper.section.label}.`);
  if (missing.length) {
    const names = missing.slice(0, 4).map((s) => s.name);
    throw new ExamRuleError(`Enter marks for ${plural(missing.length, "more student")} before submitting: ${wordList(names)}${missing.length > 4 ? " and others" : ""}. Tick Absent for a student who missed the paper.`);
  }
  await tx.marksPaper.update({ where: { id: paper.paper.id }, data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "marks-submitted", recordType: "Marks Paper", recordId: paper.paper.id, before: { status: paper.paper.status }, after: { status: "SUBMITTED", paper: `${paper.exam.title}, ${paper.section.label}, ${paper.subject.name}`, students: paper.students.length } });
  await recomputeSection(tx, ctx, paper.exam.id, paper.section.id);
  return paper;
}

/** Sends a submitted (not locked) paper back to the teacher, with a reason. Full reach only. */
export async function reopenPaper(tx: Tx, ctx: SchoolContext, scope: ExamScope, entryId: string, sectionId: string, reason: string) {
  if (!scope.manage) throw new ExamRuleError("Only the Exam In-charge or the Principal can send marks back.");
  if (reason.trim().length < 5) throw new ExamRuleError("Give a reason of at least 5 characters, so the teacher knows what to fix.", "reason");
  const paper = await loadPaper(tx, ctx, entryId, sectionId);
  if (!paper) throw new ExamRuleError("This paper was not found.");
  await assertYearOpen(tx, paper.exam.academicYearId);
  if (paper.paper.status !== "SUBMITTED") throw new ExamRuleError(paper.paper.status === "LOCKED" ? "This paper is locked. A change now needs a moderation request with approval." : "This paper is not submitted.");
  await tx.marksPaper.update({ where: { id: paper.paper.id }, data: { status: "IN_PROGRESS", submittedAt: null, submittedById: null } });
  const teachers = await tx.teacherAllocation.findMany({ where: { sectionId, subjectId: paper.subject.id, archivedAt: null }, select: { staffId: true } });
  const logins = await tx.staff.findMany({ where: { id: { in: teachers.map((t) => t.staffId) }, userLoginId: { not: null } }, select: { userLoginId: true } });
  for (const l of logins) {
    await notify(tx, ctx, { to: l.userLoginId!, type: "marks-returned", text: `${paper.subject.name} marks for ${paper.section.label} (${paper.exam.title}) were sent back to you: ${reason.trim()}`, link: `/examination-results/marks/${entryId}/${sectionId}` });
  }
  await writeAudit(tx, ctx, { action: "marks-returned", recordType: "Marks Paper", recordId: paper.paper.id, before: { status: "SUBMITTED" }, after: { status: "IN_PROGRESS", reason: reason.trim() } });
  return paper;
}

/** Locks submitted papers of an exam (Exam In-charge or Principal). Returns how many were locked and how many are still open. */
export async function lockPapers(tx: Tx, ctx: SchoolContext, scope: ExamScope, examId: string, sectionIds: string[] | null) {
  if (!scope.manage) throw new ExamRuleError("Only the Exam In-charge or the Principal can lock marks.");
  const exam = await tx.exam.findFirst({ where: { id: examId, archivedAt: null } });
  if (!exam) throw new ExamRuleError("This exam was not found.");
  await assertYearOpen(tx, exam.academicYearId);
  const entries = await tx.datesheetEntry.findMany({ where: { examId, archivedAt: null }, select: { id: true } });
  const where = { entryId: { in: entries.map((e) => e.id) }, ...(sectionIds ? { sectionId: { in: sectionIds } } : {}) };
  const locked = await tx.marksPaper.updateMany({ where: { ...where, status: "SUBMITTED" }, data: { status: "LOCKED", lockedAt: new Date(), lockedById: ctx.userId } });
  const open = await tx.marksPaper.count({ where: { ...where, status: { in: OPEN } } });
  await writeAudit(tx, ctx, { action: "marks-locked", recordType: "Exam", recordId: examId, after: { papersLocked: locked.count, stillOpen: open } });
  return { locked: locked.count, open };
}

/**
 * Asks for a change after submission or lock (moderation, rule 14): a reason,
 * an approval, and the old value kept. Nothing changes until it is approved.
 */
export async function requestModeration(tx: Tx, ctx: SchoolContext, scope: ExamScope, input: { entryId: string; sectionId: string; studentId: string; value: MarkValue; reason: string }) {
  const paper = await loadPaper(tx, ctx, input.entryId, input.sectionId);
  if (!paper) throw new ExamRuleError("This paper was not found.");
  await assertYearOpen(tx, paper.exam.academicYearId);
  if (!teachesPaper(scope, paper.section.id, paper.subject.id)) throw new ExamRuleError(`You do not teach ${paper.subject.name} in ${paper.section.label}. Ask the Exam In-charge or the Principal.`);
  if (OPEN.includes(paper.paper.status)) throw new ExamRuleError("This paper is still open. Change the marks in the grid.");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new ExamRuleError("Give a reason of at least 5 characters, such as Totalling mistake on page 3.", "reason");
  if (reason.length > 300) throw new ExamRuleError("The reason can be at most 300 characters.", "reason");
  const st = paper.students.find((s) => s.studentId === input.studentId);
  if (!st) throw new ExamRuleError("This student is not in this paper.");
  const problem = checkValue(st, input.value, paper.categories, paper.subject.gradeOnly, paper.gradeList);
  if (problem) throw new ExamRuleError(problem, "value");
  const marks = paper.marks.find((m) => m.studentId === input.studentId);
  if (!marks) throw new ExamRuleError("This student has no marks to change.");
  const absent = input.value.absent || Boolean(input.value.medical);
  const after = {
    parts: paper.subject.gradeOnly || absent ? {} : cleanParts(input.value.parts, paper.categories),
    absent, medical: Boolean(input.value.medical), grade: paper.subject.gradeOnly && !absent ? input.value.grade : null,
    total: paper.subject.gradeOnly || absent ? null : totalOf(input.value.parts, paper.categories),
  };
  if (!paper.subject.gradeOnly && !after.absent && after.total === null) throw new ExamRuleError("Enter every mark category for the new marks.", "value");
  if (paper.subject.gradeOnly && !after.absent && !after.grade) throw new ExamRuleError("Choose the new grade.", "value");
  const before = { parts: marks.parts, absent: marks.absent, medical: marks.medical, grade: marks.grade, total: marks.total };
  if (JSON.stringify(before.parts) === JSON.stringify(after.parts) && before.absent === after.absent && before.medical === after.medical && before.grade === after.grade) throw new ExamRuleError("The new marks are the same as the old ones.", "value");
  const waiting = await tx.marksModeration.findFirst({ where: { marksId: marks.id, status: "waiting" } });
  if (waiting) throw new ExamRuleError(`A change for ${st.name} is already waiting for approval.`);
  const mod = await tx.marksModeration.create({
    data: { schoolId: ctx.schoolId, marksId: marks.id, entryId: input.entryId, studentId: input.studentId, before: before as unknown as Prisma.InputJsonValue, after: after as unknown as Prisma.InputJsonValue, reason, requestedById: ctx.userId! },
  });
  const words = (v: { absent: boolean; medical?: boolean; grade: string | null; total: number | null }) => (v.medical ? "medical leave" : v.absent ? "absent" : paper.subject.gradeOnly ? v.grade ?? "no grade" : showMarks(v.total));
  const approval = await requestApproval(tx, ctx, {
    type: "marks-moderation", recordType: "Marks Moderation", recordId: mod.id,
    summary: `${st.name}, ${paper.section.label}: ${paper.subject.name} (${paper.exam.title}) from ${words(before)} to ${words(after)}`,
    reason,
  });
  await tx.marksModeration.update({ where: { id: mod.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "marks-change-asked", recordType: "Marks", recordId: marks.id, before: before as unknown as Prisma.InputJsonValue, after: { ...after, reason } as unknown as Prisma.InputJsonValue });
  return { moderation: mod, approval };
}

/** What happens when a moderation is decided (Approvals). Approved: the new marks apply, the old ones stay in the history, results are worked out again. */
export async function decideModeration(tx: Tx, ctx: SchoolContext, moderationId: string, decision: "approve" | "reject" | "ask-change" | "withdraw", approvalId: string) {
  const mod = await tx.marksModeration.findFirst({ where: { id: moderationId } });
  if (!mod || mod.status !== "waiting") return;
  const now = new Date();
  if (decision !== "approve") {
    await tx.marksModeration.update({ where: { id: mod.id }, data: { status: decision === "withdraw" ? "withdrawn" : "rejected", decidedById: ctx.userId, decidedAt: now } });
    return;
  }
  const marks = await tx.marks.findFirstOrThrow({ where: { id: mod.marksId } });
  const after = mod.after as { parts: Record<string, number>; absent: boolean; medical?: boolean; grade: string | null; total: number | null };
  const history = [...((marks.history as unknown[]) ?? []), { at: now.toISOString(), by: mod.requestedById, approvedBy: ctx.userId, before: mod.before, after: mod.after, reason: mod.reason, approvalId }];
  await tx.marks.update({ where: { id: marks.id }, data: { parts: after.parts, absent: after.absent, medical: Boolean(after.medical), grade: after.grade, total: after.total, updatedById: mod.requestedById, history: history as unknown as Prisma.InputJsonValue } });
  await tx.marksModeration.update({ where: { id: mod.id }, data: { status: "approved", decidedById: ctx.userId, decidedAt: now } });
  await writeAudit(tx, ctx, { action: "marks-changed-after-lock", recordType: "Marks", recordId: marks.id, before: mod.before as Prisma.InputJsonValue, after: { ...(mod.after as object), reason: mod.reason, approvalId } as unknown as Prisma.InputJsonValue });
  const entry = await tx.datesheetEntry.findFirstOrThrow({ where: { id: mod.entryId } });
  await recomputeSection(tx, ctx, entry.examId, marks.sectionId, { includePublished: true });
  const exam = await tx.exam.findFirstOrThrow({ where: { id: entry.examId } });
  await recomputeFinal(tx, ctx, exam.academicYearId, marks.sectionId, { includePublished: true });
}

// ---------- Lists ----------

export type PaperRow = {
  entryId: string; sectionId: string; examId: string; examTitle: string; sectionLabel: string; subjectName: string; date: Date; due: Date | null;
  status: MarksPaperStatus; done: number; of: number; gradeOnly: boolean; waiting: number;
};

/** The papers a person enters marks for (their own allocations), or every paper for full reach. */
export async function papersFor(tx: Tx, ctx: SchoolContext, scope: ExamScope, yearId: string, f: { examId?: string; status?: string; q?: string }) {
  const exams = await tx.exam.findMany({ where: { academicYearId: yearId, archivedAt: null, status: { not: "DRAFT" }, ...(f.examId ? { id: f.examId } : {}) }, include: { entries: { where: { archivedAt: null } } }, orderBy: { startDate: "desc" } });
  const sections = await tx.section.findMany({ where: { academicYearId: yearId, archivedAt: null }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] });
  const subjectIds = [...new Set(exams.flatMap((e) => e.entries.map((x) => x.subjectId)))];
  const subjects = await tx.subject.findMany({ where: { id: { in: subjectIds } } });
  const pairs: { exam: (typeof exams)[number]; entry: (typeof exams)[number]["entries"][number]; section: (typeof sections)[number] }[] = [];
  for (const exam of exams) for (const entry of exam.entries) for (const section of sections.filter((s) => s.classId === entry.classId)) {
    if (!teachesPaper(scope, section.id, entry.subjectId)) continue;
    pairs.push({ exam, entry, section });
  }
  if (pairs.length === 0) return [];
  const [papers, marks, roster, waiting] = await Promise.all([
    tx.marksPaper.findMany({ where: { entryId: { in: pairs.map((p) => p.entry.id) } } }),
    tx.marks.findMany({ where: { entryId: { in: pairs.map((p) => p.entry.id) } }, select: { entryId: true, sectionId: true, studentId: true, absent: true, total: true, grade: true } }),
    sectionStudents(tx, [...new Set(pairs.map((p) => p.section.id))], yearId),
    tx.marksModeration.groupBy({ by: ["entryId"], where: { status: "waiting", entryId: { in: pairs.map((p) => p.entry.id) } }, _count: true }),
  ]);
  const rows: PaperRow[] = pairs.map(({ exam, entry, section }) => {
    const subject = subjects.find((s) => s.id === entry.subjectId)!;
    const students = sitters(roster.filter((r) => r.sectionId === section.id), subject);
    const mine = marks.filter((m) => m.entryId === entry.id && m.sectionId === section.id);
    const done = students.filter((s: RosterStudent) => isDone(mine.find((m) => m.studentId === s.studentId), subject.gradeOnly)).length;
    return {
      entryId: entry.id, sectionId: section.id, examId: exam.id, examTitle: exam.title, sectionLabel: `${section.schoolClass.name} ${section.name}`, subjectName: subject.name,
      date: entry.date, due: entry.marksDueDate, status: papers.find((p) => p.entryId === entry.id && p.sectionId === section.id)?.status ?? "NOT_STARTED", done, of: students.length, gradeOnly: subject.gradeOnly,
      waiting: waiting.find((w) => w.entryId === entry.id)?._count ?? 0,
    };
  });
  const q = f.q?.toLowerCase();
  return rows
    .filter((r) => (!f.status || r.status === f.status) && (!q || `${r.subjectName} ${r.sectionLabel} ${r.examTitle}`.toLowerCase().includes(q)))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true }));
}

/** Moderation requests with the old and new marks, for the moderation report (08 §7). */
export async function moderationList(tx: Tx, f: { examId?: string; status?: string; yearId?: string }) {
  const entryFilter = f.examId || f.yearId ? { entryId: { in: (await tx.datesheetEntry.findMany({ where: { ...(f.examId ? { examId: f.examId } : {}), ...(f.yearId ? { exam: { academicYearId: f.yearId } } : {}) }, select: { id: true } })).map((e) => e.id) } } : {};
  const rows = await tx.marksModeration.findMany({ where: { ...(f.status ? { status: f.status } : {}), ...entryFilter }, orderBy: { createdAt: "desc" }, take: 500 });
  const entries = await tx.datesheetEntry.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.entryId))] } }, include: { exam: { select: { title: true } } } });
  const [subjects, students, people, marks] = await Promise.all([
    tx.subject.findMany({ where: { id: { in: entries.map((e) => e.subjectId) } }, select: { id: true, name: true, gradeOnly: true } }),
    tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } }),
    tx.userLogin.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById].filter((x): x is string => Boolean(x))))] } }, select: { id: true, displayName: true } }),
    tx.marks.findMany({ where: { id: { in: rows.map((r) => r.marksId) } }, select: { id: true, sectionId: true } }),
  ]);
  const sections = await tx.section.findMany({ where: { id: { in: marks.map((m) => m.sectionId) } }, include: { schoolClass: true } });
  const words = (v: unknown, gradeOnly: boolean) => {
    const x = v as { absent?: boolean; grade?: string | null; total?: number | null };
    return x.absent ? "Absent" : gradeOnly ? x.grade ?? "" : showMarks(x.total ?? null);
  };
  return rows.map((r) => {
    const e = entries.find((x) => x.id === r.entryId);
    const subj = subjects.find((s) => s.id === e?.subjectId);
    const sec = sections.find((s) => s.id === marks.find((m) => m.id === r.marksId)?.sectionId);
    return {
      id: r.id, approvalId: r.approvalId, exam: e?.exam.title ?? "", subject: subj?.name ?? "", section: sec ? `${sec.schoolClass.name} ${sec.name}` : "",
      student: students.find((s) => s.id === r.studentId)?.fullName ?? "", admissionNo: students.find((s) => s.id === r.studentId)?.admissionNo ?? "",
      oldMarks: words(r.before, Boolean(subj?.gradeOnly)), newMarks: words(r.after, Boolean(subj?.gradeOnly)), reason: r.reason, status: r.status,
      askedBy: people.find((p) => p.id === r.requestedById)?.displayName ?? "", decidedBy: people.find((p) => p.id === r.decidedById)?.displayName ?? "",
      askedOn: r.createdAt, decidedOn: r.decidedAt,
    };
  });
}

export function dueWords(due: Date | null, tz: string) {
  return due ? `Marks due ${formatDate(due, tz)}` : "";
}
