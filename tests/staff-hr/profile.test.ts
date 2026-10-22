// The staff profile shows real values (09 §2 Staff Profile; gap G33 d):
// "Today" from Staff Attendance, leave and the School Calendar instead of a
// dash, and the Attendance tab's present, absent and late marks.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { markCounts, staffMarks, todayFact } from "@/lib/staff/profile";
import { d, makeHrSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });
const TZ = "Asia/Kolkata";

beforeAll(async () => {
  f = await makeHrSchool();
  await withSchool(as(f.admin.id), async (tx) => {
    const mark = (date: string, statusKey: string, extra: { inTime?: Date; lateMinutes?: number } = {}) =>
      tx.attendanceMark.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, staffId: f.teacher.id, date: d(date), periodNo: 0, statusKey, method: "register", markedById: f.admin.id, ...extra } });
    await mark("2026-11-02", "present", { inTime: new Date("2026-11-02T03:10:00Z") });
    await mark("2026-11-03", "late", { inTime: new Date("2026-11-02T03:57:00Z"), lateMinutes: 12 });
    await mark("2026-11-04", "absent");
    await mark("2026-11-05", "half-day");
  });
}, 120_000);

describe("staff profile values (G33 d)", () => {
  it("reads the month's Staff Attendance marks and counts them", async () => {
    const marks = await withSchool(as(f.admin.id), (tx) => staffMarks(tx, as(f.admin.id), f.teacher.id, d("2026-11-01"), d("2026-11-30")));
    expect([...marks.keys()].sort()).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(marks.get("2026-11-03")).toMatchObject({ name: "Late", lateMinutes: 12 });
    expect(markCounts(marks.values())).toEqual({ present: 2.5, absent: 1, late: 1, half: 1, marked: 4 });
  });

  it("'Today' says what is true, never a dash", async () => {
    const marks = await withSchool(as(f.admin.id), (tx) => staffMarks(tx, as(f.admin.id), f.teacher.id, d("2026-11-01"), d("2026-11-30")));
    const base = { status: "ACTIVE", onLeaveUntil: null, offTitle: null, mark: null, timeZone: TZ };
    expect(todayFact({ ...base, mark: marks.get("2026-11-03")! })).toEqual({ value: "Late", sub: "In at 9:27 AM, 12 min late", tone: "warn" });
    expect(todayFact({ ...base, mark: marks.get("2026-11-02")! })).toEqual({ value: "Present", sub: "In at 8:40 AM", tone: undefined });
    expect(todayFact({ ...base, mark: marks.get("2026-11-04")! })).toEqual({ value: "Absent", sub: undefined, tone: "bad" });
    expect(todayFact(base)).toEqual({ value: "Not marked yet", sub: "In Staff Attendance" });
    expect(todayFact({ ...base, offTitle: "Diwali" })).toEqual({ value: "No school", sub: "Diwali" });
    expect(todayFact({ ...base, onLeaveUntil: d("2026-11-06") })).toEqual({ value: "On leave", sub: "Until 06-11-2026", tone: "warn" });
    expect(todayFact({ ...base, status: "SUSPENDED" }).tone).toBe("warn");
    expect(todayFact({ ...base, status: "SUSPENDED" }).value).not.toBe("–");
  });
});
