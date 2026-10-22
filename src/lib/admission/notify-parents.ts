// Every message Admission Management sends to a family that is not yet a
// parent of the school goes through this one function: follow-ups,
// campaigns, test and interview details, missing papers, offer letters and
// one-time codes. These families have no Guardian record yet, so the message
// is recorded through Communication's recordSend (src/lib/messaging) with one
// recipient addressed by phone or email: it appears in Message History, uses
// the school's channels and credits, and is delivered by the same background
// job. Once a child is admitted, messages go to the guardians with
// sendMessage / sendAutomatic instead (see convert.ts).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MessagingProblem, recordSend, type Plan, type PlannedRow } from "../messaging";
import { creditBalances, creditProblem, creditsFor } from "../messaging/credits";
import { onChannels, type Channel } from "../messaging/channels";

export type ParentMessage = {
  to: { name: string; phone: string; email?: string | null };
  /** What the message is, e.g. "admission-documents-missing" (shown as its trigger in Message History). */
  template: string;
  /** The words the family reads, already filled in. */
  text: string;
  /** The channel asked for; WhatsApp if connected, else SMS, when not given or not set up. */
  channel?: "whatsapp" | "sms" | "email";
  /** The record the message is about. */
  about: { recordType: "Enquiry" | "Application" | "Admission Campaign"; recordId: string };
  /** One-time codes: never written to the audit log or the message title. */
  secret?: boolean;
};

export type SendResult = { status: "queued" | "skipped"; channel: string; note?: string; messageId?: string };

const TRIGGERS: Record<string, string> = {
  "admission-consent-code": "Admission consent code",
  "admission-campaign": "Admission campaign",
  "admission-documents-missing": "Missing admission papers",
  "admission-document-rejected": "Admission paper rejected",
  "admission-details-missing": "Application details missing",
  "admission-fee-link": "Application fee payment link",
};

export async function messageParent(tx: Tx, ctx: SchoolContext, msg: ParentMessage): Promise<SendResult> {
  const on = await onChannels(tx, ctx);
  const asked: Channel = msg.channel ?? "whatsapp";
  const phoneOk = /^[6-9]\d{9}$/.test(msg.to.phone);
  let channel: Channel | null = null;
  if (asked === "email") channel = msg.to.email && on.has("email") ? "email" : null;
  else if (on.has(asked)) channel = asked;
  if (!channel) channel = on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : msg.to.email && on.has("email") ? "email" : null;
  if (!channel) return { status: "skipped", channel: asked, note: "No messaging channel is set up (Settings, SMS, WhatsApp & Email)" };
  if (channel !== "email" && !phoneOk) return { status: "skipped", channel, note: "No valid mobile number" };
  const address = channel === "email" ? msg.to.email! : msg.to.phone;
  const credits = creditsFor(channel, msg.text);
  const balances = await creditBalances(tx, ctx);
  const cost = { [channel]: credits } as Partial<Record<Channel, number>>;
  const row: PlannedRow = {
    // An applicant family, addressed by phone: not yet a guardian, student or staff member.
    candidate: { key: `applicant:${address}`, type: "applicant" as unknown as "guardian", id: msg.about.recordId, name: msg.to.name, description: `Admission: ${msg.about.recordType.toLowerCase()}`, phone: msg.to.phone, email: msg.to.email ?? null, userLoginId: null, language: "en", optedOut: false, students: [], inScope: true },
    rowKey: `applicant:${address}:${channel}`, studentId: null, channel, address, language: "en", version: null, title: null, text: msg.text, values: {}, credits,
  };
  const plan: Plan = { channels: [channel], rows: [row], people: 1, skipped: [], cost, backupCost: 0, balances, creditProblem: creditProblem(cost, balances), problems: [], audienceLabel: msg.to.name, backupTemplateId: null };
  const trigger = TRIGGERS[msg.template] ?? "Admission";
  try {
    const r = await recordSend(tx, ctx, {
      to: {}, channels: [channel], text: msg.secret ? "One-time code for admission consent" : msg.text, title: trigger,
      trigger, source: { type: msg.about.recordType, id: msg.about.recordId }, audienceLabel: msg.to.name, onNoCredits: "block",
    }, plan);
    await writeAudit(tx, ctx, {
      action: "message-to-parent", recordType: msg.about.recordType, recordId: msg.about.recordId,
      after: { kind: msg.template, channel, to: channel === "email" ? address : `•••••${msg.to.phone.slice(-4)}`, messageId: r.messageId, text: msg.secret ? "(one-time code)" : msg.text },
    });
    return { status: "queued", channel, messageId: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) return { status: "skipped", channel, note: e.message.replace(/\.$/, "") };
    throw e;
  }
}
