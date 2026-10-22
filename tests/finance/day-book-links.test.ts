// Day Book links (gap list G34, 07 §2 "Open an entry: shows where it came from
// ... with a link"): every kind of entry opens the record behind it, and only
// for people who may open that page. An expense entry's source is the expense
// payment, so the link must name the expense, not the payment.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { recordExpense, payExpense } from "@/lib/finance/expenses";
import { dayBookView } from "@/lib/finance/daybook-view";
import { dayBookSourceLink, type SourceLinkAccess } from "@/lib/finance/source-link";
import { todayIn } from "@/lib/staff/dates";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

const ALL: SourceLinkAccess = { payments: true, refunds: true, applications: true, salaryRuns: true, advances: true };
const NONE: SourceLinkAccess = { payments: false, refunds: false, applications: false, salaryRuns: false, advances: false };
const ID = "11111111-1111-4111-8111-111111111111";

describe("where each kind of Day Book entry opens", () => {
  const cases: [string, Partial<Parameters<typeof dayBookSourceLink>[0]>, string][] = [
    ["payment", {}, `/fee-management/payments/${ID}`],
    ["payment-cancel", {}, `/fee-management/payments/${ID}`],
    ["refund", {}, `/fee-management/concessions?tab=refunds&open=${ID}`],
    ["application-fee", { applicationId: "app-1" }, "/admission-management/applications/app-1"],
    ["application-fee-cancel", { applicationId: "app-1" }, "/admission-management/applications/app-1"],
    ["income", {}, `/finance-management/income?open=${ID}`],
    ["income-cancel", {}, `/finance-management/income?open=${ID}`],
    ["expense-payment", { expenseId: "exp-1" }, "/finance-management/expenses?open=exp-1"],
    ["expense-cancel", { expenseId: "exp-1" }, "/finance-management/expenses?open=exp-1"],
    ["payroll", {}, `/salary-management/generate?run=${ID}`],
    ["payroll-reversal", {}, `/salary-management/generate?run=${ID}`],
    ["salary-advance", {}, `/salary-management/advances?open=${ID}`],
    ["transfer", {}, `/finance-management/cash-bank?t=${ID}`],
    ["transfer-cancel", {}, `/finance-management/cash-bank?t=${ID}`],
    ["opening-balance", { accountId: "acc-1" }, "/finance-management/cash-bank?book=acc-1"],
  ];
  it.each(cases)("%s opens its record", (sourceType, extra, href) => {
    expect(dayBookSourceLink({ sourceType, sourceId: ID, ...extra }, ALL)?.[1]).toBe(href);
  });

  it("offers no link to a page the person may not open", () => {
    for (const t of ["payment", "refund", "application-fee", "payroll", "salary-advance"]) {
      expect(dayBookSourceLink({ sourceType: t, sourceId: ID, applicationId: "app-1" }, NONE)).toBeNull();
    }
    // Finance's own pages are open to everyone who sees the Day Book.
    expect(dayBookSourceLink({ sourceType: "income", sourceId: ID }, NONE)?.[1]).toBe(`/finance-management/income?open=${ID}`);
  });

  it("never links an expense entry by its payment's number", () => {
    expect(dayBookSourceLink({ sourceType: "expense-payment", sourceId: ID }, ALL)).toBeNull();
  });
});

describe("an expense paid today in the Day Book", () => {
  let f: FeeSchool;
  const today = todayIn("Asia/Kolkata");
  beforeAll(async () => {
    f = await makeFeeSchool();
  }, 120_000);

  it("carries the expense it paid, and its link opens that expense", async () => {
    const expenseId = await withSchool(f.ctx, async (tx) => {
      const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", name: "Stationery" } });
      const r = await recordExpense(tx, f.ctx, {
        date: today, accountHeadId: head.id, amountPaise: R(300), vendorId: null, costCentreId: null, billFileId: null,
        note: "Chalk", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null,
      }, null);
      await payExpense(tx, f.ctx, r.expense.id, { date: today, mode: "BANK_TRANSFER", reference: "UTR9", accountId: null });
      return r.expense.id;
    });
    const view = await withSchool(f.ctx, (tx) => dayBookView(tx, { from: today, to: today, classId: null, depositAccountId: null, waiting: false }));
    const row = view.sections.expense.find((r) => r.expenseId === expenseId)!;
    expect(row.sourceId).not.toBe(expenseId);
    expect(dayBookSourceLink(row, ALL)).toEqual(["Open the expense and bill", `/finance-management/expenses?open=${expenseId}`]);
  });
});
