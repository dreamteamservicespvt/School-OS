// "Messages from the school" on the guardian's Parent Link (live tests 16 Nov: the owner got
// nothing on the Parent Link; then a "New notice" sent by WhatsApp said "read the full notice on
// your Parent Link" and it was not there). It lists every message the school sent this guardian,
// on any channel: one entry per message (per child, when each child got their own words),
// preferring the app row, with the channels it went by ("By WhatsApp"). An app notice to a
// guardian is a Message Recipient row with channel "app" and the guardian as its address
// (src/lib/messaging/send.ts); the delivery job marks it Delivered at once, as for staff.
//
// Left out: one-time codes and the software's own link messages (a Parent Link, a pickup tap),
// SMS backups, and rows not sent (scheduled, cancelled, failed). Link codes in the words are
// removed. Rules (rule 31): only on a phone confirmed for this link (or in the staff preview,
// which changes nothing); only this guardian's own rows (the guardian from the link, the school
// by row-level security); never a row about a child the guardian may not see now (custody or
// access restriction, a child no longer studying): view.children is that list. Showing an app
// row marks it Read, which gives Message History honest read counts for the app channel; a
// WhatsApp, SMS or email row is never changed (its status comes from the provider).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { GuardianView } from "./sections";
import { ONE_TIME_CODE } from "../messaging/one-time-code";
import { SYSTEM_MESSAGES } from "../messaging/system-message";

/** The section's key, and its switch in Message Settings, Parent Link. */
export const MESSAGES_SECTION = "messages";
/** Shown at first; "Show older" adds as many again. */
export const MESSAGES_PAGE = 20;
const MESSAGES_MAX = 200;

/** by: the channels besides the app it reached the guardian on ("whatsapp", "sms", "email"). */
export type ParentMessage = { id: string; title: string | null; text: string; at: Date; from: string | null; isNew: boolean; by: string[] };
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

/** Messages that are not news for the guardian: codes, and a person's own link (./links.ts, ../front-office/pickup-tap.ts). */
const NOT_SHOWN_TYPES = [ONE_TIME_CODE, ...Object.keys(SYSTEM_MESSAGES)];
/** Which row of a message to show when it went on several channels. */
const CHANNEL_ORDER = ["app", "whatsapp", "email", "sms"];

/** The words as the guardian reads them here: no link codes, no WhatsApp *bold* marks, no empty lines left behind. */
export function parentText(text: string): string {
  return text.replace(LINK_CODE, "").replace(/\*([^*\n]+)\*/g, "$1").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The guardian's messages, newest first, marking the app rows shown as Read. Null: nothing to show. */
export async function messagesForGuardian(tx: Tx, ctx: SchoolContext, view: GuardianView, now = new Date()): Promise<ParentMessages | null> {
  if (!view.preview && !(await confirmedPhone(tx, ctx, view, now))) return null;
  const take = messagesToShow(view.more);
  const childIds = new Set(view.children.map((c) => c.id));
  // campus: one guardian's own messages, about their own children only (view.children, below).
  const all = await tx.messageRecipient.findMany({
    where: { schoolId: ctx.schoolId, guardianId: view.guardianId, recipientType: "guardian", isBackup: false, status: { in: ["SENT", "DELIVERED", "READ"] }, message: { messageType: { notIn: NOT_SHOWN_TYPES } },
      // Test mode only records a WhatsApp, SMS or email message (nothing went), so it is not shown as "By WhatsApp".
      OR: [{ channel: "app" }, { provider: null }, { provider: { not: "sandbox" } }] },
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { queuedAt: "desc" }],
    select: { id: true, messageId: true, channel: true, studentId: true, studentIds: true },
  });
  // A row that names no child (sent before rows kept their children, 16 Nov) may be about one the guardian may not
  // see now: it shows only while every child linked to this guardian is on this page.
  const linked = await tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, guardianId: view.guardianId, archivedAt: null }, select: { studentId: true } });
  const everyChildShown = linked.every((l) => childIds.has(l.studentId));
  // A row about several children (brothers and sisters in one message) shows only while every one of them is
  // on this page: never after a custody or access restriction on one, or once one has left (security review L1).
  const allowed = all.filter((r) => (!r.studentId || childIds.has(r.studentId)) && r.studentIds.every((id) => childIds.has(id)) && Boolean(r.studentId || r.studentIds.length || everyChildShown));
  // One entry per message: its app row when there is one, else WhatsApp, email, SMS.
  const groups = new Map<string, typeof allowed>();
  for (const r of allowed) groups.set(r.messageId, [...(groups.get(r.messageId) ?? []), r]);
  const entries: { pick: (typeof allowed)[number]; by: string[] }[] = [];
  for (const rows of groups.values()) {
    const channel = [...new Set(rows.map((r) => r.channel))].sort((a, b) => CHANNEL_ORDER.indexOf(a) - CHANNEL_ORDER.indexOf(b))[0];
    const by = CHANNEL_ORDER.filter((c) => c !== "app" && rows.some((r) => r.channel === c));
    // Each child's own row on that channel (a fee reminder per child, with its own words) is its own entry.
    for (const pick of rows.filter((r) => r.channel === channel)) entries.push({ pick, by });
  }
  const page = entries.slice(0, take + 1);
  const found = page.length
    ? await tx.messageRecipient.findMany({
        where: { schoolId: ctx.schoolId, guardianId: view.guardianId, id: { in: page.map((e) => e.pick.id) } },
        select: { id: true, channel: true, text: true, language: true, sentAt: true, queuedAt: true, readAt: true, message: { select: { title: true, sentById: true, translations: true, templateId: true } } },
      })
    : [];
  const byId = new Map(found.map((r) => [r.id, r]));
  const rows = page.flatMap((e) => { const r = byId.get(e.pick.id); return r ? [{ ...r, by: e.by }] : []; });
  if (!rows.length) return null;
  const shown = rows.slice(0, take);

  // Who sent it, by their role in this school ("Class Teacher"); the software's own messages are "the school".
  const senderIds = [...new Set(shown.map((r) => r.message.sentById).filter((x): x is string => Boolean(x)))];
  const access = senderIds.length
    ? await tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, userLoginId: { in: senderIds } }, select: { userLoginId: true, roles: { select: { role: { select: { name: true } } } } } })
    : [];
  const roleOf = new Map(access.map((a) => [a.userLoginId, a.roles.map((r) => r.role.name).sort()[0] ?? null] as const));
  // A template message with no title is named by its template ("Results published").
  const templateIds = [...new Set(shown.filter((r) => !r.message.title && r.message.templateId).map((r) => r.message.templateId!))];
  const templateName = new Map(templateIds.length ? (await tx.template.findMany({ where: { schoolId: ctx.schoolId, id: { in: templateIds } }, select: { id: true, name: true } })).map((t) => [t.id, t.name.replace(/ \((SMS|email)\)$/i, "")] as const) : []);

  const out = shown.map((r): ParentMessage => {
    // A translated message keeps its translated title (G40).
    const versions = Array.isArray(r.message.translations) ? (r.message.translations as { language?: string; title?: string | null }[]) : [];
    const title = (r.language !== "en" ? versions.find((v) => v?.language === r.language)?.title : null) ?? r.message.title ?? (r.message.templateId ? templateName.get(r.message.templateId) : null);
    return {
      id: r.id,
      title: title?.trim() || null,
      // Link codes are for WhatsApp and SMS; on the Parent Link itself they say nothing.
      text: parentText(r.text),
      at: r.sentAt ?? r.queuedAt,
      from: r.message.sentById ? roleOf.get(r.message.sentById) ?? null : null,
      // Only an app row is read here; WhatsApp, SMS and email report their own.
      isNew: r.channel === "app" && !r.readAt,
      by: r.by,
    };
  });

  // Seen on a confirmed phone: the app rows become Read, with the time (a staff preview marks nothing).
  // A WhatsApp, SMS or email row is never marked here: its delivery report is the provider's.
  const fresh = shown.filter((r) => r.channel === "app" && !r.readAt).map((r) => r.id);
  if (!view.preview && fresh.length) {
    await tx.messageRecipient.updateMany({ where: { schoolId: ctx.schoolId, id: { in: fresh }, guardianId: view.guardianId, channel: "app", readAt: null }, data: { status: "READ", readAt: now } });
  }
  return { rows: out, more: entries.length > take && take < MESSAGES_MAX, shown: take };
}
