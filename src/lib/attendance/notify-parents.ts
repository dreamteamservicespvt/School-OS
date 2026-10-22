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
import { ruleReady, ruleStates } from "../messaging/automatic";
import { CHANNEL_LABEL } from "../messaging/channels";
import { currentVersions, templateByKey, versionFor } from "../messaging/templates";
import { HELD_UNTIL_LIVE, movingIn } from "../move-in/live";

export type AbsenceMessageView = {
  /** "Absent today" is switched on in Communication, Message Settings. */
  on: boolean;
  /** A switched-on channel can carry it. */
  ready: boolean;
  /** "WhatsApp · SMS". */
  channels: string;
  /** The text parents get, filled in for one real student. */
  text: string | null;
};

/**
 * What parents really get for an absence: Communication's "Absent today"
 * automatic message (its template, channels and on/off), the one setting for
 * it. Attendance Settings shows this read-only, so its preview is the message
 * that goes, never a second copy (gap list G08).
 */
export async function absenceMessageView(tx: Tx, ctx: SchoolContext, sample: { student: string; className: string; date: Date }): Promise<AbsenceMessageView> {
  const [state, ready, school] = await Promise.all([
    ruleStates(tx, ctx).then((rows) => rows.find((r) => r.key === "absence")!),
    ruleReady(tx, ctx, "absence"),
    tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, phone: true, defaultLanguage: true } }),
  ]);
  const channel = ready.channels[0] ?? state.channels[0] ?? "whatsapp";
  const templateId = state.templateIds[channel] ?? (await templateByKey(tx, ctx, "absence", channel))?.id ?? null;
  const version = templateId ? versionFor(await currentVersions(tx, ctx, templateId), school.defaultLanguage, school.defaultLanguage) : null;
  const values: Record<string, string> = {
    guardian_name: "Parent", student_name: sample.student, class: sample.className, date: formatDate(sample.date, "UTC"),
    school_name: school.name, school_phone: school.phone ?? "the school",
  };
  const text = version ? version.body.replace(/\{(\w+)\}/g, (all, k: string) => values[k] ?? all) : null;
  const shown = (ready.channels.length ? ready.channels : state.channels).map((c) => CHANNEL_LABEL[c] ?? c);
  return { on: state.isOn, ready: ready.ready, channels: shown.join(" · "), text };
}

export type SendOutcome = { status: "waiting" | "sent" | "skipped"; note: string | null; messageRef?: string | null };

const NO_CHANNEL = "No message channel is ready. Connect WhatsApp or SMS in Settings, Messaging.";

/** Sends one attendance message to the student's parents through Communication. */
export async function sendAttendanceMessage(tx: Tx, ctx: SchoolContext, alert: AttendanceAlert): Promise<SendOutcome> {
  if (!alert.guardianId) return { status: "skipped", note: "No parent on file" };
  const guardian = await tx.guardian.findFirst({ where: { id: alert.guardianId, archivedAt: null }, select: { optedOut: true } });
  if (!guardian) return { status: "skipped", note: "No parent on file" };
  // Workflow 15, step 10: attendance messages to parents start when the school goes live.
  if (await movingIn(tx, ctx)) return { status: "skipped", note: HELD_UNTIL_LIVE };
  const optedOut = "The parent has opted out of messages";
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
      // Opt-outs are checked per parent by Communication: one parent's opt-out does not stop the message to another who wants it.
      if (r.status === "nobody") return { status: "skipped", note: guardian.optedOut ? optedOut : "No parent with a phone number" };
      // Kept in Message History as Not sent, with the reason, so it can be sent once a channel can carry it.
      if (r.status === "not-sent") return { status: "skipped", note: r.reason, messageRef: r.result?.messageId ?? null };
      return { status: "skipped", note: NO_CHANNEL };
    }
    // Threshold and chronic absence: a short text from Attendance, to the parent on file.
    if (guardian.optedOut) return { status: "skipped", note: optedOut };
    const r = await sendMessage(tx, ctx, {
      to: { guardiansOf: [alert.studentId] },
      channels: "preferred",
      text: alert.text,
      messageType: "attendance",
      trigger: alert.kind === "threshold" ? "Attendance below the school's %" : "Absent several days in a row",
      source: { type: "Attendance Alert", id: alert.id },
      idempotencyKey: `attendance-alert:${alert.id}`,
      onNoCredits: "fail",
      onNobody: "record",
    });
    if (!r.queued && r.notSent) return { status: "skipped", note: r.skipped.find((g) => g.notSent)?.reason ?? NO_CHANNEL, messageRef: r.messageId };
    return { status: "sent", note: null, messageRef: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) return { status: "skipped", note: e.message || NO_CHANNEL };
    throw e;
  }
}
