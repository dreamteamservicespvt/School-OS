// What happens in Examination & Results when a request is decided
// (00-global.md §3.4): marks moderation. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { decideModeration } from "./marks";

export const followUps = {
  "marks-moderation": (tx, ctx, approval, decision) => decideModeration(tx, ctx, approval.recordId, decision, approval.id),
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  "marks-moderation": (a) => ({ href: `/examination-results/results/moderation?open=${a.recordId}`, label: "Open the moderation report" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
