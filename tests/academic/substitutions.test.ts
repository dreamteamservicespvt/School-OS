// Substitutions (04 §9 Done when 6, rule "Substitute double-booked"):
// approved leave lists the teacher's periods, only free teachers are
// suggested, and nobody can be booked in two places at once.
import { beforeAll, describe, expect, it } from "vitest";
import { assignSubstitute, markAbsent, needsOn, suggestSubstitutes, raiseForLeave } from "@/lib/academic/substitutions";
import { academicSchool, d } from "./fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;
const monday = d("2026-11-09");

beforeAll(async () => {
  s = await academicSchool();
  // Asha (5 A maths in period 1, 5 B maths in period 2) is on approved leave on Monday.
  await s.run(async (tx) => {
    const type = await tx.leaveType.create({ data: { schoolId: s.school.id, forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 12 } });
    const leave = await tx.leaveRequest.create({ data: { schoolId: s.school.id, staffId: s.staff[0].id, leaveTypeId: type.id, fromDate: monday, toDate: monday, days: 1, reason: "Wedding", status: "APPROVED" } });
    await raiseForLeave(tx, s.ctx, leave.id);
  });
});

describe("approved leave raises substitution needs", () => {
  it("lists the teacher's Monday periods", async () => {
    const { rows } = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday));
    expect(rows.map((r) => `${r.periodNo} ${r.sectionLabel} ${r.absentName} ${r.reason}`)).toEqual(["1 Class 5 A Asha Rao leave", "2 Class 5 B Asha Rao leave"]);
    expect(rows.every((r) => r.substitution?.status === "NEEDED")).toBe(true);
  });

  it("suggests only teachers free in that period, best match first", async () => {
    const { rows } = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday));
    const p1 = rows.find((r) => r.periodNo === 1)!;
    const suggestions = await s.run((tx) => suggestSubstitutes(tx, s.ctx, s.campusId, p1.id, monday));
    // Kiran (5 B) and Meera (6 A) teach in period 1; Asha is away. Only Vikram is free.
    expect(suggestions.map((x) => x.name)).toEqual(["Vikram Shah"]);
    expect(suggestions[0].why).toMatch(/teaches this subject/);
    const p2 = rows.find((r) => r.periodNo === 2)!;
    const second = await s.run((tx) => suggestSubstitutes(tx, s.ctx, s.campusId, p2.id, monday));
    expect(second.map((x) => x.name)).toEqual(["Meera Pillai"]);
  });
});

describe("no double booking", () => {
  it("refuses a substitute who teaches in that period", async () => {
    const { rows } = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday));
    const p1 = rows.find((r) => r.periodNo === 1)!;
    await expect(s.run((tx) => assignSubstitute(tx, s.ctx, { campusId: s.campusId, date: monday, periodIds: [p1.id], substituteId: s.staff[1].id, note: null }))).rejects.toThrow("Kiran Das is not free in period 1 on 09-11-2026. Choose another teacher.");
  });

  it("refuses a substitute who already covers another class in that period", async () => {
    const { rows } = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday));
    const p1 = rows.find((r) => r.periodNo === 1)!;
    await s.run((tx) => assignSubstitute(tx, s.ctx, { campusId: s.campusId, date: monday, periodIds: [p1.id], substituteId: s.staff[3].id, note: "Chapter 4" }));
    // Meera is marked absent too: her 6 A period 1 needs cover, and Vikram is now busy covering 5 A.
    await s.run((tx) => markAbsent(tx, s.ctx, { staffId: s.staff[2].id, date: monday, note: null }));
    const after = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday));
    const meera1 = after.rows.find((r) => r.absentName === "Meera Pillai" && r.periodNo === 1)!;
    expect((await s.run((tx) => suggestSubstitutes(tx, s.ctx, s.campusId, meera1.id, monday))).map((x) => x.name)).not.toContain("Vikram Shah");
    await expect(s.run((tx) => assignSubstitute(tx, s.ctx, { campusId: s.campusId, date: monday, periodIds: [meera1.id], substituteId: s.staff[3].id, note: null }))).rejects.toThrow(/Vikram Shah is not free in period 1/);
  });

  it("tells the substitute about the extra period", async () => {
    const vikramLogin = await s.run((tx) => tx.staff.findUnique({ where: { id: s.staff[3].id } }));
    expect(vikramLogin?.userLoginId ?? null).toBeNull();
    const subs = await s.run((tx) => tx.substitution.findMany({ where: { substituteStaffId: s.staff[3].id, status: "ARRANGED" } }));
    expect(subs).toHaveLength(1);
  });
});
