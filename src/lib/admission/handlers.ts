// What happens in Admission Management when an admission request is decided
// (00-global.md §3.4, workflow 1 step 9), and where its approval links to.
// Listed in src/lib/approval-handlers.ts. The gateway's confirmation of an
// online application fee is in ./gateway-handler.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { onAdmissionDecision } from "./decision";

export const followUps = {
  admission: (tx, ctx, approval, decision, note) => onAdmissionDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  admission: (a) => ({ href: `/admission-management/applications/${a.recordId}`, label: "Open the application" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
