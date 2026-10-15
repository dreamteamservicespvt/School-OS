// Hostel Management's follow-ups: what happens to an outing or leave pass
// when the approver decides it in Approvals (approve, reject, ask for a
// change, or withdraw), and where that request opens. Imported by
// src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { decidePass } from "./outings";
import { BASE } from "./words";

onDecision("outing", async (tx, ctx, approval, decision, note) => {
  if (approval.recordType !== "Gate Pass") return;
  await decidePass(tx, ctx, approval.recordId, decision, note);
});

registerApprovalLink("outing", (a) => ({ href: `${BASE}/outings?pass=${a.recordId}`, label: "Open the outing pass" }));
