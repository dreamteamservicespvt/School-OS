// What happens in Fee Management when a request is decided (00-global.md
// §3.4), and where each request's record opens. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { decideConcession } from "./concessions";
import { decideRefund } from "./refunds";
import { decideCancellation, decideVerification } from "./cancel";
import { decideStructureChange } from "./structure";

export const followUps = {
  concession: (tx, ctx, a, decision, note) => decideConcession(tx, ctx, a.recordId, decision, note),
  scholarship: (tx, ctx, a, decision, note) => decideConcession(tx, ctx, a.recordId, decision, note),
  refund: (tx, ctx, a, decision, note) => decideRefund(tx, ctx, a.recordId, decision, note),
  "payment-cancellation": (tx, ctx, a, decision, note) => decideCancellation(tx, ctx, a.recordId, decision, note),
  "payment-verification": (tx, ctx, a, decision, note) => decideVerification(tx, ctx, a.recordId, decision, note),
  "fee-structure-change": (tx, ctx, a, decision) => decideStructureChange(tx, ctx, a.recordId, decision),
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  concession: (a) => ({ href: `/fee-management/concessions?open=${a.recordId}`, label: "Open the concession" }),
  scholarship: (a) => ({ href: `/fee-management/concessions?tab=scholarships&open=${a.recordId}`, label: "Open the scholarship" }),
  refund: (a) => ({ href: `/fee-management/concessions?tab=refunds&open=${a.recordId}`, label: "Open the refund" }),
  "payment-cancellation": (a) => ({ href: `/fee-management/payments/${a.recordId}`, label: "Open the payment" }),
  "payment-verification": (a) => ({ href: `/fee-management/payments/${a.recordId}`, label: "Open the payment" }),
  "fee-structure-change": () => ({ href: "/fee-management/structure", label: "Open the fee structure" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
