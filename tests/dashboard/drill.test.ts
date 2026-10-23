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
import { loadWidgetsIn } from "@/lib/dashboard/compose";
import { readDashFilters } from "@/lib/dashboard/filters";
import { HISTORY_FILTERS, historyWhereIn } from "@/lib/communication/history";
import { notDeliveredCount } from "@/lib/dashboard/widgets/communication";
import { readReportFilter } from "@/app/(school)/library-management/_lib/reports";
import { residentViewWhere, type ResidentView } from "@/lib/hostel/allocation";
import { billsList, readBillsFilter } from "@/app/(school)/inventory-management/_lib/lists";
import { allLeaveWhere } from "@/lib/staff/list";
import { dateWhere, periodRange } from "@/lib/periods";
import { homeworkScope, pilingUp, workToCheck } from "@/lib/homework/scope";
import { listHomework } from "@/lib/homework/homework";
import { classProgress } from "@/lib/homework/progress";
import type { AttentionItem, BandItem, Panel } from "@/lib/dashboard/types";
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

describe("the Dashboard's filters reach every card and the lists they open", () => {
  it("one campus chosen: the cards count that campus only, and each link carries ?campus= to a list that counts the same", async () => {
    const h = await buildHome(f.who.principal, { now: NOW, filters: { campusId: f.north, date: null } });
    expect(h.failed).toEqual([]);
    const north = { ...f.who.principal, campusId: f.north } as Current;
    const present = band(h, "attendance.students-present")!;
    expect(paramsOf(present.href!).campus).toBe(f.north);
    expect(num(present.big)).toBe((await registerList(north)).present);
    expect(present.big).toBe(band(await home("northAdmin"), "attendance.students-present")!.big);
    const fees = band(h, "fees.collected-today")!;
    expect(paramsOf(fees.href!).campus).toBe(f.north);
    expect(fees.big).toBe(formatRupeesShort((await feeList(north, fees.href!)).sum));
    const applications = card(h, "admissions.pending-applications")!;
    expect(paramsOf(applications.href).campus).toBe(f.north);
    expect(num(applications.value)).toBe(await admissionList(north, applications.href));
    expect(num(applications.value)).toBe(1);
    // Every link on the page carries the campus.
    for (const href of [...h.band.map((b) => b.href), ...h.attention.map((a) => a.href)].filter((x): x is string => Boolean(x))) {
      if (pathOf(href).startsWith("/dashboard")) continue;
      expect(paramsOf(href).campus, href).toBe(f.north);
    }
  });

  it("a campus outside the person's own limit is not taken: a one-campus login keeps its campus", async () => {
    const h = await buildHome(f.who.northAdmin, { now: NOW, filters: { campusId: null, date: null } });
    expect(band(h, "attendance.students-present")!.big).toBe("2");
  });

  it("another day: the control centre counts that day, and the lists open on that day", async () => {
    const h = await buildHome(f.who.principal, { now: NOW, filters: { campusId: null, date: day("2026-10-10") } });
    const fees = band(h, "fees.collected-today")!;
    expect(paramsOf(fees.href!)).toMatchObject({ period: "custom", from: "2026-10-10", to: "2026-10-10" });
    const list = await feeList(f.who.principal, fees.href!);
    expect(fees.big).toBe(formatRupeesShort(list.sum));
    expect(list.total).toBe(1);
    const present = band(h, "attendance.students-present")!;
    expect(paramsOf(present.href!)).toMatchObject({ period: "custom", from: "2026-10-10" });
    // A teacher's home stays on today.
    const t = await buildHome(f.who.classTeacher, { now: NOW, filters: { campusId: null, date: day("2026-10-10") } });
    expect(t.filters.date).toBeNull();
  });
});

/** Cards of the optional modules, loaded as the person's Dashboard loads them (their homes, module on, allowed). */
async function cards<K extends "attention" | "band" | "panel">(who: Current, kind: K, ids: string[]) {
  return read(who, (tx) => loadWidgetsIn(tx, who, kind, ids, NOW));
}
const getOf = (href: string) => (k: string) => paramsOf(href)[k] ?? "";

describe("cards that used to count differently from their lists (gap list G36)", () => {
  it("messages not delivered: Message History's \"Not delivered\" for the same 7 days lists the messages counted (old, cancelled and resent ones left out)", async () => {
    const a = card(await home("principal"), "communication.not-delivered")!;
    expect(paramsOf(a.href)).toMatchObject({ status: "not-delivered", period: "custom", from: "2026-10-06", to: "2026-10-12" });
    const list = await read(f.who.principal, async (tx) => tx.message.count({ where: await historyWhereIn(tx, f.who.principal.ctx, true, readListParams(paramsOf(a.href), HISTORY_FILTERS), "Asia/Kolkata") }));
    const counted = await read(f.who.principal, (tx) => notDeliveredCount(tx, NOW, "Asia/Kolkata"));
    expect(list).toBe(counted.messages);
    expect(a.value).toBe(`${list}:${counted.count}`);
    // "Fee reminder" (one person) and "PTM invite" (two): two messages, three people.
    expect(counted).toMatchObject({ messages: 2, count: 3, notSent: 1 });
  });

  it("library books more than a week late: the overdue report it opens (late=7) lists the same books", async () => {
    const [a] = await cards(f.who.principal, "attention", ["library.long-overdue"]) as AttentionItem[];
    expect(pathOf(a.href)).toBe("/library-management/reports");
    const r = readReportFilter(getOf(a.href), null, TODAY);
    expect(r.late).toBe(7);
    const rows = (await read(f.who.principal, (tx) => r.report!.run(tx, f.who.principal.ctx, r.forReport(r.report!)))).rows;
    expect(num(a.value)).toBe(rows.length);
    expect(rows.length).toBe(2);
  });

  it("in the hostel now: Allocation's \"In the hostel now\" lists the same boarders, and roll calls missing in two hostels give a card each", async () => {
    const [b] = await cards(f.who.principal, "band", ["hostel.residents"]) as BandItem[];
    const show = paramsOf(b.href!).show as ResidentView;
    expect(show).toBe("in");
    const hostels = await read(f.who.principal, (tx) => tx.hostel.findMany({ where: { archivedAt: null }, select: { id: true } }));
    const count = (view: Exclude<ResidentView, "out">) => read(f.who.principal, async (tx) => tx.bedAllocation.count({ where: await residentViewWhere(tx, view, hostels.map((h) => h.id)) }));
    expect(num(b.big)).toBe(await count("in"));
    expect(num(b.of!)).toBe((await count("in")) + (await count("away")));
    expect(b.big).toBe("2");
    const roll = await cards(f.who.principal, "attention", ["hostel.rollcall-missing"]) as AttentionItem[];
    if (roll.length) {
      expect(roll.map((x) => paramsOf(x.href).hostel).sort()).toEqual([f.boys.id, f.girls.id].sort());
      expect(new Set(roll.map((x) => x.id)).size).toBe(roll.length);
    }
  });

  it("vendor bills due: the Bills tab's \"Due within 7 days\" lists the same bills, whatever their bill date", async () => {
    const [a] = await cards(f.who.accountant, "attention", ["inventory.bills-due"]) as AttentionItem[];
    expect(paramsOf(a.href)).toMatchObject({ tab: "bills", status: "due7" });
    const finYear = periodRange({ period: "finyear" }, { timeZone: "Asia/Kolkata", now: NOW });
    const list = await read(f.who.accountant, (tx) => billsList(tx, readBillsFilter(getOf(a.href), finYear, TODAY)));
    expect(a.value.split(":")[0]).toBe(String(list.length));
    expect(list.length).toBe(2);
  });

  it("staff on leave today: the panel opens Staff Leave, all leave, approved, today, with the same people", async () => {
    const h = await home("principal");
    const panel = [...h.panels.first, ...h.panels.main, ...h.panels.side].find((p) => p.kind === "list" && p.title === "Staff on leave today") as Extract<Panel, { kind: "list" }> | undefined;
    expect(panel).toBeDefined();
    expect(paramsOf(panel!.href!)).toMatchObject({ view: "all", status: "APPROVED", period: "today" });
    const range = periodRange({ period: "today" }, { timeZone: "Asia/Kolkata", now: NOW })!;
    const count = await read(f.who.principal, async (tx) => tx.leaveRequest.count({ where: await allLeaveWhere(tx, { campusId: null, staffId: null }, { status: "APPROVED", within: dateWhere(range), q: "" }) }));
    expect(panel!.rows.length).toBe(count);
    expect(count).toBe(1);
  });

  it("homework to check and piling up: Homework's ?check= lists the same work, and its pieces add up to the card", async () => {
    const [mine] = await cards(f.who.classTeacher, "attention", ["homework.to-check"]) as AttentionItem[];
    expect(paramsOf(mine.href).check).toBe("1");
    const own = await read(f.who.classTeacher, async (tx) => {
      const s = await homeworkScope(tx, f.who.classTeacher, TODAY);
      const work = await workToCheck(tx, s);
      const { all } = await listHomework(tx, s, TODAY);
      return { work, all };
    });
    const ids = new Set(own.work.map((w) => w.id));
    expect(num(mine.value)).toBe(own.all.filter((r) => ids.has(r.id)).reduce((n, r) => n + r.counts.toCheck, 0));
    expect(mine.value).toBe("2");

    const [piling] = await cards(f.who.principal, "attention", ["homework.piling-up"]) as AttentionItem[];
    expect(paramsOf(piling.href).check).toBe("piling");
    const many = await read(f.who.principal, async (tx) => pilingUp(await workToCheck(tx, await homeworkScope(tx, f.who.principal, TODAY))));
    expect(many.map(([id]) => id)).toEqual([f.st.mainOther.id]);
    expect(piling.title).toContain("1 teacher");
  });

  it("homework handed in: each section's bar is Learning Progress's \"Homework done\" for that section and dates", async () => {
    const [p] = await cards(f.who.principal, "panel", ["homework.handed-in"]) as { slot: string; panel: Panel }[];
    expect(p.panel.kind).toBe("bars");
    if (p.panel.kind !== "bars") return;
    expect(p.panel.rows.length).toBeGreaterThan(0);
    for (const row of p.panel.rows) {
      const sp = paramsOf(row.href!);
      const lp = await read(f.who.principal, async (tx) => classProgress(tx, await homeworkScope(tx, f.who.principal, TODAY), sp.section, null, day(sp.from), day(sp.to), TODAY));
      expect(row.value, row.label).toBe(lp!.totals.donePct);
    }
    // 5 A: three of four handed in (75%); 5 B: all twelve (100%).
    expect(p.panel.rows.map((r) => r.value).sort()).toEqual([100, 75]);
  });

  it("classes overview: the classes and \"not yet in a section\" add up to the Students number", async () => {
    const h = await home("principal");
    const panel = [...h.panels.first, ...h.panels.main, ...h.panels.side].find((p) => p.kind === "classes-overview");
    if (panel?.kind !== "classes-overview") throw new Error("no classes overview");
    expect(panel.unplaced?.count).toBe(1);
    expect(panel.unplaced!.count).toBe(await studentList(f.who.principal, panel.unplaced!.href));
    const students = band(h, "students.head-count");
    if (students) expect(panel.classes.reduce((n, c) => n + c.total, 0) + panel.unplaced!.count).toBe(num(students.big));
  });
});

describe("the date range, year and class filters reach the cards and the lists they open (gap list G36)", () => {
  it("a range of days: fees collected and student attendance count those days, and their lists open on the same dates", async () => {
    const h = await buildHome(f.who.principal, { now: NOW, filters: { campusId: null, date: TODAY, from: day("2026-10-10") } });
    expect(h.failed).toEqual([]);
    const fees = band(h, "fees.collected-today")!;
    expect(paramsOf(fees.href!)).toMatchObject({ period: "custom", from: "2026-10-10", to: "2026-10-12" });
    const list = await feeList(f.who.principal, fees.href!);
    expect(fees.big).toBe(formatRupeesShort(list.sum));
    // Today's ₹13,000 and ₹4,000 on 10 October.
    expect(list.total).toBe(4);
    const present = band(h, "attendance.students-present")!;
    expect(paramsOf(present.href!)).toMatchObject({ period: "custom", from: "2026-10-10", to: "2026-10-12" });
    const totals = await read(f.who.principal, async (tx) => {
      const settings = await attendanceSettings(tx, f.who.principal.ctx);
      const access = await attendanceAccess(tx, f.who.principal.ctx, f.who.principal, settings.lockOverrideRoles);
      return (await registerWhole(tx, f.who.principal.ctx, access, day("2026-10-10"), TODAY, TODAY)).totals;
    });
    expect(present.big).toBe(totals.percent === null ? "Not taken" : `${totals.percent}%`);
  });

  it("the page address gives the filters: a past year ends the dates at its last day, and a from after the to is dropped", async () => {
    const r = await read(f.who.principal, (tx) => readDashFilters(tx, f.who.principal.ctx, f.who.principal, { year: f.pastYear.id, from: "2026-03-01", to: "2026-10-01" }, TODAY));
    expect(r.filters.pastYear).toEqual({ id: f.pastYear.id, name: "2025-26" });
    expect(r.filters.date).toEqual(day("2026-03-31"));
    expect(r.filters.from).toEqual(day("2026-03-01"));
    expect(r.years.map((y) => y.name)).toEqual(["2026-27", "2025-26"]);
    const odd = await read(f.who.principal, (tx) => readDashFilters(tx, f.who.principal.ctx, f.who.principal, { from: "2026-10-12", to: "2026-10-05" }, TODAY));
    expect(odd.filters.from).toBeNull();
    expect(odd.filters.date).toEqual(day("2026-10-05"));
    const current = await read(f.who.principal, (tx) => readDashFilters(tx, f.who.principal.ctx, f.who.principal, { year: f.mainYear.id }, TODAY));
    expect(current.filters.yearId).toBeNull();
  });

  it("a past year: the Students card counts that year and its link carries ?year=", async () => {
    const h = await buildHome(f.who.principal, { now: NOW, filters: { campusId: null, date: day("2026-03-31"), yearId: f.pastYear.id, pastYear: { id: f.pastYear.id, name: "2025-26" } } });
    expect(h.filters.pastYear?.name).toBe("2025-26");
    const students = band(h, "students.head-count");
    if (students) {
      expect(paramsOf(students.href!).year).toBe(f.pastYear.id);
      const count = await read(f.who.principal, async (tx) => tx.student.count({ where: await studentListWhere(tx, f.who.principal, readListParams(paramsOf(students.href!), LIST_FILTERS), [f.pastYear.id], f.pastYear.startDate, await getStudentSettings(tx, f.who.principal.ctx)) }));
      expect(num(students.big)).toBe(count);
    }
  });

  it("one class: the Students card and the Classes overview count that class, and the Student List opens on it", async () => {
    const h = await buildHome(f.who.principal, { now: NOW, filters: { campusId: null, date: null, classId: f.mainClass.id } });
    const students = band(h, "students.head-count");
    if (students) {
      expect(paramsOf(students.href!).class).toBe(f.mainClass.id);
      expect(num(students.big)).toBe(await studentList(f.who.principal, students.href!));
    }
    const panel = [...h.panels.first, ...h.panels.main, ...h.panels.side].find((p) => p.kind === "classes-overview");
    if (panel?.kind !== "classes-overview") throw new Error("no classes overview");
    expect(panel.classes.map((c) => c.id)).toEqual([f.mainClass.id]);
    expect(panel.unplaced).toBeUndefined();
  });
});
