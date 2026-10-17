// Confirmations sent by a payment gateway (webhooks). The webhook route
// checks the signature first; only then are the handlers run. Fee Management
// registers what to do with a confirmed payment (A8), and must post it once
// even if the same confirmation arrives twice (keyed on the payment id).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { notesOf } from "./razorpay";

export type GatewayEvent = {
  provider: string;
  gatewayAccountId: string;
  /** e.g. "payment.captured", "payment.failed", "order.paid", "refund.processed", "payment.dispute.created". */
  event: string;
  /** The gateway's own id for the payment, used to post it only once. */
  paymentId: string | null;
  orderId: string | null;
  amountPaise: number | null;
  payload: unknown;
  /** Notes on the payment and its order: our own references (school_os_school, school_os_link, purpose). */
  notes?: Record<string, string>;
  /** A refund or dispute event: the gateway's id for it and its amount. */
  reversal?: { kind: "refund" | "dispute"; id: string | null; amountPaise: number | null } | null;
  /** The payer as the gateway knows them, to help the office match a payment by hand. */
  payer?: { contact: string | null; email: string | null; method: string | null };
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

type Entity = { id?: string; order_id?: string; payment_id?: string; amount?: number; notes?: unknown; contact?: string; email?: string; method?: string };

/** Reads the parts of a Razorpay webhook every handler needs. */
export function readRazorpayEvent(body: unknown, gatewayAccountId: string): GatewayEvent {
  const b = (body ?? {}) as { event?: string; payload?: { payment?: { entity?: Entity }; order?: { entity?: Entity }; refund?: { entity?: Entity }; dispute?: { entity?: Entity } } };
  const payment = b.payload?.payment?.entity;
  const order = b.payload?.order?.entity;
  const refund = b.payload?.refund?.entity;
  const dispute = b.payload?.dispute?.entity;
  const event = String(b.event ?? "unknown");
  const reversalOf = refund && event.startsWith("refund.") ? { kind: "refund" as const, e: refund } : dispute && event.startsWith("payment.dispute.") ? { kind: "dispute" as const, e: dispute } : null;
  return {
    provider: "razorpay",
    gatewayAccountId,
    event,
    paymentId: payment?.id ?? reversalOf?.e.payment_id ?? null,
    orderId: payment?.order_id ?? order?.id ?? null,
    // For a refund or dispute, the amount is the payment's; the reversal carries its own.
    amountPaise: typeof payment?.amount === "number" ? payment.amount : null,
    payload: body,
    // Razorpay copies the order's notes to order.paid; a payment's own notes may be empty.
    notes: { ...notesOf(order?.notes), ...notesOf(payment?.notes) },
    reversal: reversalOf ? { kind: reversalOf.kind, id: reversalOf.e.id ?? null, amountPaise: typeof reversalOf.e.amount === "number" ? reversalOf.e.amount : null } : null,
    payer: { contact: payment?.contact ?? null, email: payment?.email ?? null, method: payment?.method ?? null },
  };
}
