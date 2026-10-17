// What happens in Admission Management when an admission request is decided
// (00-global.md §3.4, workflow 1 step 9), and where its approval links to.
// Listed in src/lib/approval-handlers.ts. The gateway's confirmation of an
// online application fee is in ./gateway-handler.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { onAdmissionDecision } from "./decision";

export const followUps = {
  admission: (tx, ctx, approval, decision, note) => onAdmissionDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  admission: async (tx) => requestIds(await tx.application.findMany({ where: { stage: "DECISION", archivedAt: null, approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  admission: (a) => ({ href: `/admission-management/applications/${a.recordId}`, label: "Open the application" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
