// Notifications without spam (00-global.md §4).

import { Prisma, type Notification } from "@prisma/client";
import type { SchoolContext, Tx } from "./db";
import type { MessageKey } from "./i18n/t";
import { englishNote, storedValues, type NoteValues } from "./notification-words";

/**
 * A notification still to read: not opened, and its work not already done
 * (rule 5: a decided approval, a closed task). Done ones count as read in the
 * bell, the list and "New only" (gap G48).
 */
export const UNREAD = { readAt: null, doneAt: null } satisfies Prisma.NotificationWhereInput;
const READ: Prisma.NotificationWhereInput = { OR: [{ readAt: { not: null } }, { doneAt: { not: null } }] };
export const isUnread = (n: { readAt: Date | null; doneAt: Date | null }) => !n.readAt && !n.doneAt;

/** One page of a person's notifications: unread first, newest first (the bell list, §4). */
export async function notificationPage(tx: Tx, where: Prisma.NotificationWhereInput, skip: number, take: number): Promise<Notification[]> {
  const unreadWhere = { AND: [where, UNREAD] };
  const unread = await tx.notification.count({ where: unreadWhere });
  const first = skip < unread ? await tx.notification.findMany({ where: unreadWhere, orderBy: { createdAt: "desc" }, skip, take }) : [];
  const more = take - first.length;
  const rest = more > 0 ? await tx.notification.findMany({ where: { AND: [where, READ] }, orderBy: { createdAt: "desc" }, skip: Math.max(0, skip - unread), take: more }) : [];
  return [...first, ...rest];
}

/** Repeated events of the same kind within this window become one line with a count (inferred: 30 minutes). */
export const MERGE_WINDOW_MS = 30 * 60 * 1000;

export type NotifyInput = {
  to: string;
  type: string;
  /**
   * The words, said in each reader's language (owner decision 14): an English catalogue
   * sentence with {blanks}, e.g. "Query {number} is now yours.", and the values for them
   * (src/lib/notification-words.ts). The English text is filled from them and kept too.
   */
  key?: MessageKey;
  values?: NoteValues;
  /** English words with no catalogue sentence: a person's own message, words from elsewhere. */
  text?: string;
  /** The one screen this notification opens. */
  link: string;
  /** Same group key = same kind of event; merged within the window. */
  groupKey?: string;
  /** The words when several are merged: a catalogue sentence with {n} for the count, e.g. "{n} new fee payments". */
  mergedKey?: MessageKey;
  /** Values for mergedKey's other blanks (the notification's own values are there too). */
  mergedValues?: NoteValues;
  /** English text when several are merged, for words with no catalogue sentence. */
  mergedText?: (count: number) => string;
};

/** What a notification keeps: the English text, and the key and values it was made from (none for plain text). */
function wordsOf(key: MessageKey | undefined, values: NoteValues | undefined, text: string | undefined) {
  if (key) return { text: englishNote(key, values), textKey: key as string, textValues: storedValues(values) as Prisma.InputJsonValue };
  return { text: text ?? "", textKey: null, textValues: Prisma.DbNull };
}

export async function notify(tx: Tx, ctx: SchoolContext, input: NotifyInput, now = new Date()) {
  // Rule 4: people are not notified about things they did themselves.
  if (ctx.userId && ctx.userId === input.to) return null;

  if (input.groupKey) {
    const recent = await tx.notification.findFirst({
      where: {
        schoolId: ctx.schoolId,
        userLoginId: input.to,
        groupKey: input.groupKey,
        readAt: null,
        doneAt: null,
        createdAt: { gte: new Date(now.getTime() - MERGE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      const count = recent.count + 1;
      const merged = input.mergedKey
        ? wordsOf(input.mergedKey, { ...input.values, ...input.mergedValues, n: count }, undefined)
        : input.mergedText ? wordsOf(undefined, undefined, input.mergedText(count)) : wordsOf(input.key, input.values, input.text);
      return tx.notification.update({ where: { id: recent.id }, data: { count, ...merged } });
    }
  }

  const words = wordsOf(input.key, input.values, input.text);
  const created = await tx.notification.create({
    data: {
      schoolId: ctx.schoolId,
      userLoginId: input.to,
      type: input.type,
      ...words,
      link: input.link,
      groupKey: input.groupKey ?? null,
    },
  });
  // Rule 6: also by WhatsApp, SMS or email when the person chose it and the school allows it.
  // The copy keeps the English text: the school's message templates and SMS rules are set for it.
  const { sendNotificationCopies } = await import("./notification-channels");
  await sendNotificationCopies(tx, ctx, { id: created.id, userLoginId: input.to, type: input.type, text: words.text });
  // Rules 6 and 8: a push alert with the same link, when the person chose Push.
  const { queuePush } = await import("./push");
  await queuePush(tx, ctx, { id: created.id, userLoginId: input.to, type: input.type });
  return created;
}
