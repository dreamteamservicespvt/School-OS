// What happens in Attendance when a request is decided (00-global.md §3.4):
// student leave and attendance corrections. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { onStudentLeaveDecision } from "./student-leave";
import { onCorrectionDecision } from "./corrections";

export const followUps = {
  "student-leave": (tx, ctx, approval, decision, note) => onStudentLeaveDecision(tx, ctx, approval, decision, note),
  "attendance-correction": (tx, ctx, approval, decision, note) => onCorrectionDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

export const approvalLinks = {
  "student-leave": (a) => (a.recordType === "Leave Request" ? { href: `/attendance-management/student-leave?open=${a.recordId}`, label: "Open the leave" } : null),
  "attendance-correction": (a) => ({ href: `/attendance-management/register/corrections/${a.recordId}`, label: "Open the correction" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
