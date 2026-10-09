// Teacher Allocation and reach (04 §2, §9 Done when 3, 05-roles.md): a new
// primary teacher takes over with dates, a teacher with Own reach sees only
// their sections, and syllabus progress follows the daily log (Done when 8).
import { beforeAll, describe, expect, it } from "vitest";
import { assignTeacher, workloadFor } from "@/lib/academic/allocation";
import { academicScope } from "@/lib/academic/scope";
import { logProgress, progressOf, syllabusTree } from "@/lib/academic/syllabus";
import { archiveSection } from "@/lib/academic/structure";
import { academicSchool, d } from "./fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;
beforeAll(async () => { s = await academicSchool(); });

describe("teacher allocation", () => {
  it("a new primary teacher takes over from a date; the old assignment ends the day before", async () => {
    await s.run((tx) => assignTeacher(tx, s.ctx, { yearId: s.year.id, campusId: s.campusId, sectionIds: [s.s6a.id], subjectId: s.subjects.MAT, staffId: s.staff[1].id, role: "primary", periodsPerWeek: null, fromDate: d("2026-11-01"), overLimitReason: null }));
    const rows = await s.run((tx) => tx.teacherAllocation.findMany({ where: { sectionId: s.s6a.id, subjectId: s.subjects.MAT, archivedAt: null }, orderBy: { fromDate: "asc" } }));
    expect(rows.map((r) => [r.staffId, r.toDate?.toISOString().slice(0, 10) ?? null])).toEqual([[s.staff[3].id, "2026-10-31"], [s.staff[1].id, null]]);
  });

  it("refuses a subject that is not taught in the class", async () => {
    const art = await s.run((tx) => tx.subject.create({ data: { schoolId: s.school.id, code: "ART", name: "Art" } }));
    await expect(s.run((tx) => assignTeacher(tx, s.ctx, { yearId: s.year.id, campusId: s.campusId, sectionIds: [s.s5a.id], subjectId: art.id, staffId: s.staff[1].id, role: "primary", periodsPerWeek: null, fromDate: d("2026-10-09"), overLimitReason: null }))).rejects.toThrow(/not taught in Class 5/);
  });

  it("counts each teacher's periods a week from the subject's period count", async () => {
    const load = await s.run((tx) => workloadFor(tx, s.ctx, s.year.id, d("2026-10-09"), [s.staff[0].id]));
    expect(load.get(s.staff[0].id)).toBe(12);
  });
});

describe("reach", () => {
  it("a teacher sees only their own sections; the principal sees all", async () => {
    const teacher = await s.currentFor(s.teacherUser.id);
    const principal = await s.currentFor(s.principal.id);
    const t = await s.run((tx) => academicScope(tx, teacher, s.year.id));
    const p = await s.run((tx) => academicScope(tx, principal, s.year.id));
    expect(t.see).toBe("own");
    expect(t.manage).toBe(false);
    expect(new Set(t.sectionIds)).toEqual(new Set([s.s5a.id, s.s5b.id]));
    expect(p.see).toBe("all");
    expect(p.manage).toBe(true);
    expect(p.sectionIds).toBeNull();
  });
});

describe("syllabus progress", () => {
  it("ticking topics in the daily log updates the completion", async () => {
    const ids = await s.run(async (tx) => {
      const unit = await tx.syllabusItem.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, classId: s.c5.id, subjectId: s.subjects.MAT, kind: "CHAPTER", title: "Fractions", plannedTo: d("2026-09-30") } });
      const topics = [];
      for (const [i, t] of ["Like fractions", "Equivalent fractions", "Adding fractions", "Subtracting fractions"].entries()) {
        topics.push((await tx.syllabusItem.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, classId: s.c5.id, subjectId: s.subjects.MAT, parentId: unit.id, kind: "TOPIC", title: t, sortOrder: i } })).id);
      }
      return topics;
    });
    const today = d("2026-10-09");
    const before = progressOf(await s.run((tx) => syllabusTree(tx, s.year.id, s.c5.id, s.subjects.MAT, s.s5a.id, today)), today);
    expect(before.completedPct).toBe(0);
    expect(before.late.map((l) => l.title)).toEqual(["Fractions"]);
    await s.run((tx) => logProgress(tx, s.ctx, { yearId: s.year.id, sectionId: s.s5a.id, itemIds: ids.slice(0, 2), date: today, status: "taught", staffId: s.staff[0].id }));
    // Ticking twice changes nothing.
    await s.run((tx) => logProgress(tx, s.ctx, { yearId: s.year.id, sectionId: s.s5a.id, itemIds: ids.slice(0, 2), date: today, status: "taught", staffId: s.staff[0].id }));
    const after = progressOf(await s.run((tx) => syllabusTree(tx, s.year.id, s.c5.id, s.subjects.MAT, s.s5a.id, today)), today);
    expect(after.completedPct).toBe(50);
    expect(after.plannedPct).toBe(100);
    // 5 B is a different section: still nothing done there.
    const other = progressOf(await s.run((tx) => syllabusTree(tx, s.year.id, s.c5.id, s.subjects.MAT, s.s5b.id, today)), today);
    expect(other.completedPct).toBe(0);
  });
});

describe("sections", () => {
  it("a section with no students can be archived; its allocations end with it", async () => {
    const extra = await s.run((tx) => tx.section.create({ data: { schoolId: s.school.id, classId: s.c6.id, academicYearId: s.year.id, name: "Z", seats: 30 } }));
    await s.run((tx) => tx.teacherAllocation.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, staffId: s.staff[1].id, sectionId: extra.id, subjectId: s.subjects.ENG } }));
    const r = await s.run((tx) => archiveSection(tx, s.ctx, extra.id));
    expect(r.label).toBe("Class 6 Z");
    expect(await s.run((tx) => tx.teacherAllocation.count({ where: { sectionId: extra.id, archivedAt: null } }))).toBe(0);
  });
});
