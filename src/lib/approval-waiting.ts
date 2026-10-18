// "Approved, but not finished" (00-global.md §3.4; gap list G01, follow-up):
// before 18 October 2026 a decision made on a server that had just started
// could leave its record waiting, because the follow-up never ran. Each
// module says, next to its follow-ups, which decided requests still have a
// record waiting on them (`unfinished` in its handlers file, gathered in
// ./approval-handlers.ts). The Approvals page lists them for the person who
// decided and for the Principal and School Admin, with Finish now
// (./approvals-unfinished.ts). These are the small helpers the modules use.
import type { Decision } from "./approvals";
import type { Tx } from "./db";

/**
 * The requests of one type whose record still waits on them, as if nobody
 * had decided. Returns Approval ids; the Approvals page keeps those already
 * decided (approved, not approved or sent back) and the newest for their record.
 */
export type StillWaiting = (tx: Tx) => Promise<string[]>;

/** The requests named on waiting records ("approvalId"). */
export const requestIds = (rows: { approvalId: string | null }[]) => [...new Set(rows.flatMap((r) => (r.approvalId ? [r.approvalId] : [])))];

type HistoryLine = { action?: string };

/** The decision a decided request was given: approve, reject or ask-change (sent back), or withdraw. */
export function decisionOf(a: { status: string; history: unknown }): Decision | null {
  if (a.status === "APPROVED") return "approve";
  if (a.status === "WITHDRAWN") return "withdraw";
  if (a.status !== "REJECTED") return null;
  const last = [...((a.history as HistoryLine[] | null) ?? [])].reverse().find((h) => h.action === "reject" || h.action === "ask-change");
  return last?.action === "ask-change" ? "ask-change" : "reject";
}

/**
 * Leaves out requests sent back for a change: for some records (a
 * certificate, a clearance waiver) the follow-up then keeps the record
 * waiting on purpose, for the person who asked to change it.
 */
export async function notSentBack(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  const rows = await tx.approval.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, history: true } });
  return rows.filter((a) => decisionOf(a) !== "ask-change").map((a) => a.id);
}
