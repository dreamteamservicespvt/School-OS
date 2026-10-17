// What happens in Staff & HR when a request is decided (00-global.md §3.4):
// staff leave (A5) and staff exits. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { onLeaveDecision } from "./leave";
import { onExitDecision } from "./exit";

export const followUps = {
  "staff-leave": (tx, ctx, approval, decision, note) => onLeaveDecision(tx, ctx, approval, decision, note),
  "staff-exit": (tx, ctx, approval, decision, note) => onExitDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  "staff-leave": async (tx) => requestIds(await tx.leaveRequest.findMany({ where: { status: "WAITING", archivedAt: null, staffId: { not: null }, approvalId: { not: null } }, select: { approvalId: true } })),
  "staff-exit": async (tx) => requestIds(await tx.exitCase.findMany({ where: { status: "WAITING_APPROVAL", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;
