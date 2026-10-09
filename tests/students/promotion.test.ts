// Year-end promotion (A13): 03 §9 "Done when" 6 and rule 4 of 04-data-model.md.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { confirmPromotion, promotionPreview, undoPromotion } from "@/lib/students/promotion";
import { onEnrolled, registerYearActivity } from "@/lib/students/hooks";
import { addStudent, studentSchool } from "./fixtures";

let s: Awaited<ReturnType<typeof studentSchool>>;
const ids: string[] = [];
const enrolled: { studentId: string; how: string; academicYearId: string }[] = [];
let activity: string | null = null;

beforeAll(async () => {
  s = await studentSchool();
  for (let i = 0; i < 5; i++) ids.push((await addStudent(s.ctx, s.s5a)).student.id);
  // Fee Management's fee plan hook, as it will plug in (A13 "with the new fee plan").
  onEnrolled(async (_tx, _ctx, e) => { enrolled.push(e); });
  registerYearActivity(async () => activity);
});
afterAll(() => { activity = null; });

describe("promotion", () => {
  it("needs the target year to exist", async () => {
    const lone = await studentSchool();
    await withSchool(lone.ctx, async (tx) => {
      await tx.academicYear.update({ where: { id: lone.nextYearId }, data: { status: "CLOSED" } });
      await expect(promotionPreview(tx, lone.ctx, { fromSectionId: lone.s5a })).rejects.toThrow(/2027-28 is closed/);
    });
  });

  it("suggests Promote, and a changed decision needs a reason", async () => {
    await withSchool(s.ctx, async (tx) => {
      const p = await promotionPreview(tx, s.ctx, { fromSectionId: s.s5a });
      expect(p.toYear.id).toBe(s.nextYearId);
      expect(p.toClass?.id).toBe(s.c6);
      expect(p.rows).toHaveLength(5);
      expect(p.rows.every((r) => r.suggested === "PROMOTE")).toBe(true);
      await expect(confirmPromotion(tx, s.ctx, {
        fromSectionId: s.s5a, toYearId: s.nextYearId,
        decisions: p.rows.map((r, i) => ({ studentId: r.studentId, decision: i === 0 ? "DETAIN" : "PROMOTE" })),
      })).rejects.toThrow(/Give a reason/);
    });
  });

  it("moves promoted students to 6 A in the new year and leaves 5 A of this year unchanged (Done when 6)", async () => {
    const before = await withSchool(s.ctx, (tx) => tx.enrolment.findMany({ where: { sectionId: s.s5a, academicYearId: s.yearId }, orderBy: { id: "asc" } }));
    const result = await withSchool(s.ctx, async (tx) => {
      const p = await promotionPreview(tx, s.ctx, { fromSectionId: s.s5a });
      return confirmPromotion(tx, s.ctx, {
        fromSectionId: s.s5a, toYearId: s.nextYearId,
        decisions: p.rows.map((r, i) => ({ studentId: r.studentId, decision: i === 0 ? "DETAIN" : i === 1 ? "LEAVING" : "PROMOTE", reason: i < 2 ? "Decided with parents" : null })),
      });
    });
    expect(result.batch.summary).toBe("3 promoted to Class 6 A, 1 detained, 1 leaving");
    expect(result.createdSections).toHaveLength(2); // 6 A and 5 A of 2027-28 did not exist yet
    await withSchool(s.ctx, async (tx) => {
      const after = await tx.enrolment.findMany({ where: { sectionId: s.s5a, academicYearId: s.yearId }, orderBy: { id: "asc" } });
      // Last year's record keeps the same students, section and roll numbers; only the status says what happened.
      expect(after.map((e) => [e.studentId, e.sectionId, e.rollNo])).toEqual(before.map((e) => [e.studentId, e.sectionId, e.rollNo]));
      expect(after.filter((e) => e.status === "PROMOTED")).toHaveLength(3);
      expect(after.filter((e) => e.status === "HELD_BACK")).toHaveLength(1);
      const next = await tx.enrolment.findMany({ where: { academicYearId: s.nextYearId, archivedAt: null } });
      expect(next).toHaveLength(4);
      const sixA = await tx.section.findFirstOrThrow({ where: { classId: s.c6, academicYearId: s.nextYearId, name: "A" } });
      expect(next.filter((e) => e.sectionId === sixA.id).map((e) => e.rollNo).sort()).toEqual([1, 2, 3]);
      const promotedStudent = await tx.student.findUniqueOrThrow({ where: { id: next.find((e) => e.sectionId === sixA.id)!.studentId } });
      expect(promotedStudent.status).toBe("PROMOTED");
      expect(await tx.leavingRequest.count({ where: { studentId: { in: ids }, status: "IN_PROGRESS" } })).toBe(1);
    });
    // The new year's fee plan is applied through Fee Management's hook.
    expect(enrolled.filter((e) => e.how === "promoted" && e.academicYearId === s.nextYearId)).toHaveLength(4);
  });

  it("will not promote the same students twice", async () => {
    await withSchool(s.ctx, async (tx) => {
      const p = await promotionPreview(tx, s.ctx, { fromSectionId: s.s5a });
      expect(p.rows.filter((r) => r.alreadyIn)).toHaveLength(4);
    });
  });

  it("cannot be undone once something is recorded in the new year", async () => {
    const batch = await withSchool(s.ctx, (tx) => tx.promotionBatch.findFirstOrThrow({ where: { fromSectionId: s.s5a } }));
    activity = "attendance is marked for 3 students";
    await expect(withSchool(s.ctx, (tx) => undoPromotion(tx, s.ctx, batch.id))).rejects.toThrow(/attendance is marked for 3 students in the new year/);
    activity = null;
  });

  it("can be undone while nothing is recorded, and done again", async () => {
    const batch = await withSchool(s.ctx, (tx) => tx.promotionBatch.findFirstOrThrow({ where: { fromSectionId: s.s5a } }));
    await withSchool(s.ctx, (tx) => undoPromotion(tx, s.ctx, batch.id));
    await withSchool(s.ctx, async (tx) => {
      expect(await tx.enrolment.count({ where: { academicYearId: s.nextYearId, archivedAt: null } })).toBe(0);
      expect(await tx.enrolment.count({ where: { sectionId: s.s5a, academicYearId: s.yearId, status: "STUDYING" } })).toBe(5);
      expect(await tx.student.count({ where: { id: { in: ids }, status: "ACTIVE" } })).toBe(5);
      expect(await tx.leavingRequest.count({ where: { studentId: { in: ids }, status: "IN_PROGRESS" } })).toBe(0);
      const p = await promotionPreview(tx, s.ctx, { fromSectionId: s.s5a });
      const again = await confirmPromotion(tx, s.ctx, { fromSectionId: s.s5a, toYearId: s.nextYearId, decisions: p.rows.map((r) => ({ studentId: r.studentId, decision: "PROMOTE" })) });
      expect(again.batch.summary).toBe("5 promoted to Class 6 A");
    });
  });
});
