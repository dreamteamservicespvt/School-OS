// Every message Fee Management sends to a parent goes through this one
// function: payment confirmations (A1), fee reminders (A7), payment links and
// fee invoices. Parents who opted out of messages are skipped (06 open
// questions: opted-out parents get no reminders).
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type ParentMessage = {
  guardianId: string;
  phone: string | null;
  email?: string | null;
  optedOut: boolean;
  /** "whatsapp", "sms" or "email". */
  channel: string;
  /** The template it was made from, e.g. "fee-receipt", "fee-reminder", "payment-link". */
  template: string;
  text: string;
  /** Same key = same message: sending again does nothing (automations are safe to run twice). */
  onceKey: string;
};

export type SendResult = { status: "queued" | "skipped-opted-out" | "skipped-no-phone" };

// messaging: wire this to Communication's sendMessage (src/lib/messaging) once it
// exists. It must use the school's template, respect opt-outs, write Message
// History, use SMS backup for fee messages (A1, A7) when the school has it on,
// and use onceKey so the same message is never sent twice.
export async function sendParentMessage(_tx: Tx, _ctx: SchoolContext, msg: ParentMessage): Promise<SendResult> {
  if (msg.optedOut) return { status: "skipped-opted-out" };
  if (msg.channel !== "email" && !msg.phone) return { status: "skipped-no-phone" };
  return { status: "queued" };
}

/** Message credits left for a channel (Settings, SMS, WhatsApp & Email). Email costs nothing (inferred). */
export async function creditsLeft(tx: Tx, ctx: SchoolContext, channel: string) {
  if (channel === "email") return Number.POSITIVE_INFINITY;
  const sum = await tx.creditLedgerEntry.aggregate({ where: { schoolId: ctx.schoolId, channel }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

/** Credits one message costs on a channel (inferred: 1 for SMS and WhatsApp, 0 for email). */
export function creditsPerMessage(channel: string) {
  return channel === "email" ? 0 : 1;
}
