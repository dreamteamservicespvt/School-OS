// The Exams tab of the Student Profile (05-roles.md): a subject teacher who is
// not the class teacher sees only the marks of the subject they teach in that
// section, with no totals, rank, final result or report cards. The class
// teacher and full roles see every subject.
import { beforeAll, describe, expect, it } from "vitest";
import type { Current } from "@/lib/current";
import { examScope } from "@/lib/exams/scope";
import { studentExamsTab } from "@/lib/exams/profile";
import { examKey } from "@/lib/exams/common";
import { academicSchool } from "../academic/fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;
let teacher: Current;
let principal: Current;
const ids = { a: "", b: "" };
const d = (x: string) => new Date(`${x}T00:00:00Z`);

beforeAll(async () => {
  s = await academicSchool();
  teacher = await s.currentFor(s.teacherUser.id);
  principal = await s.currentFor(s.principal.id);
  await s.run(async (tx) => {
    const sid = s.school.id;
    const term = await tx.term.create({ data: { schoolId: sid, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-09-30") } });
    const type = await tx.examType.create({ data: { schoolId: sid, name: "Unit Test" } });
    const exam = await tx.exam.create({ data: { schoolId: sid, academicYearId: s.year.id, termId: term.id, examTypeId: type.id, title: "Unit Test 1", classIds: [s.c5.id], startDate: d("2026-07-10"), endDate: d("2026-07-15") } });
    const subjects = [
      { subjectId: s.subjects.MAT, name: "Mathematics", max: 50, marks: 41, grade: "A2", passed: true },
      { subjectId: s.subjects.ENG, name: "English", max: 50, marks: 33, grade: "B2", passed: true },
      { subjectId: s.subjects.SCI, name: "Science", max: 50, marks: 22, grade: "C2", passed: true },
    ];
    for (const [key, sectionId] of [["a", s.s5a.id], ["b", s.s5b.id]] as const) {
      const st = await tx.student.create({ data: { schoolId: sid, campusId: s.campusId, admissionNo: `EX/${key}/${Date.now()}`, firstName: `Pupil ${key}`, fullName: `Pupil ${key}` } });
      ids[key] = st.id;
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: s.year.id, classId: s.c5.id, sectionId } });
      await tx.result.create({ data: { schoolId: sid, academicYearId: s.year.id, examId: exam.id, key: examKey(exam.id), studentId: st.id, classId: s.c5.id, sectionId, total: 96, maxTotal: 150, percent: 64, grade: "B1", rank: 3, outcome: "Pass", complete: true, subjects } });
    }
  });
}, 120_000);

describe("Exams tab by role", () => {
  it("a subject teacher sees only their own subject, without totals, rank or report cards", async () => {
    const tab = await s.run(async (tx) => studentExamsTab(tx, s.ctx, await examScope(tx, teacher, s.year.id), ids.b));
    const y = tab!.years[0];
    expect(y.onlySubjects).toEqual(["Mathematics"]);
    expect(y.exams[0].subjects.map((x) => x.name)).toEqual(["Mathematics"]);
    expect(y.exams[0]).toMatchObject({ percent: null, grade: null, rank: null, outcome: null });
    expect(y.final).toBeNull();
    expect(y.reportCards).toEqual([]);
  });

  it("the class teacher sees every subject of their own section", async () => {
    const tab = await s.run(async (tx) => studentExamsTab(tx, s.ctx, await examScope(tx, teacher, s.year.id), ids.a));
    const y = tab!.years[0];
    expect(y.onlySubjects).toBeNull();
    expect(y.exams[0].subjects).toHaveLength(3);
    expect(y.exams[0].percent).toBe(64);
  });

  it("the Principal sees every subject", async () => {
    const tab = await s.run(async (tx) => studentExamsTab(tx, s.ctx, await examScope(tx, principal, s.year.id), ids.b));
    expect(tab!.years[0].onlySubjects).toBeNull();
    expect(tab!.years[0].exams[0].subjects).toHaveLength(3);
  });
});
