// What happens in Staff & HR when a request is decided (00-global.md §3.4):
// staff leave (A5) and staff exits. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import { requestIds, type StillWaiting } from "../approval-waiting";
import type { ApprovalFact, FactsMaker } from "../approval-facts";
import { balancesFor, daysText, onLeaveDecision } from "./leave";
import { onExitDecision } from "./exit";

export const followUps = {
  "staff-leave": (tx, ctx, approval, decision, note) => onLeaveDecision(tx, ctx, approval, decision, note),
  "staff-exit": (tx, ctx, approval, decision, note) => onExitDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  "staff-leave": async (tx) => requestIds(await tx.leaveRequest.findMany({ where: { status: "WAITING", archivedAt: null, staffId: { not: null }, approvalId: { not: null } }, select: { approvalId: true } })),
  "staff-exit": async (tx) => requestIds(await tx.exitCase.findMany({ where: { status: "WAITING_APPROVAL", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

/**
 * Staff leave on the request (workflow 7 step 3: "with the leave balance and
 * the periods that will need cover"), read when the request is opened.
 */
export const approvalFacts = {
  "staff-leave": async (tx, ctx, list) => {
    const out = new Map<string, ApprovalFact[]>();
    const asked = list.filter((a) => a.recordType === "Leave Request");
    if (!asked.length) return out;
    const requests = await tx.leaveRequest.findMany({ where: { id: { in: asked.map((a) => a.recordId) }, staffId: { not: null } } });
    const [types, details] = await Promise.all([
      tx.leaveType.findMany({ where: { id: { in: [...new Set(requests.map((r) => r.leaveTypeId))] } }, select: { id: true, name: true } }),
      tx.staffLeaveDetail.findMany({ where: { leaveRequestId: { in: requests.map((r) => r.id) } }, select: { leaveRequestId: true, periodsAffected: true, lopDays: true } }),
    ]);
    for (const a of asked) {
      const r = requests.find((x) => x.id === a.recordId);
      if (!r?.staffId) continue;
      const facts: ApprovalFact[] = [];
      const typeName = types.find((t) => t.id === r.leaveTypeId)?.name ?? "Leave";
      const b = r.academicYearId ? (await balancesFor(tx, ctx, [r.staffId], r.academicYearId)).get(r.staffId)?.find((x) => x.type.id === r.leaveTypeId) : undefined;
      if (b) {
        const total = b.given + b.adjusted;
        const days = Number(r.days);
        facts.push({
          label: "Leave balance",
          value: !b.limited ? `${typeName}: no limit (unpaid leave)`
            : `${typeName}: ${Number.isInteger(b.left) ? b.left : b.left.toFixed(1)} of ${daysText(total)} left${r.status === "WAITING" ? `, ${daysText(Math.max(0, b.left - days))} after this leave` : ""}`,
        });
      }
      const d = details.find((x) => x.leaveRequestId === r.id);
      if (d) facts.push({ label: "Periods to cover", value: d.periodsAffected > 0 ? `${d.periodsAffected} period${d.periodsAffected === 1 ? "" : "s"} need a substitute` : "No periods to cover" });
      if (d && Number(d.lopDays) > 0) facts.push({ label: "Loss of pay", value: `${daysText(Number(d.lopDays))} beyond the balance` });
      out.set(a.id, facts);
    }
    return out;
  },
} satisfies Partial<Record<AskableType, FactsMaker>>;
