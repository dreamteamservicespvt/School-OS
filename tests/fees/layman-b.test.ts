// Layman test B (docs/qa/2026-11-12-layman-B.md): money screens that must agree
// with each other and say things in plain words.
// LB2 Day Book range bars show a loss as a minus bar, not ₹0.
// LB3 Defaulters and the Outstanding report age overdue money by the same rule.
// LB4 Admission application fees: their own line in Finance, named on the Collection report.
// LB5 Staff advances and loans are not salary in Profit and loss.
// LB8 The Surplus/Shortfall line in plain words. LB10 Months with ₹0 still show.
// LB1 A concession can never be more than is still to pay, nor above 100%.
// LB11 A long note wraps on the receipt. A3 A bank payment below zero warns first.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { MINUS, formatRupees, formatRupeesShort } from "@/lib/format";
import { defaulters } from "@/lib/fees/defaulters";
import { findFeeReport, periodKeysBetween, type ReportFilter } from "@/lib/fees/reports";
import { ageingIndexOf } from "@/lib/fees/settings";
import { plural } from "@/lib/fees/words";
import { renderReceipt } from "@/lib/fees/documents";
import type { FeeViewer } from "@/lib/fees/access";
import { MoneyProblem, MoneyWarning } from "@/lib/fees/problem";
import { concessionHeadChoices, giveConcession, type ConcessionInput } from "@/lib/fees/concessions";
import { mostOff } from "@/lib/fees/concession-max";
import { concessionRows } from "@/lib/fees/concession-list";
import { postToDayBook } from "@/lib/finance/daybook";
import { payExpense, recordExpense } from "@/lib/finance/expenses";
import { findFinanceReport, type FinanceFilter } from "@/lib/finance/reports";
import { financialYearOf } from "@/lib/finance/years";
import { shortfallWords, systemHeadSource } from "@/lib/finance/words";
import { todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");
const viewerOf = (s: FeeSchool): FeeViewer => ({ userId: s.accountant.id, see: "all", change: "all", roleKeys: ["accountant"], sectionIds: null, yearId: s.year.id, yearIds: [s.year.id], campusId: null });
const feeFilter = (o: Partial<ReportFilter> = {}): ReportFilter => ({ from: new Date("2026-04-01"), to: today, classId: null, feeHeadId: null, mode: null, collectorId: null, group: "month", today, ...o });
let fin: FinanceFilter;
let heads: Record<string, string> = {};

beforeAll(async () => {
  f = await makeFeeSchool();
  await withSchool(f.ctx, async (tx) => {
    heads = Object.fromEntries((await tx.accountHead.findMany()).map((h) => [h.systemKey ?? h.name, h.id]));
    const fy = await financialYearOf(tx, f.ctx, today);
    fin = { financialYearId: fy.id, yearStart: fy.startDate, from: fy.startDate, to: today, group: "month", by: "head", today, hidePay: null };
  });
}, 120_000);

describe("words (LB8, LB9, LB6)", () => {
  it("says a shortfall in plain words, never a minus percentage", () => {
    expect(shortfallWords(R(100), R(150))).toBe("Spent 50% more than came in");
    expect(shortfallWords(R(200), R(150))).toBe("25% of income left over");
    expect(shortfallWords(R(0), R(10))).toBe("No income yet");
  });
  it("counts with the right word and one minus sign", () => {
    expect(plural(1, "concession")).toBe("1 concession");
    expect(plural(3, "transaction")).toBe("3 transactions");
    expect(formatRupees(R(-1026608))).toBe(`${MINUS}₹10,26,608`);
    expect(formatRupees(R(-500.5))).toBe(`${MINUS}₹500.50`);
    expect(formatRupeesShort(R(-2418000))).toBe(`${MINUS}₹24.18 L`);
  });
  it("names the module a system head comes from, never Refunds for Hostel mess", () => {
    expect(systemHeadSource("hostel-mess")).toBe("Hostel");
    expect(systemHeadSource("refunds")).toBe("Refunds");
    expect(systemHeadSource(null)).toBeNull();
  });
});

describe("Defaulters and the Outstanding report (LB3)", () => {
  it("put the same overdue money in the same ageing groups", async () => {
    const out = await withSchool(f.ctx, (tx) => findFeeReport("outstanding")!.run(tx, f.ctx, feeFilter(), viewerOf(f)));
    const list = await withSchool(f.ctx, (tx) => defaulters(tx, f.ctx, viewerOf(f), today));
    expect(list.ageingTotals.length).toBeGreaterThan(1);
    for (const g of list.ageingTotals) expect(g.amount, g.label).toBe(out.totals![`b${g.index}`]);
    // Quarterly rows due in April, July and October: more than one group holds money.
    expect(list.ageingTotals.filter((g) => g.amount > BigInt(0)).length).toBeGreaterThan(1);
    expect(list.total).toBe(list.ageingTotals.reduce((t, g) => t + g.amount, BigInt(0)));
  });
  it("ages days outside every group in the last one", () => {
    const groups = [{ from: 1, to: 30 }, { from: 31, to: null }];
    expect(ageingIndexOf(groups, 5)).toBe(0);
    expect(ageingIndexOf(groups, 400)).toBe(1);
    expect(ageingIndexOf(groups, 0)).toBe(1);
  });
});

describe("Collection report (LB10, LB4)", () => {
  it("lists every month of the period, ₹0 when nothing came in", () => {
    expect(periodKeysBetween(new Date("2026-04-01"), new Date("2026-11-12"), "month")).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(periodKeysBetween(new Date("2026-04-01"), new Date("2027-02-01"), "year")).toEqual(["2026", "2027"]);
  });

  it("shows empty months and names the application fees Finance counts", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(1000) });
    await withSchool(f.ctx, (tx) => postToDayBook(tx, f.ctx, {
      date: today, direction: "IN", amountPaise: R(500), mode: "CASH", section: "other-fees", headName: "Application fee", accountHeadId: heads.fees,
      accountId: null, sourceType: "application-fee", sourceId: "00000000-0000-4000-8000-000000000001", sourceKey: "application-fee:lb4", partyName: "Applicant (application 1)",
    }));
    const r = await withSchool(f.ctx, (tx) => findFeeReport("collection")!.run(tx, f.ctx, feeFilter(), viewerOf(f)));
    expect(r.rows.length).toBe(periodKeysBetween(new Date("2026-04-01"), today, "month").length);
    expect(r.rows.filter((x) => x.amount === BigInt(0)).length).toBe(r.rows.length - 1);
    expect(r.totals!.amount).toBe(R(1000));
    expect(r.note).toContain("Admission application fees are not in this report: ₹500");
    // Finance: Fees matches Fee Reports; the application fee has its own line.
    const pl = await withSchool(f.ctx, (tx) => findFinanceReport("profit-loss")!.run(tx, f.ctx, fin));
    expect(pl.rows.find((x) => x.head === "Fees")?.amount).toBe(R(1000));
    expect(pl.rows.find((x) => x.head === "Admission application fees")?.amount).toBe(R(500));
    // Filtered by class, the note is left out (application fees have no class here).
    const byClass = await withSchool(f.ctx, (tx) => findFeeReport("collection")!.run(tx, f.ctx, feeFilter({ classId: f.cls.id }), viewerOf(f)));
    expect(byClass.note).toBeUndefined();
  });
});

describe("Finance reports (LB5, LB2)", () => {
  it("leaves a staff loan out of Salaries and says so", async () => {
    await withSchool(f.ctx, async (tx) => {
      await postToDayBook(tx, f.ctx, {
        date: today, direction: "OUT", amountPaise: R(30000), mode: "CASH", section: "salary-advance", headName: "Staff loan", accountHeadId: heads.salary,
        accountId: null, sourceType: "salary-advance", sourceId: "00000000-0000-4000-8000-000000000002", sourceKey: "salary-advance:lb5", partyName: "Mahesh Yadav · ADV/1",
      });
      await postToDayBook(tx, f.ctx, {
        date: today, direction: "OUT", amountPaise: R(10000), mode: "BANK_TRANSFER", section: "salary", headName: "Salaries", accountHeadId: heads.salary,
        accountId: null, sourceType: "payroll", sourceId: "00000000-0000-4000-8000-000000000003", sourceKey: "payroll:lb5", partyName: "Salary · 1 staff",
      });
    });
    const pl = await withSchool(f.ctx, (tx) => findFinanceReport("profit-loss")!.run(tx, f.ctx, fin));
    expect(pl.rows.find((x) => x.head === "Salaries")?.amount).toBe(R(10000));
    expect(pl.note).toContain("Staff advances and loans are not salary or income");
    expect(pl.note).toContain("₹30,000 paid out");
    expect(pl.note).toContain("net pay to staff");
    const ie = await withSchool(f.ctx, (tx) => findFinanceReport("income-expense")!.run(tx, f.ctx, fin));
    expect(ie.totals!.expense).toBe(R(10000));
  });

  it("shows a month that lost money as a minus bar, not ₹0", async () => {
    const r = await withSchool(f.ctx, (tx) => findFinanceReport("day-book-summary")!.run(tx, f.ctx, fin));
    const last = r.chart!.at(-1)!;
    // This month: ₹1,500 in, ₹40,000 out (the Day Book for a range is cash, so the loan counts here).
    expect(last.value).toBe(R(1500 - 40000));
    expect(r.rows.at(-1)!.net).toBe(last.value);
  });
});

describe("paying from a bank account with too little in it (A3)", () => {
  it("warns first, and pays once the person says pay anyway", async () => {
    const e = await withSchool(f.ctx, (tx) => recordExpense(tx, f.ctx, {
      date: today, accountHeadId: heads.Stationery, amountPaise: R(900), vendorId: null, costCentreId: null, billFileId: null,
      note: "Printer for the office", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null,
    }, null));
    const pay = (confirmLowCash: boolean) => withSchool(f.ctx, (tx) => payExpense(tx, f.ctx, e.expense.id, { date: today, mode: "BANK_TRANSFER", reference: "UTR12345678", accountId: null, confirmLowCash }));
    const err = await pay(false).catch((x) => x);
    expect(err).toBeInstanceOf(MoneyWarning);
    expect(err.message).toMatch(/This payment is ₹900, so the balance goes below zero/);
    await expect(pay(true)).resolves.toBeTruthy();
  });
});

describe("receipt PDF (LB11)", () => {
  it("breaks a long note without spaces inside the receipt box", async () => {
    const open = await dues(f.ctx, f.sita.id);
    const r = await collect(f.ctx, { studentId: f.sita.id, dueIds: [open[0].id], amountPaise: R(100), note: "x".repeat(300) });
    const doc = await withSchool(f.ctx, (tx) => renderReceipt(tx, f.ctx, r.payment.id, "office"));
    expect(doc.html).toContain("overflow-wrap:anywhere");
    expect(doc.html).toContain("x".repeat(300));
  });
});

describe("a concession bigger than what is owed (LB1)", () => {
  const give = (o: Partial<ConcessionInput>, opts: { amountField?: string } = {}) => withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, {
    studentId: f.anil.id, type: "DISCOUNT", mode: "amount", amountPaise: R(50000), percentBp: 0, feeHeadIds: [f.tuition.id], periodFrom: null, periodTo: null, reason: "LB- layman test concession", ...o,
  }, opts));
  const refused = (p: Promise<unknown>) => p.then(() => { throw new Error("was accepted"); }, (e: unknown) => e as MoneyProblem);

  it("is refused on the form with the most it can be, and nothing is saved", async () => {
    // Anil owes the whole year's tuition: ₹24,000 in four quarterly rows.
    const whole = await refused(give({}));
    expect(whole).toBeInstanceOf(MoneyProblem);
    expect(whole.message).toBe("Not more than ₹24,000: that is all that is still to pay on the chosen fee heads in this period.");
    expect(whole.field).toBe("value");
    // Rest of this year: only the rows due from today on.
    const from = new Date("2026-11-12");
    const open = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId: f.anil.id, state: "OPEN", dueDate: { gte: from } } }));
    const left = open.reduce((t, d) => t + d.balancePaise, BigInt(0));
    const rest = await refused(give({ periodFrom: from, amountPaise: left + R(1) }));
    expect(rest.message).toBe(`Not more than ${formatRupees(left)}: that is all that is still to pay on the chosen fee heads in this period.`);
    // A discount asked at the counter on ticked rows: the message is at the Discount box.
    const rows = await dues(f.ctx, f.anil.id);
    const counter = await refused(give({ feeHeadIds: [], dueIds: [rows[0].id], amountPaise: rows[0].balancePaise + R(1) }, { amountField: "discount" }));
    expect(counter.message).toBe(`Not more than ${formatRupees(rows[0].balancePaise)}: that is all that is still to pay on the ticked rows in this period.`);
    expect(counter.field).toBe("discount");
    expect(await withSchool(f.ctx, (tx) => tx.concession.count({ where: { studentId: f.anil.id } }))).toBe(0);
  });

  it("refuses a percent above 100, and takes the whole amount owed when asked exactly", async () => {
    const pct = await refused(give({ mode: "percent", amountPaise: BigInt(0), percentBp: 15000 }));
    expect(pct.message).toBe("Percent must be more than 0 and at most 100.");
    expect(pct.field).toBe("value");
    const ok = await give({ amountPaise: R(24000) });
    expect(ok.estimate).toBe(R(24000));
    const list = await withSchool(f.ctx, (tx) => concessionRows(tx, { timeZone: "Asia/Kolkata", ids: [ok.concession.id] }));
    expect(list.rows[0].askedPaise).toBe(R(24000));
    expect(list.rows[0].amountPaise).toBe(R(24000));
  });

  it("the form works out the same most as the server", async () => {
    const c = await withSchool(f.ctx, (tx) => concessionHeadChoices(tx, f.sita.id));
    const owed = (await dues(f.ctx, f.sita.id)).filter((d) => d.kind !== "LATE_FEE").reduce((t, d) => t + d.balancePaise, BigInt(0));
    expect(mostOff(c.open, { waiver: false, headIds: [f.tuition.id], from: null, to: null })).toBe(Number(owed));
    expect(mostOff(c.open, { waiver: false, headIds: [], from: null, to: null })).toBe(0);
    const rows = [{ headId: "h", late: false, due: "2026-07-01", leftPaise: 600000 }, { headId: "h", late: false, due: "2027-01-01", leftPaise: 600000 }, { headId: "h", late: true, due: "2026-07-20", leftPaise: 10000 }];
    expect(mostOff(rows, { waiver: false, headIds: ["h"], from: "2026-11-12", to: null })).toBe(600000);
    expect(mostOff(rows, { waiver: false, headIds: ["h"], from: "2026-04-01", to: "2026-09-30" })).toBe(600000);
    expect(mostOff(rows, { waiver: true, headIds: [], from: null, to: null })).toBe(10000);
  });
});
