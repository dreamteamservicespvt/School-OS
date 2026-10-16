// Every message Front Office sends to someone outside the staff goes through
// this one function: a visitor's pass on their phone, an appointment
// confirmation or reminder, a walk-in request number, and the one-time
// pickup code to a guardian's registered mobile. Visitors have no record in
// Communication, so each message is recorded through Communication's
// recordSend with one recipient addressed by phone: it appears in Message
// History, uses the school's channels and credits, and is delivered by the
// same background job.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MessagingProblem, recordSend, type Plan, type PlannedRow } from "../messaging";
import { creditBalances, creditProblem, creditsFor } from "../messaging/credits";
import { onChannels, type Channel } from "../messaging/channels";
import { maskPhone } from "./words";

export type DeskMessage = {
  to: { name: string; phone: string };
  /** What the message is, shown as its trigger in Message History. */
  trigger: "Visitor pass" | "Appointment confirmation" | "Appointment reminder" | "Appointment cancelled" | "Walk-in request number" | "Pickup code" | "Pickup gate pass";
  text: string;
  about: { recordType: string; recordId: string };
  /** One-time codes: never written to the audit log or the message title. */
  secret?: boolean;
};

export type DeskSend = { status: "queued" | "skipped"; channel: string; note?: string };

export async function messageVisitor(tx: Tx, ctx: SchoolContext, msg: DeskMessage): Promise<DeskSend> {
  const on = await onChannels(tx, ctx);
  const channel: Channel | null = on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : null;
  if (!channel) return { status: "skipped", channel: "whatsapp", note: "No WhatsApp or SMS is set up (Settings, SMS, WhatsApp & Email)" };
  if (!/^[6-9]\d{9}$/.test(msg.to.phone)) return { status: "skipped", channel, note: "No valid mobile number" };
  const credits = creditsFor(channel, msg.text);
  const balances = await creditBalances(tx, ctx);
  const cost = { [channel]: credits } as Partial<Record<Channel, number>>;
  const row: PlannedRow = {
    // A visitor or caller, addressed by phone: not a guardian, student or staff member record.
    candidate: { key: `visitor:${msg.to.phone}`, type: "visitor" as unknown as "guardian", id: msg.about.recordId, name: msg.to.name, description: `Front Office: ${msg.about.recordType.toLowerCase()}`, phone: msg.to.phone, email: null, userLoginId: null, language: "en", optedOut: false, students: [], inScope: true },
    rowKey: `visitor:${msg.to.phone}:${channel}`, studentId: null, channel, address: msg.to.phone, language: "en", version: null, title: null, text: msg.text, values: {}, credits,
  };
  const plan: Plan = { channels: [channel], rows: [row], people: 1, skipped: [], cost, backupCost: 0, balances, creditProblem: creditProblem(cost, balances), problems: [], audienceLabel: msg.to.name, backupTemplateId: null };
  try {
    await recordSend(tx, ctx, {
      to: {}, channels: [channel], text: msg.secret ? "One-time pickup code" : msg.text, title: msg.trigger,
      trigger: msg.trigger, source: { type: msg.about.recordType, id: msg.about.recordId }, audienceLabel: msg.to.name, onNoCredits: "block",
    }, plan);
    if (process.env.NODE_ENV !== "production" && msg.secret) {
      console.info(JSON.stringify({ level: "info", event: "pickup-code", note: "development only", to: msg.to.phone.slice(-4), text: msg.text }));
    }
    await writeAudit(tx, ctx, {
      action: "message-sent", recordType: msg.about.recordType, recordId: msg.about.recordId,
      after: { kind: msg.trigger, channel, to: maskPhone(msg.to.phone), text: msg.secret ? "(one-time code)" : msg.text },
    });
    return { status: "queued", channel };
  } catch (e) {
    if (e instanceof MessagingProblem) return { status: "skipped", channel, note: e.message.replace(/\.$/, "") };
    throw e;
  }
}

/** "on WhatsApp" / "by SMS", or why it was not sent. */
export function sentWords(r: DeskSend) {
  if (r.status === "queued") return r.channel === "sms" ? "by SMS" : "on WhatsApp";
  return null;
}
