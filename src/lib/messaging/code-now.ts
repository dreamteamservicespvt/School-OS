// A one-time code is handed to WhatsApp or the SMS provider at once, while the
// person waits, so the screen can say what really happened. Before this, the
// screen said "Code sent ... by WhatsApp" as soon as the code was queued, and a
// code WhatsApp then refused (for example a typed message outside its 24-hour
// window, or a template not approved) never arrived (owner test 2026-11-05).
//
// Call it after the transaction that queued the code has been saved. It runs
// the same delivery as the background job (deliver.ts), which is safe to run
// twice: the job that was queued finds the code already gone and sends nothing.
import "server-only";

import { withSchool, type SchoolContext } from "../db";
import { deliverMessage } from "./deliver";

export type CodeOutcome =
  /** WhatsApp or the SMS provider took it. */
  | { state: "sent" }
  /** It could not go; `reason` is the provider's plain words (whatsappReason and the like). */
  | { state: "failed"; reason: string }
  /** Still waiting for a provider that was slow or busy: it goes within a minute or fails. */
  | { state: "pending" };

const TAKEN = new Set(["SENT", "DELIVERED", "READ"]);

export async function deliverCodeNow(ctx: SchoolContext, messageId: string | null | undefined): Promise<CodeOutcome> {
  if (!messageId) return { state: "pending" };
  const job: SchoolContext = { schoolId: ctx.schoolId, userId: null };
  try {
    await withSchool(job, (tx) => deliverMessage(tx, job, { messageId, round: "now", chunk: 0 }), { timeout: 20_000 });
  } catch (e) {
    // The background job still sends it; the screen only cannot confirm it.
    console.error(JSON.stringify({ level: "error", event: "code-deliver-now-failed", school: ctx.schoolId, message: messageId, error: e instanceof Error ? e.message : String(e) }));
  }
  const rows = await withSchool(job, (tx) => tx.messageRecipient.findMany({ where: { messageId }, select: { status: true, failReason: true } }));
  if (rows.some((r) => TAKEN.has(r.status))) return { state: "sent" };
  if (rows.length && rows.every((r) => r.status === "FAILED")) return { state: "failed", reason: (rows.find((r) => r.failReason)?.failReason ?? "The provider refused it.").replace(/\.$/, "") };
  return { state: "pending" };
}

/** The office's words when a code could not go: what happened, and what to do instead. */
export function codeFailedWords(channel: string, reason: string): string {
  const by = channel === "whatsapp" ? "WhatsApp" : channel === "sms" ? "SMS" : channel;
  return `The code was not sent by ${by}: ${reason}. Nothing reached the phone. Tap Send code again, or ask DREAM TEAM support to check the school's ${by}.`;
}
