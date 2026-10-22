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
import { readReportInput, runReport, type ReportKey } from "@/lib/attendance/reports";
import { feeViewer } from "@/lib/fees/access";
import { recentPayments } from "@/lib/fees/dashboard";
import { defaulters } from "@/lib/fees/defaulters";
import { hiddenPayHeads } from "@/lib/finance/access";
import { dayBookView } from "@/lib/finance/daybook-view";
import { expenseRows, NO_FILTER } from "@/lib/finance/expense-list";
import { formatRupees, formatRupeesShort } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { getStudentSettings } from "@/lib/students/settings";
import { guardianConsentGroups, guardiansInReach } from "@/lib/students/guardian-list";
import { yearsFor } from "@/lib/academic/years";
import { viewerFor as admissionViewer, type ViewerSource } from "@/lib/admission/access";
import { APPLICATION_FILTERS, applicationWhere, ENQUIRY_FILTERS, enquiryWhere } from "@/lib/admission/list";
import { openYears } from "@/lib/admission/settings";
import { viewerFor as staffViewer } from "@/lib/staff/access";
import { STAFF_FILTERS, staffWhere } from "@/lib/staff/list";
import { approvalsFor } from "@/lib/approvals";
import { LIST_FILTERS, studentListWhere } from "@/app/(school)/student-management/_lib/queries";
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
      expect(tile.foot, key).toContain(`${list.absent} absent`);
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

  it("absent days in a row and below the threshold: the Chronic absence report it opens lists the same students (one who left is not counted)", async () => {
    for (const key of ["principal", "northAdmin", "classTeacher"] as const) {
      const h = await home(key);
      for (const id of ["attendance.absent-streak", "attendance.below-threshold"]) {
        const a = card(h, id);
        if (!a) continue;
        expect(pathOf(a.href), `${key} ${id}`).toBe("/attendance-management/reports");
        const sp = paramsOf(a.href);
        const rows = await read(f.who[key], async (tx) => {
          const settings = await attendanceSettings(tx, f.who[key].ctx);
          const access = await attendanceAccess(tx, f.who[key].ctx, f.who[key], settings.lockOverrideRoles);
          return (await runReport(tx, f.who[key].ctx, access, readReportInput((k) => sp[k], TODAY, ["chronic" as ReportKey]))).rows;
        });
        expect(num(a.value), `${key} ${id}`).toBe(rows.length);
      }
    }
    expect(card(await home("principal"), "attendance.absent-streak")!.value).toBe("2");
    expect(card(await home("northAdmin"), "attendance.absent-streak")!.value).toBe("1");
    expect(card(await home("classTeacher"), "attendance.absent-streak")!.value).toBe("1");
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

/** The Student List for a link's filters, as the page reads them (each campus's current year). */
async function studentList(who: Current, href: string) {
  expect(pathOf(href)).toBe("/student-management");
  return read(who, async (tx) => {
    const years = await yearsFor(tx, who.ctx, who.campusId);
    const settings = await getStudentSettings(tx, who.ctx);
    const yearStart = years.find((y) => y.campusId === (who.campusId ?? f.main))?.startDate ?? null;
    return tx.student.count({ where: await studentListWhere(tx, who, readListParams(paramsOf(href), LIST_FILTERS), years.map((y) => y.id), yearStart, settings) });
  });
}

/** Parents & Guardians for a link's filters, as the page reads them. */
async function guardianList(who: Current, href: string) {
  expect(pathOf(href)).toBe("/student-management/guardians");
  return read(who, async (tx) => {
    const years = (await yearsFor(tx, who.ctx, who.campusId)).map((y) => y.id);
    const g = await guardianConsentGroups(tx, who, await guardiansInReach(tx, who, years));
    const consent = paramsOf(href).consent;
    return consent === "not-given" ? g.dataNot.length : consent === "withdrawn" ? g.dataWithdrawn.length : g.allIds.length;
  });
}

describe("student tiles open lists with the same numbers", () => {
  it("students: the Student List shows the same count (the student who left and the archived one are not in either)", async () => {
    for (const key of ["principal", "northAdmin"] as const) {
      const tile = band(await home(key), "students.head-count");
      if (!tile) continue;
      expect(num(tile.big), key).toBe(await studentList(f.who[key], tile.href!));
    }
  });

  it("classes overview: each class and section opens a Student List of that many students", async () => {
    for (const key of ["principal", "northAdmin"] as const) {
      const h = await home(key);
      const panel = [...h.panels.first, ...h.panels.main, ...h.panels.side].find((p) => p.kind === "classes-overview");
      expect(panel?.kind, key).toBe("classes-overview");
      if (panel?.kind !== "classes-overview") continue;
      for (const c of panel.classes) {
        expect(c.total, `${key} ${c.name}`).toBe(await studentList(f.who[key], c.href));
        for (const sec of c.sections) expect(sec.count, `${key} ${c.name} ${sec.name}`).toBe(await studentList(f.who[key], sec.href));
      }
    }
  });

  it("parents and data consent: Parents & Guardians shows the same counts (a withdrawn consent is its own group)", async () => {
    for (const key of ["principal", "northAdmin"] as const) {
      const h = await home(key);
      const parents = band(h, "students.parents");
      if (parents) expect(num(parents.big), key).toBe(await guardianList(f.who[key], parents.href!));
      const a = card(h, "students.no-consent");
      expect(a, key).toBeDefined();
      expect(num(a!.value), key).toBe(await guardianList(f.who[key], a!.href));
    }
    // 12 parents in the school: one gave consent, one withdrew it, so 10 have not given it.
    expect(card(await home("principal"), "students.no-consent")!.value).toBe("10");
  });
});

/** Enquiries or Applications for a link's filters, as those pages read them (the person's campus and its open years). */
async function admissionList(who: Current, href: string) {
  return read(who, async (tx) => {
    const v = await admissionViewer(tx, who.ctx, who as unknown as ViewerSource);
    const years = (await openYears(tx, v.campusId)).map((y) => y.id);
    if (pathOf(href) === "/admission-management/enquiries") return tx.enquiry.count({ where: enquiryWhere(readListParams(paramsOf(href), ENQUIRY_FILTERS), v, { yearId: years, timeZone: "Asia/Kolkata", now: NOW }) });
    expect(pathOf(href)).toBe("/admission-management/applications");
    return tx.application.count({ where: applicationWhere(readListParams(paramsOf(href), APPLICATION_FILTERS), { yearId: years, timeZone: "Asia/Kolkata", campusId: v.campusId }) });
  });
}

describe("admissions, staff and approvals open lists with the same numbers", () => {
  it("new enquiries, follow-ups and applications waiting: the lists show the same counts, only the person's campus", async () => {
    for (const key of ["principal", "northAdmin", "receptionist"] as const) {
      const h = await home(key);
      const tile = band(h, "admissions.new-enquiries");
      if (tile) expect(num(tile.big), key).toBe(await admissionList(f.who[key], tile.href!));
      for (const id of ["admissions.follow-ups-late", "admissions.follow-ups-today", "admissions.pending-applications"]) {
        const a = card(h, id);
        if (a) expect(num(a.value), `${key} ${id}`).toBe(await admissionList(f.who[key], a.href));
      }
    }
    expect(num(card(await home("principal"), "admissions.pending-applications")!.value)).toBe(3);
    expect(num(card(await home("northAdmin"), "admissions.pending-applications")!.value)).toBe(1);
  });

  it("staff: the Staff List shows the same count (staff on leave, who resigned or are archived are not in it)", async () => {
    for (const key of ["principal", "northAdmin"] as const) {
      const tile = band(await home(key), "staff.head-count");
      if (!tile) continue;
      const count = await read(f.who[key], async (tx) => tx.staff.count({ where: staffWhere(readListParams(paramsOf(tile.href!), STAFF_FILTERS), await staffViewer(tx, f.who[key].ctx, f.who[key])) }));
      expect(num(tile.big), key).toBe(count);
    }
  });

  it("approvals waiting: Approvals shows the same requests", async () => {
    const h = await home("principal");
    const count = await read(f.who.principal, async (tx) => tx.approval.count({ where: await approvalsFor(tx, f.who.principal.ctx, f.who.principal.roles.map((r) => r.key)) }));
    expect(h.approvals?.count).toBe(count);
    const tile = band(h, "approvals.waiting");
    if (tile) expect(num(tile.big)).toBe(count);
    expect(count).toBe(2);
  });
});
