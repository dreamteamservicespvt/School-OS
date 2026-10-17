// Examination & Results, gap G23: late joiners, section moves and the settings
// the engine supports (per-board grade scale and report card format, default
// pattern per class, competencies, GPA).
// - A student who joins after an exam's results are published is "Joined after
//   this exam": left out of it, never blocking the class's results or the final.
// - Their marks are added only by a request approved in Approvals (the
//   default), or not at all when Exam Settings says so. Others' published
//   results never change.
// - A student who changes section takes their marks, results and report cards
//   with them; the new teacher can enter marks without an error.
// - Exam Settings can set what the engine supports, with checks, and it shows
//   on report cards.
// The signed-in person is swapped in for the server actions; everything else
// (the permission check, the scope, the transaction) is the real code.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import type { SchoolContext } from "@/lib/db";
import { examScope, type ExamScope } from "@/lib/exams/scope";
import { createDatesheet, publishDatesheet } from "@/lib/exams/datesheet";
import { loadPaper, requestModeration, saveMarks } from "@/lib/exams/marks";
import { finalSheet, publishResults, readiness, resultSheet } from "@/lib/exams/results";
import { examSettings, gradeScales, importPreset, saveRules, setExamFeature, type RulesInput } from "@/lib/exams/settings";
import { reportBoard, reportCardData, reportFormatFor } from "@/lib/exams/report-cards";
import { periodsForClass, periodPublished } from "@/lib/exams/report-status";
import { examKey, finalKey } from "@/lib/exams/common";
import { changeSection, undoSectionChange } from "@/lib/students/students";
import { decide } from "@/lib/approvals";
import "@/lib/exams/handlers";
import {
  archiveCompetencyAction, saveBoardsAction, saveClassPatternsAction, saveCompetencyForm, saveRulesForm,
} from "@/app/(school)/examination-results/settings/actions";
import { requestChangeAction } from "@/app/(school)/examination-results/marks/actions";
import { makeUser } from "../helpers";
import { academicSchool, d } from "../academic/fixture";
import { addStudent } from "../students/fixtures";

let s: Awaited<ReturnType<typeof academicSchool>>;
let principal: ExamScope;
let teacher: ExamScope;
let principalNow: Current;
let teacherNow: Current;
let adminCtx: SchoolContext;
let tctx: SchoolContext;
let termId = "";
let hyType = "";
let anType = "";
let utType = "";
const a5: string[] = [];
const b5: string[] = [];
const c6: string[] = [];
let s6b = "";

const as = (c: Current) => { who.current = c; };
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };
const mark = (studentId: string, n: number | null) => ({ studentId, parts: { Marks: n }, absent: false, medical: false, grade: null, remark: null });
const value = (n: number) => ({ parts: { Marks: n }, absent: false, grade: null, remark: null });
const pub = (key: string, sectionIds: string[]) => s.run((tx) => publishResults(tx, s.ctx, principal, { key, sectionIds, publishOn: new Date(), messageParents: false }));

/** An exam for one class, published, with one paper per subject (out of 50). */
async function exam(title: string, typeId: string, classId: string, papers: [string, string][]) {
  const r = await s.run((tx) => createDatesheet(tx, s.ctx, s.year.id, {
    title, examTypeId: typeId, pattern: "PERCENTAGE", termId, startDate: d(papers[0][1]), endDate: d(papers[papers.length - 1][1]), classIds: [classId], gradeScaleId: null,
  }, papers.map(([code, date]) => ({ classId, subjectId: s.subjects[code], date: d(date), startTime: "09:30", durationMin: 120, room: null, invigilatorId: null, maxMarks: 50, pattern: null }))));
  await s.run((tx) => publishDatesheet(tx, s.ctx, r.exam.id, { tellParents: false }));
  const entries = await s.run((tx) => tx.datesheetEntry.findMany({ where: { examId: r.exam.id } }));
  const entry = (code: string) => entries.find((e) => e.subjectId === s.subjects[code])!.id;
  return { id: r.exam.id, entry };
}

beforeAll(async () => {
  s = await academicSchool();
  for (let i = 0; i < 3; i++) a5.push((await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false })).student.id);
  for (let i = 0; i < 2; i++) b5.push((await addStudent(s.ctx, s.s5b.id, { applyFeePlan: false })).student.id);
  for (let i = 0; i < 2; i++) c6.push((await addStudent(s.ctx, s.s6a.id, { applyFeePlan: false })).student.id);
  const admin = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["school-admin"] }] });
  adminCtx = { schoolId: s.school.id, userId: admin.id };
  tctx = { schoolId: s.school.id, userId: s.teacherUser.id };
  await s.run(async (tx) => {
    termId = (await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Whole year", startDate: d("2026-04-01"), endDate: d("2027-03-31"), sortOrder: 1 } })).id;
    await examSettings(tx, s.ctx);
    hyType = (await tx.examType.findFirstOrThrow({ where: { name: "Half Yearly" } })).id;
    anType = (await tx.examType.findFirstOrThrow({ where: { name: "Annual" } })).id;
    utType = (await tx.examType.findFirstOrThrow({ where: { name: "Unit Test 1" } })).id;
    s6b = (await tx.section.create({ data: { schoolId: s.school.id, classId: s.c6.id, academicYearId: s.year.id, name: "B", seats: 40 } })).id;
  });
  principalNow = await s.currentFor(s.principal.id);
  teacherNow = await s.currentFor(s.teacherUser.id);
  principal = await s.run((tx) => examScope(tx, principalNow, s.year.id));
  teacher = await s.run((tx) => examScope(tx, teacherNow, s.year.id));
}, 180_000);

describe("a student who joins after an exam's results are published", () => {
  let hy: Awaited<ReturnType<typeof exam>>;
  let an: Awaited<ReturnType<typeof exam>>;
  let late5a = "";
  let late5b = "";

  it("is shown as \"Joined after this exam\" and is left out of it", async () => {
    hy = await exam("Half Yearly", hyType, s.c5.id, [["MAT", "2026-10-05"], ["ENG", "2026-10-06"]]);
    for (const [sectionId, list, base] of [[s.s5a.id, a5, 40], [s.s5b.id, b5, 30]] as const) {
      await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: hy.entry("MAT"), sectionId, rows: list.map((id, i) => mark(id, base - i)) }));
      await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: hy.entry("ENG"), sectionId, rows: list.map((id, i) => mark(id, base - i)) }));
    }
    await pub(examKey(hy.id), [s.s5a.id, s.s5b.id]);
    late5a = (await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false })).student.id;
    late5b = (await addStudent(s.ctx, s.s5b.id, { applyFeePlan: false })).student.id;

    const sheet = await s.run((tx) => resultSheet(tx, s.ctx, hy.id, s.s5a.id));
    expect(sheet!.rows.find((r) => r.studentId === late5a)).toMatchObject({ leftOut: true, status: "DRAFT", rank: null });
    const [ready] = await s.run((tx) => readiness(tx, s.ctx, examKey(hy.id), [s.s5a.id]));
    expect(ready).toMatchObject({ published: true, ready: true, waiting: [] });
    expect(ready.leftOut).toHaveLength(1);
    // The marks grid shows the student with no marks in a locked paper.
    const paper = await s.run((tx) => loadPaper(tx, s.ctx, hy.entry("MAT"), s.s5a.id));
    expect(paper!.students.some((x) => x.studentId === late5a)).toBe(true);
    expect(paper!.marks.some((m) => m.studentId === late5a)).toBe(false);
  });

  it("does not stop the final result being published; the missed exam is left out", async () => {
    an = await exam("Annual", anType, s.c5.id, [["MAT", "2027-02-01"], ["ENG", "2027-02-02"]]);
    const all5b = [...b5, late5b];
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: an.entry("MAT"), sectionId: s.s5b.id, rows: all5b.map((id) => mark(id, 45)) }));
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: an.entry("ENG"), sectionId: s.s5b.id, rows: all5b.map((id) => mark(id, 45)) }));
    await pub(examKey(an.id), [s.s5b.id]);
    const r = await pub(finalKey(s.year.id), [s.s5b.id]);
    expect(r).toMatchObject({ scheduled: false });
    const fin = await s.run((tx) => finalSheet(tx, s.ctx, s.year.id, s.s5b.id));
    const lateRow = fin.rows.find((x) => x.studentId === late5b)!;
    // Only the Annual exam counts for the late joiner: 45 of 50 = 90%.
    expect(lateRow).toMatchObject({ complete: true, percent: 90, status: "PUBLISHED", outcome: "Pass" });
    expect(lateRow.exams[hy.id]).toMatchObject({ leftOut: true });
    // Everyone else: the average of both exams, published.
    expect(fin.rows.find((x) => x.studentId === b5[0])).toMatchObject({ percent: 75, status: "PUBLISHED" });
  });

  it("gets no report card for the exam they missed, but does for the year", async () => {
    const options = await s.run((tx) => periodsForClass(tx, s.year.id, s.c5.id));
    const hyCard = options.find((o) => o.key === `exam:${hy.id}`)!;
    const year = options.find((o) => o.key === "year")!;
    expect(await s.run((tx) => periodPublished(tx, late5b, hyCard))).toBe(false);
    expect(await s.run((tx) => periodPublished(tx, late5b, year))).toBe(true);
    const board = await s.run((tx) => reportBoard(tx, s.ctx, s.s5b.id, `exam:${hy.id}`));
    expect(board!.rows.find((x) => x.studentId === late5b)!.missing).toContain("Joined after this exam");
    // A term card with both exams shows the Annual exam, with the term's totals.
    const term = options.find((o) => o.period.kind === "term")!;
    expect(await s.run((tx) => periodPublished(tx, late5b, term))).toBe(true);
    const card = await s.run((tx) => reportCardData(tx, s.ctx, b5[0], s.s5b.id, term.key));
    expect(card.data.fields).toMatchObject({ total_marks: "150 / 200", percentage: "75%", result: "Pass" });
  });

  it("their marks are not added when the school says so", async () => {
    const v = (await s.run((tx) => examSettings(tx, s.ctx)));
    const rules: RulesInput = {
      ranksOn: v.ranksOn, tieRule: v.tieRule as "skip", passPercentSubject: v.passPercentSubject, passPercentOverall: v.passPercentOverall, graceMarks: v.graceMarks,
      compartmentSubjects: v.compartmentSubjects, absentRule: v.absentRule as "zero", gradeOnlyGrades: v.gradeOnlyGrades, publishRoles: v.publishRoles, marksDueDays: v.marksDueDays,
      reminderDaysBefore: v.reminderDaysBefore, gpaOn: v.gpaOn, defaultScaleId: v.defaultScaleId!, lateMarks: "off", lateJoinRule: "leave-out",
    };
    expect(v.lateMarks).toBe("approval");
    await s.run((tx) => saveRules(tx, s.ctx, rules));
    await expect(s.run((tx) => requestModeration(tx, tctx, teacher, { entryId: hy.entry("MAT"), sectionId: s.s5a.id, studentId: late5a, value: value(40), reason: "Joined late; took the paper on another day" })))
      .rejects.toThrow(/joined after the marks were in.*leaves such students out/);
    await s.run((tx) => saveRules(tx, s.ctx, { ...rules, lateMarks: "approval" }));
  });

  it("their marks are added only once approved, and other students' published results never change", async () => {
    const before = await s.run((tx) => tx.result.findMany({ where: { key: examKey(hy.id), studentId: { in: a5 } }, orderBy: { studentId: "asc" } }));
    // The Maths teacher asks (through the screen's action); nothing changes until the Principal approves.
    as(teacherNow);
    const asked = await requestChangeAction({ ok: false }, form({ entryId: hy.entry("MAT"), sectionId: s.s5a.id, studentId: late5a, "part:Marks": "48", reason: "Joined late; took the paper on another day" }));
    expect(asked).toMatchObject({ ok: true });
    const mod = await s.run((tx) => tx.marksModeration.findFirstOrThrow({ where: { studentId: late5a, entryId: hy.entry("MAT") } }));
    expect(mod).toMatchObject({ kind: "late", marksId: null, before: null, status: "waiting", sectionId: s.s5a.id });
    expect(await s.run((tx) => tx.marks.count({ where: { studentId: late5a } }))).toBe(0);
    await expect(s.run((tx) => requestModeration(tx, tctx, teacher, { entryId: hy.entry("MAT"), sectionId: s.s5a.id, studentId: late5a, value: value(40), reason: "Asking twice by mistake" }))).rejects.toThrow(/already waiting/);
    await s.run((tx) => decide(tx, s.ctx, mod.approvalId!, "approve", null));
    expect((await s.run((tx) => tx.marks.findFirstOrThrow({ where: { studentId: late5a, entryId: hy.entry("MAT") } }))).total).toBe(48);
    // One paper of two: still left out, so nothing is blocked.
    let row = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(hy.id), studentId: late5a } }));
    expect(row).toMatchObject({ leftOut: true, status: "DRAFT" });

    // English: the Principal asks, the School Admin approves.
    const { approval, late } = await s.run((tx) => requestModeration(tx, s.ctx, principal, { entryId: hy.entry("ENG"), sectionId: s.s5a.id, studentId: late5a, value: value(42), reason: "Joined late; took the paper on another day" }));
    expect(late).toBe(true);
    await s.run((tx) => decide(tx, adminCtx, approval.id, "approve", null));
    row = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(hy.id), studentId: late5a } }));
    expect(row).toMatchObject({ leftOut: false, complete: true, status: "DRAFT", total: 90, percent: 90, rank: 1 });
    const after = await s.run((tx) => tx.result.findMany({ where: { key: examKey(hy.id), studentId: { in: a5 } }, orderBy: { studentId: "asc" } }));
    expect(after.map((r) => [r.total, r.rank, r.status, r.publishedAt?.getTime()])).toEqual(before.map((r) => [r.total, r.rank, r.status, r.publishedAt?.getTime()]));
    const audit = await s.run((tx) => tx.auditLogEntry.count({ where: { action: { in: ["late-marks-asked", "late-marks-added"] } } }));
    expect(audit).toBe(4);
  });

  it("the late result is published on its own, and the final waits for it", async () => {
    const [ready] = await s.run((tx) => readiness(tx, s.ctx, examKey(hy.id), [s.s5a.id]));
    expect(ready).toMatchObject({ published: false, ready: true, leftOut: [] });
    expect(ready.waiting).toHaveLength(1);
    an = an ?? (await exam("Annual", anType, s.c5.id, [["MAT", "2027-02-01"], ["ENG", "2027-02-02"]]));
    const all5a = [...a5, late5a];
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: an.entry("MAT"), sectionId: s.s5a.id, rows: all5a.map((id) => mark(id, 40)) }));
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: an.entry("ENG"), sectionId: s.s5a.id, rows: all5a.map((id) => mark(id, 40)) }));
    await pub(examKey(an.id), [s.s5a.id]);
    await expect(pub(finalKey(s.year.id), [s.s5a.id])).rejects.toThrow(/Publish the Half Yearly result of .* first/);
    const r = await pub(examKey(hy.id), [s.s5a.id]);
    expect(r.students).toBe(1);
    const publishedNow = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(hy.id), studentId: late5a } }));
    expect(publishedNow.status).toBe("PUBLISHED");
    await pub(finalKey(s.year.id), [s.s5a.id]);
    const fin = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: finalKey(s.year.id), studentId: late5a } }));
    expect(fin).toMatchObject({ status: "PUBLISHED", percent: 85 });
  });
});

describe("a student who changes section after marks are in", () => {
  let ut1: Awaited<ReturnType<typeof exam>>;
  let ut2: Awaited<ReturnType<typeof exam>>;
  let changeId = "";

  it("takes their marks, draft results and report cards to the new section; a published result stays as it was", async () => {
    ut1 = await exam("Unit Test 1", utType, s.c6.id, [["MAT", "2026-07-06"]]);
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut1.entry("MAT"), sectionId: s.s6a.id, rows: [mark(c6[0], 44), mark(c6[1], 30)] }));
    await pub(examKey(ut1.id), [s.s6a.id]);
    ut2 = await exam("Unit Test 2", utType, s.c6.id, [["MAT", "2026-08-03"], ["ENG", "2026-08-04"]]);
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut2.entry("MAT"), sectionId: s.s6a.id, rows: [mark(c6[0], 35)] }));
    const published = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(ut1.id), studentId: c6[0] } }));

    const { change } = await s.run((tx) => changeSection(tx, s.ctx, c6[0], s6b, "Parents asked"));
    changeId = change.id;
    const marks = await s.run((tx) => tx.marks.findMany({ where: { studentId: c6[0] } }));
    expect(marks.length).toBe(2);
    expect(marks.every((m) => m.sectionId === s6b)).toBe(true);
    const moved = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(ut1.id), studentId: c6[0] } }));
    expect(moved).toMatchObject({ sectionId: s.s6a.id, status: "PUBLISHED", total: published.total, rank: published.rank });
    expect(await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(ut2.id), studentId: c6[0] } }))).toMatchObject({ sectionId: s6b, status: "DRAFT" });
    expect((await s.run((tx) => tx.reportCard.findMany({ where: { studentId: c6[0] } }))).every((c) => c.sectionId === s6b)).toBe(true);
    expect(await s.run((tx) => tx.auditLogEntry.count({ where: { action: "results-followed-student", recordId: c6[0] } }))).toBe(1);
  });

  it("the new section's teacher sees the marks already there and can enter the rest without an error", async () => {
    const mat = await s.run((tx) => loadPaper(tx, s.ctx, ut2.entry("MAT"), s6b));
    expect(mat!.marks.find((m) => m.studentId === c6[0])?.total).toBe(35);
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut2.entry("MAT"), sectionId: s6b, rows: [mark(c6[0], 36)] }));
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut2.entry("ENG"), sectionId: s6b, rows: [mark(c6[0], 41)] }));
    const [b] = await s.run((tx) => readiness(tx, s.ctx, examKey(ut2.id), [s6b]));
    expect(b).toMatchObject({ ready: true });
    // The old section no longer counts the student who left it.
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut2.entry("MAT"), sectionId: s.s6a.id, rows: [mark(c6[1], 20)] }));
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut2.entry("ENG"), sectionId: s.s6a.id, rows: [mark(c6[1], 20)] }));
    const [a] = await s.run((tx) => readiness(tx, s.ctx, examKey(ut2.id), [s.s6a.id]));
    expect(a).toMatchObject({ ready: true });
    const sheet = await s.run((tx) => resultSheet(tx, s.ctx, ut2.id, s6b));
    expect(sheet!.rows.find((r) => r.studentId === c6[0])).toMatchObject({ total: 77, complete: true });
    const sheet1 = await s.run((tx) => resultSheet(tx, s.ctx, ut1.id, s6b));
    expect(sheet1!.rows.find((r) => r.studentId === c6[0])).toMatchObject({ total: 44, status: "PUBLISHED" });
    // The new section publishes; report cards are found by student, with no clash.
    await pub(examKey(ut2.id), [s6b]);
    const board = await s.run((tx) => reportBoard(tx, s.ctx, s6b, `exam:${ut1.id}`));
    expect(board!.rows.find((r) => r.studentId === c6[0])?.status).toBe("READY");
  });

  it("undoing the move takes them back; results published meanwhile still show", async () => {
    await s.run((tx) => undoSectionChange(tx, s.ctx, changeId));
    const marks = await s.run((tx) => tx.marks.findMany({ where: { studentId: c6[0] } }));
    expect(marks.every((m) => m.sectionId === s.s6a.id)).toBe(true);
    // Unit Test 2 was published for 6 B while the student was there: it stays with 6 B, and shows in 6 A.
    expect(await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(ut2.id), studentId: c6[0] } }))).toMatchObject({ sectionId: s6b, status: "PUBLISHED" });
    const sheet = await s.run((tx) => resultSheet(tx, s.ctx, ut2.id, s.s6a.id));
    expect(sheet!.rows.find((r) => r.studentId === c6[0])).toMatchObject({ total: 77, status: "PUBLISHED" });
    const [a] = await s.run((tx) => readiness(tx, s.ctx, examKey(ut2.id), [s.s6a.id]));
    expect(a).toMatchObject({ ready: true, published: false, waiting: [] });
    const r = await pub(examKey(ut2.id), [s.s6a.id]);
    expect(r.students).toBe(1);
  });
});

describe("Exam Settings: patterns, boards, competencies and GPA", () => {
  it("only full reach changes them", async () => {
    as(teacherNow);
    expect(await saveBoardsAction({})).toMatch(/permission|cannot|role/i);
    expect(await saveClassPatternsAction({ [s.c5.id]: "GRADING" })).toMatch(/permission|cannot|role/i);
    expect(await saveCompetencyForm(form({ subjectId: s.subjects.ENG, name: "Reads aloud", levels: "A, B" }))).toMatch(/permission|cannot|role/i);
  });

  it("the default pattern per class is checked and saved", async () => {
    as(principalNow);
    expect(await saveClassPatternsAction({ [s.c5.id]: "MARKS" })).toMatch(/Percentage, Grading or CGPA/);
    expect(await saveClassPatternsAction({ "00000000-0000-0000-0000-000000000000": "GRADING" })).toMatch(/Reload the page/);
    expect(await saveClassPatternsAction({ [s.c5.id]: "GRADING", [s.c6.id]: "PERCENTAGE" })).toBeUndefined();
    expect((await s.run((tx) => examSettings(tx, s.ctx))).classPatterns).toEqual({ [s.c5.id]: "GRADING" });
  });

  it("each board's grade scale and report card format show on its classes' report cards (Done when 12)", async () => {
    await s.run(async (tx) => {
      await tx.school.update({ where: { id: s.school.id }, data: { board: "CBSE" } });
      await tx.schoolClass.update({ where: { id: s.c6.id }, data: { board: "State Board" } });
      await setExamFeature(tx, s.ctx, "exam-boards", true);
    });
    const state = await s.run((tx) => importPreset(tx, s.ctx, "state"));
    as(principalNow);
    expect(await saveBoardsAction({ ICSE: { scaleId: state.id } })).toMatch(/No class follows ICSE/);
    expect(await saveBoardsAction({ "State Board": { reportBase: "fancy" } })).toMatch(/report card format/);
    // A Class 6 draft result made with the school's (CBSE) scale.
    const ut3 = await exam("Unit Test 3", utType, s.c6.id, [["MAT", "2026-09-07"]]);
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut3.entry("MAT"), sectionId: s.s6a.id, rows: [mark(c6[0], 17), mark(c6[1], 25)] }));
    const cbse = (await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(ut3.id), studentId: c6[0] } }))).grade;
    const ut1Before = await s.run((tx) => tx.result.findMany({ where: { key: { startsWith: "exam:" }, status: "PUBLISHED", classId: s.c6.id } }));

    expect(await saveBoardsAction({ "State Board": { scaleId: state.id, reportBase: "modern" }, CBSE: { reportBase: "cbse" } })).toBeUndefined();
    const saved = await s.run((tx) => examSettings(tx, s.ctx));
    expect(saved.boards).toEqual({ "State Board": { scaleId: state.id, reportBase: "modern" }, CBSE: { scaleId: null, reportBase: "cbse" } });
    // Drafts are worked out again with the State board scale; published results do not change.
    const redone = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(ut3.id), studentId: c6[0] } }));
    const stateBands = (await s.run((tx) => gradeScales(tx, s.ctx))).find((x) => x.id === state.id)!.bands;
    expect(stateBands.some((b) => b.grade === redone.grade)).toBe(true);
    // 34%: a pass (D) on the CBSE scale, a fail (D2) on the State board scale.
    expect([cbse, redone.grade, redone.outcome]).toEqual(["D", "D2", "Fail"]);
    const ut1After = await s.run((tx) => tx.result.findMany({ where: { id: { in: ut1Before.map((r) => r.id) } } }));
    expect(ut1After.map((r) => [r.id, r.grade, r.percent])).toEqual(expect.arrayContaining(ut1Before.map((r) => [r.id, r.grade, r.percent])));
    const card6 = await s.run((tx) => reportCardData(tx, s.ctx, c6[0], s.s6a.id, `exam:${ut3.id}`));
    expect(card6.data.fields.overall_grade).toBe(redone.grade);
    expect(await s.run((tx) => reportFormatFor(tx, s.ctx, "State Board"))).toBe("modern");
    expect(await s.run((tx) => reportFormatFor(tx, s.ctx, null))).toBe("cbse");
    // Switched off: every class uses the school's design again.
    await s.run((tx) => setExamFeature(tx, s.ctx, "exam-boards", false));
    expect(await s.run((tx) => reportFormatFor(tx, s.ctx, "State Board"))).toBeNull();
  });

  it("GPA shows on the report card when switched on", async () => {
    as(principalNow);
    const v = await s.run((tx) => examSettings(tx, s.ctx));
    const fd = form({
      tieRule: v.tieRule, passPercentSubject: String(v.passPercentSubject), passPercentOverall: String(v.passPercentOverall), graceMarks: "0", compartmentSubjects: "0",
      absentRule: v.absentRule, gradeOnlyGrades: v.gradeOnlyGrades.join(","), marksDueDays: "7", reminderDaysBefore: "1", defaultScaleId: v.defaultScaleId!,
      gpaOn: "on", ranksOn: "on", lateMarks: "approval", lateJoinRule: "zero",
    });
    for (const r of v.publishRoles) fd.append("publishRoles", r);
    expect(await saveRulesForm(fd)).toBeUndefined();
    const after = await s.run((tx) => examSettings(tx, s.ctx));
    expect(after).toMatchObject({ gpaOn: true, lateJoinRule: "zero", lateMarks: "approval" });
    const ut = await s.run((tx) => tx.exam.findFirstOrThrow({ where: { title: "Unit Test 3" } }));
    const card = await s.run((tx) => reportCardData(tx, s.ctx, c6[1], s.s6a.id, `exam:${ut.id}`));
    expect(card.data.fields.overall_grade).toBe("C2 (GPA 5.0)");
    expect(card.data.columns?.some((c) => c.key === "points")).toBe(true);
  });

  it("competencies are added, changed and archived, with checks", async () => {
    as(principalNow);
    expect(await saveCompetencyForm(form({ subjectId: s.subjects.ENG, name: "Reads with understanding", levels: "Beginning" }))).toMatch(/at least 2 levels/);
    expect(await saveCompetencyForm(form({ subjectId: s.subjects.ENG, name: "Reads with understanding", levels: "Beginning, Developing, Proficient" }))).toBeUndefined();
    expect(await saveCompetencyForm(form({ subjectId: s.subjects.ENG, name: "reads with understanding", levels: "A, B" }))).toMatch(/already has/);
    const c = await s.run((tx) => tx.competency.findFirstOrThrow({ where: { name: "Reads with understanding" } }));
    expect(await saveCompetencyForm(form({ id: c.id, subjectId: s.subjects.ENG, name: "Reads with understanding", levels: "Beginning, Developing, Proficient, Advanced" }))).toBeUndefined();
    expect((await s.run((tx) => tx.competency.findFirstOrThrow({ where: { id: c.id } }))).levels).toHaveLength(4);
    expect(await archiveCompetencyAction(c.id)).toBeUndefined();
    expect(await archiveCompetencyAction(c.id)).toMatch(/already archived/);
    expect(await s.run((tx) => tx.auditLogEntry.count({ where: { recordType: "Competency", recordId: c.id } }))).toBe(3);
  });
});
