// Closing a financial year (gap list G34, 07 §6 "Month and year close", rule 35):
// a check list first (what stops the close, what only needs a look), years
// close in order, and closing locks the year, opens the next and carries each
// account's closing balance as its opening balance.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { closeFinancialYear, yearClosePlan } from "@/lib/finance/year-close";
import { financialYearOf } from "@/lib/finance/years";
import { cancelIncome, recordIncome } from "@/lib/finance/income";
import { accountBook } from "@/lib/finance/daybook";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const today = new Date("2026-10-09T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

const income = (date: string, rupees: number, post: boolean) => withSchool(f.ctx, async (tx) => {
  const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "INCOME", systemKey: null }, orderBy: { code: "asc" } });
  return recordIncome(tx, f.ctx, { date: d(date), accountHeadId: head.id, amountPaise: R(rupees), receivedFrom: "Hall rent", vendorId: null, mode: "CASH", reference: null, accountId: null, note: null }, post);
});

describe("closing a financial year", () => {
  it("will not close a year that has not ended", async () => {
    const fy = await withSchool(f.ctx, (tx) => financialYearOf(tx, f.ctx, d("2026-06-01")));
    const plan = await withSchool(f.ctx, (tx) => yearClosePlan(tx, f.ctx, fy.id, today));
    expect(plan.canClose).toBe(false);
    expect(plan.checks.find((c) => c.key === "ended")?.text).toBe("2026-27 has not ended yet. Close it after 31-03-2027.");
    await expect(withSchool(f.ctx, (tx) => closeFinancialYear(tx, f.ctx, fy.id, today))).rejects.toThrow("2026-27 has not ended yet");
  });

  it("lists what stops the close: an earlier open year and Draft income", async () => {
    await income("2025-06-10", 5000, true);
    const draft = await income("2025-07-01", 1000, false);
    const older = await withSchool(f.ctx, (tx) => financialYearOf(tx, f.ctx, d("2024-06-01")));
    const fy = await withSchool(f.ctx, (tx) => financialYearOf(tx, f.ctx, d("2025-06-10")));
    const plan = await withSchool(f.ctx, (tx) => yearClosePlan(tx, f.ctx, fy.id, today));
    expect(plan.canClose).toBe(false);
    expect(plan.checks.filter((c) => c.tone === "stop").map((c) => c.key)).toEqual(["earlier", "income"]);
    expect(plan.checks.find((c) => c.key === "income")?.text).toBe("1 income entry dated in the year is still Draft. Post or cancel it first.");
    await expect(withSchool(f.ctx, (tx) => closeFinancialYear(tx, f.ctx, fy.id, today))).rejects.toThrow("Close 2024-25 first: years close in order.");

    // Put both right: the earlier year closes, the Draft is cancelled.
    await withSchool(f.ctx, (tx) => closeFinancialYear(tx, f.ctx, older.id, today));
    await withSchool(f.ctx, (tx) => cancelIncome(tx, f.ctx, draft.id, "Rent not received", today));
    const again = await withSchool(f.ctx, (tx) => yearClosePlan(tx, f.ctx, fy.id, today));
    expect(again.canClose).toBe(true);
    expect(again.carried.find((a) => a.kind === "CASH")?.closing).toBe(R(5000));
    expect(again.result).toEqual({ word: "Surplus", amount: R(5000) });
    expect(again.nextName).toBe("2026-27");
  });

  it("closes the year: read-only, the next year opens with the closing balance, logged", async () => {
    const fy = await withSchool(f.ctx, (tx) => financialYearOf(tx, f.ctx, d("2025-06-10")));
    const r = await withSchool(f.ctx, (tx) => closeFinancialYear(tx, f.ctx, fy.id, today));
    expect(r.next.name).toBe("2026-27");
    await withSchool(f.ctx, async (tx) => {
      expect((await tx.financialYear.findUniqueOrThrow({ where: { id: fy.id } })).status).toBe("CLOSED");
      const cash = await tx.bankAccount.findFirstOrThrow({ where: { kind: "CASH" } });
      expect((await accountBook(tx, cash.id, d("2026-04-01"), d("2026-04-30"))).opening).toBe(R(5000));
      const log = await tx.auditLogEntry.findFirstOrThrow({ where: { action: "closed-year", recordId: fy.id } });
      expect(log.after).toMatchObject({ name: "2025-26", nextYear: "2026-27", surplus: "₹5,000" });
      expect(JSON.stringify(log.after)).toContain("₹5,000 on 01-04-2026");
    });
    await expect(income("2025-08-01", 200, true)).rejects.toThrow("Finance year 2025-26 is closed");
    await expect(withSchool(f.ctx, (tx) => closeFinancialYear(tx, f.ctx, fy.id, today))).rejects.toThrow("2025-26 is already closed.");
  });
});
