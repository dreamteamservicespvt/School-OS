// Live test as Principal (17 Nov 2026): Generate Salary said "Salary structures
// 2 of 11 · 9 missing" while Staff & HR said 6 staff on roll. The 11 is the
// month's payroll: the staff on roll, and those who left during the month and
// are paid up to their last working day (their final settlement is paid in
// Generate Salary for that month). Someone who left before the month started is
// not on it. The count was right, but nothing said which group it counts:
// payrollCoverage() now gives the people who left, and payrollGroupWords() says
// both groups on Generate Salary and Salary Structures.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { payrollCoverage, payrollGroupWords } from "@/lib/salary/payroll";
import { as, d, makeSalarySchool, type SalaryFixture } from "./fixture";

let f: SalaryFixture;
let leftInNov: string;
let leftInOct: string;

beforeAll(async () => {
  f = await makeSalarySchool("Salary Group School");
  const sys = as(f, null);
  await withSchool(sys, async (tx) => {
    const mk = (first: string, code: string, leavingDate: Date) =>
      tx.staff.create({
        data: {
          schoolId: f.school.id, campusId: f.school.campus.id, staffCode: code, firstName: first, lastName: "Rao", fullName: `${first} Rao`,
          phone: `98765${code.replace(/\D/g, "").padStart(5, "0")}`, designation: "Teacher", joiningDate: d("2021-06-01"),
          status: "RESIGNED", leavingDate, leavingReason: "Moved to another city",
        },
      });
    leftInNov = (await mk("Anitha", "ST-091", d("2026-11-10"))).id;
    leftInOct = (await mk("Bhaskar", "ST-092", d("2026-10-31"))).id;
  });
}, 120_000);

describe("who a month's salary structure count is about", () => {
  it("counts staff on roll and those who left during the month, and names the ones who left", async () => {
    const sys = as(f, null);
    const nov = await withSchool(sys, (tx) => payrollCoverage(tx, f.school.campus.id, d("2026-11-01")));
    const ids = nov.staff.map((s) => s.id);
    // Left on 10 November: paid for the first ten days, so on November's payroll.
    expect(ids).toContain(leftInNov);
    // Last working day 31 October: gone before November started, needs no structure for November.
    expect(ids).not.toContain(leftInOct);
    expect(nov.left.map((s) => s.id)).toEqual([leftInNov]);
    // The five staff of the fixture are on roll.
    expect(nov.staff.length - nov.left.length).toBe(5);
    expect(payrollGroupWords(nov)).toBe("5 on roll + 1 who left");
  });

  it("puts both leavers on October's payroll, and nobody who left on a month with no leavers", async () => {
    const sys = as(f, null);
    const oct = await withSchool(sys, (tx) => payrollCoverage(tx, f.school.campus.id, d("2026-10-01")));
    expect(oct.left.map((s) => s.id).sort()).toEqual([leftInNov, leftInOct].sort());
    expect(payrollGroupWords(oct)).toBe("5 on roll + 2 who left");
    const dec = await withSchool(sys, (tx) => payrollCoverage(tx, f.school.campus.id, d("2026-12-01")));
    expect(dec.left).toEqual([]);
    expect(dec.staff.length).toBe(5);
    expect(payrollGroupWords(dec)).toBe("all on roll");
  });

  it("says the group in words for any numbers", () => {
    expect(payrollGroupWords({ staff: new Array(11), left: new Array(5) })).toBe("6 on roll + 5 who left");
    expect(payrollGroupWords({ staff: new Array(6), left: [] })).toBe("all on roll");
    expect(payrollGroupWords({ staff: [], left: [] })).toBe("no staff yet");
  });
});
