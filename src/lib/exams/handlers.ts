// What happens in Examination & Results when a request is decided
// (00-global.md §3.4): marks moderation. Imported by src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { decideModeration } from "./marks";

onDecision("marks-moderation", (tx, ctx, approval, decision) => decideModeration(tx, ctx, approval.recordId, decision, approval.id));
registerApprovalLink("marks-moderation", (a) => ({ href: `/examination-results/results/moderation?open=${a.recordId}`, label: "Open the moderation report" }));
