// What happens in Transport when a transport change is decided in Approvals
// (00-global.md §3.4). Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { todayDate } from "../front-office/time";
import { onTransportDecision } from "./places";

export const followUps = {
  "transport-change": async (tx, ctx, approval, decision) => {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    await onTransportDecision(tx, ctx, approval, decision, todayDate(school.timeZone));
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  "transport-change": async (tx) => requestIds(await tx.transportAssignment.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  "transport-change": () => ({ href: "/transport-management/students?show=waiting", label: "Open Student Transport" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
