// The one place Attendance hands a parent message to Communication (A4,
// late-arrival, threshold and chronic absence alerts). Every message is
// first saved as an Attendance Alert (one per student, day and kind), so a
// parent never gets two messages for one absence even if this runs twice;
// Communication also refuses the same event twice (automation log and
// idempotency key).
import "server-only";

import type { AttendanceAlert } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import { MessagingProblem, sendAutomatic, sendMessage } from "../messaging";

export type SendOutcome = { status: "waiting" | "sent" | "skipped"; note: string | null; messageRef?: string | null };

const NO_CHANNEL = "No message channel is ready. Connect WhatsApp or SMS in Settings, Messaging.";

/** Sends one attendance message to the student's parents through Communication. */
export async function sendAttendanceMessage(tx: Tx, ctx: SchoolContext, alert: AttendanceAlert): Promise<SendOutcome> {
  if (!alert.guardianId) return { status: "skipped", note: "No parent on file" };
  const guardian = await tx.guardian.findFirst({ where: { id: alert.guardianId, archivedAt: null }, select: { optedOut: true } });
  if (!guardian) return { status: "skipped", note: "No parent on file" };
  if (guardian.optedOut) return { status: "skipped", note: "The parent has opted out of messages" };
  const date = formatDate(alert.date, "UTC");
  try {
    if (alert.kind === "absence" || alert.kind === "late") {
      const r = await sendAutomatic(tx, ctx, {
        rule: alert.kind,
        event: { key: `attendance:${alert.kind}:${date}:${alert.studentId}`, label: `${alert.kind === "absence" ? "Absent" : "Late"} on ${date}` },
        to: { guardiansOf: [alert.studentId] },
        values: { date },
        perStudent: { [alert.studentId]: { date } },
        source: { type: "Attendance Alert", id: alert.id },
      });
      if (r.status === "sent") return { status: "sent", note: null, messageRef: r.result.messageId };
      if (r.status === "duplicate") return { status: "sent", note: "Already sent for this day" };
      if (r.status === "off") return { status: "skipped", note: `The "${alert.kind === "absence" ? "Absent today" : "Late arrival"}" message is switched off in Message Settings` };
      if (r.status === "nobody") return { status: "skipped", note: "No parent with a phone number" };
      return { status: "skipped", note: NO_CHANNEL };
    }
    // Threshold and chronic absence: a short text from Attendance.
    const r = await sendMessage(tx, ctx, {
      to: { guardiansOf: [alert.studentId] },
      channels: "preferred",
      text: alert.text,
      messageType: "attendance",
      trigger: alert.kind === "threshold" ? "Attendance below the school's %" : "Absent several days in a row",
      source: { type: "Attendance Alert", id: alert.id },
      idempotencyKey: `attendance-alert:${alert.id}`,
      onNoCredits: "fail",
    });
    return { status: "sent", note: null, messageRef: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) return { status: "skipped", note: e.message || NO_CHANNEL };
    throw e;
  }
}
