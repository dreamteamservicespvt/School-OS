// Attendance totals read fast at a real school's size (gap list G37) give
// the same numbers as before: the marks come packed one row per person, and
// "Attendance % by month" works out every month from one read of the year.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { attendanceSummary } from "@/lib/attendance/summary";
import { readReportInput, runReport } from "@/lib/attendance/reports";
import { accessFor, as, d, makeAttendanceSchool, type Fixture } from "./fixture";

let f: Fixture;
const TODAY = d("2026-10-20");
const DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"];
const STATUSES = ["present", "absent", "late", "half-day", "present", "leave", "present", "absent"];

beforeAll(async () => {
  f = await makeAttendanceSchool("Attendance Summary Speed School");
  const students = [...f.studentsA.map((s) => ({ s, sec: f.sectionA.id })), ...f.studentsB.map((s) => ({ s, sec: f.sectionB.id }))];
  await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
    // Whole-day marks for everyone (2 October is a holiday: its marks never count).
    await tx.attendanceMark.createMany({
      data: students.flatMap(({ s, sec }, i) => DAYS.map((day, j) => ({
        schoolId: f.school.id, academicYearId: f.year.id, studentId: s.id, sectionId: sec, date: d(day), periodNo: 0, statusKey: STATUSES[(i + j) % STATUSES.length],
      }))),
    });
    // One student marked by period on another day (absent, then present: present for the day), and one archived mark.
    const p = f.studentsA[0].id;
    await tx.attendanceMark.createMany({
      data: [
        { schoolId: f.school.id, academicYearId: f.year.id, studentId: p, sectionId: f.sectionA.id, date: d("2026-10-08"), periodNo: 1, statusKey: "absent" },
        { schoolId: f.school.id, academicYearId: f.year.id, studentId: p, sectionId: f.sectionA.id, date: d("2026-10-08"), periodNo: 2, statusKey: "present" },
        { schoolId: f.school.id, academicYearId: f.year.id, studentId: p, sectionId: f.sectionA.id, date: d("2026-10-09"), periodNo: 0, statusKey: "absent", archivedAt: new Date() },
      ],
    });
  });
}, 120_000);

describe("attendance totals", () => {
  it("count each day once by its status, leave out holidays and archived marks, and join period marks", async () => {
    const one = f.studentsA[0].id;
    const sum = await withSchool(as(f, f.principal.id), (tx) => attendanceSummary(tx, as(f, f.principal.id), { studentId: one, from: d("2026-09-01"), to: d("2026-10-31"), today: TODAY }));
    const days = sum.days.get(one)!;
    expect(days.has("2026-10-02")).toBe(false);
    expect(days.has("2026-10-09")).toBe(false);
    expect(days.get("2026-10-08")).toBe("present");
    expect(days.get("2026-09-28")).toBe("present");
    expect(days.get("2026-09-29")).toBe("absent");
    const p = sum.people.get(one)!;
    expect(p.markedDays).toBe(8);
    expect(Object.values(p.byStatus).reduce((a, b) => a + b, 0)).toBe(8);
  });

  it("Attendance % by month gives each month's numbers as a summary of that month alone", async () => {
    const access = await accessFor(f, f.principal.id);
    const table = await withSchool(as(f, f.principal.id), (tx) => runReport(tx, as(f, f.principal.id), access, readReportInput((k) => (k === "report" ? "trends" : null), TODAY, ["trends"])));
    const row = table.rows.find((r) => r.who === "Class 5")!;
    expect(row).toBeTruthy();
    const ids = [...f.studentsA, ...f.studentsB].map((s) => s.id);
    let present = 0, counted = 0;
    for (const month of ["2026-09", "2026-10"]) {
      const from = d(`${month}-01`);
      const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
      const alone = await withSchool(as(f, f.principal.id), (tx) => attendanceSummary(tx, as(f, f.principal.id), { studentIds: ids, from, to, today: TODAY }));
      expect(alone.overall.countedDays).toBeGreaterThan(0);
      expect(String(row[month])).toContain(String(alone.overall.percent));
      present += alone.overall.present;
      counted += alone.overall.countedDays;
    }
    expect(String(row.year)).toContain(String(Math.round((present / counted) * 1000) / 10));
  });
});
