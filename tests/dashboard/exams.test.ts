// Examination & Results widgets on the Dashboard: a teacher sees only the
// papers, sections and students given to them (a class teacher also their own
// class), the Principal sees the whole school, and another school's exams
// never show (01-dashboard.md, 08-examination-results.md §1).
import { beforeAll, describe, expect, it } from "vitest";
import { buildHome } from "@/lib/dashboard/compose";
import type { Panel } from "@/lib/dashboard/types";
import type { Current } from "@/lib/current";
import { academicSchool, d } from "../academic/fixture";
import { makeUser } from "../helpers";

// Monday 12 October 2026, 8:00 AM in India.
const NOW = new Date("2026-10-12T02:30:00Z");
type Fixture = Awaited<ReturnType<typeof academicSchool>>;

/** A published exam for Classes 5 and 6 running this week, one student per section with results. */
async function seedExam(f: Fixture, opts: { title: string; percents: Record<"s5a" | "s5b" | "s6a", number[]> }) {
  return f.run(async (tx) => {
    const schoolId = f.school.id;
    const term = await tx.term.create({ data: { schoolId, academicYearId: f.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-10-31") } });
    const type = await tx.examType.create({ data: { schoolId, name: `Half-yearly ${opts.title}` } });
    const exam = await tx.exam.create({ data: { schoolId, academicYearId: f.year.id, termId: term.id, examTypeId: type.id, title: opts.title, classIds: [f.c5.id, f.c6.id], startDate: d("2026-10-12"), endDate: d("2026-10-16"), status: "PUBLISHED", publishedAt: d("2026-10-01") } });
    const entry = (classId: string, subject: string, date: string, invigilatorId?: string) => tx.datesheetEntry.create({ data: { schoolId, examId: exam.id, classId, subjectId: f.subjects[subject], date: d(date), startTime: "09:00", durationMin: 120, maxMarks: 80, marksDueDate: d("2026-10-13"), invigilatorId } });
    await entry(f.c5.id, "MAT", "2026-10-12");
    await entry(f.c5.id, "ENG", "2026-10-12");
    await entry(f.c6.id, "MAT", "2026-10-12");
    await entry(f.c6.id, "ENG", "2026-10-14", f.staff[0].id); // Asha invigilates Class 6 English
    let i = 0;
    for (const [key, list] of Object.entries(opts.percents) as ["s5a" | "s5b" | "s6a", number[]][]) {
      const section = f[key];
      for (const percent of list) {
        i++;
        const st = await tx.student.create({ data: { schoolId, campusId: f.campusId, admissionNo: `${opts.title}-${i}`, firstName: `${key}-${i}`, fullName: `Student ${key.toUpperCase()} ${i}` } });
        await tx.enrolment.create({ data: { schoolId, studentId: st.id, academicYearId: f.year.id, classId: section.classId, sectionId: section.id } });
        await tx.result.create({ data: { schoolId, academicYearId: f.year.id, examId: exam.id, key: `exam:${exam.id}`, studentId: st.id, classId: section.classId, sectionId: section.id, total: percent * 0.8, maxTotal: 80, percent, outcome: percent >= 33 ? "Pass" : "Fail", complete: true } });
      }
    }
    return exam;
  });
}

let f: Fixture, other: Fixture;
let principal: Current, teacher: Current, classTeacher: Current;
let examId: string;

beforeAll(async () => {
  f = await academicSchool();
  // Vikram teaches Maths in 6 A and is class teacher of 5 B.
  const vikram = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["class-teacher"] }] });
  await f.run(async (tx) => {
    await tx.staff.update({ where: { id: f.staff[3].id }, data: { userLoginId: vikram.id } });
    await tx.section.update({ where: { id: f.s5b.id }, data: { classTeacherId: f.staff[3].id } });
  });
  examId = (await seedExam(f, { title: "Half-yearly", percents: { s5a: [80], s5b: [30], s6a: [20] } })).id;
  // Another school with many weak students and its own papers.
  other = await academicSchool();
  await seedExam(other, { title: "Other school exam", percents: { s5a: [10, 12, 14], s5b: [5, 6], s6a: [1, 2, 3] } });
  [principal, teacher, classTeacher] = await Promise.all([f.currentFor(f.principal.id), f.currentFor(f.teacherUser.id), f.currentFor(vikram.id)]);
}, 180_000);

const panel = (h: Awaited<ReturnType<typeof buildHome>>) => [...h.panels.first, ...h.panels.main, ...h.panels.side].find((p): p is Extract<Panel, { kind: "bars" }> => p.kind === "bars" && p.title === "Exam results");
const att = (h: Awaited<ReturnType<typeof buildHome>>, prefix: string) => h.attention.find((a) => a.id.startsWith(prefix));

describe("exams.marks-due", () => {
  it("a teacher sees only their own papers", async () => {
    const a = att(await buildHome(teacher, { now: NOW }), "exams.my-marks-due");
    expect(a?.title).toBe("2 papers of yours waiting for marks");
    expect(a?.detail).toContain("Mathematics Class 5 A");
    expect(a?.detail).toContain("Mathematics Class 5 B");
    expect(a?.detail).not.toMatch(/English|Class 6/);
    expect(a?.href).toBe(`/examination-results/marks?exam=${examId}`);
  });

  it("a class teacher enters marks only for papers given to them, not every paper of their class", async () => {
    const a = att(await buildHome(classTeacher, { now: NOW }), "exams.my-marks-due");
    expect(a?.title).toBe("1 paper of yours waiting for marks");
    expect(a?.detail).toContain("Mathematics Class 6 A");
  });

  it("the Principal sees every paper of this school, none of another's", async () => {
    const a = att(await buildHome(principal, { now: NOW }), "exams.marks-due");
    expect(a?.title).toBe("5 papers waiting for marks");
  });
});

describe("exams.average", () => {
  it("a teacher gets bars for their own sections only", async () => {
    const p = panel(await buildHome(teacher, { now: NOW }));
    expect(p?.rows.map((r) => r.key).sort()).toEqual([f.s5a.id, f.s5b.id].sort());
    expect(p?.rows.find((r) => r.key === f.s5a.id)?.value).toBe(80);
    expect(p?.rows[0].href).toContain("scope=s:");
  });

  it("a class teacher also sees their own class", async () => {
    const p = panel(await buildHome(classTeacher, { now: NOW }));
    expect(p?.rows.map((r) => r.key).sort()).toEqual([f.s5b.id, f.s6a.id].sort());
  });

  it("the Principal gets every class of this school, with this school's numbers only", async () => {
    const p = panel(await buildHome(principal, { now: NOW }));
    expect(p?.rows.map((r) => r.label)).toEqual(["Class 5", "Class 6"]);
    expect(p?.rows.map((r) => r.value)).toEqual([55, 20]);
    expect(p?.sub).toContain("3 students");
  });
});

describe("exams.weak-students", () => {
  it("a teacher hears only about students in their sections", async () => {
    const a = att(await buildHome(teacher, { now: NOW }), "exams.weak-students");
    expect(a?.title).toBe("1 student in Class 5 B below 50% or not passing in Half-yearly");
    expect(a?.detail).toBe("Student S5B 2");
  });

  it("a class teacher hears about their own class and the sections they teach", async () => {
    const a = att(await buildHome(classTeacher, { now: NOW }), "exams.weak-students");
    expect(a?.value).toBe("2");
  });

  it("the Principal counts this school's students only", async () => {
    const a = att(await buildHome(principal, { now: NOW }), "exams.weak-students");
    expect(a?.value).toBe("2");
    expect(a?.href).toBe(`/examination-results/analysis?exam=${examId}&drill=help`);
  });
});

describe("exams.upcoming", () => {
  it("a teacher sees the exam in their classes and their own invigilation duty", async () => {
    const h = await buildHome(teacher, { now: NOW });
    const exam = h.agenda.find((a) => a.id === `exam:${examId}`);
    expect(exam?.title).toBe("Half-yearly is on");
    expect(exam?.where).toMatch(/^Class 5/);
    expect(h.agenda.some((a) => a.id.startsWith("invigilation:") && a.title === "Invigilation: English, Class 6")).toBe(true);
    expect(h.agenda.some((a) => a.title.includes("Other school"))).toBe(false);
  });

  it("someone with no duty does not get another teacher's invigilation", async () => {
    const h = await buildHome(classTeacher, { now: NOW });
    expect(h.agenda.some((a) => a.id.startsWith("invigilation:"))).toBe(false);
    expect(h.agenda.find((a) => a.id === `exam:${examId}`)?.where).toBe("Classes 5–6 · ends Fri");
  });

  it("the Principal sees this school's exam only", async () => {
    const h = await buildHome(principal, { now: NOW });
    expect(h.agenda.filter((a) => a.id.startsWith("exam:")).map((a) => a.id)).toEqual([`exam:${examId}`]);
  });
});
