// The one place Attendance hands a parent message to Communication (A4,
// late-arrival, threshold and chronic absence alerts). Every message is
// first saved as an Attendance Alert (one per student, day and kind), so a
// parent never gets two messages for one absence even if this runs twice.
import "server-only";

import type { AttendanceAlert } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";

export type SendOutcome = { status: "waiting" | "sent" | "skipped"; note: string | null; messageRef?: string | null };

/**
 * Sends one attendance message to the student's primary guardian.
 *
 * messaging: replace the body with Communication's sendMessage(tx, ctx, {
 *   to: { guardianId: alert.guardianId }, template: `attendance-${alert.kind}`,
 *   text: alert.text, channels: alert.channels, smsBackup: true,
 *   idempotencyKey: `attendance-alert:${alert.id}` }) and return its status.
 * Until then the alert waits in the queue ("Waiting to send"), never a false "Sent".
 */
export async function sendAttendanceMessage(tx: Tx, ctx: SchoolContext, alert: AttendanceAlert): Promise<SendOutcome> {
  if (!alert.guardianId) return { status: "skipped", note: "No parent mobile number on file" };
  const guardian = await tx.guardian.findFirst({ where: { id: alert.guardianId, archivedAt: null }, select: { optedOut: true, phone: true } });
  if (!guardian) return { status: "skipped", note: "No parent on file" };
  if (guardian.optedOut) return { status: "skipped", note: "The parent has opted out of messages" };
  return { status: "waiting", note: "Waiting to send through Communication" };
}
