// What happens in Salary Management when a request is decided (00-global.md
// §3.4), and where each request's record opens. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { decidePayroll } from "./payroll";
import { decideAdvance } from "./advances";

export const followUps = {
  payroll: (tx, ctx, a, decision, note) => decidePayroll(tx, ctx, a.recordId, decision, note),
  "salary-advance": (tx, ctx, a, decision, note) => decideAdvance(tx, ctx, a.recordId, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  payroll: async (tx) => requestIds(await tx.payrollRun.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
  "salary-advance": async (tx) => requestIds(await tx.salaryAdvance.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  payroll: (a) => ({ href: `/salary-management/generate?run=${a.recordId}`, label: "Open the salary month" }),
  "salary-advance": (a) => ({ href: `/salary-management/advances?open=${a.recordId}`, label: "Open the advance" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
