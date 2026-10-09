// What happens when Student Management's requests are decided in Approvals:
// certificates (TC always), clearance waivers and re-admissions.
import "server-only";

import { onDecision } from "../approvals";
import { certificateDecided } from "./certificates";
import { waiverDecided } from "./leaving";
import { currentYear } from "../academic/years";
import { applyStatus } from "./students";

onDecision("certificate", async (tx, ctx, approval, decision, note) => {
  if (decision === "ask-change") return;
  await certificateDecided(tx, ctx, approval.recordId, decision === "approve", note);
});

onDecision("clearance-waiver", async (tx, ctx, approval, decision, note) => {
  if (decision === "ask-change") return;
  await waiverDecided(tx, ctx, approval.recordId, decision === "approve", note);
});

onDecision("re-admission", async (tx, ctx, approval, decision) => {
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
});
