// What happens in Staff & HR when a request is decided (00-global.md §3.4):
// staff leave (A5) and staff exits. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import { onLeaveDecision } from "./leave";
import { onExitDecision } from "./exit";

export const followUps = {
  "staff-leave": (tx, ctx, approval, decision, note) => onLeaveDecision(tx, ctx, approval, decision, note),
  "staff-exit": (tx, ctx, approval, decision, note) => onExitDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;
