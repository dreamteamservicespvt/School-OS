// Hands a queued message to its providers now and reads back what really happened (self-test B1, 2026-11-12).
// Same steps as confirmInviteSent (src/lib/settings/invite-message.ts). Call it after the transaction that
// queued the message was saved.
import "server-only";

import { withSchool, type SchoolContext } from "../db";
import { deliverMessage } from "./deliver";
import { classifyDelivery, type Delivery } from "./delivery-words";

export async function deliverNowAndCheck(ctx: SchoolContext, messageId: string): Promise<Delivery> {
  const job: SchoolContext = { schoolId: ctx.schoolId, userId: null };
  try {
    // Safe to run twice: the queued background job finds it already handed over.
    await withSchool(job, (tx) => deliverMessage(tx, job, { messageId, round: "now", chunk: 0 }), { timeout: 20_000 });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "message-deliver-now-failed", school: ctx.schoolId, message: messageId, error: e instanceof Error ? e.message : String(e) }));
  }
  const rows = await withSchool(job, (tx) => tx.messageRecipient.findMany({ where: { messageId }, select: { channel: true, status: true, failReason: true, provider: true } }));
  return classifyDelivery(rows);
}
