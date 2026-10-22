"use server";

// Student Leave (05 §2): recorded by staff, decided by the class teacher
// within the limit or by the principal, through Approvals.

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { findStudents as findAnyStudents } from "@/lib/students/find";
import { abilities } from "@/lib/students/access";
import type { FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { dateOf, FieldProblem, file, id, str, UUID_RE } from "@/lib/staff/act";
import { daysText } from "@/lib/staff/leave";
import { act } from "@/lib/attendance/act";
import { actionContext } from "@/lib/attendance/page";
import { AttendanceProblem, studentLimit } from "@/lib/attendance/access";
import { cancelStudentLeave, checkStudentLeave, decideStudentLeave, quotaText, recordStudentLeave } from "@/lib/attendance/student-leave";

function leaveInput(fd: FormData) {
  const from = dateOf(fd, "from", "From date");
  const halfDay = str(fd, "halfDay") === "on";
  const to = halfDay ? from : str(fd, "to") ? dateOf(fd, "to", "To date") : from;
  return {
    studentId: id(fd, "studentId", "student"),
    leaveTypeId: id(fd, "leaveTypeId", "leave type"),
    from, to, halfDay,
    reason: str(fd, "reason").slice(0, 500),
  };
}

export type StudentOption = { id: string; label: string; detail: string };

/** Student search for the Record leave form: only students this person may record leave for. */
export async function findStudents(q: string): Promise<StudentOption[]> {
  const text = String(q ?? "").trim().slice(0, 60);
  if (text.length < 2) return [];
  const { current } = await requireAction("attendance-management", "create");
  const { access } = await actionContext(current);
  if (access.studentLeave === "none" || access.yearIds.length === 0) return [];
  // The one student search, within the students this person may record leave for: each student's
  // class is in their own campus's current year, and a person limited to one campus finds that campus's students only.
  const yearIds = access.yearIds;
  return withSchool(current.ctx, async (tx) => {
    const scope = { ...studentLimit(access), enrolments: { some: { academicYearId: { in: yearIds }, archivedAt: null, status: "STUDYING" as const, ...(access.studentLeave === "own" ? { sectionId: { in: access.classSections } } : {}) } } };
    const hits = await findAnyStudents(tx, text, { scope, yearId: yearIds, campusId: access.campusLimit, statuses: ["ACTIVE", "ADMITTED"], byParent: abilities(current).seeParents, take: 12 });
    return hits.map((h) => ({ id: h.id, label: h.name, detail: `${h.classSection ?? ""}${h.rollNo ? `, roll ${h.rollNo}` : ""} · ${h.admissionNo}` }));
  });
}

/** The check under the form: school days counted, the quota and who decides. */
export async function previewStudentLeave(_: FormState<{ text: string; canApprove: boolean; warn: boolean }>, fd: FormData): Promise<FormState<{ text: string; canApprove: boolean; warn: boolean }>> {
  try {
    const { current } = await requireAction("attendance-management", "create");
    const { access } = await actionContext(current);
    const input = leaveInput(fd);
    const c = await withSchool(current.ctx, (tx) => checkStudentLeave(tx, current.ctx, access, input));
    const parts = [`${daysText(c.days)} of school (Sundays, holidays and days off not counted)`];
    if (c.quota) parts.push(quotaText(c.quota));
    if (c.overQuota) parts.push(c.settings.quotaOverNeedsApproval ? "This is over the quota, so it goes to the principal in Approvals" : "This is over the quota");
    return { ok: true, data: { text: `${parts.join(" · ")}.`, canApprove: c.mayDecide, warn: c.overQuota } };
  } catch (e) {
    const err = e as Error & { field?: string };
    if (e instanceof AttendanceProblem || e instanceof FieldProblem) return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined };
    return { ok: false, message: "The check did not work. You can still save the leave." };
  }
}

export async function recordStudentLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "create");
    const { access } = await actionContext(current);
    const input = leaveInput(fd);
    const doc = file(fd, "document");
    return withSchool(current.ctx, async (tx) => {
      const documentFileId = doc ? (await saveFile(tx, current.ctx, { file: doc, purpose: "student-leave-document", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
      const r = await recordStudentLeave(tx, current.ctx, access, { ...input, documentFileId, approveNow: str(fd, "approveNow") === "on" });
      return { id: r.request.id, approved: r.approved, days: Number(r.request.days) };
    }, { timeout: 30_000 });
  }, (r) => r.approved
    ? `Leave recorded and approved (${daysText(r.days)}). It shows as Leave in Take Attendance, and no absence message goes for those days.`
    : `Leave recorded (${daysText(r.days)}). It is waiting for approval.`);
}

async function decideAction(fd: FormData, decision: "approve" | "reject") {
  const { current } = await requireAction("attendance-management", "approve");
  const { access } = await actionContext(current);
  const requestId = id(fd, "requestId", "leave");
  const note = str(fd, "note").slice(0, 500) || null;
  await withSchool(current.ctx, (tx) => decideStudentLeave(tx, current.ctx, access, requestId, decision, note));
  return { id: requestId };
}

export async function approveStudentLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => decideAction(fd, "approve"), () => "Leave approved. Those days show as Leave in Take Attendance.");
}

export async function rejectStudentLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => decideAction(fd, "reject"), () => "Leave rejected. The reason is saved with the request.");
}

export async function cancelStudentLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "edit");
    const { access } = await actionContext(current);
    const requestId = id(fd, "requestId", "leave");
    await withSchool(current.ctx, (tx) => cancelStudentLeave(tx, current.ctx, access, requestId, str(fd, "reason").slice(0, 500)));
    return { id: requestId };
  }, () => "Leave cancelled. Take Attendance no longer shows Leave for the days still to come.");
}

/** Approves several waiting requests at once; each is checked as if approved alone. */
export async function approveManyStudentLeaveAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("attendance-management", "approve");
    const { access } = await actionContext(current);
    const ids = str(fd, "ids").split(",").map((x) => x.trim()).filter((x) => UUID_RE.test(x)).slice(0, 100);
    if (!ids.length) throw new AttendanceProblem("Choose at least one leave request.");
    let done = 0;
    await withSchool(current.ctx, async (tx) => {
      for (const requestId of ids) { await decideStudentLeave(tx, current.ctx, access, requestId, "approve", null); done++; }
    }, { timeout: 60_000 });
    return { done };
  }, (r) => `Approved ${r.done} leave ${r.done === 1 ? "request" : "requests"}. Those days show as Leave in Take Attendance, and no absence message goes for them.`);
}
