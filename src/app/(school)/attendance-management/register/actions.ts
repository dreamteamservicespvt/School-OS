"use server";

// Attendance corrections (05 §2 Attendance Register, rule 17): asked here,
// decided through Approvals. The original marks stay in the audit log.

import "@/lib/approval-handlers";
import { redirect } from "next/navigation";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { decide, type Decision } from "@/lib/approvals";
import { dateOf, FieldProblem, id, str, UUID_RE } from "@/lib/staff/act";
import { act } from "@/lib/attendance/act";
import { actionContext } from "@/lib/attendance/page";
import { AttendanceProblem, BASE } from "@/lib/attendance/access";
import { requestCorrection } from "@/lib/attendance/corrections";

/** Ask for a correction: one or more students (or staff), a date, the new status and a reason. */
export async function requestCorrectionAction(_: FormState<unknown>, fd: FormData) {
  let createdId: string | null = null;
  const result = await act(fd, async () => {
    const { current } = await requireAction("attendance-management", "edit");
    const { access } = await actionContext(current);
    const forWhom = str(fd, "forWhom") === "staff" ? "staff" : "student";
    const sectionId = forWhom === "student" ? id(fd, "sectionId", "class") : null;
    const date = dateOf(fd, "date", "Date");
    const periodNo = Math.max(0, Math.min(20, Number.parseInt(str(fd, "periodNo") || "0", 10) || 0));
    const people = fd.getAll("people").map(String).filter((v) => UUID_RE.test(v));
    if (people.length === 0) throw new FieldProblem(forWhom === "staff" ? "Choose the staff member." : "Choose at least one student.", "people");
    if (people.length > 100) throw new FieldProblem("Choose at most 100 people in one request.", "people");
    const to = str(fd, "status");
    if (!to) throw new FieldProblem("Choose the new status.", "status");
    const note = str(fd, "note").slice(0, 300) || null;
    const reason = str(fd, "reason").slice(0, 500);
    const c = await withSchool(current.ctx, (tx) => requestCorrection(tx, current.ctx, access, {
      forWhom, sectionId, date, periodNo, reason, changes: people.map((p) => ({ id: p, to, note })),
    }));
    createdId = c.id;
    return { id: c.id };
  }, () => ({ message: "Correction request sent to Approvals. The register changes when it is approved.", link: { href: `${BASE}/register/corrections`, label: "See corrections" } }));
  if (result?.ok && createdId) redirect(`${BASE}/register/corrections/${createdId}`);
  return result;
}

async function decideCorrection(fd: FormData, decision: Decision) {
  const { current } = await requireAction("attendance-management", decision === "withdraw" ? "edit" : "approve");
  const correctionId = id(fd, "correctionId", "correction");
  const note = str(fd, "note").slice(0, 500) || null;
  return withSchool(current.ctx, async (tx) => {
    const c = await tx.attendanceCorrection.findFirst({ where: { id: correctionId, archivedAt: null } });
    if (!c || !c.approvalId) throw new AttendanceProblem("This correction was not found.");
    if (c.status !== "WAITING") throw new AttendanceProblem("This correction was already decided.");
    await decide(tx, current.ctx, c.approvalId, decision, note);
    return { id: c.id };
  });
}

export async function approveCorrectionAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => decideCorrection(fd, "approve"), () => "Correction approved. The register is changed, and the original marks are kept in the audit log.");
}

export async function rejectCorrectionAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => decideCorrection(fd, "reject"), () => "Correction not approved. The register stays as it was.");
}

export async function withdrawCorrectionAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => decideCorrection(fd, "withdraw"), () => "Correction request withdrawn.");
}
