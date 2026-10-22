// WhatsApp Inbox (11-communication.md, WhatsApp Inbox; an optional page switched on per school):
// every chat on the school's WhatsApp Business number, matched to a parent or staff member when
// the number is known. People with school-wide reach see all chats and pass them around; everyone
// else sees only the chats given to them, and can reply and mark them resolved.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { channelSecrets, channelSetups } from "../messaging/channels";
import { providerFor } from "../messaging/providers";
import { logQuery, QueryProblem } from "./queries";
import type { QueryType } from "../messaging/settings";

export class InboxProblem extends Error {}

/** WhatsApp lets a business send free text only within 24 hours of the person's last message. */
export const REPLY_WINDOW_MS = 24 * 3600_000;
export const MAX_REPLY = 1000;

export const QUICK_REPLIES = [
  "Noted, thank you.",
  "Fee details and the Pay button are on your Parent Link.",
  "The class teacher will call you today.",
];

export type InboxTab = "mine" | "all" | "none";

/** Which chats a person may see on a tab. Without school-wide reach only "mine" exists. */
export function inboxWhere(ctx: SchoolContext, full: boolean, tab: InboxTab, q: string): Prisma.WhatsappChatWhereInput {
  const and: Prisma.WhatsappChatWhereInput[] = [{ schoolId: ctx.schoolId, archivedAt: null }];
  if (!full || tab === "mine") and.push({ assignedToId: ctx.userId ?? "00000000-0000-0000-0000-000000000000" });
  else if (tab === "none") and.push({ assignedToId: null });
  const s = q.trim();
  if (s) and.push({ OR: [{ displayName: { contains: s, mode: "insensitive" } }, { phone: { contains: s.replace(/\D/g, "") || s } }] });
  return { AND: and };
}

export const canReplyFreely = (chat: { lastInboundAt: Date | null }, now = new Date()) => Boolean(chat.lastInboundAt && now.getTime() - chat.lastInboundAt.getTime() < REPLY_WINDOW_MS);

/** Loads one chat the person may see, or refuses. */
export async function chatFor(tx: Tx, ctx: SchoolContext, full: boolean, id: string) {
  const chat = await tx.whatsappChat.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null } });
  if (!chat || (!full && chat.assignedToId !== ctx.userId)) throw new InboxProblem("This chat was not found, or it is not given to you.");
  return chat;
}

const tenDigits = (raw: string) => raw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");

/** Who a number belongs to: a parent first, then a staff member. */
async function matchContact(tx: Tx, ctx: SchoolContext, phone: string) {
  const g = await tx.guardian.findFirst({ where: { schoolId: ctx.schoolId, phone, archivedAt: null }, select: { id: true, name: true } });
  if (g) return { contactType: "guardian", contactId: g.id, name: g.name };
  const s = await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, phone, archivedAt: null }, select: { id: true, fullName: true } });
  if (s) return { contactType: "staff", contactId: s.id, name: s.fullName };
  return null;
}

/** A message that came in on the school's WhatsApp number (from the provider's webhook). */
export async function recordIncoming(tx: Tx, ctx: SchoolContext, m: { from: string; name?: string | null; text: string; providerMessageId?: string | null; at?: Date }) {
  const phone = tenDigits(m.from);
  if (!phone || !m.text.trim()) return null;
  if (m.providerMessageId) {
    const seen = await tx.whatsappChatMessage.findFirst({ where: { schoolId: ctx.schoolId, providerMessageId: m.providerMessageId }, select: { id: true } });
    if (seen) return null; // providers retry webhooks; never record the same message twice
  }
  const at = m.at ?? new Date();
  let chat = await tx.whatsappChat.findUnique({ where: { schoolId_phone: { schoolId: ctx.schoolId, phone } } });
  if (!chat) {
    const who = await matchContact(tx, ctx, phone);
    chat = await tx.whatsappChat.create({
      data: { schoolId: ctx.schoolId, phone, contactType: who?.contactType ?? "unknown", contactId: who?.contactId ?? null, displayName: who?.name ?? (m.name?.trim() || `+91 ${phone}`), lastMessageAt: at, lastInboundAt: at },
    });
  }
  await tx.whatsappChatMessage.create({ data: { schoolId: ctx.schoolId, chatId: chat.id, direction: "in", body: m.text.slice(0, 4000), providerMessageId: m.providerMessageId ?? null, createdAt: at } });
  await tx.whatsappChat.update({ where: { id: chat.id }, data: { lastMessageAt: at, lastInboundAt: at, unreadCount: { increment: 1 }, resolvedAt: null } });
  if (chat.assignedToId) await notify(tx, ctx, { to: chat.assignedToId, type: "whatsapp", text: `WhatsApp from ${chat.displayName}: ${m.text.slice(0, 100)}`, link: `/communication/inbox?chat=${chat.id}` });
  return chat.id;
}

/** Delivery and read receipts for replies sent from the inbox. */
export async function applyChatStatus(tx: Tx, ctx: SchoolContext, providerMessageId: string, status: string, reason: string | null) {
  await tx.whatsappChatMessage.updateMany({ where: { schoolId: ctx.schoolId, providerMessageId, direction: "out" }, data: { status, failReason: reason } });
}

export async function markRead(tx: Tx, ctx: SchoolContext, chatId: string) {
  await tx.whatsappChat.updateMany({ where: { id: chatId, schoolId: ctx.schoolId, unreadCount: { gt: 0 } }, data: { unreadCount: 0 } });
}

/** Reply with text, within WhatsApp's 24-hour window. */
export async function replyToChat(tx: Tx, ctx: SchoolContext, full: boolean, chatId: string, text: string, now = new Date()) {
  const body = text.trim();
  if (body.length < 1) throw new InboxProblem("Write the reply.");
  if (body.length > MAX_REPLY) throw new InboxProblem(`A reply can be at most ${MAX_REPLY} characters.`);
  const chat = await chatFor(tx, ctx, full, chatId);
  if (!canReplyFreely(chat, now)) throw new InboxProblem("The 24-hour reply window has closed. WhatsApp allows only an approved template now: send one from Send Message.");
  const setups = await channelSetups(tx, ctx);
  if (!setups.whatsapp.isOn) throw new InboxProblem("WhatsApp is switched off in Settings, so replies cannot be sent.");
  const provider = providerFor(setups.whatsapp, await channelSecrets(tx, ctx, "whatsapp"));
  let r;
  try {
    r = await provider.send({ channel: "whatsapp", to: chat.phone, text: body });
  } catch {
    r = { ok: false as const, reason: "WhatsApp did not answer. Try again in a minute.", retryable: true };
  }
  const msg = await tx.whatsappChatMessage.create({
    data: { schoolId: ctx.schoolId, chatId: chat.id, direction: "out", body, sentById: ctx.userId, providerMessageId: r.ok ? r.providerMessageId : null, status: r.ok ? r.status : "FAILED", failReason: r.ok ? null : r.reason, createdAt: now },
  });
  await tx.whatsappChat.update({ where: { id: chat.id }, data: { lastMessageAt: now, unreadCount: 0, assignedToId: chat.assignedToId ?? ctx.userId } });
  await writeAudit(tx, ctx, { action: "replied", recordType: "WhatsApp Conversation", recordId: chat.id, after: { message: msg.id, sent: r.ok } });
  if (!r.ok) throw new InboxProblem(`Not sent: ${r.reason}`);
  return msg;
}

/** Give a chat to a staff member with a login (school-wide reach only). */
export async function assignChat(tx: Tx, ctx: SchoolContext, chatId: string, userLoginId: string) {
  const chat = await chatFor(tx, ctx, true, chatId);
  const access = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, userLoginId, archivedAt: null }, select: { userLoginId: true } });
  const person = access ? await tx.userLogin.findUnique({ where: { id: access.userLoginId }, select: { displayName: true } }) : null;
  if (!person) throw new InboxProblem("Choose a staff member who can sign in to School OS.");
  if (chat.assignedToId === userLoginId) throw new InboxProblem(`This chat is already with ${person.displayName}.`);
  await tx.whatsappChat.update({ where: { id: chat.id }, data: { assignedToId: userLoginId } });
  await writeAudit(tx, ctx, { action: "assigned", recordType: "WhatsApp Conversation", recordId: chat.id, before: { to: chat.assignedToId }, after: { to: userLoginId } });
  if (userLoginId !== ctx.userId) await notify(tx, ctx, { to: userLoginId, type: "whatsapp", text: `A WhatsApp chat with ${chat.displayName} was given to you.`, link: `/communication/inbox?chat=${chat.id}` });
  return person.displayName;
}

export async function setResolved(tx: Tx, ctx: SchoolContext, full: boolean, chatId: string, resolved: boolean) {
  const chat = await chatFor(tx, ctx, full, chatId);
  if (Boolean(chat.resolvedAt) === resolved) throw new InboxProblem(resolved ? "This chat is already resolved." : "This chat is already open.");
  await tx.whatsappChat.update({ where: { id: chat.id }, data: { resolvedAt: resolved ? new Date() : null, unreadCount: 0 } });
  await writeAudit(tx, ctx, { action: resolved ? "resolved" : "reopened", recordType: "WhatsApp Conversation", recordId: chat.id });
}

/** Turn a chat into a query (Feedback & Queries), with the person's last messages as the details. */
export async function chatToQuery(tx: Tx, ctx: SchoolContext, chatId: string, type: QueryType = "query") {
  const chat = await chatFor(tx, ctx, true, chatId);
  if (chat.queryId) {
    const q = await tx.query.findFirst({ where: { id: chat.queryId, schoolId: ctx.schoolId }, select: { id: true, number: true } });
    if (q) throw new InboxProblem(`This chat is already query ${q.number}.`);
  }
  const last = await tx.whatsappChatMessage.findMany({ where: { schoolId: ctx.schoolId, chatId: chat.id, direction: "in" }, orderBy: { createdAt: "desc" }, take: 5 });
  const details = last.reverse().map((m) => m.body).join("\n").slice(0, 2000) || "From a WhatsApp chat.";
  const ownerId = chat.assignedToId ?? ctx.userId;
  try {
    const { query: q } = await logQuery(tx, ctx, {
      fromType: chat.contactType === "guardian" || chat.contactType === "staff" ? chat.contactType : "other",
      fromId: chat.contactType === "guardian" || chat.contactType === "staff" ? chat.contactId : null,
      fromName: chat.displayName, fromPhone: chat.phone, aboutStudentId: null, type, topicId: null,
      details, priority: "normal", ownerId, departmentId: null, cameBy: "whatsapp",
    } as Parameters<typeof logQuery>[2]);
    await tx.whatsappChat.update({ where: { id: chat.id }, data: { queryId: q.id } });
    await writeAudit(tx, ctx, { action: "made-query", recordType: "WhatsApp Conversation", recordId: chat.id, after: { query: q.number } });
    return q;
  } catch (e) {
    if (e instanceof QueryProblem) throw new InboxProblem(e.message);
    throw e;
  }
}

/**
 * For a person limited to one campus: the chats about their campus (with a
 * parent of one of its students, or one of its staff), chats with numbers not
 * on record, and chats given to them. {} for the whole school.
 */
export async function inboxCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string | null | undefined): Promise<Prisma.WhatsappChatWhereInput> {
  if (!campusId) return {};
  const [links, staff] = await Promise.all([
    tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, student: { campusId, archivedAt: null } }, select: { guardianId: true } }),
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId }, select: { id: true } }),
  ]);
  return {
    OR: [
      ...(ctx.userId ? [{ assignedToId: ctx.userId }] : []),
      { contactType: "unknown" },
      { contactType: "guardian", contactId: { in: [...new Set(links.map((l) => l.guardianId))] } },
      { contactType: "staff", contactId: { in: staff.map((s) => s.id) } },
    ],
  };
}

/** Refuses a chat about another campus for a person limited to one campus (the same words as a chat not found). */
export async function assertChatOnCampus(tx: Tx, ctx: SchoolContext, chatId: string, campusId: string | null | undefined) {
  if (!campusId) return;
  const ok = await tx.whatsappChat.findFirst({ where: { AND: [{ id: chatId, schoolId: ctx.schoolId }, await inboxCampusWhere(tx, ctx, campusId)] }, select: { id: true } });
  if (!ok) throw new InboxProblem("This chat was not found, or it is not given to you.");
}
