// "Messages from the school" on the guardian's Parent Link (live test 16 Nov: the owner got
// nothing on the Parent Link, as an app notice to parents was dropped). An app notice to a
// guardian is a Message Recipient row with channel "app" and the guardian as its address
// (src/lib/messaging/send.ts); the delivery job marks it Delivered at once, as for staff.
//
// Rules (rule 31): only on a phone confirmed for this link (or in the staff preview, which
// changes nothing); only this guardian's own rows (the guardian from the link, the school by
// row-level security); never a row about a child the guardian may not see now (custody or
// access restriction, a child no longer studying): view.children is that list. Showing a row
// marks it Read, which gives Message History honest read counts for the app channel.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { GuardianView } from "./sections";

/** The section's key, and its switch in Message Settings, Parent Link. */
export const MESSAGES_SECTION = "messages";
/** Shown at first; "Show older" adds as many again. */
export const MESSAGES_PAGE = 20;
const MESSAGES_MAX = 200;

export type ParentMessage = { id: string; title: string | null; text: string; at: Date; from: string | null; isNew: boolean };
export type ParentMessages = { rows: ParentMessage[]; more: boolean; shown: number };

const LINK_CODE = /⟦[^⟧]*⟧/g;

/** How many to show for the page's ?more= (0 first, then 1, 2 …). */
export function messagesToShow(more: number | null | undefined): number {
  const n = Number.isFinite(more) && (more ?? 0) > 0 ? Math.floor(more!) : 0;
  return Math.min(MESSAGES_PAGE * (n + 1), MESSAGES_MAX);
}

/** True when this view is on a phone confirmed for its own link, still in date and not removed. */
async function confirmedPhone(tx: Tx, ctx: SchoolContext, view: GuardianView, now: Date) {
  if (!view.deviceId) return false;
  const dev = await tx.parentLinkDevice.findFirst({ where: { schoolId: ctx.schoolId, id: view.deviceId, parentLinkId: view.linkId, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } });
  return Boolean(dev);
}

/** The guardian's app messages, newest first, marking those shown as Read. Null: nothing to show. */
export async function messagesForGuardian(tx: Tx, ctx: SchoolContext, view: GuardianView, now = new Date()): Promise<ParentMessages | null> {
  if (!view.preview && !(await confirmedPhone(tx, ctx, view, now))) return null;
  const take = messagesToShow(view.more);
  const childIds = view.children.map((c) => c.id);
  // campus: one guardian's own messages, about their own children only (view.children).
  const rows = await tx.messageRecipient.findMany({
    where: {
      schoolId: ctx.schoolId,
      guardianId: view.guardianId,
      recipientType: "guardian",
      channel: "app",
      isBackup: false,
      status: { in: ["SENT", "DELIVERED", "READ"] },
      OR: [{ studentId: null }, { studentId: { in: childIds } }],
    },
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { queuedAt: "desc" }],
    take: take + 1,
    select: { id: true, text: true, language: true, sentAt: true, queuedAt: true, readAt: true, message: { select: { title: true, sentById: true, translations: true } } },
  });
  if (!rows.length) return null;
  const shown = rows.slice(0, take);

  // Who sent it, by their role in this school ("Class Teacher"); the software's own messages are "the school".
  const senderIds = [...new Set(shown.map((r) => r.message.sentById).filter((x): x is string => Boolean(x)))];
  const access = senderIds.length
    ? await tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, userLoginId: { in: senderIds } }, select: { userLoginId: true, roles: { select: { role: { select: { name: true } } } } } })
    : [];
  const roleOf = new Map(access.map((a) => [a.userLoginId, a.roles.map((r) => r.role.name).sort()[0] ?? null] as const));

  const out = shown.map((r): ParentMessage => {
    // A translated message keeps its translated title (G40).
    const versions = Array.isArray(r.message.translations) ? (r.message.translations as { language?: string; title?: string | null }[]) : [];
    const title = (r.language !== "en" ? versions.find((v) => v?.language === r.language)?.title : null) ?? r.message.title;
    return {
      id: r.id,
      title: title?.trim() || null,
      // Link codes are for WhatsApp and SMS; on the Parent Link itself they say nothing.
      text: r.text.replace(LINK_CODE, "").replace(/[ \t]+\n/g, "\n").trim(),
      at: r.sentAt ?? r.queuedAt,
      from: r.message.sentById ? roleOf.get(r.message.sentById) ?? null : null,
      isNew: !r.readAt,
    };
  });

  // Seen on a confirmed phone: Read, with the time (a staff preview marks nothing).
  const fresh = shown.filter((r) => !r.readAt).map((r) => r.id);
  if (!view.preview && fresh.length) {
    await tx.messageRecipient.updateMany({ where: { schoolId: ctx.schoolId, id: { in: fresh }, guardianId: view.guardianId, readAt: null }, data: { status: "READ", readAt: now } });
  }
  return { rows: out, more: rows.length > take && take < MESSAGES_MAX, shown: take };
}
