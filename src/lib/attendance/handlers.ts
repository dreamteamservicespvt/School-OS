// What happens in Attendance when a request is decided (00-global.md §3.4):
// student leave and attendance corrections. Imported by src/lib/approval-handlers.ts.
import "server-only";

import { onDecision } from "../approvals";
import { registerApprovalLink } from "../approval-links";
import { onStudentLeaveDecision } from "./student-leave";
import { onCorrectionDecision } from "./corrections";

onDecision("student-leave", (tx, ctx, approval, decision, note) => onStudentLeaveDecision(tx, ctx, approval, decision, note));
onDecision("attendance-correction", (tx, ctx, approval, decision, note) => onCorrectionDecision(tx, ctx, approval, decision, note));

registerApprovalLink("student-leave", (a) => (a.recordType === "Leave Request" ? { href: `/attendance-management/student-leave?open=${a.recordId}`, label: "Open the leave" } : null));
registerApprovalLink("attendance-correction", (a) => ({ href: `/attendance-management/register/corrections/${a.recordId}`, label: "Open the correction" }));
