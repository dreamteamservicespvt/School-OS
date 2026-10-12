// What happens in Admission Management when an admission request is decided
// (00-global.md §3.4, workflow 1 step 9), where its approval links to, and the
// gateway's confirmation of an online application fee.
// Imported by src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { onGatewayEvent } from "../payments/events";
import { onAdmissionDecision } from "./decision";
import { onAdmissionGatewayEvent } from "./fee";

onDecision("admission", (tx, ctx, approval, decision, note) => onAdmissionDecision(tx, ctx, approval, decision, note));
registerApprovalLink("admission", (a) => ({ href: `/admission-management/applications/${a.recordId}`, label: "Open the application" }));
onGatewayEvent(onAdmissionGatewayEvent);
