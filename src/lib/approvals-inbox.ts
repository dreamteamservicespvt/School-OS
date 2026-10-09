// The Approvals list and detail (00-global.md §3): what a person may see,
// filters, and approving several requests together (P11).
import "server-only";

import type { ApprovalStatus, Prisma } from "@prisma/client";
import { withSchool, type SchoolContext, type Tx } from "./db";
import { DecisionProblem, approvalsFor, canDecide, decide } from "./approvals";
import "./approval-handlers";

/** These roles see every request of the school (00-global.md §3; 05-roles.md). */
export const OVERSEER_ROLES = ["school-admin", "principal"];

export type InboxView = "mine" | "asked" | "all";
export const VIEWS: { value: InboxView; label: string }[] = [
  { value: "mine", label: "Waiting for me" },
  { value: "asked", label: "Asked by me" },
  { value: "all", label: "All I may see" },
];

export type HistoryLine = { at: string; by: string | null; action: string; note?: string | null };

export function isOverseer(roleKeys: (string | null)[]) {
  return roleKeys.some((k) => k !== null && OVERSEER_ROLES.includes(k));
}

/** Requests this person may decide, ask or have decided; School Admins and the Principal see all. */
export async function inboxWhere(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], view: InboxView): Promise<Prisma.ApprovalWhereInput> {
  if (view === "mine") return approvalsFor(tx, ctx, roleKeys);
  if (view === "asked") return { askedById: ctx.userId ?? undefined };
  if (isOverseer(roleKeys)) return {};
  const keys = roleKeys.filter((k): k is string => Boolean(k));
  return {
    OR: [
      { askedById: ctx.userId ?? undefined },
      { decidedById: ctx.userId ?? undefined },
      { currentApproverId: ctx.userId },
      { currentApproverId: null, currentApproverRole: { in: keys } },
    ],
  };
}

export function canSeeApproval(
  a: { askedById: string; decidedById: string | null; currentApproverId: string | null; currentApproverRole: string | null; history: unknown },
  ctx: SchoolContext,
  roleKeys: (string | null)[],
) {
  if (isOverseer(roleKeys)) return true;
  const me = ctx.userId;
  if (!me) return false;
  if (a.askedById === me || a.decidedById === me || a.currentApproverId === me) return true;
  if (!a.currentApproverId && a.currentApproverRole && roleKeys.includes(a.currentApproverRole)) return true;
  return ((a.history as HistoryLine[]) ?? []).some((h) => h.by === me);
}

export function statusWords(status: ApprovalStatus, history: unknown): { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" } {
  const last = [...((history as HistoryLine[]) ?? [])].reverse()[0];
  switch (status) {
    case "WAITING": return { label: "Waiting", tone: "warning" };
    case "ESCALATED": return { label: "Escalated", tone: "warning" };
    case "APPROVED": return { label: "Approved", tone: "success" };
    case "WITHDRAWN": return { label: "Withdrawn", tone: "neutral" };
    case "REJECTED": return last?.action === "ask-change" ? { label: "Sent back for a change", tone: "brand" } : { label: "Rejected", tone: "danger" };
  }
}

export const ACTION_WORDS: Record<string, string> = {
  asked: "Asked",
  approve: "Approved",
  reject: "Rejected",
  "ask-change": "Sent back for a change",
  withdraw: "Withdrawn",
  escalated: "Moved to the next approver",
};

export type BulkResult = { approved: number; skipped: { summary: string; reason: string }[] };

/**
 * Approves several requests, each on its own, so one that cannot be approved
 * does not stop the others. The same rules apply as for one request.
 */
export async function bulkApprove(ctx: SchoolContext, ids: string[]): Promise<BulkResult> {
  const result: BulkResult = { approved: 0, skipped: [] };
  for (const id of [...new Set(ids)].slice(0, 100)) {
    try {
      await withSchool(ctx, (tx) => decide(tx, ctx, id, "approve", null));
      result.approved++;
    } catch (e) {
      const summary = await withSchool(ctx, (tx) => tx.approval.findUnique({ where: { id }, select: { summary: true } })).catch(() => null);
      result.skipped.push({ summary: summary?.summary ?? "A request", reason: e instanceof DecisionProblem ? e.message : "It could not be approved. Try it on its own." });
    }
  }
  return result;
}

/** Which of these requests may this person decide now? */
export async function decidableIds(tx: Tx, ctx: SchoolContext, rows: { id: string; askedById: string; currentApproverId: string | null; currentApproverRole: string | null; status: ApprovalStatus }[]) {
  const out = new Set<string>();
  for (const r of rows) if (await canDecide(tx, ctx, r)) out.add(r.id);
  return out;
}
