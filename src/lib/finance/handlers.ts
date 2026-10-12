// What happens in Finance Management when a request is decided, and where
// each request's record opens. The person who asked is told by Approvals
// itself. Imported by src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { decideExpense } from "./expenses";
import { decideOpeningBalance } from "./accounts";

onDecision("expense", (tx, ctx, a, decision, note) => decideExpense(tx, ctx, a.recordId, decision, note));
onDecision("opening-balance", (tx, ctx, a, decision, note) => decideOpeningBalance(tx, ctx, a.recordId, decision, note));

registerApprovalLink("expense", (a) => ({ href: `/finance-management/expenses/${a.recordId}`, label: "Open the expense" }));
registerApprovalLink("opening-balance", () => ({ href: "/finance-management/cash-bank?tab=opening", label: "Open opening balances" }));
