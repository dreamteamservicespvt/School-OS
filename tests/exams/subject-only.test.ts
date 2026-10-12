// Subject teachers see marks only for their own subjects (owner's rules,
// 12 Oct 2026): in a section they do not class-teach, the result sheet, its
// export and the analysis keep only the subjects given to them in Teacher
// Allocation, with no totals, ranks or overall results. Exam Analysis and the
// final result are not theirs at all, and the server refuses them.
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

import { examScope, resultSubjects, type ExamScope } from "@/lib/exams/scope";
import { createDatesheet, publishDatesheet } from "@/lib/exams/datesheet";
import { saveMarks } from "@/lib/exams/marks";
import { resultSheet } from "@/lib/exams/results";
import { analyse, studentsBehind } from "@/lib/exams/analysis";
import { examSettings } from "@/lib/exams/settings";
import { GET as exportGet } from "@/app/(school)/examination-results/export/route";
import { academicSchool, d } from "../academic/fixture";
import { addStudent } from "../students/fixtures";

let s: Awaited<ReturnType<typeof academicSchool>>;
let principal: ExamScope;
let teacher: ExamScope;
let teacherCurrent: Current;
let principalCurrent: Current;
let examId = "";
const in5a: string[] = [];
const in5b: string[] = [];

const marks = (studentId: string, n: number) => ({ studentId, parts: { Marks: n }, absent: false, grade: null, remark: null });

beforeAll(async () => {
  s = await academicSchool();
  for (let i = 0; i < 2; i++) in5a.push((await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false })).student.id);
  for (let i = 0; i < 2; i++) in5b.push((await addStudent(s.ctx, s.s5b.id, { applyFeePlan: false })).student.id);
  [teacherCurrent, principalCurrent] = await Promise.all([s.currentFor(s.teacherUser.id), s.currentFor(s.principal.id)]);
  principal = await s.run((tx) => examScope(tx, principalCurrent, s.year.id));
  teacher = await s.run((tx) => examScope(tx, teacherCurrent, s.year.id));
  await s.run(async (tx) => {
    const term = await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-12-31"), sortOrder: 1 } });
    await examSettings(tx, s.ctx);
    const typeId = (await tx.examType.findFirstOrThrow({ where: { name: "Half Yearly" } })).id;
    const row = (code: string, date: string) => ({ classId: s.c5.id, subjectId: s.subjects[code], date: d(date), startTime: "09:30", durationMin: 120, room: null, invigilatorId: null, maxMarks: 50, pattern: null });
    const r = await createDatesheet(tx, s.ctx, s.year.id, { title: "Half Yearly", examTypeId: typeId, pattern: "PERCENTAGE", termId: term.id, startDate: d("2026-10-05"), endDate: d("2026-10-16"), classIds: [s.c5.id], gradeScaleId: null }, [row("MAT", "2026-10-05"), row("ENG", "2026-10-06")]);
    examId = r.exam.id;
    await publishDatesheet(tx, s.ctx, examId, { tellParents: false });
    const entries = await tx.datesheetEntry.findMany({ where: { examId } });
    const entry = (code: string) => entries.find((e) => e.subjectId === s.subjects[code])!.id;
    for (const [sectionId, kids] of [[s.s5a.id, in5a], [s.s5b.id, in5b]] as const) {
      await saveMarks(tx, s.ctx, principal, { entryId: entry("MAT"), sectionId, rows: kids.map((k, i) => marks(k, 40 - i * 10)) });
      await saveMarks(tx, s.ctx, principal, { entryId: entry("ENG"), sectionId, rows: kids.map((k, i) => marks(k, 35 - i * 5)) });
    }
  });
}, 180_000);

describe("which subjects a person sees in a section's results", () => {
  it("a subject teacher sees only their subject; their own class and full roles see every subject", () => {
    // Asha teaches Maths in 5 A (her own class) and 5 B.
    expect(resultSubjects(teacher, s.s5b.id)).toEqual([s.subjects.MAT]);
    expect(resultSubjects(teacher, s.s5a.id)).toBeNull();
    expect(resultSubjects(principal, s.s5b.id)).toBeNull();
  });

  it("the result sheet for 5 B keeps only Maths, with no totals, ranks or results", async () => {
    const sheet = await s.run((tx) => resultSheet(tx, s.ctx, examId, s.s5b.id, resultSubjects(teacher, s.s5b.id)));
    expect(sheet!.columns.map((c) => c.id)).toEqual([s.subjects.MAT]);
    for (const r of sheet!.rows) {
      expect(Object.keys(r.cells)).toEqual([s.subjects.MAT]);
      expect(r).toMatchObject({ total: 0, maxTotal: 0, percent: null, grade: null, rank: null, outcome: null });
    }
    const full = await s.run((tx) => resultSheet(tx, s.ctx, examId, s.s5b.id, resultSubjects(principal, s.s5b.id)));
    expect(full!.columns).toHaveLength(2);
    expect(full!.rows.some((r) => r.percent !== null)).toBe(true);
  });

  it("the analysis counts overall results only for the teacher's own class, and subjects only for what they teach", async () => {
    const a = await s.run((tx) => analyse(tx, s.ctx, teacher, s.year.id, { examId, final: false, classId: null, sectionId: null, subjectId: null }));
    expect(a!.overview.students).toBe(in5a.length);
    const fiveB = a!.subjectRows.filter((r) => r.sectionId === s.s5b.id);
    expect(fiveB.map((r) => r.subjectId)).toEqual([s.subjects.MAT]);
    const englishIn5b = await s.run((tx) => studentsBehind(tx, teacher, s.year.id, { examId, final: false, classId: null, sectionId: s.s5b.id, subjectId: null }, { kind: "subject-pass", value: s.subjects.ENG }));
    expect(englishIn5b).toEqual([]);
    const mathsIn5b = await s.run((tx) => studentsBehind(tx, teacher, s.year.id, { examId, final: false, classId: null, sectionId: s.s5b.id, subjectId: null }, { kind: "subject-pass", value: s.subjects.MAT }));
    expect(mathsIn5b.length).toBeGreaterThan(0);
    expect(mathsIn5b.every((r) => r.rank === null && r.outcome === null)).toBe(true);
  });

  it("Exam Analysis is for whole-school roles only", () => {
    expect(teacher.analysis).toBe(false);
    expect(principal.analysis).toBe(true);
  });
});

describe("the export refuses what the teacher may not see", () => {
  const get = (q: string) => exportGet(new Request(`http://localhost/examination-results/export?format=csv&${q}`));

  it("exports only Maths for 5 B, without totals", async () => {
    who.current = teacherCurrent;
    const res = await get(`kind=result-sheet&section=${s.s5b.id}&exam=${examId}`);
    expect(res.status).toBe(200);
    const head = (await res.text()).split("\n").find((l) => l.includes("Roll")) ?? "";
    expect(head).toContain("Mathematics");
    expect(head).not.toContain("English");
    expect(head).not.toContain("Total");
  });

  it("refuses the final result of 5 B and the analysis", async () => {
    who.current = teacherCurrent;
    expect((await get(`kind=final-sheet&section=${s.s5b.id}`)).status).toBe(403);
    expect((await get(`kind=analysis&exam=${examId}`)).status).toBe(403);
  });

  it("the Principal exports every subject with totals", async () => {
    who.current = principalCurrent;
    const res = await get(`kind=result-sheet&section=${s.s5b.id}&exam=${examId}`);
    const head = (await res.text()).split("\n").find((l) => l.includes("Roll")) ?? "";
    expect(head).toContain("English");
    expect(head).toContain("Total");
  });
});
