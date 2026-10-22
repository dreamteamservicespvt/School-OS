// Student Leave (05 §2, workflow 6): recorded by school staff, since parents
// have no login; no overlapping leave; decided by the class teacher up to a
// limit, otherwise the principal; balances and quotas when the school
// switches them on. Approved days show as Leave in Take Attendance in advance
// and get no absence message.
import "server-only";

import { Prisma, type LeaveRequest } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { requestApproval, decide, type Decision } from "../approvals";
import { formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { isoDay } from "../staff/dates";
import { daysText } from "../staff/leave";
import { AttendanceProblem, BASE, NotYoursError, type AttendanceAccess } from "./access";
import { schoolDays } from "./calendar";
import { attendanceFeatures, attendanceSettings, ensureAttendanceDefaults } from "./settings";
import { fillReasonsFromLeave, undoReasonsFromLeave } from "./absence-reasons";
import { queueAfterSave } from "./after-save";

const dayText = (d: Date) => formatDate(d, "UTC");
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

export const STUDENT_LEAVE_STATUS: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  WAITING: { label: "Waiting", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export async function studentLeaveTypes(tx: Tx, ctx: SchoolContext) {
  await ensureAttendanceDefaults(tx, ctx);
  const types = await tx.leaveType.findMany({ where: { schoolId: ctx.schoolId, forWhom: "student", archivedAt: null }, orderBy: { name: "asc" } });
  // Medical first, as the form's default (05 §2).
  return types.sort((a, b) => (a.code === "MED" ? -1 : b.code === "MED" ? 1 : a.name.localeCompare(b.name)));
}

/** The student's current enrolment (class and section) for a date. */
export async function enrolmentOn(tx: Tx, studentId: string, date: Date) {
  const rows = await tx.enrolment.findMany({
    where: { studentId, archivedAt: null },
    include: { student: { select: { id: true, fullName: true, campusId: true, status: true, archivedAt: true } } },
  });
  for (const e of rows) {
    const year = await tx.academicYear.findUnique({ where: { id: e.academicYearId } });
    if (year && year.startDate <= date && year.endDate >= date) {
      const section = await tx.section.findUnique({ where: { id: e.sectionId }, include: { schoolClass: { select: { name: true, campusId: true } } } });
      return { enrolment: e, year, section, sectionName: section ? `${section.schoolClass.name} ${section.name}` : "" };
    }
  }
  return null;
}

// ---------------------------------------------------------------- quotas

export type QuotaView = { typeName: string; quota: number; used: number; left: number; period: "term" | "year"; periodName: string };

/** "Medical: 2 of 6 days left this term", or null when quotas are off or the type has none. */
export async function quotaFor(tx: Tx, ctx: SchoolContext, studentId: string, leaveTypeId: string, date: Date, opts: { ignoreRequestId?: string } = {}): Promise<QuotaView | null> {
  const features = await attendanceFeatures(tx, ctx);
  if (!features.has("attendance-leave-quotas")) return null;
  const quota = await tx.studentLeaveQuota.findFirst({ where: { leaveTypeId, archivedAt: null } });
  if (!quota) return null;
  const type = await tx.leaveType.findUnique({ where: { id: leaveTypeId }, select: { name: true } });
  const where = await enrolmentOn(tx, studentId, date);
  if (!where) return null;
  let from = where.year.startDate;
  let to = where.year.endDate;
  let periodName = where.year.name;
  if (quota.period === "term") {
    const term = await tx.term.findFirst({ where: { academicYearId: where.year.id, startDate: { lte: date }, endDate: { gte: date }, archivedAt: null } });
    if (term) { from = term.startDate; to = term.endDate; periodName = term.name; }
  }
  // Each student has a Leave Balance record per leave type for the year (04-data-model.md).
  const existing = await tx.leaveBalance.findFirst({ where: { academicYearId: where.year.id, studentId, leaveTypeId } });
  if (!existing) await tx.leaveBalance.create({ data: { schoolId: ctx.schoolId, academicYearId: where.year.id, studentId, leaveTypeId, daysGiven: quota.days } });
  else if (num(existing.daysGiven) !== num(quota.days)) await tx.leaveBalance.update({ where: { id: existing.id }, data: { daysGiven: quota.days } });
  const balance = await tx.leaveBalance.findFirst({ where: { academicYearId: where.year.id, studentId, leaveTypeId } });
  const adjusted = ((balance?.adjustments ?? []) as { days: number }[]).reduce((s, a) => s + Number(a.days || 0), 0);
  const taken = await tx.leaveRequest.findMany({
    where: { studentId, leaveTypeId, status: "APPROVED", archivedAt: null, fromDate: { lte: to }, toDate: { gte: from }, ...(opts.ignoreRequestId ? { id: { not: opts.ignoreRequestId } } : {}) },
    select: { days: true },
  });
  const used = taken.reduce((s, r) => s + num(r.days), 0);
  const total = num(quota.days) + adjusted;
  return { typeName: type?.name ?? "Leave", quota: total, used, left: Math.max(0, total - used), period: quota.period === "year" ? "year" : "term", periodName };
}

export function quotaText(q: QuotaView) {
  return `${q.typeName}: ${q.left} of ${q.quota} days left this ${q.period}`;
}

// ---------------------------------------------------------------- recording

export type StudentLeaveInput = {
  studentId: string;
  leaveTypeId: string;
  from: Date;
  to: Date;
  halfDay: boolean;
  reason: string;
  documentFileId: string | null;
  /** The recorder may decide it and chose to approve it at once. */
  approveNow: boolean;
};

/** Is the student on the person's campus? Always true for the whole school. */
async function onCampus(tx: Tx, access: AttendanceAccess, studentId: string | null) {
  if (!access.campusLimit) return true;
  return Boolean(studentId && (await tx.student.findFirst({ where: { id: studentId, campusId: access.campusLimit }, select: { id: true } })));
}

export async function checkStudentLeave(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: Omit<StudentLeaveInput, "approveNow" | "documentFileId">, opts: { ignoreRequestId?: string } = {}) {
  if (access.studentLeave === "none" || access.change === "none") throw new AttendanceProblem("Your role cannot record student leave. Ask the class teacher or the office.");
  // A person limited to one campus records leave for that campus's students only.
  if (!(await onCampus(tx, access, input.studentId))) throw new NotYoursError("this student");
  const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, forWhom: "student", archivedAt: null } });
  if (!type) throw new AttendanceProblem("Choose a leave type.", "leaveTypeId");
  if (input.to < input.from) throw new AttendanceProblem("To date is before the from date. Choose a to date on or after the from date.", "to");
  if (input.halfDay && isoDay(input.from) !== isoDay(input.to)) throw new AttendanceProblem("A half day is for one date. Make the from and to dates the same.", "to");
  if (input.reason.trim().length < 3) throw new AttendanceProblem("Reason is needed.", "reason");
  const where = await enrolmentOn(tx, input.studentId, input.from);
  if (!where || !where.section) throw new AttendanceProblem(`This student is not in a class on ${dayText(input.from)}.`, "studentId");
  const student = where.enrolment.student;
  if (student.archivedAt || !["ACTIVE", "ADMITTED"].includes(student.status)) throw new AttendanceProblem(`${student.fullName} is not studying here now, so leave cannot be recorded.`, "studentId");
  if (access.studentLeave === "own" && !access.classSections.includes(where.section.id)) throw new NotYoursError("this student");
  if (input.to > where.year.endDate) throw new AttendanceProblem(`Leave cannot cross into the next academic year (${where.year.name} ends ${dayText(where.year.endDate)}). Record it in two parts.`, "to");
  await assertYearOpen(tx, where.year.id);

  const overlap = await tx.leaveRequest.findFirst({
    where: { studentId: input.studentId, archivedAt: null, status: { in: ["WAITING", "APPROVED"] }, fromDate: { lte: input.to }, toDate: { gte: input.from }, ...(opts.ignoreRequestId ? { id: { not: opts.ignoreRequestId } } : {}) },
    orderBy: { fromDate: "asc" },
  });
  if (overlap) {
    const first = student.fullName.split(" ")[0];
    throw new AttendanceProblem(`${first} already has leave from ${dayText(overlap.fromDate)} to ${dayText(overlap.toDate)}. Change the existing leave instead.`, "from");
  }

  // Days without school inside the range (holidays, Sundays, days off) are not counted (05 §2 form).
  const days = (await schoolDays(tx, ctx, input.from, input.to, where.section.schoolClass.campusId, { classId: where.enrolment.classId })).working.length;
  const counted = input.halfDay ? (days > 0 ? 0.5 : 0) : days;
  if (counted <= 0) throw new AttendanceProblem("These dates are all days without school (Sundays, days off or School Calendar holidays), so no leave is needed.", "from");
  const quota = await quotaFor(tx, ctx, input.studentId, type.id, input.from, opts);
  const overQuota = quota ? counted > quota.left : false;
  const settings = await attendanceSettings(tx, ctx);
  const classTeacherMay = access.classSections.includes(where.section.id) && counted <= settings.classTeacherLeaveDays && !(overQuota && settings.quotaOverNeedsApproval);
  const mayDecide = access.full || classTeacherMay;
  return { type, where, student, days: counted, quota, overQuota, mayDecide, settings };
}

/** Records a student's leave. Approved at once when the recorder may decide and chose to; otherwise sent to Approvals. */
export async function recordStudentLeave(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: StudentLeaveInput) {
  const c = await checkStudentLeave(tx, ctx, access, input);
  const request = await tx.leaveRequest.create({
    data: {
      schoolId: ctx.schoolId, academicYearId: c.where.year.id, studentId: input.studentId, leaveTypeId: c.type.id,
      fromDate: input.from, toDate: input.to, halfDay: input.halfDay, days: c.days, reason: input.reason.trim(),
      documentFileId: input.documentFileId, recordedById: ctx.userId,
    },
  });
  const dates = isoDay(input.from) === isoDay(input.to) ? dayText(input.from) : `${dayText(input.from)} to ${dayText(input.to)}`;
  const summary = `${c.type.name} leave: ${c.student.fullName} (${c.where.sectionName}), ${dates} (${daysText(c.days)})${c.overQuota ? ", over the quota" : ""}`;
  await writeAudit(tx, ctx, {
    action: "created", recordType: "Leave Request", recordId: request.id,
    after: { student: c.student.fullName, class: c.where.sectionName, type: c.type.name, from: isoDay(input.from), to: isoDay(input.to), days: c.days, halfDay: input.halfDay, overQuota: c.overQuota },
  });

  if (input.approveNow && c.mayDecide) {
    await tx.leaveRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: "Approved when recorded" } });
    await writeAudit(tx, ctx, { action: "leave-approve", recordType: "Leave Request", recordId: request.id, before: { status: "WAITING" }, after: { status: "APPROVED", note: "Approved when recorded" } });
    // Days already saved become Leave; half-day absences take their reason from the leave (absence reasons).
    await onApproved(tx, ctx, request);
    return { request, approved: true, summary, quota: c.quota, overQuota: c.overQuota };
  }

  // Who decides: the class teacher up to their limit, otherwise the principal.
  const classTeacherLogin = c.where.section?.classTeacherId ? (await tx.staff.findUnique({ where: { id: c.where.section.classTeacherId }, select: { userLoginId: true } }))?.userLoginId ?? null : null;
  const withinLimit = c.days <= c.settings.classTeacherLeaveDays && !(c.overQuota && c.settings.quotaOverNeedsApproval);
  let firstApproverId: string | null = null;
  if (withinLimit && classTeacherLogin && classTeacherLogin !== ctx.userId) firstApproverId = classTeacherLogin;
  else {
    const principal = await tx.schoolAccess.findFirst({
      where: { schoolId: ctx.schoolId, archivedAt: null, userLoginId: { not: ctx.userId ?? undefined }, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: "principal", isEnabled: true, archivedAt: null } } } },
      orderBy: { createdAt: "asc" }, select: { userLoginId: true },
    });
    firstApproverId = principal?.userLoginId ?? null;
  }
  const approval = await requestApproval(tx, ctx, { type: "student-leave", recordType: "Leave Request", recordId: request.id, summary, reason: input.reason.trim(), firstApproverId });
  await tx.leaveRequest.update({ where: { id: request.id }, data: { approvalId: approval.id } });
  return { request, approved: false, summary, quota: c.quota, overQuota: c.overQuota };
}

/** What happens to a student leave when its approval is decided (listed in src/lib/approval-handlers.ts). */
export async function onStudentLeaveDecision(tx: Tx, ctx: SchoolContext, approval: { id: string }, decision: Decision, note: string | null) {
  const rows = await tx.leaveRequest.findMany({ where: { approvalId: approval.id, status: "WAITING", archivedAt: null, studentId: { not: null } } });
  for (const r of rows) {
    const status = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "CANCELLED" : "REJECTED";
    await tx.leaveRequest.update({ where: { id: r.id }, data: { status, decidedById: decision === "withdraw" ? null : ctx.userId, decidedAt: new Date(), decisionReason: note } });
    await writeAudit(tx, ctx, { action: `leave-${decision}`, recordType: "Leave Request", recordId: r.id, before: { status: r.status }, after: { status, note } });
    if (decision === "approve") {
      await onApproved(tx, ctx, r);
      await tellClassTeacher(tx, ctx, r);
    }
  }
}

/**
 * Approved full-day leave for days already saved (workflow 6 step 5): those
 * marks become Leave at once, so Take Attendance, the register and every %
 * agree, and they count as leave, not as present or absent (browser finding
 * TEACHING-02). Audited with the marks they had. A half day keeps its mark
 * (the other half of the day was attended or missed). A4 runs for those days
 * so a flag the absences raised can clear; no message goes for them.
 */
export async function studentMarksToLeave(tx: Tx, ctx: SchoolContext, r: Pick<LeaveRequest, "id" | "studentId" | "fromDate" | "toDate" | "halfDay">) {
  if (r.halfDay || !r.studentId) return 0;
  const marks = await tx.attendanceMark.findMany({
    where: { studentId: r.studentId, archivedAt: null, date: { gte: r.fromDate, lte: r.toDate }, statusKey: { not: "leave" } },
    orderBy: [{ date: "asc" }, { periodNo: "asc" }], select: { id: true, date: true, periodNo: true, statusKey: true, sectionId: true },
  });
  if (!marks.length) return 0;
  await tx.attendanceMark.updateMany({ where: { id: { in: marks.map((m) => m.id) } }, data: { statusKey: "leave", leaveRequestId: r.id, absenceReason: null, absenceNote: null, reasonSource: null } });
  const student = await tx.student.findUnique({ where: { id: r.studentId }, select: { fullName: true } });
  await writeAudit(tx, ctx, {
    action: "student-attendance-leave-approved", recordType: "Attendance Mark", recordId: r.id,
    before: marks.map((m) => ({ student: student?.fullName ?? null, date: isoDay(m.date), period: m.periodNo || null, status: m.statusKey })) as unknown as Prisma.InputJsonValue,
    after: { student: student?.fullName ?? null, leaveRequestId: r.id, status: "leave", dates: [...new Set(marks.map((m) => isoDay(m.date)))] },
  });
  const targets = marks.filter((m) => m.sectionId).map((m) => ({ sectionId: m.sectionId!, date: m.date }));
  await queueAfterSave(tx, ctx, await attendanceSettings(tx, ctx), targets, new Date(), { messages: false });
  return marks.length;
}

/** What approving a student's leave does to attendance: saved days become Leave; half-day absences take their reason from it. */
async function onApproved(tx: Tx, ctx: SchoolContext, r: Pick<LeaveRequest, "id" | "studentId" | "fromDate" | "toDate" | "halfDay">) {
  await studentMarksToLeave(tx, ctx, r);
  await fillReasonsFromLeave(tx, ctx, r.id);
}

/** The class teacher hears of approved leave in their section, so Take Attendance makes sense. */
async function tellClassTeacher(tx: Tx, ctx: SchoolContext, r: LeaveRequest) {
  const where = await enrolmentOn(tx, r.studentId!, r.fromDate);
  const teacher = where?.section?.classTeacherId ? await tx.staff.findUnique({ where: { id: where.section.classTeacherId }, select: { userLoginId: true } }) : null;
  if (!teacher?.userLoginId) return;
  const student = where!.enrolment.student.fullName;
  await notify(tx, ctx, { to: teacher.userLoginId, type: "student-leave", text: `Leave approved: ${student}, ${dayText(r.fromDate)}${isoDay(r.fromDate) !== isoDay(r.toDate) ? ` to ${dayText(r.toDate)}` : ""}. It shows as Leave in Take Attendance.`, link: `${BASE}/student-leave?status=APPROVED` });
}

/** May this person decide this student's leave? Full reach, or the class teacher within their limit. */
export async function canDecideStudentLeave(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, r: LeaveRequest) {
  if (r.status !== "WAITING" || r.recordedById === ctx.userId && !access.full) return false;
  if (access.full) return onCampus(tx, access, r.studentId);
  const where = await enrolmentOn(tx, r.studentId!, r.fromDate);
  if (!where?.section || !access.classSections.includes(where.section.id)) return false;
  const settings = await attendanceSettings(tx, ctx);
  if (num(r.days) > settings.classTeacherLeaveDays) return false;
  if (settings.quotaOverNeedsApproval) {
    const q = await quotaFor(tx, ctx, r.studentId!, r.leaveTypeId, r.fromDate, { ignoreRequestId: r.id });
    if (q && num(r.days) > q.left) return false;
  }
  return true;
}

/**
 * Approves or rejects from the Student Leave page. Goes through the shared
 * Approvals decision when there is one, so the request leaves everyone's list.
 */
export async function decideStudentLeave(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, requestId: string, decision: "approve" | "reject", note: string | null) {
  const r = await tx.leaveRequest.findFirst({ where: { id: requestId, studentId: { not: null }, archivedAt: null } });
  if (!r || !(await onCampus(tx, access, r.studentId))) throw new AttendanceProblem("This leave was not found.");
  if (r.status !== "WAITING") throw new AttendanceProblem("This leave was already decided.");
  if (decision === "reject" && (!note || note.trim().length < 5)) throw new AttendanceProblem("Give a reason of at least 5 characters, so the parent can be told why.", "note");
  if (r.approvalId) {
    const approval = await tx.approval.findUnique({ where: { id: r.approvalId } });
    if (approval && ["WAITING", "ESCALATED"].includes(approval.status)) {
      const direct = await canDecideStudentLeave(tx, ctx, access, r);
      if (!direct) throw new AttendanceProblem("This leave is waiting for someone else to decide.");
      if (approval.askedById === ctx.userId) throw new AttendanceProblem("You recorded this leave, so someone else decides it.");
      // Make the approval this person's to decide, then decide it the shared way.
      await tx.approval.update({ where: { id: approval.id }, data: { currentApproverId: ctx.userId, currentApproverRole: null } });
      await decide(tx, ctx, approval.id, decision, note?.trim() || null);
      return;
    }
  }
  if (!(await canDecideStudentLeave(tx, ctx, access, r))) throw new AttendanceProblem("This leave is waiting for someone else to decide.");
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  await tx.leaveRequest.update({ where: { id: r.id }, data: { status, decidedById: ctx.userId, decidedAt: new Date(), decisionReason: note?.trim() || null } });
  await writeAudit(tx, ctx, { action: `leave-${decision}`, recordType: "Leave Request", recordId: r.id, before: { status: r.status }, after: { status, note } });
  if (status === "APPROVED") await onApproved(tx, ctx, r);
}

/** Cancels a student's leave with a reason. Days already taken stay on record; Take Attendance stops showing Leave for later days. */
export async function cancelStudentLeave(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, requestId: string, reason: string) {
  const r = await tx.leaveRequest.findFirst({ where: { id: requestId, studentId: { not: null }, archivedAt: null } });
  if (!r || !(await onCampus(tx, access, r.studentId))) throw new AttendanceProblem("This leave was not found.");
  if (r.status === "CANCELLED" || r.status === "REJECTED") throw new AttendanceProblem("This leave is already closed.");
  if (reason.trim().length < 3) throw new AttendanceProblem("Give a short reason for cancelling.", "reason");
  if (access.studentLeave === "none" || access.change === "none") throw new NotYoursError("this student");
  if (access.studentLeave === "own") {
    const where = await enrolmentOn(tx, r.studentId!, r.fromDate);
    if (!where?.section || !access.classSections.includes(where.section.id)) throw new NotYoursError("this student");
  }
  if (r.academicYearId) await assertYearOpen(tx, r.academicYearId);
  if (r.approvalId) {
    const approval = await tx.approval.findUnique({ where: { id: r.approvalId } });
    if (approval && ["WAITING", "ESCALATED"].includes(approval.status)) {
      const history = [...((approval.history as object[]) ?? []), { at: new Date().toISOString(), by: ctx.userId, action: "withdraw", note: reason }];
      await tx.approval.update({ where: { id: approval.id }, data: { status: "WITHDRAWN", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: reason, history } });
      await tx.notification.updateMany({ where: { link: `/approvals/${approval.id}`, doneAt: null }, data: { doneAt: new Date() } });
    }
  }
  await tx.leaveRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decisionReason: reason.trim(), decidedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "leave-cancelled", recordType: "Leave Request", recordId: r.id, before: { status: r.status }, after: { status: "CANCELLED", reason } });
  if (r.status === "APPROVED") await undoReasonsFromLeave(tx, ctx, r);
}
