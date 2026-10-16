// A8: what Fee Management does with a gateway confirmation. The webhook route
// has already checked the signature before this runs. Imported by the route.
import "server-only";

import { onGatewayEvent } from "../payments/events";
import { confirmGatewayPayment, recordGatewayFailure } from "./online";

const CONFIRMED = new Set(["payment.captured", "order.paid", "payment.authorized"]);

onGatewayEvent(async (tx, ctx, event) => {
  if (event.provider !== "razorpay" || !event.paymentId) return;
  if (CONFIRMED.has(event.event)) {
    await confirmGatewayPayment(tx, ctx, { gatewayAccountId: event.gatewayAccountId, gatewayPaymentId: event.paymentId, orderId: event.orderId, amountPaise: event.amountPaise, event: event.event });
  } else if (event.event === "payment.failed") {
    const p = (event.payload as { payload?: { payment?: { entity?: { error_description?: string } } } })?.payload?.payment?.entity;
    await recordGatewayFailure(tx, ctx, { gatewayAccountId: event.gatewayAccountId, gatewayPaymentId: event.paymentId, orderId: event.orderId, amountPaise: event.amountPaise, reason: p?.error_description ?? null });
  }
});
