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
import { feeViewer } from "@/lib/fees/access";
import { recentPayments } from "@/lib/fees/dashboard";
import { defaulters } from "@/lib/fees/defaulters";
import { hiddenPayHeads } from "@/lib/finance/access";
import { dayBookView } from "@/lib/finance/daybook-view";
import { expenseRows, NO_FILTER } from "@/lib/finance/expense-list";
import { formatRupees, formatRupeesShort } from "@/lib/format";
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

describe("every home loads", () => {
  it("no card fails to load for any role", async () => {
    for (const key of Object.keys(f.who) as (keyof DrillSchool["who"])[]) expect((await home(key)).failed, key).toEqual([]);
  });
});

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


/** Fee Dashboard's Recent payments for a link's filters (full, partial or both), as the page reads them. */
async function feeList(who: Current, href: string) {
  const sp = paramsOf(href);
  expect(pathOf(href)).toBe("/fee-management/dashboard");
  const from = sp.period === "today" ? TODAY : sp.from ? day(sp.from) : day("2026-04-01");
  const to = sp.period === "today" ? TODAY : sp.to ? day(sp.to) : TODAY;
  return read(who, async (tx) => {
    const v = await feeViewer(tx, who.ctx, who);
    return recentPayments(tx, v, { from, to, status: sp.status ?? null, partial: sp.kind === "all" ? null : sp.kind === "partial" }, 0);
  });
}

describe("money tiles open lists with the same numbers", () => {
  it("fees collected today: the payments list it opens holds the same payments and amount (partial ones included, cancelled and waiting ones left out)", async () => {
    for (const key of ["principal", "accountant", "northAccountant"] as const) {
      const tile = band(await home(key), "fees.collected-today")!;
      const list = await feeList(f.who[key], tile.href!);
      expect(tile.big, key).toBe(formatRupeesShort(list.sum));
      expect(tile.foot, key).toContain(`${list.total} payment`);
    }
    // Main and North: ₹6,000 + ₹2,000 (partial) + ₹5,000; North alone: ₹5,000.
    expect((await feeList(f.who.principal, band(await home("principal"), "fees.collected-today")!.href!)).total).toBe(3);
    expect((await feeList(f.who.northAccountant, band(await home("northAccountant"), "fees.collected-today")!.href!)).total).toBe(1);
  });

  it("waiting for verification: the list holds every waiting payment, however old, with their amount", async () => {
    for (const key of ["accountant", "northAccountant"] as const) {
      const tile = band(await home(key), "fees.cheques-to-verify")!;
      const list = await feeList(f.who[key], tile.href!);
      expect(num(tile.big), key).toBe(list.total);
      if (list.total) expect(tile.foot, key).toContain(formatRupees(list.sum));
    }
    expect(band(await home("accountant"), "fees.cheques-to-verify")!.big).toBe("2");
  });

  it("defaulters and overdue fees: Defaulters lists the same students and amount (a student who left still owes; an archived one is not counted)", async () => {
    for (const key of ["principal", "accountant", "northAccountant"] as const) {
      const list = await read(f.who[key], async (tx) => defaulters(tx, f.who[key].ctx, await feeViewer(tx, f.who[key].ctx, f.who[key]), TODAY));
      const amount = list.rows.reduce((s, r) => s + r.overduePaise, BigInt(0));
      const h = await home(key);
      const b = band(h, "fees.defaulters");
      if (b) { expect(pathOf(b.href!)).toBe("/fee-management/defaulters"); expect(num(b.big), key).toBe(list.rows.length); }
      const a = card(h, "fees.overdue");
      if (a) { expect(pathOf(a.href)).toBe("/fee-management/defaulters"); expect(a.value, key).toBe(`${list.rows.length}:${amount}`); }
      expect(Boolean(a || b), key).toBe(true);
    }
    const all = await read(f.who.accountant, async (tx) => defaulters(tx, f.who.accountant.ctx, await feeViewer(tx, f.who.accountant.ctx, f.who.accountant), TODAY));
    expect(all.rows.map((r) => r.name).sort()).toEqual(["Bina Bose", "Diya Reddy", "Ishaan Kumar", "Lalit Left", "Meera Iyer", "Nikhil Naidu"]);
  });

  it("Day Book today and Money today: the Day Book shows the same totals", async () => {
    const h = await home("accountant");
    const book = await read(f.who.accountant, async (tx) => dayBookView(tx, { from: TODAY, to: TODAY, classId: null, depositAccountId: null, waiting: false, hidePay: await hiddenPayHeads(tx, f.who.accountant.permissions) }));
    // The band shows when it is among the accountant's first four numbers.
    const tile = band(h, "finance.day-book");
    if (tile) {
      expect(paramsOf(tile.href!).period).toBe("today");
      expect(tile.big).toBe(formatRupeesShort(book.totals.net));
    }
    const money = [...h.panels.first, ...h.panels.main, ...h.panels.side].find((p) => p.kind === "list" && p.title === "Money today");
    const spent = money?.kind === "list" ? money.rows.find((r) => r.id === "spent") : undefined;
    expect(spent?.right).toBe(formatRupees(book.totals.expense));
    const collected = money?.kind === "list" ? money.rows.find((r) => r.id === "collected") : undefined;
    const list = await feeList(f.who.accountant, collected!.href!);
    expect(collected!.right).toBe(formatRupees(list.sum));
  });

  it("expenses waiting for approval: the Waiting tab lists every one, last financial year's too", async () => {
    const a = card(await home("principal"), "finance.expenses")!;
    expect(paramsOf(a.href).tab).toBe("waiting");
    const list = await read(f.who.principal, async (tx) => expenseRows(tx, { ...NO_FILTER, hidePay: await hiddenPayHeads(tx, f.who.principal.permissions), status: "WAITING" }, 100));
    const sum = list.rows.reduce((s, r) => s + r.amountPaise, BigInt(0));
    expect(a.value).toBe(`${list.count}:${sum}`);
    expect(list.count).toBe(3);
  });
});
