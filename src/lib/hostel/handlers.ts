// Hostel Management's follow-ups: what happens to an outing or leave pass
// when the approver decides it in Approvals (approve, reject, ask for a
// change, or withdraw), and where that request opens. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { decidePass } from "./outings";
import { BASE } from "./words";

export const followUps = {
  outing: async (tx, ctx, approval, decision, note) => {
    if (approval.recordType !== "Gate Pass") return;
    await decidePass(tx, ctx, approval.recordId, decision, note);
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  outing: (a) => ({ href: `${BASE}/outings?pass=${a.recordId}`, label: "Open the outing pass" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
