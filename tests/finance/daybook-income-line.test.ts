// QA audit (MONEY): the Day Book's "Total income" line must add up. With a payment
// cancelled the same day, a payment from an earlier day cancelled today, and a fee
// refund, "Fees + Partial + Other − reversed" equals Total income, and the refund
// is counted among the expense transactions.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { dayBookView } from "@/lib/finance/daybook-view";
import { postToDayBook, reverseSource } from "@/lib/finance/daybook";
import { cashAccount } from "@/lib/finance/settings";
import { cancelPayment } from "@/lib/fees/cancel";
import { todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("the Day Book's Total income line", () => {
  it("adds up when payments are cancelled and fees refunded", async () => {
    const ravi = await dues(f.ctx, f.ravi.id);
    const sita = await dues(f.ctx, f.sita.id);
    const full = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [ravi[0].id], amountPaise: ravi[0].balancePaise });
    await collect(f.ctx, { studentId: f.sita.id, dueIds: [sita[0].id], amountPaise: R(1000) });
    // Cancelled the same day (no approval needed for today's payment).
    await withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, full.payment.id, { reason: "Duplicate", note: null }));
    // An earlier day's income reversed today, and a refund paid out today.
    await withSchool(f.ctx, async (tx) => {
      const cash = await cashAccount(tx, f.ctx);
      const oldId = randomUUID();
      const old = new Date(today.getTime() - 3 * 86_400_000);
      await postToDayBook(tx, f.ctx, { date: old, direction: "IN", amountPaise: R(700), mode: "CASH", section: "fees-full", headName: "Tuition fee", accountId: cash.id, sourceType: "payment", sourceId: oldId, sourceKey: `qa-old:${Date.now()}`, partyName: "Earlier payer" });
      await reverseSource(tx, f.ctx, { sourceType: "payment", sourceId: oldId, date: today, reversalType: "payment-cancel", note: "Cancelled today" });
      await postToDayBook(tx, f.ctx, { date: today, direction: "OUT", amountPaise: R(300), mode: "CASH", section: "refund", headName: "Fee refund", accountId: cash.id, sourceType: "refund", sourceId: randomUUID(), sourceKey: `qa-refund:${Date.now()}`, partyName: "Refund" });
    });
    const v = await withSchool(f.ctx, (tx) => dayBookView(tx, { from: today, to: today, classId: null, depositAccountId: null, waiting: false, hidePay: null }));
    expect(v.feesFull + v.feesPartial + v.otherIncome + v.reversed).toBe(v.totals.income);
    expect(v.totals.income).toBe(R(1000 - 700));
    expect(v.reversed).toBe(-(ravi[0].balancePaise + R(700)));
    expect(v.totals.expense).toBe(R(300));
    expect(v.totals.expenseCount).toBe(1);
  });
});
