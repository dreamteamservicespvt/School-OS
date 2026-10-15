// What happens in Transport when a transport change is decided in Approvals
// (00-global.md §3.4). Imported by src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { todayDate } from "../front-office/time";
import { onTransportDecision } from "./places";

onDecision("transport-change", async (tx, ctx, approval, decision) => {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  await onTransportDecision(tx, ctx, approval, decision, todayDate(school.timeZone));
});

registerApprovalLink("transport-change", () => ({ href: "/transport-management/students?show=waiting", label: "Open Student Transport" }));
