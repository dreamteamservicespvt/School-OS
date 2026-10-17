// What happens in Transport when a transport change is decided in Approvals
// (00-global.md §3.4). Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { todayDate } from "../front-office/time";
import { onTransportDecision } from "./places";

export const followUps = {
  "transport-change": async (tx, ctx, approval, decision) => {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    await onTransportDecision(tx, ctx, approval, decision, todayDate(school.timeZone));
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  "transport-change": () => ({ href: "/transport-management/students?show=waiting", label: "Open Student Transport" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
