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
import { chargesFor, MessagingProblem, recordSend, type Plan, type PlannedRow } from "../messaging";
import { creditBalances, creditProblem, creditsFor } from "../messaging/credits";
import { channelSetups, codeChannels, onChannels, WHATSAPP_NO_CODES, whatsappIsLive, type Channel } from "../messaging/channels";
import { CODE_MASK, withCode } from "../messaging/one-time-code";
import { bareText, currentVersions, ensureReadyTemplates, isApproved, render, templateByKey, TYPED_CARRIER, versionFor, type UsableVersion, withLastApproved } from "../messaging/templates";
import { formatDate } from "../format";

export type ParentMessage = {
  to: { name: string; phone: string; email?: string | null };
  /** What the message is, e.g. "admission-documents-missing" (shown as its trigger in Message History). */
  template: string;
  /** The words the family reads, already filled in. */
  text: string;
  /** Blanks for the school's approved template of the same key (one-time codes), e.g. { school_name }. */
  values?: Record<string, string>;
  /** The channel asked for; WhatsApp if connected, else SMS, when not given or not set up. */
  channel?: "whatsapp" | "sms" | "email";
  /** The record the message is about. */
  about: { recordType: "Enquiry" | "Application" | "Admission Campaign"; recordId: string };
  /**
   * A one-time code: the text has "••••••" where the code goes, and the code goes only to
   * the provider; it is never in Message History, the audit log or the title (QA SEC-01).
   */
  code?: string;
};

export type SendResult = { status: "queued" | "skipped"; channel: string; note?: string; messageId?: string };

/** Why a family's WhatsApp message could not go on a real account (shown on the screen, in en.ts). */
export const CARRIER_NOT_APPROVED = "WhatsApp has not approved the General announcement message yet";

const TRIGGERS: Record<string, string> = {
  "admission-consent-code": "Admission consent code",
  "admission-campaign": "Admission campaign",
  "admission-documents-missing": "Missing admission papers",
  "admission-document-rejected": "Admission paper rejected",
  "admission-details-missing": "Application details missing",
  "admission-fee-link": "Application fee payment link",
};

export async function messageParent(tx: Tx, ctx: SchoolContext, msg: ParentMessage): Promise<SendResult> {
  // A one-time code keeps its SMS path; other messages never go by SMS while it is not offered (SMS_OFFERED).
  const on = msg.code ? await codeChannels(tx, ctx) : await onChannels(tx, ctx);
  const asked: Channel = msg.channel ?? "whatsapp";
  const phoneOk = /^[6-9]\d{9}$/.test(msg.to.phone);
  let channel: Channel | null = null;
  if (asked === "email") channel = msg.to.email && on.has("email") ? "email" : null;
  else if (on.has(asked)) channel = asked;
  if (!channel) channel = on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : msg.to.email && on.has("email") ? "email" : null;
  if (!channel && msg.code && whatsappIsLive((await channelSetups(tx, ctx)).whatsapp)) return { status: "skipped", channel: asked, note: WHATSAPP_NO_CODES };
  if (!channel) return { status: "skipped", channel: asked, note: "No messaging channel is set up (Settings, SMS, WhatsApp & Email)" };
  if (channel !== "email" && !phoneOk) return { status: "skipped", channel, note: "No valid mobile number" };
  const address = channel === "email" ? msg.to.email! : msg.to.phone;
  let version: UsableVersion | null = null;
  let text = msg.text;
  let values: Record<string, string> = {};
  if (!msg.code && channel === "whatsapp" && whatsappIsLive((await channelSetups(tx, ctx)).whatsapp)) {
    // A real WhatsApp account refuses plain words to a family that has not written in the last 24 hours:
    // the words go in the approved General announcement's {message} blank, the way typed announcements
    // to parents do (TYPED_CARRIER in planMessage, send.ts). In test mode they stay plain, as before.
    await ensureReadyTemplates(tx, ctx);
    const t = await templateByKey(tx, ctx, TYPED_CARRIER.guardian, "whatsapp");
    // The last approved version keeps sending while a new card waits for WhatsApp (15 Nov).
    const v = t ? versionFor((await withLastApproved(tx, ctx, t.id, await currentVersions(tx, ctx, t.id))).filter(isApproved), "en", "en") : null;
    if (!v) return { status: "skipped", channel, note: CARRIER_NOT_APPROVED };
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, phone: true, timeZone: true } });
    const filled: Record<string, string> = {
      guardian_name: msg.to.name, school_name: school.name, date: formatDate(new Date(), school.timeZone),
      ...(school.phone ? { school_phone: school.phone } : {}),
      message: bareText(msg.text, school.name),
    };
    const r = render(v.body, filled);
    if (!r.ok) return { status: "skipped", channel, note: CARRIER_NOT_APPROVED };
    version = v; text = r.text; values = filled;
  } else if (msg.code && channel !== "email") {
    // A one-time code goes in the school's approved template of its own key when it has one.
    await ensureReadyTemplates(tx, ctx);
    const t = await templateByKey(tx, ctx, msg.template, channel);
    const v = t ? versionFor(await currentVersions(tx, ctx, t.id), "en", "en") : null;
    if (v && (channel === "whatsapp" ? isApproved(v) : Boolean(v.dltTemplateId))) {
      const r = render(v.body, { ...msg.values, code: CODE_MASK });
      if (r.ok) { version = v; text = r.text; values = { ...msg.values, code: CODE_MASK }; }
    }
  }
  // Counted on the words as sent: the code's mask would make an SMS look like Unicode.
  const credits = creditsFor(channel, msg.code ? withCode(text, msg.code) : text);
  const balances = await creditBalances(tx, ctx);
  const cost = { [channel]: credits } as Partial<Record<Channel, number>>;
  const row: PlannedRow = {
    // An applicant family, addressed by phone: not yet a guardian, student or staff member.
    candidate: { key: `applicant:${address}`, type: "applicant" as unknown as "guardian", id: msg.about.recordId, name: msg.to.name, description: `Admission: ${msg.about.recordType.toLowerCase()}`, phone: msg.to.phone, email: msg.to.email ?? null, userLoginId: null, language: "en", optedOut: false, students: [], inScope: true },
    rowKey: `applicant:${address}:${channel}`, studentId: null, channel, address, language: "en", version, title: null, text, values, credits,
  };
  const charges = await chargesFor(tx, ctx, cost);
  const plan: Plan = { channels: [channel], rows: [row], people: 1, skipped: [], cost, ...charges, backupCost: 0, balances, creditProblem: creditProblem(charges.charged, balances), problems: [], audienceLabel: msg.to.name, backupTemplateId: null };
  const trigger = TRIGGERS[msg.template] ?? "Admission";
  try {
    const r = await recordSend(tx, ctx, {
      to: {}, channels: [channel], text: msg.code ? "One-time code for admission consent" : msg.text, title: trigger,
      trigger, source: { type: msg.about.recordType, id: msg.about.recordId }, audienceLabel: msg.to.name, onNoCredits: "block",
      oneTimeCode: msg.code ? { code: msg.code, purpose: "admission-consent" } : null,
    }, plan);
    await writeAudit(tx, ctx, {
      action: "message-to-parent", recordType: msg.about.recordType, recordId: msg.about.recordId,
      after: { kind: msg.template, channel, to: channel === "email" ? address : `•••••${msg.to.phone.slice(-4)}`, messageId: r.messageId, text: msg.code ? "(one-time code)" : msg.text },
    });
    return { status: "queued", channel, messageId: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) return { status: "skipped", channel, note: e.message.replace(/\.$/, "") };
    throw e;
  }
}
