// Every message Admission Management sends to a parent goes through this one
// function: follow-ups, campaigns, test and interview details, missing
// papers, offer letters, the welcome message and one-time codes. Parents have
// no login, so these are WhatsApp, SMS or email messages, never notifications.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";

export type ParentMessage = {
  to: { name: string; phone: string; email?: string | null };
  /** The Communication template this message uses, e.g. "admission-enquiry-follow-up". */
  template: string;
  /** The words the parent reads, already filled in. */
  text: string;
  channel?: "whatsapp" | "sms" | "email";
  /** The record the message is about, for Message History. */
  about: { recordType: "Enquiry" | "Application" | "Admission Campaign"; recordId: string };
  /** One-time codes are never written to the audit log. */
  secret?: boolean;
};

export type SendResult = { status: "queued" | "skipped"; channel: string; note?: string };

export async function messageParent(tx: Tx, ctx: SchoolContext, msg: ParentMessage): Promise<SendResult> {
  const channel = msg.channel ?? "whatsapp";
  if (!/^[6-9]\d{9}$/.test(msg.to.phone)) return { status: "skipped", channel, note: "No valid mobile number" };
  // messaging: hand this to Communication's sendMessage({ to, template, text, channel, about }) once
  // src/lib/messaging exists. It applies the school's template, opt-outs, credits and Message History.
  if (process.env.NODE_ENV !== "production" && msg.secret) {
    console.info(JSON.stringify({ level: "info", event: "admission-parent-code", note: "Messaging is not connected yet; development only", to: msg.to.phone.slice(-4), text: msg.text }));
  }
  await writeAudit(tx, ctx, {
    action: "message-to-parent",
    recordType: msg.about.recordType,
    recordId: msg.about.recordId,
    after: { template: msg.template, channel, to: `•••••${msg.to.phone.slice(-4)}`, text: msg.secret ? "(one-time code)" : msg.text },
  });
  return { status: "queued", channel };
}
