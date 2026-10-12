// What happens in Fee Management when a request is decided (00-global.md
// §3.4), and where each request's record opens. Imported by
// src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { decideConcession } from "./concessions";
import { decideRefund } from "./refunds";
import { decideCancellation, decideVerification } from "./cancel";

onDecision("concession", (tx, ctx, a, decision, note) => decideConcession(tx, ctx, a.recordId, decision, note));
onDecision("scholarship", (tx, ctx, a, decision, note) => decideConcession(tx, ctx, a.recordId, decision, note));
onDecision("refund", (tx, ctx, a, decision, note) => decideRefund(tx, ctx, a.recordId, decision, note));
onDecision("payment-cancellation", (tx, ctx, a, decision, note) => decideCancellation(tx, ctx, a.recordId, decision, note));
onDecision("payment-verification", (tx, ctx, a, decision, note) => decideVerification(tx, ctx, a.recordId, decision, note));

registerApprovalLink("concession", (a) => ({ href: `/fee-management/concessions?open=${a.recordId}`, label: "Open the concession" }));
registerApprovalLink("scholarship", (a) => ({ href: `/fee-management/concessions?tab=scholarships&open=${a.recordId}`, label: "Open the scholarship" }));
registerApprovalLink("refund", (a) => ({ href: `/fee-management/concessions?tab=refunds&open=${a.recordId}`, label: "Open the refund" }));
registerApprovalLink("payment-cancellation", (a) => ({ href: `/fee-management/payments/${a.recordId}`, label: "Open the payment" }));
registerApprovalLink("payment-verification", (a) => ({ href: `/fee-management/payments/${a.recordId}`, label: "Open the payment" }));
