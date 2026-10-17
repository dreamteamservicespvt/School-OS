// What happens in Fee Management when a request is decided (00-global.md
// §3.4), and where each request's record opens. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { Tx } from "../db";
import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
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

const concessionsWaiting = async (tx: Tx) => requestIds(await tx.concession.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } }));

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  concession: concessionsWaiting,
  scholarship: concessionsWaiting,
  refund: async (tx) => requestIds(await tx.refund.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
  "payment-cancellation": async (tx) => requestIds((await tx.payment.findMany({ where: { status: "POSTED", cancelApprovalId: { not: null } }, select: { cancelApprovalId: true } })).map((p) => ({ approvalId: p.cancelApprovalId }))),
  "payment-verification": async (tx) => requestIds((await tx.payment.findMany({ where: { status: "WAITING", verifyApprovalId: { not: null } }, select: { verifyApprovalId: true } })).map((p) => ({ approvalId: p.verifyApprovalId }))),
  // Approved, but the draft was never published (and not discarded since).
  "fee-structure-change": async (tx) => {
    const approved = await tx.approval.findMany({ where: { type: "fee-structure-change", status: "APPROVED" }, select: { id: true, recordId: true } });
    if (!approved.length) return [];
    const drafts = new Set((await tx.feeStructure.findMany({ where: { id: { in: approved.map((a) => a.recordId) }, status: "DRAFT", archivedAt: null }, select: { id: true } })).map((s) => s.id));
    return approved.filter((a) => drafts.has(a.recordId)).map((a) => a.id);
  },
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  concession: (a) => ({ href: `/fee-management/concessions?open=${a.recordId}`, label: "Open the concession" }),
  scholarship: (a) => ({ href: `/fee-management/concessions?tab=scholarships&open=${a.recordId}`, label: "Open the scholarship" }),
  refund: (a) => ({ href: `/fee-management/concessions?tab=refunds&open=${a.recordId}`, label: "Open the refund" }),
  "payment-cancellation": (a) => ({ href: `/fee-management/payments/${a.recordId}`, label: "Open the payment" }),
  "payment-verification": (a) => ({ href: `/fee-management/payments/${a.recordId}`, label: "Open the payment" }),
  "fee-structure-change": () => ({ href: "/fee-management/structure", label: "Open the fee structure" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
