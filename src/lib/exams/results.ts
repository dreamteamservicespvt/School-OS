// Results (08 §2, automation A9): worked out as soon as marks are saved,
// using the grade scale, the pass rules and the tie rule. Drafts with missing
// marks cannot be published (rule 16). Publishing (now or on a set date)
// keeps a copy of the grade bands, so a later scale change never alters a
// published result (rule 15); report cards become ready and parents are told.
//
// A section's results are those of the students on its roll: a student's
// marks and draft results follow them when they change section, and a result
// already published stays with the section it was published in (its rank and
// values are history) while showing in the new section too (G23). A student who
// joined after an exam's marks were in is "Joined after this exam": left out
// of it, never blocking anyone's publishing, until late marks (with approval,
// Exam Settings) complete their result.
import "server-only";

import type { Prisma, Result } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate, formatDateTime } from "../format";
import { assertYearOpen } from "../academic/years";
import { plural, wordList } from "../academic/common";
import { ExamRuleError, examKey, finalKey } from "./common";
import { examResult, finalResult, isDone, rankWithTies, type ExamResult, type PaperInput, type SubjectResult } from "./compute";
import { readBands, type Band } from "./grades";
import { examSettings, scaleFor } from "./settings";
import { sectionStudents, sitters } from "./roster";
import { messageParents } from "./notify-parents";
import { refreshReportCards } from "./report-status";
import type { ExamScope } from "./scope";

async function boardsOn(tx: Tx, ctx: SchoolContext) {
  const f = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: "exam-boards" } } });
  return Boolean(f?.isOn);
}

export async function sectionInfo(tx: Tx, sectionId: string) {
  const s = await tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: true } });
  if (!s) throw new ExamRuleError("This section was not found.");
  return { id: s.id, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, board: s.schoolClass.board, academicYearId: s.academicYearId, classTeacherId: s.classTeacherId };
}

/** The bands a class uses for an exam (the exam's scale, the board's, or the school's). */
export async function bandsFor(tx: Tx, ctx: SchoolContext, examScaleId: string | null, board: string | null) {
  const on = await boardsOn(tx, ctx);
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { board: true } });
  return scaleFor(tx, ctx, { examScaleId, board: board ?? school?.board ?? null, boardsOn: on });
}

/** The papers of an exam for a class, with subjects, in date order. */
async function papersOf(tx: Tx, examId: string, classId: string) {
  const entries = await tx.datesheetEntry.findMany({ where: { examId, classId, archivedAt: null }, orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  const subjects = await tx.subject.findMany({ where: { id: { in: entries.map((e) => e.subjectId) } } });
  return entries.map((e) => ({ entry: e, subject: subjects.find((s) => s.id === e.subjectId)! })).filter((p) => p.subject);
}

function storedResult(r: Result): ExamResult {
  return {
    total: r.total, maxTotal: r.maxTotal, percent: r.percent, grade: r.grade, points: r.points,
    outcome: (r.outcome as ExamResult["outcome"]) ?? null, complete: r.complete, missing: r.missing, absentPapers: r.absentPapers,
    subjects: (Array.isArray(r.subjects) ? r.subjects : []) as unknown as SubjectResult[], leftOut: r.leftOut,
  };
}

type Computed = { studentId: string; result: ExamResult; keep: boolean };

/**
 * Saves worked-out results. Rows marked `keep` (published, and not being
 * worked out again after an approved change) are only used to place the
 * others in the ranking; they are never changed. Students left out of the
 * exam get no rank.
 */
async function saveResults(
  tx: Tx, ctx: SchoolContext,
  base: { yearId: string; examId: string | null; key: string; classId: string; sectionId: string },
  computed: Computed[],
  ranksOn: boolean, tieRule: string,
) {
  const ranks = ranksOn ? rankWithTies(computed.filter((c) => !c.result.leftOut).map((c) => ({ id: c.studentId, percent: c.result.percent, total: c.result.total, complete: c.result.complete })), tieRule) : new Map<string, number>();
  const todo = computed.filter((c) => !c.keep);
  if (!todo.length) return;
  const now = new Date();
  const rows = todo.map((c) => {
    const r = c.result;
    return {
      studentId: c.studentId,
      data: {
        total: r.total, maxTotal: r.maxTotal, percent: r.percent, grade: r.grade, points: r.points, rank: r.leftOut ? null : ranks.get(c.studentId) ?? null,
        outcome: r.outcome, complete: r.complete, missing: r.missing, absentPapers: r.absentPapers, leftOut: Boolean(r.leftOut),
        subjects: r.subjects as unknown as Prisma.InputJsonValue, computedAt: now, classId: base.classId, sectionId: base.sectionId,
      },
    };
  });
  // New results in one write and changed ones in one more (G37: one query per student made a whole school's
  // results run past the 15 second limit of the background job that publishes them).
  const have = new Set((await tx.result.findMany({ where: { key: base.key, studentId: { in: rows.map((r) => r.studentId) } }, select: { studentId: true } })).map((r) => r.studentId));
  const fresh = rows.filter((r) => !have.has(r.studentId));
  if (fresh.length) {
    await tx.result.createMany({ data: fresh.map((r) => ({ schoolId: ctx.schoolId, academicYearId: base.yearId, examId: base.examId, key: base.key, studentId: r.studentId, ...r.data })) });
  }
  const changed = rows.filter((r) => have.has(r.studentId)).map((r) => ({
    student_id: r.studentId, total: r.data.total, max_total: r.data.maxTotal, percent: r.data.percent, grade: r.data.grade, points: r.data.points, rank: r.data.rank,
    outcome: r.data.outcome, complete: r.data.complete, missing: r.data.missing, absent_papers: r.data.absentPapers, left_out: r.data.leftOut, subjects: r.data.subjects,
  }));
  if (changed.length) {
    await tx.$executeRaw`
      UPDATE result AS t SET total = v.total, max_total = v.max_total, percent = v.percent, grade = v.grade, points = v.points, rank = v.rank,
        outcome = v.outcome, complete = v.complete, missing = v.missing, absent_papers = v.absent_papers, left_out = v.left_out, subjects = v.subjects,
        computed_at = (${now}::timestamptz AT TIME ZONE 'UTC'), class_id = ${base.classId}::uuid, section_id = ${base.sectionId}::uuid,
        updated_at = (${now}::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(${JSON.stringify(changed)}::jsonb) AS v(student_id uuid, total float8, max_total float8, percent float8, grade text, points float8, rank int, outcome text, complete boolean, missing int, absent_papers int, left_out boolean, subjects jsonb)
      WHERE t.school_id = ${ctx.schoolId}::uuid AND t.key = ${base.key} AND t.student_id = v.student_id`;
  }
}

/**
 * The results of a key for the students on a section's roll, wherever they
 * were worked out. A draft of a student who has since moved into this section
 * (same class) is brought along; a published one stays with the section it was
 * published in, as history, and is only read here (G23).
 */
export async function rosterResults(tx: Tx, key: string, section: { id: string; classId: string }, studentIds: string[]) {
  if (studentIds.length === 0) return [];
  const rows = await tx.result.findMany({ where: { key, studentId: { in: studentIds } } });
  const moved = rows.filter((r) => r.status === "DRAFT" && r.sectionId !== section.id && r.classId === section.classId);
  if (moved.length) {
    await tx.result.updateMany({ where: { id: { in: moved.map((r) => r.id) } }, data: { sectionId: section.id } });
    for (const r of moved) r.sectionId = section.id;
  }
  return rows;
}

const CLOSED = new Set(["SUBMITTED", "LOCKED"]);

/**
 * Works out every student's result for one exam in one section (A9). Published
 * results are left as they are, unless a moderation was approved; then they
 * are worked out again with the bands they were published with.
 *
 * A student with no marks at all in papers whose marks were already submitted
 * (or published) joined after this exam: their result is "Joined after this
 * exam" (left out). It stays so until late marks complete it.
 */
export async function recomputeSection(tx: Tx, ctx: SchoolContext, examId: string, sectionId: string, opts: { includePublished?: boolean; final?: boolean } = {}) {
  const exam = await tx.exam.findFirst({ where: { id: examId } });
  if (!exam) return;
  const section = await sectionInfo(tx, sectionId);
  const students = await sectionStudents(tx, [sectionId], exam.academicYearId);
  const ids = students.map((s) => s.studentId);
  const key = examKey(examId);
  const existing = await rosterResults(tx, key, section, ids);
  const allPublished = students.length > 0 && students.every((st) => existing.some((r) => r.studentId === st.studentId && r.status === "PUBLISHED"));
  if (allPublished && !opts.includePublished) {
    if (opts.final !== false) await recomputeFinal(tx, ctx, exam.academicYearId, sectionId);
    return;
  }
  const settings = await examSettings(tx, ctx);
  const papers = await papersOf(tx, examId, section.classId);
  const scale = await bandsFor(tx, ctx, exam.gradeScaleId, section.board);
  const entryIds = papers.map((p) => p.entry.id);
  const [marks, paperRows] = await Promise.all([
    tx.marks.findMany({ where: { entryId: { in: entryIds }, studentId: { in: ids } } }),
    tx.marksPaper.findMany({ where: { entryId: { in: entryIds }, sectionId }, select: { entryId: true, status: true } }),
  ]);
  const closed = new Set(paperRows.filter((p) => CLOSED.has(p.status)).map((p) => p.entryId));
  // Once the section's results are published, every paper's marks were in, whatever its status says.
  if (existing.some((r) => r.status === "PUBLISHED" && r.sectionId === sectionId)) for (const id of entryIds) closed.add(id);
  const takers = new Map(papers.map((p) => [p.entry.id, new Set(sitters(students, p.subject).map((s) => s.studentId))]));
  const computed: Computed[] = students.map((st) => {
    const prior = existing.find((r) => r.studentId === st.studentId);
    if (prior?.status === "PUBLISHED" && !opts.includePublished) return { studentId: st.studentId, result: storedResult(prior), keep: true };
    const bands: Band[] = prior?.status === "PUBLISHED" && prior.scale ? readBands(prior.scale) : scale.bands;
    const sits = papers.filter((p) => takers.get(p.entry.id)?.has(st.studentId));
    const markOf = (entryId: string) => marks.find((x) => x.entryId === entryId && x.studentId === st.studentId);
    const inputs: PaperInput[] = sits.map((p) => {
      const m = markOf(p.entry.id);
      return {
        subjectId: p.subject.id, name: p.subject.name, max: p.subject.gradeOnly ? 0 : p.entry.maxMarks, gradeOnly: p.subject.gradeOnly,
        marks: m ? { total: m.total, absent: m.absent, medical: m.medical, grade: m.grade, parts: (m.parts ?? {}) as Record<string, number> } : null,
      };
    });
    const result = examResult(inputs, bands, settings.rules);
    const joinedLate = sits.length > 0 && sits.every((p) => closed.has(p.entry.id)) && !sits.some((p) => isDone(markOf(p.entry.id), p.subject.gradeOnly));
    const leftOut = !result.complete && (joinedLate || Boolean(prior?.leftOut));
    return { studentId: st.studentId, result: leftOut ? { ...result, outcome: null, leftOut } : result, keep: false };
  });
  await saveResults(tx, ctx, { yearId: exam.academicYearId, examId, key, classId: section.classId, sectionId }, computed, settings.ranksOn, settings.tieRule);
  if (opts.final !== false) await recomputeFinal(tx, ctx, exam.academicYearId, sectionId);
}

/** The year's exams for a class that count in the final result, with their weights. */
export async function finalExams(tx: Tx, ctx: SchoolContext, yearId: string, classId: string) {
  const settings = await examSettings(tx, ctx);
  const exams = await tx.exam.findMany({ where: { academicYearId: yearId, archivedAt: null, classIds: { has: classId }, status: { not: "DRAFT" } }, orderBy: { startDate: "asc" } });
  const weightOf = (typeId: string) => settings.finalWeights.find((w) => w.examTypeId === typeId)?.weight ?? 0;
  const anyWeight = exams.some((e) => weightOf(e.examTypeId) > 0);
  return exams.map((e) => ({ id: e.id, title: e.title, examTypeId: e.examTypeId, weight: weightOf(e.examTypeId), counts: anyWeight ? weightOf(e.examTypeId) > 0 : true }));
}

/**
 * The final result across the year's exams for one section. Published final
 * results are kept unless an approved change needs them worked out again.
 * Every student on the roll first gets a result for each exam that counts, so
 * a student who joined after an exam is "Joined after this exam" in it rather
 * than missing; the school's rule then leaves that exam out or counts it as 0%.
 */
export async function recomputeFinal(tx: Tx, ctx: SchoolContext, yearId: string, sectionId: string, opts: { includePublished?: boolean } = {}) {
  const section = await sectionInfo(tx, sectionId);
  const key = finalKey(yearId);
  const students = await sectionStudents(tx, [sectionId], yearId);
  const ids = students.map((s) => s.studentId);
  const existing = await rosterResults(tx, key, section, ids);
  const allPublished = students.length > 0 && students.every((st) => existing.some((r) => r.studentId === st.studentId && r.status === "PUBLISHED"));
  if (allPublished && !opts.includePublished) return;
  const exams = await finalExams(tx, ctx, yearId, section.classId);
  if (exams.length === 0) return;
  const keys = exams.map((e) => examKey(e.id));
  let results = await tx.result.findMany({ where: { key: { in: keys }, studentId: { in: ids } } });
  const gaps = exams.filter((e) => ids.some((id) => !results.some((r) => r.key === examKey(e.id) && r.studentId === id)));
  if (gaps.length) {
    for (const e of gaps) await recomputeSection(tx, ctx, e.id, sectionId, { final: false });
    results = await tx.result.findMany({ where: { key: { in: keys }, studentId: { in: ids } } });
  }
  const settings = await examSettings(tx, ctx);
  const scale = await bandsFor(tx, ctx, null, section.board);
  const computed: Computed[] = students.map((st) => {
    const prior = existing.find((r) => r.studentId === st.studentId);
    if (prior?.status === "PUBLISHED" && !opts.includePublished) return { studentId: st.studentId, result: storedResult(prior), keep: true };
    const bands = prior?.status === "PUBLISHED" && prior.scale ? readBands(prior.scale) : scale.bands;
    const inputs = exams.map((e) => {
      const r = results.find((x) => x.key === examKey(e.id) && x.studentId === st.studentId);
      return { examId: e.id, weight: e.counts ? (e.weight || 1) : 0, result: r ? storedResult(r) : null };
    });
    return { studentId: st.studentId, result: finalResult(inputs, bands, settings.rules), keep: false };
  });
  await saveResults(tx, ctx, { yearId, examId: null, key, classId: section.classId, sectionId }, computed, settings.ranksOn, settings.tieRule);
}

/** Works out again every draft result of open years, e.g. after a grade scale or a pass rule changes. Published ones stay. */
export async function recomputeDrafts(tx: Tx, ctx: SchoolContext) {
  const exams = await tx.exam.findMany({ where: { archivedAt: null, status: { not: "DRAFT" }, academicYearId: { in: (await tx.academicYear.findMany({ where: { status: { not: "CLOSED" } }, select: { id: true } })).map((y) => y.id) } } });
  let n = 0;
  for (const e of exams) {
    const sections = await tx.section.findMany({ where: { classId: { in: e.classIds }, academicYearId: e.academicYearId, archivedAt: null }, select: { id: true } });
    for (const s of sections) {
      await recomputeSection(tx, ctx, e.id, s.id);
      n++;
    }
  }
  return n;
}

/**
 * A student changed section (or the change was undone): their marks, draft
 * results and report cards of the year go with them, so the new section's
 * marks grid, result sheet and report cards show what they already have, and
 * the old section no longer counts them (G23). A published result stays with
 * the section it was published in, unchanged, and shows in the new section
 * too. Drafts and ranks of both sections are worked out again.
 */
export async function followSectionChange(tx: Tx, ctx: SchoolContext, e: { studentId: string; academicYearId: string; fromSectionId: string; toSectionId: string }) {
  const [from, to] = await Promise.all([sectionInfo(tx, e.fromSectionId), sectionInfo(tx, e.toSectionId)]);
  const marks = await tx.marks.updateMany({ where: { studentId: e.studentId, sectionId: e.fromSectionId }, data: { sectionId: e.toSectionId } });
  const moving = await tx.result.findMany({ where: { studentId: e.studentId, academicYearId: e.academicYearId, sectionId: e.fromSectionId, classId: to.classId, status: "DRAFT" } });
  if (moving.length) await tx.result.updateMany({ where: { id: { in: moving.map((r) => r.id) } }, data: { sectionId: e.toSectionId } });
  const cards = await tx.reportCard.updateMany({ where: { studentId: e.studentId, academicYearId: e.academicYearId, sectionId: e.fromSectionId }, data: { sectionId: e.toSectionId } });
  if (marks.count + moving.length + cards.count === 0) return;
  const examIds = [...new Set(moving.filter((r) => r.examId).map((r) => r.examId!))];
  for (const examId of examIds) {
    for (const sectionId of [e.fromSectionId, e.toSectionId]) await recomputeSection(tx, ctx, examId, sectionId, { final: false });
  }
  if (examIds.length || moving.some((r) => r.examId === null)) {
    for (const sectionId of [e.fromSectionId, e.toSectionId]) await recomputeFinal(tx, ctx, e.academicYearId, sectionId);
  }
  await refreshReportCards(tx, ctx, e.academicYearId, [e.fromSectionId, e.toSectionId]);
  await writeAudit(tx, ctx, {
    action: "results-followed-student", recordType: "Result", recordId: e.studentId,
    before: { section: from.label }, after: { section: to.label, marks: marks.count, results: moving.length, reportCards: cards.count },
  });
}

// ---------- Publishing ----------

export type Readiness = {
  sectionId: string; label: string; ready: boolean; problems: string[]; published: boolean; scheduled: { id: string; publishOn: Date } | null;
  /** Students shown as "Joined after this exam": left out, so they do not stop publishing. */
  leftOut: string[];
  /** Results added after the section was published (late marks), waiting to be published. */
  waiting: string[];
};

/** What stops a result being published, per section, in plain words (rule 16). */
export async function readiness(tx: Tx, ctx: SchoolContext, key: string, sectionIds: string[]): Promise<Readiness[]> {
  const out: Readiness[] = [];
  const isFinal = key.startsWith("final:");
  const id = key.slice(key.indexOf(":") + 1);
  const scheduledRows = await tx.resultPublication.findMany({ where: { key, status: "scheduled" } });
  for (const sectionId of sectionIds) {
    const section = await sectionInfo(tx, sectionId);
    const problems: string[] = [];
    const students = await sectionStudents(tx, [sectionId], section.academicYearId);
    const ids = students.map((s) => s.studentId);
    const nameOf = (sid: string) => students.find((s) => s.studentId === sid)?.name ?? "";
    const results = ids.length ? await tx.result.findMany({ where: { key, studentId: { in: ids } } }) : [];
    const leftOut = new Set(results.filter((r) => r.leftOut).map((r) => r.studentId));
    if (isFinal) {
      const exams = (await finalExams(tx, ctx, id, section.classId)).filter((e) => e.counts);
      if (exams.length === 0) problems.push(`No exams count in the final result for ${section.label}. Set the weights in Exam Settings.`);
      const examRows = ids.length ? await tx.result.findMany({ where: { key: { in: exams.map((e) => examKey(e.id)) }, studentId: { in: ids } }, select: { key: true, studentId: true, status: true, leftOut: true, sectionId: true } }) : [];
      // Published for this section: its own rows, not a published result a moved-in student brought.
      const unpublished = exams.filter((e) => !examRows.some((p) => p.key === examKey(e.id) && p.status === "PUBLISHED" && p.sectionId === sectionId));
      if (unpublished.length) problems.push(`Publish ${wordList(unpublished.map((e) => e.title))} results for ${section.label} first.`);
      // Late marks completed after an exam was published: that result is published first, so the final never uses an unpublished one.
      for (const e of exams.filter((x) => !unpublished.includes(x))) {
        const late = examRows.filter((r) => r.key === examKey(e.id) && r.status === "DRAFT" && !r.leftOut).map((r) => nameOf(r.studentId)).filter(Boolean);
        if (late.length) problems.push(`Publish the ${e.title} result of ${wordList(late)} first. ${late.length === 1 ? "It was" : "They were"} completed after ${e.title} was published for ${section.label}.`);
      }
    } else {
      const exam = await tx.exam.findFirst({ where: { id } });
      if (!exam || exam.status === "DRAFT") problems.push("Publish the datesheet first.");
      const papers = exam ? await papersOf(tx, exam.id, section.classId) : [];
      const marks = ids.length ? await tx.marks.findMany({ where: { entryId: { in: papers.map((p) => p.entry.id) }, studentId: { in: ids } } }) : [];
      const missingSubjects: string[] = [];
      for (const p of papers) {
        const takers = sitters(students, p.subject).filter((t) => !leftOut.has(t.studentId));
        if (takers.some((t) => !isDone(marks.find((x) => x.entryId === p.entry.id && x.studentId === t.studentId), p.subject.gradeOnly))) missingSubjects.push(p.subject.name);
      }
      if (missingSubjects.length) problems.push(`${plural(missingSubjects.length, "subject")} ${missingSubjects.length === 1 ? "has" : "have"} missing marks in ${section.label}: ${wordList(missingSubjects)}.`);
      if (papers.length === 0) problems.push(`${section.label} has no papers in this exam.`);
    }
    const missingStudents = students.filter((s) => !leftOut.has(s.studentId) && !results.some((r) => r.studentId === s.studentId && r.complete));
    if (problems.length === 0 && missingStudents.length) problems.push(`${plural(missingStudents.length, "student")} in ${section.label} ${missingStudents.length === 1 ? "has" : "have"} no complete result yet. Open the result sheet to check.`);
    const counted = results.filter((r) => !r.leftOut);
    const sched = scheduledRows.find((s) => s.sectionIds.includes(sectionId));
    const somePublished = counted.some((r) => r.status === "PUBLISHED" && r.sectionId === sectionId);
    out.push({
      sectionId, label: section.label, ready: problems.length === 0, problems,
      published: counted.length > 0 && counted.every((r) => r.status === "PUBLISHED"),
      scheduled: sched ? { id: sched.id, publishOn: sched.publishOn } : null,
      leftOut: students.filter((s) => leftOut.has(s.studentId)).map((s) => s.name),
      waiting: somePublished ? counted.filter((r) => r.status === "DRAFT").map((r) => nameOf(r.studentId)).filter(Boolean) : [],
    });
  }
  return out;
}

export type PublishInput = { key: string; sectionIds: string[]; publishOn: Date; messageParents: boolean };

/**
 * Publishes results now, or sets the date and time they publish by themselves.
 * Drafts with missing marks cannot be published (rule 16).
 */
export async function publishResults(tx: Tx, ctx: SchoolContext, scope: Pick<ExamScope, "publish">, input: PublishInput, now = new Date()) {
  if (!scope.publish) throw new ExamRuleError("Your role does not publish results. Exam Settings says who may (Exam rules).");
  if (input.sectionIds.length === 0) throw new ExamRuleError("Choose at least one section.", "sectionIds");
  const yearId = await yearOfKey(tx, input.key);
  await assertYearOpen(tx, yearId);
  if (input.key.startsWith("exam:")) {
    for (const s of input.sectionIds) await recomputeSection(tx, ctx, input.key.slice(5), s);
  } else {
    for (const s of input.sectionIds) await recomputeFinal(tx, ctx, yearId, s);
  }
  const ready = await readiness(tx, ctx, input.key, input.sectionIds);
  const blocked = ready.filter((r) => !r.ready);
  if (blocked.length) throw new ExamRuleError(`Results in draft cannot be published. ${blocked.flatMap((b) => b.problems).join(" ")}`);
  const already = ready.filter((r) => r.published);
  if (already.length) throw new ExamRuleError(`${wordList(already.map((r) => r.label))} ${already.length === 1 ? "is" : "are"} already published.`);
  const scheduledFor = ready.filter((r) => r.scheduled);
  if (scheduledFor.length) throw new ExamRuleError(`${wordList(scheduledFor.map((r) => r.label))} already ${scheduledFor.length === 1 ? "has" : "have"} a publish date. Cancel it first to choose another.`);
  if (input.publishOn.getTime() < now.getTime() - 5 * 60_000) throw new ExamRuleError("The publish date and time has passed. Choose now or a later time.", "publishOn");

  const pub = await tx.resultPublication.create({
    data: {
      schoolId: ctx.schoolId, academicYearId: yearId, key: input.key, examId: input.key.startsWith("exam:") ? input.key.slice(5) : null,
      sectionIds: input.sectionIds, publishOn: input.publishOn, messageParents: input.messageParents, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "result-publish-set", recordType: "Result Publication", recordId: pub.id, after: { key: input.key, sections: ready.map((r) => r.label), publishOn: input.publishOn.toISOString(), messageParents: input.messageParents } });
  if (input.publishOn.getTime() <= now.getTime() + 60_000) {
    const done = await runPublication(tx, ctx, pub.id, now);
    return { scheduled: false as const, ...done };
  }
  return { scheduled: true as const, publishOn: input.publishOn, sections: ready.map((r) => r.label), students: 0, parents: 0 };
}

async function yearOfKey(tx: Tx, key: string) {
  if (key.startsWith("final:")) return key.slice(6);
  const exam = await tx.exam.findFirst({ where: { id: key.slice(5) } });
  if (!exam) throw new ExamRuleError("This exam was not found.");
  return exam.academicYearId;
}

/** Publishes one Result Publication (now, or when its date comes). Safe to run twice. */
export async function runPublication(tx: Tx, ctx: SchoolContext, publicationId: string, now = new Date()) {
  const pub = await tx.resultPublication.findFirst({ where: { id: publicationId } });
  if (!pub || pub.status !== "scheduled") return { sections: [] as string[], students: 0, parents: 0 };
  const isExam = pub.key.startsWith("exam:");
  // Worked out again first, so students who joined since (left out) or moved in are counted as they are now.
  for (const sectionId of pub.sectionIds) {
    if (isExam) await recomputeSection(tx, ctx, pub.key.slice(5), sectionId);
    else await recomputeFinal(tx, ctx, pub.academicYearId, sectionId);
  }
  const ready = await readiness(tx, ctx, pub.key, pub.sectionIds);
  const blocked = ready.filter((r) => !r.ready && !r.published);
  if (blocked.length) {
    const note = blocked.flatMap((b) => b.problems).join(" ");
    await tx.resultPublication.update({ where: { id: pub.id }, data: { status: "failed", note } });
    if (pub.createdById) {
      await notify(tx, { ...ctx, userId: null }, { to: pub.createdById, type: "result-not-published", text: `Results were not published on ${formatDateTime(pub.publishOn)}: ${note}`, link: resultsLink(pub.key, pub.sectionIds[0]) });
    }
    await writeAudit(tx, ctx, { action: "result-publish-failed", recordType: "Result Publication", recordId: pub.id, after: { note } });
    return { sections: [] as string[], students: 0, parents: 0 };
  }
  const studentIds: string[] = [];
  for (const sectionId of pub.sectionIds) {
    const section = await sectionInfo(tx, sectionId);
    const exam = isExam ? await tx.exam.findFirst({ where: { id: pub.key.slice(5) } }) : null;
    const scale = await bandsFor(tx, ctx, exam?.gradeScaleId ?? null, section.board);
    // "Joined after this exam" rows are never published: there is nothing in them to publish.
    const rows = await tx.result.findMany({ where: { key: pub.key, sectionId, status: "DRAFT", leftOut: false } });
    await tx.result.updateMany({
      where: { key: pub.key, sectionId, status: "DRAFT", leftOut: false },
      data: { status: "PUBLISHED", publishedAt: now, publishedById: pub.createdById, scale: { id: scale.id, name: scale.name, version: scale.version, bands: scale.bands } as unknown as Prisma.InputJsonValue },
    });
    studentIds.push(...rows.map((r) => r.studentId));
    if (isExam) {
      const entries = await tx.datesheetEntry.findMany({ where: { examId: pub.key.slice(5), classId: section.classId, archivedAt: null }, select: { id: true } });
      await tx.marksPaper.updateMany({ where: { entryId: { in: entries.map((e) => e.id) }, sectionId, status: { not: "LOCKED" } }, data: { status: "LOCKED", lockedAt: now, lockedById: pub.createdById } });
    }
  }
  if (isExam) await refreshExamStatus(tx, pub.key.slice(5), now);
  await refreshReportCards(tx, ctx, pub.academicYearId, pub.sectionIds);

  let parents = 0;
  if (pub.messageParents && studentIds.length) {
    const title = isExam ? (await tx.exam.findFirst({ where: { id: pub.key.slice(5) } }))?.title ?? "Exam" : "the final result";
    const sent = await messageParents(tx, ctx, {
      template: "result-published", studentIds, idempotencyKey: `result:${pub.key}`, source: { type: "Result Publication", id: pub.id },
      vars: { exam_name: title }, text: `${title} results are out. The report card is on your Parent Link.`,
    });
    parents = sent.recipients;
  }
  await tx.resultPublication.update({ where: { id: pub.id }, data: { status: "published", publishedAt: now, messagesSent: parents } });
  await writeAudit(tx, ctx, { action: "results-published", recordType: "Result Publication", recordId: pub.id, after: { key: pub.key, sections: pub.sectionIds.length, students: studentIds.length, parentsMessaged: parents } });
  return { sections: ready.map((r) => r.label), students: studentIds.length, parents };
}

/** Exam status follows its results: Results published when every section is published. */
export async function refreshExamStatus(tx: Tx, examId: string, now = new Date()) {
  const exam = await tx.exam.findFirst({ where: { id: examId } });
  if (!exam || exam.status === "DRAFT") return;
  const sections = await tx.section.findMany({ where: { classId: { in: exam.classIds }, academicYearId: exam.academicYearId, archivedAt: null }, select: { id: true } });
  const published = await tx.result.groupBy({ by: ["sectionId"], where: { key: examKey(examId), status: "PUBLISHED" } });
  const all = sections.length > 0 && sections.every((s) => published.some((p) => p.sectionId === s.id));
  const status = all ? "RESULTS_PUBLISHED" : "PUBLISHED";
  if (exam.status !== status) await tx.exam.update({ where: { id: examId }, data: { status, resultsPublishedAt: all ? now : null } });
}

/** Takes a result back to draft (permitted people, with a reason). Parents are not messaged again; the report card leaves Parent Link. */
export async function unpublishResults(tx: Tx, ctx: SchoolContext, scope: Pick<ExamScope, "publish">, input: { key: string; sectionIds: string[]; reason: string }) {
  if (!scope.publish) throw new ExamRuleError("Your role does not publish or unpublish results.");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new ExamRuleError("Give a reason of at least 5 characters.", "reason");
  const yearId = await yearOfKey(tx, input.key);
  await assertYearOpen(tx, yearId);
  if (input.key.startsWith("exam:")) {
    const finals = await tx.result.count({ where: { key: finalKey(yearId), sectionId: { in: input.sectionIds }, status: "PUBLISHED" } });
    if (finals) throw new ExamRuleError("The final result built on this exam is published. Unpublish the final result first.");
  }
  const changed = await tx.result.updateMany({ where: { key: input.key, sectionId: { in: input.sectionIds }, status: "PUBLISHED" }, data: { status: "DRAFT", publishedAt: null, publishedById: null } });
  if (changed.count === 0) throw new ExamRuleError("These results are not published.");
  await tx.resultPublication.updateMany({ where: { key: input.key, status: "published", sectionIds: { hasSome: input.sectionIds } }, data: { status: "unpublished", unpublishedAt: new Date(), unpublishedById: ctx.userId, note: reason } });
  if (input.key.startsWith("exam:")) await refreshExamStatus(tx, input.key.slice(5));
  await refreshReportCards(tx, ctx, yearId, input.sectionIds);
  await writeAudit(tx, ctx, { action: "results-unpublished", recordType: "Result", recordId: input.key, before: { status: "PUBLISHED", students: changed.count }, after: { status: "DRAFT", reason } });
  return changed.count;
}

export async function cancelScheduled(tx: Tx, ctx: SchoolContext, scope: Pick<ExamScope, "publish">, publicationId: string) {
  if (!scope.publish) throw new ExamRuleError("Your role does not publish results.");
  const pub = await tx.resultPublication.findFirst({ where: { id: publicationId, status: "scheduled" } });
  if (!pub) throw new ExamRuleError("This publish date was already used or cancelled. Reload the page.");
  await tx.resultPublication.update({ where: { id: pub.id }, data: { status: "cancelled" } });
  await writeAudit(tx, ctx, { action: "result-publish-cancelled", recordType: "Result Publication", recordId: pub.id, before: { publishOn: pub.publishOn.toISOString() } });
  return pub;
}

/** Publishes the results whose date has come (runs every few minutes). */
export async function publishDue(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const due = await tx.resultPublication.findMany({ where: { status: "scheduled", publishOn: { lte: now } }, orderBy: { publishOn: "asc" } });
  for (const p of due) await runPublication(tx, ctx, p.id, now);
  return due.length;
}

export function resultsLink(key: string, sectionId?: string) {
  if (key.startsWith("final:")) return `/examination-results/results?view=final${sectionId ? `&section=${sectionId}` : ""}`;
  return `/examination-results/results?exam=${key.slice(5)}${sectionId ? `&section=${sectionId}` : ""}`;
}

// ---------- Reading ----------

export type SheetColumn = { id: string; name: string; max: number; gradeOnly: boolean; entryId: string | null };
/**
 * Below 50% or not passing: the Dashboard's "students below 50% or not passing" card counts these
 * among complete results, and Results lists them with ?weak=1 (gap list G36).
 */
export const isWeakResult = (r: { outcome: string | null; percent: number | null }) => r.outcome !== "Pass" || (r.percent ?? 0) < 50;

export type SheetRow = {
  studentId: string; name: string; rollNo: number | null; admissionNo: string;
  cells: Record<string, { marks: number | null; grade: string | null; absent: boolean; medical: boolean; missing: boolean; passed: boolean | null; grace: number }>;
  total: number; maxTotal: number; percent: number | null; grade: string | null; points: number | null; rank: number | null; outcome: string | null; complete: boolean; missing: number;
  status: "DRAFT" | "PUBLISHED"; publishedAt: Date | null;
  /** "Joined after this exam" (for the final: after every exam that counts). */
  leftOut: boolean;
};

/**
 * Only these subjects of a result sheet (a subject teacher's view, scope.ts
 * resultSubjects). The other subjects' marks are taken out, and so are the
 * totals, percentages, grades, ranks and overall results, which are worked
 * out from them. "complete" and "missing" then count only these subjects.
 */
export function limitSheet<T extends { columns: SheetColumn[]; rows: SheetRow[]; paperStatus: { entryId: string }[] }>(sheet: T, subjectIds: string[] | null): T {
  if (subjectIds === null) return sheet;
  const columns = sheet.columns.filter((c) => subjectIds.includes(c.id));
  const entryIds = new Set(columns.map((c) => c.entryId));
  const rows = sheet.rows.map((r) => {
    const cells: SheetRow["cells"] = {};
    for (const c of columns) if (r.cells[c.id]) cells[c.id] = r.cells[c.id];
    const missing = columns.filter((c) => !cells[c.id] || cells[c.id].missing).length;
    return { ...r, cells, total: 0, maxTotal: 0, percent: null, grade: null, points: null, rank: null, outcome: null, complete: missing === 0, missing };
  });
  return { ...sheet, columns, rows, paperStatus: sheet.paperStatus.filter((p) => entryIds.has(p.entryId)) };
}

/** The class result sheet for one exam and section: marks per subject, total, %, grade, rank, pass or fail. */
export async function resultSheet(tx: Tx, ctx: SchoolContext, examId: string, sectionId: string, onlySubjects: string[] | null = null) {
  const exam = await tx.exam.findFirst({ where: { id: examId } });
  if (!exam) return null;
  const section = await sectionInfo(tx, sectionId);
  const papers = await papersOf(tx, examId, section.classId);
  const students = await sectionStudents(tx, [sectionId], exam.academicYearId);
  const ids = students.map((s) => s.studentId);
  let results = await rosterResults(tx, examKey(examId), section, ids);
  // Worked out when someone on the roll has no result yet (nothing entered so far, or a student who joined since).
  if (exam.status !== "DRAFT" && ids.some((id) => !results.some((r) => r.studentId === id))) {
    await recomputeSection(tx, ctx, examId, sectionId);
    results = await rosterResults(tx, examKey(examId), section, ids);
  }
  const columns: SheetColumn[] = papers.map((p) => ({ id: p.subject.id, name: p.subject.name, max: p.subject.gradeOnly ? 0 : p.entry.maxMarks, gradeOnly: p.subject.gradeOnly, entryId: p.entry.id }));
  const rows = buildRows(students, results);
  const paperStatus = await tx.marksPaper.findMany({ where: { entryId: { in: papers.map((p) => p.entry.id) }, sectionId } });
  return limitSheet({ exam, section, columns, rows, paperStatus, scale: results.find((r) => r.scale)?.scale ?? null }, onlySubjects);
}

function buildRows(students: { studentId: string; name: string; rollNo: number | null; admissionNo: string }[], results: Result[]): SheetRow[] {
  return students.map((st) => {
    const r = results.find((x) => x.studentId === st.studentId);
    const subjects = ((r?.subjects ?? []) as unknown as SubjectResult[]);
    const cells: SheetRow["cells"] = {};
    for (const s of subjects) cells[s.subjectId] = { marks: s.marks, grade: s.grade, absent: s.absent, medical: Boolean(s.medical), missing: s.missing, passed: s.passed, grace: s.grace };
    return {
      studentId: st.studentId, name: st.name, rollNo: st.rollNo, admissionNo: st.admissionNo, cells,
      total: r?.total ?? 0, maxTotal: r?.maxTotal ?? 0, percent: r?.percent ?? null, grade: r?.grade ?? null, points: r?.points ?? null, rank: r?.rank ?? null,
      outcome: r?.outcome ?? null, complete: r?.complete ?? false, missing: r?.missing ?? 0, status: r?.status ?? "DRAFT", publishedAt: r?.publishedAt ?? null,
      leftOut: r?.leftOut ?? false,
    };
  });
}

/** The final result sheet for the year and one section: each exam's percentage and the weighted final. */
export async function finalSheet(tx: Tx, ctx: SchoolContext, yearId: string, sectionId: string) {
  const section = await sectionInfo(tx, sectionId);
  const exams = await finalExams(tx, ctx, yearId, section.classId);
  const students = await sectionStudents(tx, [sectionId], yearId);
  const ids = students.map((s) => s.studentId);
  let finals = await rosterResults(tx, finalKey(yearId), section, ids);
  if (exams.length && ids.some((id) => !finals.some((r) => r.studentId === id))) {
    await recomputeFinal(tx, ctx, yearId, sectionId);
    finals = await rosterResults(tx, finalKey(yearId), section, ids);
  }
  const examResults = ids.length ? await tx.result.findMany({ where: { key: { in: exams.map((e) => examKey(e.id)) }, studentId: { in: ids } } }) : [];
  const rows = buildRows(students, finals).map((row) => ({
    ...row,
    exams: Object.fromEntries(exams.map((e) => {
      const r = examResults.find((x) => x.key === examKey(e.id) && x.studentId === row.studentId);
      return [e.id, r ? { percent: r.percent, grade: r.grade, status: r.status, complete: r.complete, leftOut: r.leftOut } : null];
    })),
  }));
  const subjects = new Map<string, { id: string; name: string }>();
  for (const f of finals) for (const s of (f.subjects as unknown as SubjectResult[]) ?? []) subjects.set(s.subjectId, { id: s.subjectId, name: s.name });
  return { section, exams, rows, subjects: [...subjects.values()] };
}

export function publishOnWords(d: Date, tz: string) {
  return `${formatDate(d, tz)} at ${formatDateTime(d, tz).split(", ")[1]}`;
}
