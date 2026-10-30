// The Who list for sending Parent Links and asking for consent: sections of
// the current year only. Next year's empty "Class 5 A" was listed first, so
// choosing "Class 5 A" found 0 guardians (self-test 2026-10-30).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { whoOptions } from "@/app/(school)/communication/parent-link/who-options";
import { makeCommSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeCommSchool>>;

beforeAll(async () => {
  f = await makeCommSchool();
  await withSchool(f.ctx, async (tx) => {
    const next = await tx.academicYear.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "2027-28", startDate: new Date("2027-04-01"), endDate: new Date("2028-03-31"), status: "UPCOMING" } });
    await tx.section.create({ data: { schoolId: f.school.id, classId: f.cls.id, academicYearId: next.id, name: "A" } });
  });
});

describe("Who options", () => {
  it("lists each section of the current year once, never next year's", async () => {
    const opts = await withSchool(f.ctx, (tx) => whoOptions(tx, f.ctx));
    const fiveA = opts.filter((o) => o.label === "Class 5 A");
    expect(fiveA.map((o) => o.value)).toEqual([`section:${f.a.id}`]);
    expect(opts.filter((o) => o.label === "Class 5 B")).toHaveLength(1);
  });
});
