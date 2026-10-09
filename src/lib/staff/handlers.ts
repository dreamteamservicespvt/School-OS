// What happens in Staff & HR when a request is decided (00-global.md §3.4):
// staff leave (A5) and staff exits. Imported by src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { onLeaveDecision } from "./leave";
import { onExitDecision } from "./exit";

onDecision("staff-leave", (tx, ctx, approval, decision, note) => onLeaveDecision(tx, ctx, approval, decision, note));
onDecision("staff-exit", (tx, ctx, approval, decision, note) => onExitDecision(tx, ctx, approval, decision, note));
