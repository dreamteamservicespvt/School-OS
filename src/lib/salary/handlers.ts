// What happens in Salary Management when a request is decided (00-global.md
// §3.4), and where each request's record opens. Imported by
// src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { decidePayroll } from "./payroll";
import { decideAdvance } from "./advances";

onDecision("payroll", (tx, ctx, a, decision, note) => decidePayroll(tx, ctx, a.recordId, decision, note));
onDecision("salary-advance", (tx, ctx, a, decision, note) => decideAdvance(tx, ctx, a.recordId, decision, note));

registerApprovalLink("payroll", (a) => ({ href: `/salary-management/generate?run=${a.recordId}`, label: "Open the salary month" }));
registerApprovalLink("salary-advance", (a) => ({ href: `/salary-management/advances?open=${a.recordId}`, label: "Open the advance" }));
