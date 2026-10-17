// What happens in Examination & Results when a request is decided
// (00-global.md §3.4): marks moderation. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { decideModeration } from "./marks";

export const followUps = {
  "marks-moderation": (tx, ctx, approval, decision) => decideModeration(tx, ctx, approval.recordId, decision, approval.id),
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  "marks-moderation": async (tx) => requestIds(await tx.marksModeration.findMany({ where: { status: "waiting", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  "marks-moderation": (a) => ({ href: `/examination-results/results/moderation?open=${a.recordId}`, label: "Open the moderation report" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
