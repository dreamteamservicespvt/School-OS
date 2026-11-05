// A child admitted mid-year owes the whole year's plan, but a term whose date has passed is due on
// the day they join, never "147 days late" on day one (live test 2026-11-04, issues 12 and 16).
// And the Fee collection chart counts the year's rows like the "due so far" tile, also a term dated
// before the year's first day (issue 15: "₹35k of ₹8 L due so far" beside "No fees have fallen due").
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { assignToStudent, dueDateForStudent } from "@/lib/fees/structure";
import { monthlyTrend } from "@/lib/fees/dashboard";
import { dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

let f: FeeSchool;
beforeAll(async () => { f = await makeFeeSchool(); }, 120_000);

describe("a student who joins after a term's date", () => {
  it("keeps the later of the term's date and the joining day", () => {
    expect(iso(dueDateForStudent(day("2026-06-10"), day("2026-11-05")))).toBe("2026-11-05");
    expect(iso(dueDateForStudent(day("2027-01-01"), day("2026-11-05")))).toBe("2027-01-01");
    expect(iso(dueDateForStudent(day("2026-06-10"), null))).toBe("2026-06-10");
  });

  it("owes every term, with the past ones due on the joining day", async () => {
    const late = await withSchool(f.ctx, async (tx) => {
      const s = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: `L${randomUUID().slice(0, 6)}`, firstName: "Late", fullName: "Late Joiner", joiningDate: day("2026-11-05") } });
      await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s.id, academicYearId: f.year.id, classId: f.cls.id, sectionId: f.a.id } });
      await assignToStudent(tx, f.ctx, s.id, f.structureId, null);
      return s;
    });
    const mine = await dues(f.ctx, late.id);
    const theirs = await dues(f.ctx, f.ravi.id);
    expect(mine.length).toBe(4);
    // The same money as a child who was there from April.
    expect(mine.reduce((a, d) => a + d.amountPaise, BigInt(0))).toBe(R(24000));
    expect(theirs.reduce((a, d) => a + d.amountPaise, BigInt(0))).toBe(R(24000));
    const byLabel = new Map(theirs.map((d) => [d.label, iso(d.dueDate)]));
    for (const d of mine) {
      const original = byLabel.get(d.label)!;
      expect(iso(d.dueDate)).toBe(original < "2026-11-05" ? "2026-11-05" : original);
    }
    // A student with no joining date keeps the plan's dates.
    expect(theirs.map((d) => iso(d.dueDate))).toEqual([...byLabel.values()].sort());
  });
});

describe("the Fee collection chart", () => {
  it("counts a term dated before the year's first day in the first month, when the year is given", async () => {
    await withSchool(f.ctx, (tx) => tx.studentFeeDue.updateMany({ where: { studentId: f.sita.id, academicYearId: f.year.id }, data: { dueDate: day("2026-03-20") } }));
    const byDate = await withSchool(f.ctx, (tx) => monthlyTrend(tx, f.year.startDate, f.year.endDate));
    const byYear = await withSchool(f.ctx, (tx) => monthlyTrend(tx, f.year.startDate, f.year.endDate, {}, f.year.id));
    const total = (rows: { due: bigint }[]) => rows.reduce((a, r) => a + r.due, BigInt(0));
    // By date alone Sita's rows (before 1 April) are missed; by year they land in April.
    expect(total(byYear) - total(byDate)).toBe(R(24000));
    expect(byYear[0].key).toBe("2026-04");
    expect(byYear[0].due - byDate[0].due).toBe(R(24000));
  });
});
