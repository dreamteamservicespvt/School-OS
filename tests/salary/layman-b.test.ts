// Layman test B, LB7: Generate Salary said "33 of 39, 6 missing" while Salary
// Structures said "32 of 41, 9 without". Both pages now use payrollCoverage():
// the staff on the month's payroll on one campus, and those with no structure
// for that month (a structure counts from its effective month, as the
// calculation does).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { payrollCoverage } from "@/lib/salary/payroll";
import { saveStructure } from "@/lib/salary/structures";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

let f: SalaryFixture;

beforeAll(async () => {
  f = await makeSalarySchool("Salary Coverage School");
  const acc = as(f, f.accountant.id);
  await withSchool(acc, async (tx) => {
    await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(22000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
    await saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-12-01"), lines: lines(12000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
  });
}, 120_000);

describe("who is left out of a month's salary (LB7)", () => {
  it("counts a structure only from its effective month, the way the calculation does", async () => {
    const sys = as(f, null);
    const nov = await withSchool(sys, (tx) => payrollCoverage(tx, f.school.campus.id, d("2026-11-01")));
    const dec = await withSchool(sys, (tx) => payrollCoverage(tx, f.school.campus.id, d("2026-12-01")));
    const missingNov = nov.missing.map((s) => s.id);
    expect(missingNov).not.toContain(f.staffA.id);
    expect(missingNov).toContain(f.staffB.id);
    expect(dec.missing.map((s) => s.id)).not.toContain(f.staffB.id);
    expect(dec.missing.length).toBe(nov.missing.length - 1);
    // Every missing person is on that month's payroll.
    for (const m of nov.missing) expect(nov.staff.map((s) => s.id)).toContain(m.id);
  });
});
