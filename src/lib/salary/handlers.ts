// What happens in Salary Management when a request is decided (00-global.md
// §3.4), and where each request's record opens. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { decidePayroll } from "./payroll";
import { decideAdvance } from "./advances";

export const followUps = {
  payroll: (tx, ctx, a, decision, note) => decidePayroll(tx, ctx, a.recordId, decision, note),
  "salary-advance": (tx, ctx, a, decision, note) => decideAdvance(tx, ctx, a.recordId, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  payroll: (a) => ({ href: `/salary-management/generate?run=${a.recordId}`, label: "Open the salary month" }),
  "salary-advance": (a) => ({ href: `/salary-management/advances?open=${a.recordId}`, label: "Open the advance" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
