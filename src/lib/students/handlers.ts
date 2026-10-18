// What happens when Student Management's requests are decided in Approvals:
// certificates (TC always), clearance waivers and re-admissions. Listed in
// src/lib/approval-handlers.ts.
import "server-only";

import type { AskableType, FollowUp } from "../approvals";
import { notSentBack, requestIds, type StillWaiting } from "../approval-waiting";
import { certificateDecided } from "./certificates";
import { waiverDecided } from "./leaving";
import { currentYear } from "../academic/years";
import { applyStatus } from "./students";

export const followUps = {
  certificate: async (tx, ctx, approval, decision, note) => {
    if (decision === "ask-change") return;
    await certificateDecided(tx, ctx, approval.recordId, decision === "approve", note);
  },

  "clearance-waiver": async (tx, ctx, approval, decision, note) => {
    if (decision === "ask-change") return;
    await waiverDecided(tx, ctx, approval.recordId, decision === "approve", note);
  },

  "re-admission": async (tx, ctx, approval, decision) => {
    if (decision !== "approve") return;
    const student = await tx.student.findUnique({ where: { id: approval.recordId } });
    if (!student || (student.status !== "TRANSFERRED" && student.status !== "WITHDRAWN")) return;
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    await applyStatus(tx, ctx, student.id, "ACTIVE", today, "Re-admitted (approved)", `approval:${approval.id}`, { leavingDate: null, leavingReason: null });
    // Back in this year's class when the year is still open; otherwise the profile offers "Place in a section".
    const year = await currentYear(tx, ctx);
    if (year && year.status !== "CLOSED") {
      await tx.enrolment.updateMany({ where: { studentId: student.id, academicYearId: year.id, status: "LEFT", archivedAt: null }, data: { status: "STUDYING" } });
    }
  },
} satisfies Partial<Record<AskableType, FollowUp>>;

/** Decided requests whose record still waits on them: their follow-up never ran (Approvals, "Approved, but not finished"). */
export const unfinished = {
  // Sent back for a change, a certificate or a waiver keeps waiting on purpose.
  certificate: async (tx) => notSentBack(tx, requestIds(await tx.certificate.findMany({ where: { status: "REQUESTED", approvalId: { not: null } }, select: { approvalId: true } }))),
  "clearance-waiver": async (tx) => notSentBack(tx, requestIds(await tx.studentClearanceCheck.findMany({ where: { status: "WAIVER_ASKED", approvalId: { not: null } }, select: { approvalId: true } }))),
  // Approved, but the student is still Transferred or Withdrawn, with no status change made by this approval.
  "re-admission": async (tx) => {
    const approved = await tx.approval.findMany({ where: { type: "re-admission", status: "APPROVED" }, select: { id: true, recordId: true } });
    if (!approved.length) return [];
    const away = new Set((await tx.student.findMany({ where: { id: { in: approved.map((a) => a.recordId) }, status: { in: ["TRANSFERRED", "WITHDRAWN"] } }, select: { id: true } })).map((s) => s.id));
    const done = new Set((await tx.studentStatusChange.findMany({ where: { source: { in: approved.map((a) => `approval:${a.id}`) } }, select: { source: true } })).map((c) => c.source));
    return approved.filter((a) => away.has(a.recordId) && !done.has(`approval:${a.id}`)).map((a) => a.id);
  },
} satisfies Partial<Record<AskableType, StillWaiting>>;
