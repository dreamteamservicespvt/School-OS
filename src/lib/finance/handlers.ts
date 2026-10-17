// What happens in Finance Management when a request is decided, and where
// each request's record opens. The person who asked is told by Approvals
// itself. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { decideExpense } from "./expenses";
import { decideOpeningBalance } from "./accounts";

export const followUps = {
  expense: (tx, ctx, a, decision, note) => decideExpense(tx, ctx, a.recordId, decision, note),
  "opening-balance": (tx, ctx, a, decision, note) => decideOpeningBalance(tx, ctx, a.recordId, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  expense: (a) => ({ href: `/finance-management/expenses/${a.recordId}`, label: "Open the expense" }),
  "opening-balance": () => ({ href: "/finance-management/cash-bank?tab=opening", label: "Open opening balances" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
