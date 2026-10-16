// Examination & Results end to end (08 Done when): a datesheet with a clash
// check, marks entry only by the subject's teacher and only once published,
// submit and lock, moderation with approval, publishing blocked while marks
// are missing, publishing only by permitted roles, a grade scale change never
// changing published results, report cards and Parent Link following
// publication, and a teacher seeing only their own papers.
import { beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { examScope, type ExamScope } from "@/lib/exams/scope";
import { createDatesheet, publishDatesheet } from "@/lib/exams/datesheet";
import { lockPapers, papersFor, readMarkRows, requestModeration, saveMarks, submitPaper } from "@/lib/exams/marks";
import { publishResults, unpublishResults } from "@/lib/exams/results";
import { examSettings, gradeScales, saveGradeScale } from "@/lib/exams/settings";
import { parentReportCards } from "@/lib/exams/parent-link";
import { reportBoard } from "@/lib/exams/report-cards";
import { examKey } from "@/lib/exams/common";
import { decide } from "@/lib/approvals";
import "@/lib/exams/handlers";
import { academicSchool, d } from "../academic/fixture";
import { addStudent } from "../students/fixtures";

let s: Awaited<ReturnType<typeof academicSchool>>;
const students: string[] = [];
let examId = "";
let mat5a = "";
let eng5a = "";
let principal: ExamScope;
let teacher: ExamScope;
let termId = "";
let typeId = "";

const scopeOf = async (userId: string) => {
  const cur = await s.currentFor(userId);
  return s.run((tx) => examScope(tx, cur, s.year.id));
};
const marks = (studentId: string, n: number | null, extra: { absent?: boolean; medical?: boolean } = {}) => ({ studentId, parts: { Marks: n }, absent: Boolean(extra.absent), medical: extra.medical, grade: null, remark: null });

beforeAll(async () => {
  s = await academicSchool();
  for (let i = 0; i < 4; i++) {
    const { student } = await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false });
    students.push(student.id);
  }
  await s.run(async (tx) => {
    const term = await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-12-31"), sortOrder: 1 } });
    termId = term.id;
    await examSettings(tx, s.ctx);
    typeId = (await tx.examType.findFirstOrThrow({ where: { name: "Half Yearly" } })).id;
  });
  principal = await scopeOf(s.principal.id);
  teacher = await scopeOf(s.teacherUser.id);
}, 120_000);

const details = (title: string) => ({ title, examTypeId: typeId, pattern: "PERCENTAGE" as const, termId, startDate: d("2026-10-05"), endDate: d("2026-10-16"), classIds: [s.c5.id], gradeScaleId: null });
const row = (subject: string, date: string, startTime = "09:30") => ({ classId: s.c5.id, subjectId: s.subjects[subject], date: d(date), startTime, durationMin: 120, room: null, invigilatorId: null, maxMarks: 50, pattern: null });

describe("datesheet", () => {
  it("creates the exam as a draft, leaving out subjects with no date", async () => {
    const r = await s.run((tx) => createDatesheet(tx, s.ctx, s.year.id, details("Half Yearly"), [row("MAT", "2026-10-05"), row("ENG", "2026-10-06"), { ...row("SCI", "2026-10-07"), date: null }]));
    examId = r.exam.id;
    expect(r).toMatchObject({ papers: 2, leftOut: 1 });
    expect(r.exam.status).toBe("DRAFT");
    const entries = await s.run((tx) => tx.datesheetEntry.findMany({ where: { examId } }));
    mat5a = entries.find((e) => e.subjectId === s.subjects.MAT)!.id;
    eng5a = entries.find((e) => e.subjectId === s.subjects.ENG)!.id;
  });

  it("refuses two papers of one class at the same time", async () => {
    await expect(s.run((tx) => createDatesheet(tx, s.ctx, s.year.id, details("Unit Test 9"), [row("MAT", "2026-10-08"), row("ENG", "2026-10-08", "10:00")]))).rejects.toThrow(/already has|two papers|at the same time|clash/i);
  });

  it("refuses a paper on a Sunday", async () => {
    await expect(s.run((tx) => createDatesheet(tx, s.ctx, s.year.id, details("Unit Test 8"), [row("MAT", "2026-10-11")]))).rejects.toThrow(/Sunday/);
  });

  it("marks cannot be entered before the datesheet is published", async () => {
    await expect(s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: mat5a, sectionId: s.s5a.id, rows: [marks(students[0], 40)] }))).rejects.toThrow(/once the datesheet is published/);
    await s.run((tx) => publishDatesheet(tx, s.ctx, examId, { tellParents: false }));
  });

  it("the exam days on the School Calendar are for the exam's classes only, not the whole school (QA ACAD)", async () => {
    const days = await s.run((tx) => tx.calendarEntry.findMany({ where: { source: `exam:${examId}`, archivedAt: null } }));
    expect(days.length).toBe(2);
    for (const day of days) expect(day.classIds).toEqual([s.c5.id]);
  });
});

describe("marks entry and locking", () => {
  it("medical leave (ML) sent by the marks grid is kept apart from absent (QA ACAD)", () => {
    const [ml, ab, typed] = readMarkRows([
      { studentId: "a", parts: {}, absent: true, medical: true, grade: null, remark: null },
      { studentId: "b", parts: {}, absent: true, grade: null, remark: null },
      { studentId: "c", parts: { Marks: "37.5" }, absent: false, grade: null, remark: null },
    ]);
    expect(ml).toMatchObject({ absent: true, medical: true });
    expect(ab).toMatchObject({ absent: true, medical: false });
    expect(typed.parts).toEqual({ Marks: 37.5 });
  });

  it("a teacher enters marks only for the subjects and sections they teach", async () => {
    const t = { schoolId: s.school.id, userId: s.teacherUser.id };
    const r = await s.run((tx) => saveMarks(tx, t, teacher, { entryId: mat5a, sectionId: s.s5a.id, rows: [marks(students[0], 45), marks(students[1], 45), marks(students[2], 30), marks(students[3], 10)] }));
    expect(r).toMatchObject({ saved: 4, done: 4, of: 4 });
    await expect(s.run((tx) => saveMarks(tx, t, teacher, { entryId: eng5a, sectionId: s.s5a.id, rows: [marks(students[0], 40)] }))).rejects.toThrow(/You do not teach English in Class 5 A/);
  });

  it("refuses marks above the maximum", async () => {
    await expect(s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: eng5a, sectionId: s.s5a.id, rows: [marks(students[0], 51)] }))).rejects.toThrow(/out of 50/);
  });

  it("a teacher sees only their own papers; the principal sees every paper", async () => {
    const mine = await s.run((tx) => papersFor(tx, s.ctx, teacher, s.year.id, { examId }));
    const all = await s.run((tx) => papersFor(tx, s.ctx, principal, s.year.id, { examId }));
    expect(new Set(mine.map((p) => `${p.subjectName} ${p.sectionLabel}`))).toEqual(new Set(["Mathematics Class 5 A", "Mathematics Class 5 B"]));
    expect(all.length).toBe(4);
  });

  it("publishing is refused while marks are missing", async () => {
    await expect(s.run((tx) => publishResults(tx, s.ctx, principal, { key: examKey(examId), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }))).rejects.toThrow(/Results in draft cannot be published.*English/);
  });

  it("after submitting, the teacher cannot change marks; a paper with missing marks cannot be submitted", async () => {
    const t = { schoolId: s.school.id, userId: s.teacherUser.id };
    await s.run((tx) => submitPaper(tx, t, teacher, mat5a, s.s5a.id));
    await expect(s.run((tx) => saveMarks(tx, t, teacher, { entryId: mat5a, sectionId: s.s5a.id, rows: [marks(students[0], 46)] }))).rejects.toThrow(/Marks are submitted/);
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: eng5a, sectionId: s.s5a.id, rows: [marks(students[0], 40)] }));
    await expect(s.run((tx) => submitPaper(tx, s.ctx, principal, eng5a, s.s5a.id))).rejects.toThrow(/Enter marks for 3 more students/);
  });

  it("absent and medical leave complete the paper; only full reach locks", async () => {
    await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: eng5a, sectionId: s.s5a.id, rows: [marks(students[1], 35), marks(students[2], null, { absent: true }), marks(students[3], null, { medical: true })] }));
    await s.run((tx) => submitPaper(tx, s.ctx, principal, eng5a, s.s5a.id));
    await expect(s.run((tx) => lockPapers(tx, { schoolId: s.school.id, userId: s.teacherUser.id }, teacher, examId, null))).rejects.toThrow(/Only the Exam In-charge or the Principal can lock/);
    const r = await s.run((tx) => lockPapers(tx, s.ctx, principal, examId, [s.s5a.id]));
    expect(r.locked).toBe(2);
    const ml = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(examId), studentId: students[3] } }));
    expect(ml.maxTotal).toBe(50);
  });
});

describe("publishing", () => {
  it("only permitted roles publish", async () => {
    expect(teacher.publish).toBe(false);
    await expect(s.run((tx) => publishResults(tx, s.ctx, teacher, { key: examKey(examId), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }))).rejects.toThrow(/does not publish/);
  });

  it("publishes with ranks, and the report card shows on Parent Link", async () => {
    await s.run((tx) => publishResults(tx, s.ctx, principal, { key: examKey(examId), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }));
    const rows = await s.run((tx) => tx.result.findMany({ where: { key: examKey(examId), sectionId: s.s5a.id } }));
    expect(rows.every((r) => r.status === "PUBLISHED")).toBe(true);
    const top = rows.find((r) => r.studentId === students[0])!;
    expect(top).toMatchObject({ total: 85, percent: 85, grade: "A2", rank: 1, outcome: "Pass" });
    const cards = await s.run((tx) => parentReportCards(tx, s.ctx, [students[0]]));
    expect(cards.map((c) => c.label)).toContain("Half Yearly");
    const board = await s.run((tx) => reportBoard(tx, s.ctx, s.s5a.id, `exam:${examId}`));
    expect(board!.rows.find((r) => r.studentId === students[0])!.status).toBe("READY");
  });

  it("report card attendance comes from the Attendance register (ACADEMICS-15)", async () => {
    await s.run((tx) => tx.attendanceMark.createMany({ data: [
      { schoolId: s.school.id, academicYearId: s.year.id, studentId: students[0], sectionId: s.s5a.id, date: d("2026-10-05"), statusKey: "present" },
      { schoolId: s.school.id, academicYearId: s.year.id, studentId: students[0], sectionId: s.s5a.id, date: d("2026-10-06"), statusKey: "absent" },
      { schoolId: s.school.id, academicYearId: s.year.id, studentId: students[0], sectionId: s.s5a.id, date: d("2026-10-07"), statusKey: "present" },
    ] }));
    const board = await s.run((tx) => reportBoard(tx, s.ctx, s.s5a.id, `exam:${examId}`));
    const marked = board!.rows.find((r) => r.studentId === students[0])!;
    expect(marked).toMatchObject({ attendanceFromRegister: true, attendancePresent: 2 });
    expect(marked.attendanceWorking).toBeGreaterThanOrEqual(3);
    expect(marked.missing).not.toContain("Attendance");
    // No mark in the register: the days the class teacher types are still used.
    expect(board!.rows.find((r) => r.studentId === students[1])!.attendanceFromRegister).toBe(false);
  });

  it("a grade scale change never changes published results", async () => {
    const scale = (await s.run((tx) => gradeScales(tx, s.ctx)))[0];
    const shifted = scale.bands.map((b) => (b.grade === "A1" ? { ...b, from: 81 } : b.grade === "A2" ? { ...b, from: 71, to: 80 } : b.grade === "B1" ? { ...b, from: 61, to: 70 } : b.grade === "B2" ? { ...b, from: 51, to: 60 } : b.grade === "C1" ? { ...b, from: 45, to: 50 } : b.grade === "C2" ? { ...b, from: 41, to: 44 } : b));
    await s.run((tx) => saveGradeScale(tx, s.ctx, { id: scale.id, name: scale.name, bands: shifted }));
    const top = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(examId), studentId: students[0] } }));
    expect(top.grade).toBe("A2");
  });

  it("a locked mark changes only through moderation with approval; the old mark stays in the history", async () => {
    const t = { schoolId: s.school.id, userId: s.teacherUser.id };
    await expect(s.run((tx) => saveMarks(tx, t, teacher, { entryId: mat5a, sectionId: s.s5a.id, rows: [marks(students[2], 33)] }))).rejects.toThrow(/Marks are submitted/);
    const { approval } = await s.run((tx) => requestModeration(tx, t, teacher, { entryId: mat5a, sectionId: s.s5a.id, studentId: students[2], value: { parts: { Marks: 33 }, absent: false, grade: null, remark: null }, reason: "Totalling mistake on page 3" }));
    const before = await s.run((tx) => tx.marks.findFirstOrThrow({ where: { entryId: mat5a, studentId: students[2] } }));
    expect(before.total).toBe(30);
    await expect(s.run((tx) => decide(tx, t, approval.id, "approve", null))).rejects.toThrow(/own request/);
    await s.run((tx) => decide(tx, s.ctx, approval.id, "approve", null));
    const after = await s.run((tx) => tx.marks.findFirstOrThrow({ where: { entryId: mat5a, studentId: students[2] } }));
    expect(after.total).toBe(33);
    expect((after.history as { before: { total: number } }[])[0].before.total).toBe(30);
    const result = await s.run((tx) => tx.result.findFirstOrThrow({ where: { key: examKey(examId), studentId: students[2] } }));
    expect(result).toMatchObject({ total: 33, status: "PUBLISHED" });
  });

  it("unpublishing takes the report card off Parent Link and needs a reason", async () => {
    await expect(s.run((tx) => unpublishResults(tx, s.ctx, principal, { key: examKey(examId), sectionIds: [s.s5a.id], reason: "x" }))).rejects.toThrow(/reason/);
    await s.run((tx) => unpublishResults(tx, s.ctx, principal, { key: examKey(examId), sectionIds: [s.s5a.id], reason: "Wrong marks in English" }));
    const cards = await s.run((tx: Tx) => parentReportCards(tx, s.ctx, [students[0]]));
    expect(cards.map((c) => c.label)).not.toContain("Half Yearly");
  });
});
