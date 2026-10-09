// Confirmations sent by a payment gateway (webhooks). The webhook route
// checks the signature first; only then are the handlers run. Fee Management
// registers what to do with a confirmed payment (A8), and must post it once
// even if the same confirmation arrives twice (keyed on the payment id).
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type GatewayEvent = {
  provider: string;
  gatewayAccountId: string;
  /** e.g. "payment.captured", "payment.failed", "order.paid". */
  event: string;
  /** The gateway's own id for the payment, used to post it only once. */
  paymentId: string | null;
  orderId: string | null;
  amountPaise: number | null;
  payload: unknown;
};

type Handler = (tx: Tx, ctx: SchoolContext, event: GatewayEvent) => Promise<void>;
const handlers: Handler[] = [];

export function onGatewayEvent(handler: Handler) {
  handlers.push(handler);
}

export async function runGatewayEvent(tx: Tx, ctx: SchoolContext, event: GatewayEvent) {
  for (const h of handlers) await h(tx, ctx, event);
  return handlers.length;
}

/** Reads the parts of a Razorpay webhook every handler needs. */
export function readRazorpayEvent(body: unknown, gatewayAccountId: string): GatewayEvent {
  const b = (body ?? {}) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } }; order?: { entity?: { id?: string } } } };
  const payment = b.payload?.payment?.entity;
  return {
    provider: "razorpay",
    gatewayAccountId,
    event: String(b.event ?? "unknown"),
    paymentId: payment?.id ?? null,
    orderId: payment?.order_id ?? b.payload?.order?.entity?.id ?? null,
    amountPaise: typeof payment?.amount === "number" ? payment.amount : null,
    payload: body,
  };
}
