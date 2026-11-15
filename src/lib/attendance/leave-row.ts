// Take Attendance: what a row says about a student's approved leave (adopt
// item 3, docs/research/inkwelly-2026-11-15.md). The row is pre-set to Leave
// (./sheet-start in the take sheet) and says which days and who approved it,
// so the teacher does not overwrite it by mistake. Read only.
import "server-only";

import type { Tx } from "../db";
import { formatDate } from "../format";

export type LeaveFacts = { fromDate: Date; toDate: Date; by: string | null };

/** The days and the approver of each approved leave request, by its id. */
export async function leaveFacts(tx: Tx, leaveIds: string[]): Promise<Map<string, LeaveFacts>> {
  const ids = [...new Set(leaveIds)];
  if (!ids.length) return new Map();
  const rows = await tx.leaveRequest.findMany({ where: { id: { in: ids }, status: "APPROVED", archivedAt: null }, select: { id: true, fromDate: true, toDate: true, decidedById: true } });
  const users = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.decidedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
  const name = new Map(users.map((u) => [u.id, u.displayName]));
  return new Map(rows.map((r) => [r.id, { fromDate: r.fromDate, toDate: r.toDate, by: r.decidedById ? name.get(r.decidedById) ?? null : null }]));
}

/**
 * The small note under the student's name: "On approved leave · 17-11-2026 to
 * 18-11-2026 · Fever · approved by Mrs Sharma". A one-day leave names one day;
 * a half-day leave says so (the teacher still marks the other half).
 */
export function leaveRowNote(leave: { typeName: string; halfDay: boolean; reason: string | null }, facts: LeaveFacts | null | undefined): string {
  const days = facts
    ? facts.fromDate.getTime() === facts.toDate.getTime() ? formatDate(facts.fromDate, "UTC") : `${formatDate(facts.fromDate, "UTC")} to ${formatDate(facts.toDate, "UTC")}`
    : null;
  return [
    leave.halfDay ? "Half-day leave approved" : "On approved leave",
    days,
    leave.reason || leave.typeName,
    facts?.by ? `approved by ${facts.by}` : null,
  ].filter(Boolean).join(" · ");
}
