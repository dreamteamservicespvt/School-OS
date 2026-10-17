// Hostel Management's follow-ups: what happens to an outing or leave pass
// when the approver decides it in Approvals (approve, reject, ask for a
// change, or withdraw), and where that request opens. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { decidePass } from "./outings";
import { BASE } from "./words";

export const followUps = {
  outing: async (tx, ctx, approval, decision, note) => {
    if (approval.recordType !== "Gate Pass") return;
    await decidePass(tx, ctx, approval.recordId, decision, note);
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  outing: async (tx) => requestIds(await tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  outing: (a) => ({ href: `${BASE}/outings?pass=${a.recordId}`, label: "Open the outing pass" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
