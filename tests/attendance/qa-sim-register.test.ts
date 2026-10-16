// QA (Chaitanya EM School audit), SIM-03, SIM-04 and SIM-05: the Dashboard,
// Attendance Reports, the class-wise view and the register count the students
// on the section's register on each day (src/lib/attendance/on-register.ts).
// A student who has left keeps every saved mark; the marks count for the days
// the student was on the register (before the leaving date), not after.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { classWise } from "@/lib/attendance/classwise";
import { attendanceToday } from "@/lib/attendance/integrations";
import { registerMonth } from "@/lib/attendance/register";
import { runReport, type ReportInput } from "@/lib/attendance/reports";
import { accessFor, as, at, d } from "./fixture";
import { makeSimSchool, TODAY, WEEK, type SimFixture } from "./qa-sim-fixture";

let f: SimFixture;

const viewer = async (userId: string): Promise<Current> => {
  const view = await accessIn(userId, f.school.id);
  return { ...view!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
};

beforeAll(async () => {
  f = await makeSimSchool("Attendance QA Register School");
}, 120_000);

describe("today's numbers count the register", () => {
  it("SIM-03: the Dashboard leaves out the transferred student's mark", async () => {
    // QA (Chaitanya EM School audit), SIM-03: Dashboard "17 / 352 · 81% of marked" counted a Present mark of a TRANSFERRED student no longer on the register.
    const home = await buildHome(await viewer(f.principal.id), { now: at(TODAY, "12:00") });
    const tile = home.band.find((b) => b.id === "attendance.students-present");
    // 5 A: Rohan present + Meera late = 2, Diya absent, Ishaan on leave (not counted), Varun not marked; 5 B not taken.
    expect(tile?.big).toBe("2");
    expect(tile?.of).toBe("/ 10");
    expect(tile?.foot).toBe("66.7% of marked · 1 absent · 1 class not marked");
    // The leaver's marks are still stored.
    const kept = await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.attendanceMark.count({ where: { studentId: f.leaverId, archivedAt: null } }));
    expect(kept).toBe(3);
  });

  it("SIM-04: the daily report and the tile above it agree on present, not marked and %", async () => {
    // QA (Chaitanya EM School audit), SIM-04: "on roll 21, Present 17, Not marked 0, 85%" while the tile said "17 of 21 · 81%"; truth was 16 present and 1 not marked.
    const access = await accessFor(f, f.principal.id);
    const input: ReportInput = { report: "daily", date: d(TODAY), month: d("2026-10-01"), from: d(TODAY), to: d(TODAY), sectionId: null, person: null, period: "month", today: d(TODAY) };
    const { table, day } = await withSchool(as(f, f.principal.id), async (tx) => ({
      table: await runReport(tx, as(f, f.principal.id), access, input),
      day: await attendanceToday(tx, as(f, f.principal.id), d(TODAY), {}),
    }));
    const row = table.rows.find((r) => r.who === "Class 5 A")!;
    expect(row).toMatchObject({ total: 5, present: 2, absent: 1, late: 1, leave: 1, notMarked: 1, percent: "66.7%" });
    expect(day.students.present).toBe(2);
    expect(day.students.percent).toBe(66.7);
    // Varun in 5 A, and the five of 5 B (not taken).
    expect(day.students.notMarked).toBe(6);
  });
});

describe("past days count the students on the register that day", () => {
  it("SIM-05: the week counts the transferred student's marks before the leaving date only", async () => {
    // QA (Chaitanya EM School audit), SIM-05: the 12-16 Oct report showed Present 93 against the register's 90; the extra were the transferred student's marks.
    // Reading: the leaving date is the day the status changes and Take Attendance stops listing the student,
    // so 12 and 13 Oct count (he was on the register) and 14 Oct does not.
    const week = await withSchool(as(f, f.principal.id), (tx) => classWise(tx, as(f, f.principal.id), { yearId: f.year.id, from: d(WEEK[0]), to: d(TODAY), today: d(TODAY), sectionIds: [f.sectionA.id] }));
    expect(week.sections[0].present).toBe(5 + 5 + 2);
    expect(week.sections[0].absent).toBe(1);
    const first = await withSchool(as(f, f.principal.id), (tx) => classWise(tx, as(f, f.principal.id), { yearId: f.year.id, from: d(WEEK[0]), to: d(WEEK[0]), today: d(TODAY), sectionIds: [f.sectionA.id] }));
    expect(first.sections[0].present).toBe(5);
    expect(first.sections[0].percent).toBe(100);
  });

  it("the monthly register keeps the leaver's row with the days he was on the register", async () => {
    const grid = await withSchool(as(f, f.principal.id), (tx) => registerMonth(tx, as(f, f.principal.id), { sectionId: f.sectionA.id, month: d("2026-10-01"), today: d(TODAY) }));
    const row = grid!.rows.find((r) => r.id === f.leaverId)!;
    expect(row.name).toContain("(left)");
    expect(Object.keys(row.days).sort()).toEqual(["2026-10-12", "2026-10-13"]);
    expect(row.summary.present).toBe(2);
  });
});
