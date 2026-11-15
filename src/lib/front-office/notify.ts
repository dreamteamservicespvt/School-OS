// Every message Front Office sends to someone outside the staff goes through
// this one function: a visitor's pass on their phone, an appointment
// confirmation or reminder, a walk-in request number, and the one-time
// pickup code to a guardian's registered mobile. Visitors have no record in
// Communication, so each message is recorded through Communication's
// recordSend with one recipient addressed by phone: it appears in Message
// History, uses the school's channels and credits, and is delivered by the
// same background job.
//
// On WhatsApp each kind of message goes in its own approved template, a card
// (src/lib/messaging/ready-whatsapp.ts): WhatsApp drops plain text to anyone who
// has not written to the school in the last 24 hours (live test 15 Nov 2026).
// The desk's sentence fills the card's {message} blank; the pickup code goes in
// its code template (Authentication). On a real WhatsApp account a kind whose
// template WhatsApp has not approved yet is not sent, and the desk is told why.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { chargesFor, MessagingProblem, recordSend, type Plan, type PlannedRow } from "../messaging";
import { creditBalances, creditProblem, creditsFor } from "../messaging/credits";
import { channelSetups, codeChannels, onChannels, SMS_OFFERED, whatsappIsLive, type Channel } from "../messaging/channels";
import { CODE_MASK, withCode } from "../messaging/one-time-code";
import { bareText, currentVersions, ensureReadyTemplates, isApproved, render, templateByKey, versionFor, withLastApproved, type UsableVersion } from "../messaging/templates";
import { maskPhone } from "./words";

/** The ready WhatsApp template of each Front Office message. */
export const DESK_TEMPLATE: Record<DeskMessage["trigger"], string> = {
  "Visitor pass": "visitor-pass",
  "Appointment confirmation": "appointment-confirmed",
  "Appointment reminder": "appointment-reminder",
  "Appointment cancelled": "appointment-cancelled",
  "Walk-in request number": "walk-in-number",
  "Pickup code": "pickup-code",
  "Pickup gate pass": "gate-pass",
};

type DeskText = { version: UsableVersion | null; text: string; values: Record<string, string> } | { skip: string };

/** The words a desk message goes in on WhatsApp: its card filled in, or (test mode, no template) the desk's own words. */
async function whatsappText(tx: Tx, ctx: SchoolContext, msg: DeskMessage): Promise<DeskText> {
  const live = whatsappIsLive((await channelSetups(tx, ctx)).whatsapp);
  await ensureReadyTemplates(tx, ctx);
  const t = await templateByKey(tx, ctx, DESK_TEMPLATE[msg.trigger], "whatsapp");
  const now = t ? await currentVersions(tx, ctx, t.id) : [];
  // New words waiting for approval: the last approved ones go meanwhile.
  const versions = t && live ? (await withLastApproved(tx, ctx, t.id, now)).filter(isApproved) : now;
  const v = versionFor(versions, "en", "en");
  if (!v) return live ? { skip: `WhatsApp has not approved the "${t?.name ?? msg.trigger}" template yet. Send it for approval in Message Templates` } : { version: null, text: msg.text, values: {} };
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true } });
  const values: Record<string, string> = { visitor_name: msg.to.name, school_name: school.name, message: bareText(msg.text, school.name), ...(msg.code ? { code: CODE_MASK } : {}) };
  const r = render(v.body, values);
  if (!r.ok) return live ? { skip: `The "${t!.name}" template has a blank Front Office cannot fill (${r.missing.map((k) => `{${k}}`).join(", ")})` } : { version: null, text: msg.text, values: {} };
  return { version: v, text: r.text, values };
}

export type DeskMessage = {
  to: { name: string; phone: string };
  /** What the message is, shown as its trigger in Message History. */
  trigger: "Visitor pass" | "Appointment confirmation" | "Appointment reminder" | "Appointment cancelled" | "Walk-in request number" | "Pickup code" | "Pickup gate pass";
  text: string;
  about: { recordType: string; recordId: string };
  /**
   * A one-time code: the text has "••••••" where the code goes, and the code goes only to
   * the provider; it is never in Message History, the audit log or the title (QA SEC-01).
   */
  code?: string;
};

export type DeskSend = { status: "queued" | "skipped"; channel: string; note?: string };

export async function messageVisitor(tx: Tx, ctx: SchoolContext, msg: DeskMessage): Promise<DeskSend> {
  // A pickup code keeps its SMS path; other messages never go by SMS while it is not offered (SMS_OFFERED).
  const on = msg.code ? await codeChannels(tx, ctx) : await onChannels(tx, ctx);
  const channel: Channel | null = on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : null;
  if (!channel) return { status: "skipped", channel: "whatsapp", note: SMS_OFFERED ? "No WhatsApp or SMS is set up (Settings, SMS, WhatsApp & Email)" : "WhatsApp is not set up (Settings, SMS, WhatsApp & Email)" };
  if (!/^[6-9]\d{9}$/.test(msg.to.phone)) return { status: "skipped", channel, note: "No valid mobile number" };
  const words = channel === "whatsapp" ? await whatsappText(tx, ctx, msg) : { version: null, text: msg.text, values: {} };
  if ("skip" in words) return { status: "skipped", channel, note: words.skip };
  // Counted on the words as sent: the code's mask would make an SMS look like Unicode.
  const credits = creditsFor(channel, msg.code ? withCode(words.text, msg.code) : words.text);
  const balances = await creditBalances(tx, ctx);
  const cost = { [channel]: credits } as Partial<Record<Channel, number>>;
  const row: PlannedRow = {
    // A visitor or caller, addressed by phone: not a guardian, student or staff member record.
    candidate: { key: `visitor:${msg.to.phone}`, type: "visitor" as unknown as "guardian", id: msg.about.recordId, name: msg.to.name, description: `Front Office: ${msg.about.recordType.toLowerCase()}`, phone: msg.to.phone, email: null, userLoginId: null, language: "en", optedOut: false, students: [], inScope: true },
    rowKey: `visitor:${msg.to.phone}:${channel}`, studentId: null, channel, address: msg.to.phone, language: words.version?.language ?? "en", version: words.version, title: null, text: words.text, values: words.values, credits,
  };
  const charges = await chargesFor(tx, ctx, cost);
  const plan: Plan = { channels: [channel], rows: [row], people: 1, skipped: [], cost, ...charges, backupCost: 0, balances, creditProblem: creditProblem(charges.charged, balances), problems: [], audienceLabel: msg.to.name, backupTemplateId: null };
  try {
    await recordSend(tx, ctx, {
      to: {}, channels: [channel], text: msg.code ? "One-time pickup code" : msg.text, title: msg.trigger,
      trigger: msg.trigger, source: { type: msg.about.recordType, id: msg.about.recordId }, audienceLabel: msg.to.name, onNoCredits: "block",
      oneTimeCode: msg.code ? { code: msg.code, purpose: "pickup" } : null,
    }, plan);
    await writeAudit(tx, ctx, {
      action: "message-sent", recordType: msg.about.recordType, recordId: msg.about.recordId,
      after: { kind: msg.trigger, channel, to: maskPhone(msg.to.phone), text: msg.code ? "(one-time code)" : msg.text },
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
