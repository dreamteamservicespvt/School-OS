// What happens in Attendance when a request is decided (00-global.md §3.4):
// student leave and attendance corrections. Listed in src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import type { LinkMaker } from "../approval-links";
import { requestIds, type StillWaiting } from "../approval-waiting";
import { onStudentLeaveDecision } from "./student-leave";
import { onCorrectionDecision } from "./corrections";

export const followUps = {
  "student-leave": (tx, ctx, approval, decision, note) => onStudentLeaveDecision(tx, ctx, approval, decision, note),
  "attendance-correction": (tx, ctx, approval, decision, note) => onCorrectionDecision(tx, ctx, approval, decision, note),
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  "student-leave": async (tx) => requestIds(await tx.leaveRequest.findMany({ where: { status: "WAITING", archivedAt: null, studentId: { not: null }, approvalId: { not: null } }, select: { approvalId: true } })),
  "attendance-correction": async (tx) => requestIds(await tx.attendanceCorrection.findMany({ where: { status: "WAITING", approvalId: { not: null } }, select: { approvalId: true } })),
} satisfies Partial<Record<AskableType, StillWaiting>>;

export const approvalLinks = {
  "student-leave": (a) => (a.recordType === "Leave Request" ? { href: `/attendance-management/student-leave?open=${a.recordId}`, label: "Open the leave" } : null),
  "attendance-correction": (a) => ({ href: `/attendance-management/register/corrections/${a.recordId}`, label: "Open the correction" }),
} satisfies Partial<Record<AskableType, LinkMaker>>;
