// Sends a new login's invite link to the person through Communication
// (docs/BUILDING.md §5): by WhatsApp (or SMS when WhatsApp is off) to the
// phone on the login, and by email when they have one. The message keeps only
// a placeholder for the link (src/lib/parent-link/token.ts), so Message
// History never shows a working invite. The link is still shown on screen,
// so an invite never fails because a channel is off.
import "server-only";

import { withSchool, type SchoolContext, type Tx } from "../db";
import { deliverMessage } from "../messaging/deliver";
import { channelSetups, type Channel } from "../messaging/channels";
import { planMessage, recordSend } from "../messaging/send";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import { invitePlaceholderFor } from "../parent-link/token";

export const INVITE_TEMPLATE = "staff-invite";

const WORD: Record<Channel, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "email", app: "School OS" };

export type InviteSent = {
  /** The channels it went by, in words: ["WhatsApp", "email"]. Empty when nothing could be sent. */
  sentBy: string[];
  /** Channels still waiting for a slow provider (only after confirmInviteSent). */
  pending?: string[];
  /** Why it was not sent (or not by every channel), in plain words. */
  note: string | null;
  messageId: string | null;
};

/** Words for the screen: "The link was sent by WhatsApp and email." Only after confirmInviteSent, which
 * keeps in sentBy the channels whose provider really took it (owner test 2026-11-05: "sent" when only queued). */
export function inviteSentWords(sent: InviteSent | null | undefined): string {
  if (!sent) return "";
  const by = sent.sentBy.length ? ` The link was sent to them by ${sent.sentBy.join(" and ")}.` : "";
  const going = sent.pending?.length ? ` It is on its way by ${sent.pending.join(" and ")}: check Message History in a minute.` : "";
  return `${by}${going}${sent.note ? ` ${sent.note}` : ""}`;
}

const TAKEN = new Set(["SENT", "DELIVERED", "READ"]);
const WORD_OF: Record<string, string> = WORD;

/** Hands a queued invite to WhatsApp, SMS and email at once (as code-now.ts does for codes) and says
 * what really happened per channel. Call it after the transaction that queued the invite was saved. */
export async function confirmInviteSent(ctx: SchoolContext, sent: InviteSent | null | undefined): Promise<InviteSent | null> {
  if (!sent?.messageId || !sent.sentBy.length) return sent ?? null;
  const messageId = sent.messageId;
  const job: SchoolContext = { schoolId: ctx.schoolId, userId: null };
  try {
    // Safe to run twice: the queued background job finds it already handed over.
    await withSchool(job, (tx) => deliverMessage(tx, job, { messageId, round: "now", chunk: 0 }), { timeout: 20_000 });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "invite-deliver-now-failed", school: ctx.schoolId, message: messageId, error: e instanceof Error ? e.message : String(e) }));
  }
  const rows = await withSchool(job, (tx) => tx.messageRecipient.findMany({ where: { messageId }, select: { channel: true, status: true, failReason: true } }));
  const sentBy: string[] = [];
  const pending: string[] = [];
  const failed: string[] = [];
  for (const channel of [...new Set(rows.map((r) => r.channel))]) {
    const mine = rows.filter((r) => r.channel === channel);
    const word = WORD_OF[channel] ?? channel;
    if (mine.some((r) => TAKEN.has(r.status))) sentBy.push(word);
    else if (mine.every((r) => r.status === "FAILED")) failed.push(`${word} did not take it (${(mine.find((r) => r.failReason)?.failReason ?? "the provider refused it").replace(/\.$/, "")})`);
    else pending.push(word);
  }
  const notes = [...(failed.length ? [`${failed.join("; ")}.${sentBy.length || pending.length ? "" : " Copy the link and send it yourself."}`] : []), ...(sent.note ? [sent.note] : [])];
  return { sentBy, pending, note: notes.join(" ") || null, messageId };
}

async function smsTemplateReady(tx: Tx, ctx: SchoolContext, templateId: string) {
  return (await tx.templateVersion.count({ where: { schoolId: ctx.schoolId, templateId, isCurrent: true, dltTemplateId: { not: null } } })) > 0;
}

export async function sendInviteMessage(tx: Tx, ctx: SchoolContext, login: { id: string; displayName: string; phone: string | null; email: string | null }, nonce: string): Promise<InviteSent> {
  if (!login.phone && !login.email) return { sentBy: [], note: "They have no phone or email on their login, so copy the link and give it to them.", messageId: null };
  await ensureReadyTemplates(tx, ctx);
  const setups = await channelSetups(tx, ctx);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
  const channels: Channel[] = [];
  const templates: Partial<Record<Channel, string>> = {};
  const notes: string[] = [];

  if (login.phone) {
    const wa = setups.whatsapp.isOn ? await templateByKey(tx, ctx, INVITE_TEMPLATE, "whatsapp") : null;
    const sms = !wa && setups.sms.isOn ? await templateByKey(tx, ctx, INVITE_TEMPLATE, "sms") : null;
    if (wa) { channels.push("whatsapp"); templates.whatsapp = wa.id; }
    else if (sms && school.smsDltEntityId && school.smsSenderHeader && (await smsTemplateReady(tx, ctx, sms.id))) { channels.push("sms"); templates.sms = sms.id; }
    else if (setups.sms.isOn && !setups.whatsapp.isOn) notes.push("SMS was not sent: the \"Staff invite (SMS)\" template needs its DLT template ID (Communication, Message Templates).");
  }
  if (login.email && setups.email.isOn) {
    const em = await templateByKey(tx, ctx, INVITE_TEMPLATE, "email");
    if (em) { channels.push("email"); templates.email = em.id; }
  }
  if (!channels.length) {
    return { sentBy: [], note: notes[0] ?? "WhatsApp, SMS and email are not switched on for your school, so copy the link and send it to them yourself.", messageId: null };
  }

  const input = {
    to: { loginIds: [login.id] },
    channels,
    templates,
    perPerson: { [login.id]: { link: invitePlaceholderFor(login.id, nonce) } },
    // The invite is the person's own key to their login: it is not a general message they can opt out of.
    // Sent by School OS, not an emergency broadcast (QA LABEL-01).
    systemMessage: "staff-invite" as const,
    trigger: "Invite to School OS",
    source: { type: "User Login", id: login.id },
    audienceLabel: `Invite: ${login.displayName}`,
    idempotencyKey: `invite:${login.id}:${nonce}`,
    onNoCredits: "fail" as const,
  };
  const plan = await planMessage(tx, ctx, input);
  if (plan.problems.length || plan.rows.length === 0) {
    const why = plan.problems[0] ?? (plan.skipped[0] ? `${plan.skipped[0].reason}.` : "");
    return { sentBy: [], note: `It could not be sent by message. ${why} Copy the link and send it yourself.`.replace(/\s+/g, " "), messageId: null };
  }
  const result = await recordSend(tx, ctx, input, plan);
  const used = [...new Set(plan.rows.map((r) => r.channel))];
  if (plan.creditProblem) notes.push("Your message credits are low, so it may not arrive: copy the link as well.");
  return { sentBy: used.map((c) => WORD[c]), note: notes[0] ?? null, messageId: result.messageId };
}
