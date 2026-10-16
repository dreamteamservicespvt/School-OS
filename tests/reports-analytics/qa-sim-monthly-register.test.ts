// QA (Chaitanya EM School audit), SIM-07: the Monthly attendance register in
// Reports & Analytics shows school days, days marked and days not marked, so a
// reader can tell when days were never taken, and the % says what it is of.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { findEntry } from "@/lib/reports/catalogue";
import { readFilters } from "@/lib/reports/filters";
import { runEntry, viewerOf } from "@/lib/reports/run";
import { d, TZ } from "../attendance/fixture";
import { makeSimSchool, TODAY, type SimFixture } from "../attendance/qa-sim-fixture";

let f: SimFixture;
const SETUP = { timeZone: TZ, weekStart: "monday" as const, calendar: {} };

beforeAll(async () => {
  f = await makeSimSchool("Reports QA Monthly Register School");
}, 120_000);

describe("Monthly attendance register", () => {
  it("SIM-07: shows days not marked instead of hiding them in the %", async () => {
    // QA (Chaitanya EM School audit), SIM-07: every row said "School days 13" while only 5 days were marked, and 5 present of 13 showed as 100%.
    const v = await withSchool({ schoolId: f.school.id, userId: f.principal.id }, (tx) => viewerOf(tx, f.principal.id, f.school.id));
    const e = findEntry("at-monthly")!;
    // 9 to 14 Oct: 5 school days (Sunday 11 Oct is off), of which 12, 13 and 14 are marked.
    const t = await withSchool(v!.ctx, async (tx) => runEntry(tx, v!, e, await readFilters(tx, v!.ctx, e, { period: "custom", from: "2026-10-09", to: TODAY, section: f.sectionA.id }, SETUP, d(TODAY))));
    expect(t.columns.map((c) => c.label)).toEqual(["Student", "Class", "Roll no.", "School days", "Days marked", "Not marked", "Present", "Absent", "Late", "On leave", "Days counted", "Present %"]);
    expect(t.rows.find((r) => r.name === "Rohan Das")).toMatchObject({ days: 5, marked: 3, notMarked: 2, counted: 3, present: 3, percent: 100 });
    expect(t.rows.find((r) => r.name === "Ishaan Kumar")).toMatchObject({ days: 5, marked: 3, notMarked: 2, counted: 2, leave: 1, percent: 100 });
    expect(t.rows.find((r) => r.name === "Varun Teja")).toMatchObject({ marked: 0, notMarked: 5, percent: null });
    expect(t.note).toContain("Days not marked are left out of the %");
  });
});
