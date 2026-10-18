// Admit cards (08 Admit Cards, browser finding TEACHING-18): each card has the
// father's and mother's name and signature lines for the student, the class
// teacher and the school's signatory; an admission number is printed whole,
// never broken in the middle (on report cards too: the same details grid).
import { beforeAll, describe, expect, it } from "vitest";
import { createDatesheet, publishDatesheet } from "@/lib/exams/datesheet";
import { renderAdmitCards } from "@/lib/exams/admit";
import { examSettings } from "@/lib/exams/settings";
import { keptWhole } from "@/lib/documents/render";
import { academicSchool, d } from "../academic/fixture";
import { addStudent } from "../students/fixtures";

let s: Awaited<ReturnType<typeof academicSchool>>;
let examId = "";
let studentId = "";

beforeAll(async () => {
  s = await academicSchool();
  studentId = (await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false, guardianName: "Ramesh Iyer" })).student.id;
  await s.run(async (tx) => {
    const mother = await tx.guardian.create({ data: { schoolId: s.school.id, name: "Lakshmi Iyer", relationship: "Mother", phone: "9811122233" } });
    await tx.studentGuardian.create({ data: { schoolId: s.school.id, studentId, guardianId: mother.id, relationship: "Mother", isPrimary: false } });
    await tx.student.update({ where: { id: studentId }, data: { admissionNo: "SPS/2021/0180" } });
    const term = await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-12-31"), sortOrder: 1 } });
    await examSettings(tx, s.ctx);
    const typeId = (await tx.examType.findFirstOrThrow({ where: { name: "Half Yearly" } })).id;
    const r = await createDatesheet(tx, s.ctx, s.year.id, { title: "Half Yearly", examTypeId: typeId, pattern: "PERCENTAGE", termId: term.id, startDate: d("2026-11-02"), endDate: d("2026-11-02"), classIds: [s.c5.id], gradeScaleId: null },
      [{ classId: s.c5.id, subjectId: s.subjects.MAT, date: d("2026-11-02"), startTime: "09:30", durationMin: 120, room: null, invigilatorId: null, maxMarks: 80, pattern: null }]);
    examId = r.exam.id;
    await publishDatesheet(tx, s.ctx, examId, { tellParents: false });
  });
}, 120_000);

describe("an admit card", () => {
  it("has the father's and mother's names, and signature lines for the student, class teacher and Principal", async () => {
    const { doc } = await s.run((tx) => renderAdmitCards(tx, s.ctx, { examId, sectionId: s.s5a.id, studentId }));
    expect(doc.html).toContain("Ramesh Iyer");
    expect(doc.html).toContain("Lakshmi Iyer");
    const lines = [...doc.html.matchAll(/<div class="sigline">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(lines).toEqual(["Student", "Class teacher", "Principal"]);
  });

  it("prints the admission number whole", async () => {
    const { doc } = await s.run((tx) => renderAdmitCards(tx, s.ctx, { examId, sectionId: s.s5a.id, studentId }));
    expect(doc.html).toMatch(/<div class="whole"><dt>Admission number<\/dt><dd>SPS\/2021\/0180<\/dd><\/div>/);
    expect(doc.html).toContain(".info div.whole dd{white-space:nowrap");
  });

  it("keeps numbers and codes whole, but lets names and words wrap", () => {
    for (const v of ["SPS/2021/0180", "9876543210", "01-04-2026", "12"]) expect(keptWhole(v)).toBe(true);
    for (const v of ["Class 5 A", "Ramesh Iyer", "Half Yearly, 2026-27 (Term 1)", "A".repeat(30)]) expect(keptWhole(v)).toBe(false);
  });
});
