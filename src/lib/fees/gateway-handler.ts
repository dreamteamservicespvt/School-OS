// A8: what Fee Management does with a gateway event. The webhook route has
// already checked the signature before this runs. Imported by the route.
//
// - Captured (payment.captured, order.paid): posted once per gateway payment
//   id. payment.authorized is not money taken yet (it may never be captured),
//   so it posts nothing; the reconcile job and the capture event follow it.
// - Failed: recorded with no receipt, listed on the Fee Dashboard.
// - Refunded at Razorpay or disputed at the bank: kept for the office to check
//   and ask to cancel through Approvals, never cancelled by itself.
// Admission application fees have their own handler (admission/fee.ts).
import "server-only";

import type { Tx } from "../db";
import { onGatewayEvent, type GatewayEvent } from "../payments/events";
import { confirmGatewayPayment, recordGatewayFailure, recordGatewayReversal } from "./online";

const CONFIRMED = new Set(["payment.captured", "order.paid"]);
const REVERSED = new Set(["refund.processed", "payment.dispute.created", "payment.dispute.lost"]);

async function isAdmissionFee(tx: Tx, event: GatewayEvent) {
  if (event.notes?.purpose === "admission-application-fee") return true;
  return event.orderId ? (await tx.applicationFeePayment.count({ where: { gatewayOrderId: event.orderId } })) > 0 : false;
}

onGatewayEvent(async (tx, ctx, event) => {
  if (event.provider !== "razorpay" || !event.paymentId) return;
  if (await isAdmissionFee(tx, event)) return;
  if (CONFIRMED.has(event.event)) {
    await confirmGatewayPayment(tx, ctx, { gatewayAccountId: event.gatewayAccountId, gatewayPaymentId: event.paymentId, orderId: event.orderId, amountPaise: event.amountPaise, event: event.event, notes: event.notes, payer: event.payer });
  } else if (event.event === "payment.failed") {
    const p = (event.payload as { payload?: { payment?: { entity?: { error_description?: string } } } })?.payload?.payment?.entity;
    await recordGatewayFailure(tx, ctx, { gatewayAccountId: event.gatewayAccountId, gatewayPaymentId: event.paymentId, orderId: event.orderId, amountPaise: event.amountPaise, reason: p?.error_description ?? null, notes: event.notes });
  } else if (REVERSED.has(event.event) && event.reversal) {
    await recordGatewayReversal(tx, ctx, {
      gatewayAccountId: event.gatewayAccountId, event: event.event, kind: event.reversal.kind, gatewayPaymentId: event.paymentId, orderId: event.orderId,
      reference: event.reversal.id, amountPaise: event.reversal.amountPaise,
    });
  }
});
