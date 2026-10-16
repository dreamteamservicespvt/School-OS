// QA audit (MONEY): paying the same expense from two tabs, or a double click,
// must take the money out once: one Expense Payment, one Day Book entry.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { recordExpense, payExpense } from "@/lib/finance/expenses";
import { todayIn } from "@/lib/staff/dates";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

async function approvedExpense(rupees: number, bill = false) {
  return withSchool(f.ctx, async (tx) => {
    const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", name: "Stationery" } });
    const vendor = bill ? await tx.vendor.create({ data: { schoolId: f.school.id, name: `Demo Vendor ${Date.now()}` } }) : null;
    const r = await recordExpense(tx, f.ctx, {
      date: today, accountHeadId: head.id, amountPaise: R(rupees), vendorId: vendor?.id ?? null, costCentreId: null, billFileId: null,
      note: "Demo chalk", isVendorBill: bill, billNo: bill ? `B-${Date.now()}` : null, billDueDate: null, duplicateReason: null,
    }, null);
    expect(r.outcome).toBe("approved");
    return r.expense.id;
  });
}

const pay = (id: string, amount?: number) =>
  withSchool(f.ctx, (tx) => payExpense(tx, f.ctx, id, { date: today, mode: "BANK_TRANSFER", reference: "UTR123", accountId: null, amountPaise: amount ? R(amount) : null }));

describe("paying an expense twice at the same moment", () => {
  it("pays it once; the second attempt is told it is already paid", async () => {
    const id = await approvedExpense(400);
    const results = await Promise.allSettled([pay(id), pay(id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason?.message)).toMatch(/already paid/);
    await withSchool(f.ctx, async (tx) => {
      expect(await tx.expensePayment.count({ where: { expenseId: id } })).toBe(1);
      const payIds = (await tx.expensePayment.findMany({ where: { expenseId: id } })).map((p) => p.id);
      expect(await tx.dayBookEntry.count({ where: { sourceType: "expense-payment", sourceId: { in: payIds } } })).toBe(1);
      expect((await tx.expense.findUniqueOrThrow({ where: { id } })).status).toBe("PAID");
    });
  });

  it("two part payments of a vendor bill add up and never pass the bill", async () => {
    const id = await approvedExpense(500, true);
    const results = await Promise.allSettled([pay(id, 300), pay(id, 300)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await withSchool(f.ctx, async (tx) => {
      const e = await tx.expense.findUniqueOrThrow({ where: { id } });
      const paid = (await tx.expensePayment.findMany({ where: { expenseId: id } })).reduce((s, p) => s + p.amountPaise, BigInt(0));
      expect(e.paidPaise).toBe(paid);
      expect(paid).toBe(R(300));
    });
  });
});
