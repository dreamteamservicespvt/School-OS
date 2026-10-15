// Gentle reminders from the people who look after the whole school (owner's
// prototype changes of 13 Oct 2026): instead of doing someone's work, the
// Principal, School Admin or Vice Principal taps Remind and the person who
// owes it gets a notification (in the app, and on WhatsApp, SMS or email if
// they chose it in My profile). Every reminder is written to the Audit Log,
// which is also how a screen knows a person was already reminded today.
import "server-only";

import type { SchoolContext, Tx } from "./db";
import { writeAudit } from "./audit";
import { notify } from "./notifications";

export type Reminder = {
  /** Audit action, such as "attendance-reminder". */
  action: string;
  recordType: string;
  recordId: string;
  /** The login of the person reminded. */
  to: string;
  text: string;
  /** The screen the reminder opens for them. */
  link: string;
  /** Extra facts for the audit line. */
  about?: Record<string, string | number | null>;
};

/** Sends one reminder and records it. Returns false when the person is the sender (nobody reminds themselves). */
export async function sendReminder(tx: Tx, ctx: SchoolContext, r: Reminder) {
  if (ctx.userId && ctx.userId === r.to) return false;
  await notify(tx, ctx, { to: r.to, type: "work-reminder", text: r.text, link: r.link, groupKey: `${r.action}:${r.recordId}` });
  await writeAudit(tx, ctx, { action: r.action, recordType: r.recordType, recordId: r.recordId, after: { to: r.to, text: r.text, ...(r.about ?? {}) } });
  return true;
}

/** When each record's latest reminder of this kind went out since a moment (for "Reminded at 10:44 AM"). */
export async function remindedSince(tx: Tx, ctx: SchoolContext, action: string, recordIds: string[], since: Date) {
  if (recordIds.length === 0) return new Map<string, Date>();
  const rows = await tx.auditLogEntry.findMany({
    where: { schoolId: ctx.schoolId, action, recordId: { in: recordIds }, at: { gte: since } },
    orderBy: { at: "asc" },
    select: { recordId: true, at: true },
  });
  return new Map(rows.map((r) => [r.recordId!, r.at]));
}
