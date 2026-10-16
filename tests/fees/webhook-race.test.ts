// QA audit (MONEY-10): Razorpay sends payment.captured and order.paid for the same
// payment at the same moment, and retries. However they arrive, a payment is posted
// once: one Payment, one Receipt, one Day Book entry. This holds also after an earlier
// payment.failed for the same payment id (its record has no unique id to stop a second).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { confirmGatewayPayment, createPaymentLink, recordGatewayFailure } from "@/lib/fees/online";
import { dues, makeFeeSchool, type FeeSchool } from "./fixture";

let f: FeeSchool;
let gwId = "";

beforeAll(async () => {
  f = await makeFeeSchool();
  gwId = (await withSchool(f.ctx, (tx) => tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused-in-this-test" } }))).id;
}, 120_000);

async function linkFor(studentId: string, orderId: string) {
  const open = await dues(f.ctx, studentId);
  const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId, dueIds: [open[0].id], source: "PARENT_LINK" }));
  await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: made.link.id }, data: { gatewayOrderId: orderId } }));
  return Number(open[0].balancePaise);
}

const confirm = (payId: string, orderId: string, amount: number, event: string) =>
  withSchool(f.ctx, (tx) => confirmGatewayPayment(tx, f.ctx, { gatewayAccountId: gwId, gatewayPaymentId: payId, orderId, amountPaise: amount, event }));

async function counts(payId: string) {
  return withSchool(f.ctx, async (tx) => {
    const posted = await tx.payment.findMany({ where: { reference: payId, status: "POSTED" } });
    const ids = posted.map((p) => p.id);
    return {
      posted: posted.length,
      receipts: await tx.receipt.count({ where: { paymentId: { in: ids } } }),
      dayBook: await tx.dayBookEntry.count({ where: { sourceType: "payment", sourceId: { in: ids }, reversesEntryId: null } }),
    };
  });
}

describe("gateway confirmations arriving together", () => {
  it("post the payment once", async () => {
    const amount = await linkFor(f.ravi.id, "order_race_1");
    await Promise.allSettled([confirm("pay_race_1", "order_race_1", amount, "payment.captured"), confirm("pay_race_1", "order_race_1", amount, "order.paid"), confirm("pay_race_1", "order_race_1", amount, "payment.captured")]);
    expect(await counts("pay_race_1")).toEqual({ posted: 1, receipts: 1, dayBook: 1 });
  });

  it("post the payment once after an earlier failure with the same payment id", async () => {
    const amount = await linkFor(f.sita.id, "order_race_2");
    await withSchool(f.ctx, (tx) => recordGatewayFailure(tx, f.ctx, { gatewayAccountId: gwId, gatewayPaymentId: "pay_race_2", orderId: "order_race_2", amountPaise: amount, reason: "Bank timed out" }));
    const r = await Promise.allSettled([confirm("pay_race_2", "order_race_2", amount, "payment.captured"), confirm("pay_race_2", "order_race_2", amount, "order.paid")]);
    expect(r.every((x) => x.status === "fulfilled")).toBe(true);
    expect(await counts("pay_race_2")).toEqual({ posted: 1, receipts: 1, dayBook: 1 });
  });
});
