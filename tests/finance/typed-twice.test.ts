// Delivery audit follow-up: "Record expense" (no vendor) and "Record income" pressed twice,
// at once or a minute apart, must not quietly save the same money twice. The second is
// told about the first and saved only when the person says it is a second one. Other
// modules (fuel, fines) record their own entries and are not asked.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { recordExpense, type ExpenseInput } from "@/lib/finance/expenses";
import { recordIncome, type IncomeInput } from "@/lib/finance/income";
import { todayIn } from "@/lib/staff/dates";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

const headId = (kind: "EXPENSE" | "INCOME") =>
  withSchool(f.ctx, async (tx) => (await tx.accountHead.findFirstOrThrow({ where: { kind, archivedAt: null, OR: [{ systemKey: null }, { systemKey: { not: "fees" } }] } })).id);

async function expense(rupees: number, more: Partial<ExpenseInput> = {}, typed = true) {
  const accountHeadId = await headId("EXPENSE");
  return withSchool(f.ctx, (tx) => recordExpense(tx, f.ctx, {
    date: today, accountHeadId, amountPaise: R(rupees), vendorId: null, costCentreId: null, billFileId: null,
    note: "Demo chalk", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null, ...more,
  }, null, { typed }));
}

async function income(rupees: number, more: Partial<IncomeInput> = {}) {
  const accountHeadId = await headId("INCOME");
  return withSchool(f.ctx, (tx) => recordIncome(tx, f.ctx, {
    date: today, accountHeadId, amountPaise: R(rupees), receivedFrom: "Demo Caterers", vendorId: null, mode: "CASH",
    reference: null, accountId: null, note: null, confirmDuplicate: false, ...more,
  }, true));
}

const count = (model: "expense" | "income", rupees: number) =>
  withSchool(f.ctx, (tx) => (model === "expense" ? tx.expense.count({ where: { amountPaise: R(rupees) } }) : tx.income.count({ where: { amountPaise: R(rupees) } })));

describe("Record expense pressed twice", () => {
  it("at the same moment saves one; the other is asked first", async () => {
    const results = await Promise.allSettled([expense(731), expense(731)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const no = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(no.reason?.message)).toMatch(/recorded a few minutes ago as EXP\/.*Save it again\?/);
    expect(await count("expense", 731)).toBe(1);
  });

  it("saves it again when the person gives the reason", async () => {
    await expense(732);
    await expense(732, { duplicateReason: "Two boxes of chalk, two bills" });
    expect(await count("expense", 732)).toBe(2);
  });

  it("does not ask for an expense another module records", async () => {
    await expense(733, {}, false);
    await expense(733, {}, false);
    expect(await count("expense", 733)).toBe(2);
  });
});

describe("Record income pressed twice", () => {
  it("at the same moment posts one receipt; the other is asked first", async () => {
    const results = await Promise.allSettled([income(611), income(611)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const no = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(no.reason?.message)).toMatch(/from Demo Caterers .* was recorded a few minutes ago as .*Save it again\?/);
    expect(await count("income", 611)).toBe(1);
  });

  it("saves it again after 'Save it again', and asks nothing for another payer", async () => {
    await income(612);
    await income(612, { confirmDuplicate: true });
    await income(612, { receivedFrom: "Demo Hall Hire" });
    expect(await count("income", 612)).toBe(3);
  });

  it("does not ask for income another module records", async () => {
    await income(613, { confirmDuplicate: undefined });
    await income(613, { confirmDuplicate: undefined });
    expect(await count("income", 613)).toBe(2);
  });
});
