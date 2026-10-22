// Resend to unread, or to failed, by the same or another channel
// (11-communication.md, Message History; decided 9 October 2026). The resend
// is a new Message (resendOfId points back) with the usual preview of count
// and cost. Each person gets the values they had in the first message.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { PREFERRED_ORDER, type Channel } from "./channels";
import { planMessage, sendMessage, MessagingProblem, type SendInput } from "./send";
import type { AudienceRule, Scope } from "./recipients";

export type ResendWho = "unread" | "failed";

/**
 * Unread: people whose message went (sent, delivered or failed) and who have
 * not read it. Someone still Queued has not been sent it yet, so a resend
 * would give them a second copy (COMM-03). A copy made in test mode (the
 * sandbox provider) was only recorded and never reached anyone, so it is not
 * "unread" either: a resend is only for people a real channel sent it to (COMM-07).
 */
const UNREAD = ["SENT", "DELIVERED", "FAILED"] as const;
const TEST_MODE_PROVIDER = "sandbox";

/** Which first-message recipients a resend is for. Unread: everyone sent it who is not yet at Read. */
async function targets(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho) {
  const rows = await tx.messageRecipient.findMany({
    where: { schoolId: ctx.schoolId, messageId, isBackup: false, ...(who === "failed" ? { status: "FAILED" } : { status: { in: [...UNREAD] }, OR: [{ provider: null }, { provider: { not: TEST_MODE_PROVIDER } }] }) },
    select: { recipientType: true, guardianId: true, studentId: true, staffId: true, userLoginId: true, values: true, status: true },
  });
  // Someone who read it on any channel has read it.
  const readBy = new Set(
    (await tx.messageRecipient.findMany({ where: { schoolId: ctx.schoolId, messageId, status: "READ" }, select: { guardianId: true, studentId: true, staffId: true, userLoginId: true, recipientType: true } })).map((r) => (r.recipientType === "login" ? r.userLoginId : r.guardianId ?? r.staffId ?? r.studentId)),
  );
  // A custody restriction added since the first message: that child's message is not sent again to that guardian,
  // and a message naming several children names only the ones the guardian may still hear about.
  const guardianIds = [...new Set(rows.map((r) => r.guardianId).filter(Boolean) as string[])];
  const restricted = guardianIds.length
    ? await tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: guardianIds }, archivedAt: null, restriction: { not: null } }, select: { guardianId: true, studentId: true } })
    : [];
  const isRestricted = (g: string, s: string | null) => restricted.some((x) => x.guardianId === g && (s === null || x.studentId === s));
  const to: Required<Pick<AudienceRule, "guardianIds" | "studentIds" | "staffIds" | "loginIds">> = { guardianIds: [], studentIds: [], staffIds: [], loginIds: [] };
  const perPerson: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const id = r.recipientType === "guardian" ? r.guardianId : r.recipientType === "staff" ? r.staffId : r.recipientType === "login" ? r.userLoginId : r.studentId;
    if (!id || (who === "unread" && readBy.has(id))) continue;
    let values = (r.values ?? {}) as Record<string, string>;
    if (r.recipientType === "guardian" && r.studentId && isRestricted(id, r.studentId)) continue;
    if (r.recipientType === "guardian" && !r.studentId && isRestricted(id, null)) {
      // The children's names are worked out again from the children the guardian may hear about.
      values = Object.fromEntries(Object.entries(values).filter(([k]) => !["student_name", "class", "admission_no"].includes(k)));
    }
    const list = r.recipientType === "guardian" ? to.guardianIds : r.recipientType === "staff" ? to.staffIds : r.recipientType === "login" ? to.loginIds : to.studentIds;
    if (!list.includes(id)) list.push(id);
    perPerson[id] ??= values;
  }
  return { to, perPerson, count: to.guardianIds.length + to.studentIds.length + to.staffIds.length + to.loginIds.length };
}

/**
 * The send input for a resend; throws a MessagingProblem when there is nobody
 * or no template for the channel. "preferred": for each person the first of
 * WhatsApp, SMS, email and app that can carry it now (people who were not
 * sent it because no channel could carry it at the time).
 */
export async function resendInput(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho, channel: Channel | "preferred", scope: Scope): Promise<SendInput> {
  const m = await tx.message.findFirst({ where: { id: messageId, schoolId: ctx.schoolId } });
  if (!m) throw new MessagingProblem("This message was not found.");
  if (m.status === "SCHEDULED" || m.status === "CANCELLED") throw new MessagingProblem("This message has not been sent, so there is nothing to resend.");
  if (who === "unread" && m.status !== "SENT") throw new MessagingProblem("This message is still going out. Resend to unread once everyone has been sent it.");
  const t = await targets(tx, ctx, messageId, who);
  if (!t.count) {
    if (who === "failed") throw new MessagingProblem("Nobody failed. There is nothing to resend.");
    const testOnly = await tx.messageRecipient.count({ where: { schoolId: ctx.schoolId, messageId, isBackup: false, provider: TEST_MODE_PROVIDER, status: { in: ["SENT", "DELIVERED"] } } });
    throw new MessagingProblem(testOnly
      ? "The people who have not read it were sent it in test mode, so nobody received it and there is nothing to resend. Send a new message once the channel is live."
      : "Everyone has read this message. There is nothing to resend.");
  }
  const templates: Partial<Record<Channel, string>> = {};
  if (m.templateId) {
    const first = await tx.template.findUnique({ where: { id: m.templateId } });
    for (const ch of channel === "preferred" ? PREFERRED_ORDER : [channel]) {
      const same = first?.key ? await tx.template.findFirst({ where: { schoolId: ctx.schoolId, key: first.key, channel: ch, archivedAt: null } }) : first?.channel === ch ? first : null;
      if (same) templates[ch] = same.id;
    }
    if (channel !== "preferred" && !templates[channel] && channel !== "app" && channel !== "email") throw new MessagingProblem(`There is no ${channel === "sms" ? "SMS" : "WhatsApp"} template for "${first?.name ?? m.title ?? "this message"}". Add one in Message Templates, or choose another channel.`);
  }
  const typed = !m.templateId || (channel !== "preferred" && !templates[channel]);
  return {
    to: t.to,
    channels: channel === "preferred" ? "preferred" : [channel],
    templates,
    text: typed ? m.body : null,
    title: m.title,
    perPerson: t.perPerson,
    messageType: (m.messageType as SendInput["messageType"]) ?? "general",
    emergency: m.isEmergency,
    scope,
    trigger: `${who === "failed" ? "Resend to failed" : "Resend to unread"} of an earlier message`,
    source: m.sourceType && m.sourceId ? { type: m.sourceType, id: m.sourceId } : null,
    audienceLabel: `${who === "failed" ? "Failed" : "Not yet read"} from "${m.title ?? m.audienceLabel}"`,
    resendOfId: m.id,
  };
}

/** How many people "Resend to unread" would reach: none until the message has finished going (COMM-03). */
export async function unreadCount(tx: Tx, ctx: SchoolContext, messageId: string) {
  const m = await tx.message.findFirst({ where: { id: messageId, schoolId: ctx.schoolId }, select: { status: true } });
  if (m?.status !== "SENT") return 0;
  return (await targets(tx, ctx, messageId, "unread")).count;
}

export async function planResend(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho, channel: Channel | "preferred", scope: Scope) {
  return planMessage(tx, ctx, await resendInput(tx, ctx, messageId, who, channel, scope));
}

export async function resend(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho, channel: Channel | "preferred", scope: Scope) {
  return sendMessage(tx, ctx, await resendInput(tx, ctx, messageId, who, channel, scope));
}
