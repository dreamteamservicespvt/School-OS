// Profit and loss with journal entries (gap list G34, 07 §2 Accounts, §7):
// a journal entry moving an amount between heads shows in Profit and loss and
// in Income and expense, a reversal nets it off, and staff pay heads stay out
// for people who may not see staff pay.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { recordExpense, payExpense } from "@/lib/finance/expenses";
import { addJournal, reverseJournal } from "@/lib/finance/journals";
import { findFinanceReport, type FinanceFilter } from "@/lib/finance/reports";
import { financialYearOf } from "@/lib/finance/years";
import { todayIn } from "@/lib/staff/dates";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");
let heads: Record<string, string> = {};
let filter: FinanceFilter;

beforeAll(async () => {
  f = await makeFeeSchool();
  await withSchool(f.ctx, async (tx) => {
    heads = Object.fromEntries((await tx.accountHead.findMany()).map((h) => [h.name, h.id]));
    const r = await recordExpense(tx, f.ctx, {
      date: today, accountHeadId: heads.Stationery, amountPaise: R(1000), vendorId: null, costCentreId: null, billFileId: null,
      note: "Printing paper", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null,
    }, null);
    await payExpense(tx, f.ctx, r.expense.id, { date: today, mode: "BANK_TRANSFER", reference: "UTR1", accountId: null });
    const fy = await financialYearOf(tx, f.ctx, today);
    filter = { financialYearId: fy.id, yearStart: fy.startDate, from: fy.startDate, to: today, group: "month", by: "head", today, hidePay: null };
  });
}, 120_000);

const line = (head: string, debit: number, credit: number) => ({ accountHeadId: heads[head], debitPaise: R(debit), creditPaise: R(credit) });
const pl = (hidePay: string[] | null = null) => withSchool(f.ctx, (tx) => findFinanceReport("profit-loss")!.run(tx, f.ctx, { ...filter, hidePay }));
const amountOf = (rows: Record<string, unknown>[], head: string) => rows.find((r) => r.head === head)?.amount ?? null;

describe("Profit and loss with journal entries", () => {
  it("moves an amount between expense heads; the total stays the same", async () => {
    const before = await pl();
    expect(amountOf(before.rows, "Stationery")).toBe(R(1000));
    expect(before.note).toBeUndefined();
    await withSchool(f.ctx, (tx) => addJournal(tx, f.ctx, { date: today, narration: "Paper was for printing", lines: [line("Printing", 400, 0), line("Stationery", 0, 400)] }));
    const after = await pl();
    expect(amountOf(after.rows, "Stationery")).toBe(R(600));
    expect(amountOf(after.rows, "Printing")).toBe(R(400));
    expect(after.rows.find((r) => r.section === "Total expenses")?.amount).toBe(R(1000));
    expect(after.note).toContain("Includes journal entries");
  });

  it("counts a journal on an income head, and a reversal takes it back out", async () => {
    const j = await withSchool(f.ctx, (tx) => addJournal(tx, f.ctx, { date: today, narration: "Donation in kind: paper", lines: [line("Stationery", 250, 0), line("Donations", 0, 250)] }));
    let r = await pl();
    expect(amountOf(r.rows, "Donations")).toBe(R(250));
    expect(r.rows.find((x) => x.section === "Total income")?.amount).toBe(R(250));
    expect(r.totals).toEqual({ section: "Deficit", amount: R(1000) });
    await withSchool(f.ctx, (tx) => reverseJournal(tx, f.ctx, j.id, "Entered by mistake", today));
    r = await pl();
    expect(amountOf(r.rows, "Donations")).toBeNull();
    expect(r.rows.find((x) => x.section === "Total income")?.amount).toBe(R(0));
  });

  it("shows journals in Income and expense too, and leaves staff pay heads out for people who may not see them", async () => {
    await withSchool(f.ctx, (tx) => addJournal(tx, f.ctx, { date: today, narration: "Coaching fee was salary", lines: [line("Salaries", 300, 0), line("Miscellaneous", 0, 300)] }));
    const ie = await withSchool(f.ctx, (tx) => findFinanceReport("income-expense")!.run(tx, f.ctx, filter));
    expect(ie.rows.find((r) => r.head === "Salaries")?.expense).toBe(R(300));
    const hidden = await pl([heads.Salaries]);
    expect(amountOf(hidden.rows, "Salaries")).toBeNull();
    expect(amountOf(hidden.rows, "Miscellaneous")).toBe(R(-300));
  });
});
