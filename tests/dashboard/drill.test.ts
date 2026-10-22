// Every Dashboard number opens the list behind it, and that list shows the
// same count (01-dashboard.md §2 Actions, §5 "Tile numbers must match the
// list behind them", Done when 2; gap list G36). For each role's home in a
// seeded school, each card's number is compared with the count of the list
// its link opens, worked out the way that list's page works it out (the
// page's own function, with the filters read from the link).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import type { Current } from "@/lib/current";
import { buildHome, type Home } from "@/lib/dashboard/compose";
import { attendanceAccess } from "@/lib/attendance/access";
import { attendanceSettings } from "@/lib/attendance/settings";
import { registerWhole } from "@/lib/attendance/classwise";
import { staffDay, staffDayCounts } from "@/lib/attendance/staff";
import { drillSchool, NOW, TODAY, day, type DrillSchool } from "./drill-fixture";

let f: DrillSchool;

beforeAll(async () => {
  f = await drillSchool();
}, 240_000);

const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
const homes = new Map<string, Home>();
async function home(key: keyof DrillSchool["who"], now = NOW) {
  const k = `${key}:${now.toISOString()}`;
  if (!homes.has(k)) homes.set(k, await buildHome(f.who[key], { now }));
  return homes.get(k)!;
}
const band = (h: Home, id: string) => h.band.find((b) => b.id === id);
const card = (h: Home, id: string) => h.attention.find((a) => a.id === id);
const read = <T>(who: Current, fn: (tx: Parameters<Parameters<typeof withSchool>[1]>[0]) => Promise<T>) => withSchool(who.ctx, fn, { timeout: 60_000 });
const paramsOf = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams);
const pathOf = (href: string) => new URL(href, "http://x").pathname;

/** Attendance Register's whole-school view, as the page reads it for this person. */
async function registerList(who: Current, date = TODAY) {
  return read(who, async (tx) => {
    const settings = await attendanceSettings(tx, who.ctx);
    const access = await attendanceAccess(tx, who.ctx, who, settings.lockOverrideRoles);
    return (await registerWhole(tx, who.ctx, access, date, date, date)).totals;
  });
}

describe("attendance tiles open lists with the same numbers", () => {
  it("students present today: the register shows the same present, absent and late, the student who left not counted", async () => {
    for (const key of ["principal", "northAdmin"] as const) {
      const tile = band(await home(key), "attendance.students-present")!;
      expect(pathOf(tile.href!)).toBe("/attendance-management/register");
      const list = await registerList(f.who[key]);
      expect(num(tile.big), key).toBe(list.present);
      expect(num(tile.of!), key).toBe(list.markedStudents);
      expect(tile.foot, key).toContain(`${list.absent} absent, ${list.late} late`);
    }
    // Main 5 A: 3 present (one late) and 1 absent; the student who left is not on the register. North: 2 present, 1 absent.
    expect(band(await home("principal"), "attendance.students-present")!.big).toBe("5");
    expect(band(await home("northAdmin"), "attendance.students-present")!.big).toBe("2");
  });

  it("a holiday on one campus: the tile still counts the other campus, as the register does", async () => {
    const holiday = new Date("2026-10-13T06:30:00Z");
    const tile = band(await home("principal", holiday), "attendance.students-present")!;
    const list = await registerList(f.who.principal, day("2026-10-13"));
    expect(tile.big).not.toBe("Holiday");
    expect(tile.big).toBe("Not taken");
    expect(list.markedSections).toBe(0);
    expect(list.sections).toBeGreaterThan(0);
  });

  it("staff present: Staff Attendance shows the same present of the same staff", async () => {
    for (const key of ["principal", "northAdmin"] as const) {
      const tile = band(await home(key), "attendance.staff-present")!;
      expect(pathOf(tile.href!)).toBe("/attendance-management/staff");
      const t = await read(f.who[key], async (tx) => {
        const settings = await attendanceSettings(tx, f.who[key].ctx);
        const access = await attendanceAccess(tx, f.who[key].ctx, f.who[key], settings.lockOverrideRoles);
        return staffDayCounts(await staffDay(tx, f.who[key].ctx, access, TODAY));
      });
      expect(num(tile.big), key).toBe(t.present);
      expect(num(tile.of!), key).toBe(t.total);
      expect(tile.foot, key).toContain(`${t.leave.length} on leave`);
    }
  });
});

