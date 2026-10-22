// Automation A4 "Attendance marked" (05 §4 step 1): it runs after a class's
// register is saved, and also when a device or QR punch completes a day's
// record, when an approved correction changes a mark, and when approved leave
// turns saved days into Leave. Every path that writes student marks queues it
// here, so late messages, absence messages and the threshold and streak flags
// (raised and cleared) follow every mark, not only the register's.
// The job is safe to run twice: the 5-minute bucket and the Attendance Alert's
// one-per-student-day-kind rule stop a second message.
import "server-only";

import type { AttendanceSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { enqueue } from "../jobs";
import { isoDay } from "../staff/dates";

/** When absence messages go for a save made now, or null when they are off. */
export function absenceSendTime(settings: Pick<AttendanceSetting, "absenceAlertOn" | "absenceDelayMinutes">, now: Date) {
  if (!settings.absenceAlertOn) return null;
  return new Date(now.getTime() + settings.absenceDelayMinutes * 60000);
}

export type AfterSaveTarget = { sectionId: string; date: Date };

/**
 * Queues A4 for each section and day once (after the absence wait). With
 * `messages: false` the job only works the flags out again: an approved
 * correction for a day already past sends no "absent today" message days
 * later (the parent can be sent a correction message from Message History).
 */
export async function queueAfterSave(tx: Tx, ctx: SchoolContext, settings: Pick<AttendanceSetting, "absenceAlertOn" | "absenceDelayMinutes">, targets: AfterSaveTarget[], now: Date, opts: { messages?: boolean } = {}) {
  const sendAt = absenceSendTime(settings, now) ?? now;
  const bucket = Math.ceil(sendAt.getTime() / (5 * 60000));
  const seen = new Set<string>();
  for (const t of targets) {
    const key = `${t.sectionId}:${isoDay(t.date)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const quiet = opts.messages === false;
    await enqueue(tx, ctx, "attendance-after-save", `attendance:${key}:${bucket}${quiet ? ":flags" : ""}`, { sectionId: t.sectionId, date: isoDay(t.date), ...(quiet ? { messages: false } : {}) }, quiet ? now : sendAt);
  }
  return { sendAt, queued: seen.size };
}
