// Attendance Flag (05 §4 A4): the one record of a student's attendance
// concern. A4 raises it once per drop and clears it when attendance recovers;
// Early Warnings (19 §2) lists it and records the review on it; the Dashboard,
// the Chronic absence report and the student's Attendance tab read the same
// record, so a review or a close in one place shows in every place.
//
// Two dates mean two things:
// - clearedAt: attendance is back within the rule (A4). Until it is set the
//   flag is not raised again, even when a person closed it as not a concern.
// - status CLOSED (with closedAt and closedReason): the concern is over,
//   because it cleared or because a person closed it.
import type { Prisma } from "@prisma/client";

export type AttendanceFlagStatus = "NEW" | "REVIEWED" | "ACTION_PLANNED" | "CLOSED";

/** Open flags: not cleared and not closed by a person. What every count and list of concerns uses. */
export const OPEN_ATTENDANCE_FLAG = { clearedAt: null, status: { not: "CLOSED" } } satisfies Prisma.AttendanceFlagWhereInput;

export const CLEARED_REASON = "Cleared: attendance is back within the rule.";

export const FLAG_STATUS_LABEL: Record<AttendanceFlagStatus, string> = { NEW: "Not reviewed yet", REVIEWED: "Reviewed", ACTION_PLANNED: "Action planned", CLOSED: "Closed" };

/** The flag's status as people see it: a cleared flag is closed, whatever it said before. */
export function flagStatusOf(f: { status: string; clearedAt: Date | null }): AttendanceFlagStatus {
  if (f.clearedAt) return "CLOSED";
  return (["NEW", "REVIEWED", "ACTION_PLANNED", "CLOSED"] as const).find((s) => s === f.status) ?? "NEW";
}
