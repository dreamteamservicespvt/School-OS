// Every message Fee Management sends to parents goes through Communication
// (src/lib/messaging): the payment confirmation (A1, rule "fee-paid"), fee
// reminders (A7, rule "fee-due", and reminders sent by hand from Defaulters),
// and payment links. Opt-outs, templates, languages, credits, SMS backup and
// Message History are all handled there.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { sendAutomatic, sendMessage, planMessage, MessagingProblem, type SendInput } from "../messaging";
import { formatDate, formatRupees } from "../format";
import { receiptPlaceholderFor } from "../parent-link/token";

/** A1: the parent's "Fee received" message. Never stops the payment: a messaging setup problem is only logged. */
export async function sendFeePaid(tx: Tx, ctx: SchoolContext, p: { paymentId: string; studentId: string; amountPaise: bigint; date: Date; receiptNo: string }) {
  try {
    return await sendAutomatic(tx, ctx, {
      rule: "fee-paid",
      event: { key: `fee-paid:${p.paymentId}`, label: `Fee received, receipt ${p.receiptNo}` },
      to: { guardiansOf: [p.studentId] },
      perStudent: { [p.studentId]: { paid_amount: formatRupees(p.amountPaise), payment_date: formatDate(p.date), receipt_number: p.receiptNo, receipt_link: receiptPlaceholderFor(ctx.schoolId, p.paymentId) } },
      source: { type: "Payment", id: p.paymentId },
    });
  } catch (e) {
    if (e instanceof MessagingProblem) {
      console.warn(JSON.stringify({ level: "warn", event: "fee-paid-message-not-sent", reason: e.message }));
      return null;
    }
    throw e;
  }
}

/** Values for one student's fee message. */
export function dueValues(v: { amountPaise: bigint; dueDate: Date; link: string | null }) {
  return { due_amount: formatRupees(v.amountPaise), due_date: formatDate(v.dueDate), link: v.link ?? "your Parent Link" };
}

/** The message a person sends from Defaulters or Collect Fee (payment link, reminder). */
export function feeMessageInput(input: {
  studentIds: string[];
  channel: "whatsapp" | "sms" | "email";
  templateId: string | null;
  text: string | null;
  perStudent: Record<string, Record<string, string>>;
  /** A guardian's own values about one child ("guardianId:studentId"), e.g. their Parent Link. */
  perGuardianStudent?: Record<string, Record<string, string>>;
  trigger: string;
  source?: { type: string; id: string } | null;
  scheduledAt?: Date | null;
  idempotencyKey?: string | null;
}): SendInput {
  return {
    to: { guardiansOf: input.studentIds },
    channels: [input.channel],
    templates: input.templateId ? { [input.channel]: input.templateId } : undefined,
    text: input.templateId ? null : input.text,
    perStudent: input.perStudent,
    perGuardianStudent: input.perGuardianStudent,
    messageType: "fee",
    trigger: input.trigger,
    source: input.source ?? null,
    scheduledAt: input.scheduledAt ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    audienceLabel: input.studentIds.length === 1 ? "Parents of one student" : `Parents of ${input.studentIds.length} students`,
  };
}

export { sendMessage, planMessage, sendAutomatic, MessagingProblem };
