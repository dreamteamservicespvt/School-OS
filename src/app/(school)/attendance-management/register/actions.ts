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
import { setAbsenceReason } from "@/lib/attendance/absence-reasons";
import { remindNotMarked } from "@/lib/attendance/remind";
import { problemState } from "@/lib/attendance/act";
import { todayIn } from "@/lib/staff/dates";
import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";

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
      forWhom, sectionId, date, periodNo, reason, changes: people.map((p) => ({ id: p, to, note })), today: todayIn(current.school.timeZone),
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

/**
 * "Remind" on Not marked yet: asks the class teachers of these sections to take
 * today's attendance. Only for people who see every section (checked again in
 * remindNotMarked); each reminder is audited.
 */
export async function remindNotMarkedAction(sectionIds: string[]): Promise<string | null> {
  try {
    const { current } = await requireAction("attendance-management", "view");
    const ids = (Array.isArray(sectionIds) ? sectionIds : []).filter((s) => typeof s === "string" && UUID_RE.test(s)).slice(0, 200);
    if (ids.length === 0) return "Choose a class to remind.";
    const { access } = await actionContext(current);
    const tz = current.school.timeZone;
    const now = new Date();
    const r = await withSchool(current.ctx, (tx) => remindNotMarked(tx, current.ctx, access, { sectionIds: ids, date: todayIn(tz, now), now, timeZone: tz }));
    if (r.reminded.length === 0) return r.skipped.length ? `Nobody was reminded: ${r.skipped.map((s) => `${s.name} (${s.why})`).join(", ")}.` : "Nobody was reminded.";
    await flash({ message: r.reminded.length === 1 ? `Reminded ${r.reminded[0]} to take today's attendance` : `Reminded ${r.reminded.length} class teachers to take today's attendance` });
    revalidatePath(BASE, "layout");
    revalidatePath("/dashboard");
    return null;
  } catch (e) {
    return problemState(e).message ?? "That did not go through. Please try again.";
  }
}

/**
 * The reason for a student's absence, set later from the day's absent list
 * (absence reasons, when the school records them). Only the reason changes;
 * the mark and the % stay. Class teachers for their section, the office and
 * whole-school roles; checked again in setAbsenceReason. Audited.
 */
export async function setAbsenceReasonAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "edit");
    const { access } = await actionContext(current);
    const studentId = id(fd, "studentId", "student");
    const date = dateOf(fd, "date", "Date");
    const reason = str(fd, "reason").slice(0, 40);
    if (!reason) throw new FieldProblem("Choose the reason.", "reason");
    const note = str(fd, "note").slice(0, 100) || null;
    return withSchool(current.ctx, (tx) => setAbsenceReason(tx, current.ctx, access, { studentId, date, reason, note }));
  }, (r) => (r.changed ? `Reason saved for ${r.name}: ${r.label}.` : "Nothing changed."));
}
