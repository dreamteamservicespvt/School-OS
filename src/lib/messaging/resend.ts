// Resend to unread, or to failed, by the same or another channel
// (11-communication.md, Message History; decided 9 October 2026). The resend
// is a new Message (resendOfId points back) with the usual preview of count
// and cost. Each person gets the values they had in the first message.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Channel } from "./channels";
import { planMessage, sendMessage, MessagingProblem, type SendInput } from "./send";
import type { AudienceRule, Scope } from "./recipients";

export type ResendWho = "unread" | "failed";

/** Which first-message recipients a resend is for. Unread: everyone not yet at Read. */
async function targets(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho) {
  const rows = await tx.messageRecipient.findMany({
    where: { schoolId: ctx.schoolId, messageId, isBackup: false, ...(who === "failed" ? { status: "FAILED" } : { status: { not: "READ" } }) },
    select: { recipientType: true, guardianId: true, studentId: true, staffId: true, userLoginId: true, values: true, status: true },
  });
  // Someone who read it on any channel has read it.
  const readBy = new Set(
    (await tx.messageRecipient.findMany({ where: { schoolId: ctx.schoolId, messageId, status: "READ" }, select: { guardianId: true, studentId: true, staffId: true, userLoginId: true, recipientType: true } })).map((r) => (r.recipientType === "login" ? r.userLoginId : r.guardianId ?? r.staffId ?? r.studentId)),
  );
  const to: Required<Pick<AudienceRule, "guardianIds" | "studentIds" | "staffIds" | "loginIds">> = { guardianIds: [], studentIds: [], staffIds: [], loginIds: [] };
  const perPerson: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const id = r.recipientType === "guardian" ? r.guardianId : r.recipientType === "staff" ? r.staffId : r.recipientType === "login" ? r.userLoginId : r.studentId;
    if (!id || (who === "unread" && readBy.has(id))) continue;
    const list = r.recipientType === "guardian" ? to.guardianIds : r.recipientType === "staff" ? to.staffIds : r.recipientType === "login" ? to.loginIds : to.studentIds;
    if (!list.includes(id)) list.push(id);
    perPerson[id] ??= (r.values ?? {}) as Record<string, string>;
  }
  return { to, perPerson, count: to.guardianIds.length + to.studentIds.length + to.staffIds.length + to.loginIds.length };
}

/** The send input for a resend; throws a MessagingProblem when there is nobody or no template for the channel. */
export async function resendInput(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho, channel: Channel, scope: Scope): Promise<SendInput> {
  const m = await tx.message.findFirst({ where: { id: messageId, schoolId: ctx.schoolId } });
  if (!m) throw new MessagingProblem("This message was not found.");
  if (m.status === "SCHEDULED" || m.status === "CANCELLED") throw new MessagingProblem("This message has not been sent, so there is nothing to resend.");
  const t = await targets(tx, ctx, messageId, who);
  if (!t.count) throw new MessagingProblem(who === "failed" ? "Nobody failed. There is nothing to resend." : "Everyone has read this message. There is nothing to resend.");
  let templateId: string | null = null;
  if (m.templateId) {
    const first = await tx.template.findUnique({ where: { id: m.templateId } });
    const same = first?.key ? await tx.template.findFirst({ where: { schoolId: ctx.schoolId, key: first.key, channel, archivedAt: null } }) : first?.channel === channel ? first : null;
    templateId = same?.id ?? null;
    if (!templateId && channel !== "app" && channel !== "email") throw new MessagingProblem(`There is no ${channel === "sms" ? "SMS" : "WhatsApp"} template for "${first?.name ?? m.title ?? "this message"}". Add one in Message Templates, or choose another channel.`);
  }
  return {
    to: t.to,
    channels: [channel],
    templates: templateId ? { [channel]: templateId } : undefined,
    text: templateId ? null : m.body,
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

export async function planResend(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho, channel: Channel, scope: Scope) {
  return planMessage(tx, ctx, await resendInput(tx, ctx, messageId, who, channel, scope));
}

export async function resend(tx: Tx, ctx: SchoolContext, messageId: string, who: ResendWho, channel: Channel, scope: Scope) {
  return sendMessage(tx, ctx, await resendInput(tx, ctx, messageId, who, channel, scope));
}
