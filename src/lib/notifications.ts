// Notifications without spam (00-global.md §4).

import type { SchoolContext, Tx } from "./db";

/** Repeated events of the same kind within this window become one line with a count (inferred: 30 minutes). */
export const MERGE_WINDOW_MS = 30 * 60 * 1000;

export type NotifyInput = {
  to: string;
  type: string;
  text: string;
  /** The one screen this notification opens. */
  link: string;
  /** Same group key = same kind of event; merged within the window. */
  groupKey?: string;
  /** Text to show when several are merged, given the count, e.g. n => `${n} new fee payments`. */
  mergedText?: (count: number) => string;
};

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
      return tx.notification.update({
        where: { id: recent.id },
        data: { count, text: input.mergedText ? input.mergedText(count) : input.text },
      });
    }
  }

  const created = await tx.notification.create({
    data: {
      schoolId: ctx.schoolId,
      userLoginId: input.to,
      type: input.type,
      text: input.text,
      link: input.link,
      groupKey: input.groupKey ?? null,
    },
  });
  // Rule 6: also by WhatsApp, SMS or email when the person chose it and the school allows it.
  const { sendNotificationCopies } = await import("./notification-channels");
  await sendNotificationCopies(tx, ctx, { id: created.id, userLoginId: input.to, type: input.type, text: input.text });
  return created;
}
