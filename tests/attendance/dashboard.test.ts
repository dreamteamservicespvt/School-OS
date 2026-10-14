// Attendance on the Dashboard (01-dashboard.md §2, 05 "Gives"): the
// Principal's band shows students and staff present from the day's real
// marks; a class teacher sees their own section, a card to take attendance
// before the lock, and the Take Attendance link; nobody sees another
// school's or another section's numbers.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
const DAY = "2026-10-07";
const viewer = async (userId: string): Promise<Current> => {
  const view = await accessIn(userId, f.school.id);
  return { ...view!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
};

beforeAll(async () => {
  f = await makeAttendanceSchool("Attendance Dashboard School");
  // Section A is taken: four present, one absent. Section B is not taken.
  const access = await accessFor(f, f.teacherA.id);
  await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, {
    sectionId: f.sectionA.id, date: d(DAY), periodNo: 0, timeZone: TZ, now: at(DAY, "09:00"),
    entries: f.studentsA.map((s, i) => ({ studentId: s.id, statusKey: i === 0 ? "absent" : "present" })),
  }));
}, 120_000);

describe("Attendance on the Dashboard", () => {
  it("the Principal sees students present today from the real marks", async () => {
    const home = await buildHome(await viewer(f.principal.id), { now: at(DAY, "09:30") });
    const students = home.band.find((b) => b.id === "attendance.students-present");
    expect(students?.big).toBe("4");
    expect(students?.of).toBe("/ 10");
    expect(students?.foot).toBe("80% of marked · 1 absent · 1 class not marked");
    expect(students?.href).toBe("/attendance-management/register");
    expect(home.band.some((b) => b.id === "attendance.staff-present")).toBe(true);
  });

  it("a class teacher sees only their own section, and the card to take attendance before the lock", async () => {
    const a = await buildHome(await viewer(f.teacherA.id), { now: at(DAY, "09:30") });
    const mine = a.band.find((b) => b.id === "attendance.my-section-today");
    expect(mine?.big).toBe("4");
    expect(mine?.of).toBe("/ 5");
    expect(a.band.some((b) => b.id === "attendance.students-present")).toBe(false);
    expect(a.attention.some((x) => x.id.startsWith("attendance.not-taken"))).toBe(false);

    const b = await buildHome(await viewer(f.teacherB.id), { now: at(DAY, "09:30") });
    expect(b.band.find((x) => x.id === "attendance.my-section-today")?.big).toBe("Not taken");
    const card = b.attention.find((x) => x.id === `attendance.not-taken:${f.sectionB.id}`);
    expect(card?.title).toMatch(/^Take attendance for /);
    expect(card?.href).toBe(`/attendance-management?section=${f.sectionB.id}&date=${DAY}`);
  });

  it("office staff and HR get no student numbers", async () => {
    for (const id of [f.officeLogin.id, f.hrLogin.id]) {
      const home = await buildHome(await viewer(id), { now: at(DAY, "09:30") });
      expect(home.band.some((b) => b.id === "attendance.students-present" || b.id === "attendance.my-section-today")).toBe(false);
    }
  });
});
