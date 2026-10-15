// Leaving & Alumni (automation A14, workflow 12). A leaving request runs the
// clearance checks other modules register (src/lib/students/clearance.ts).
// A pending check can be waived only through Approvals, with a reason. The
// student's status changes to Transferred, Withdrawn or Graduated on the
// last date; the record stays (rule 21).
import "server-only";

import type { LeavingType } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { formatRupees } from "../format";
import { runClearanceChecks } from "./clearance";
// Each module's clearance check registers itself when imported.
import "../fees/clearance";
import "../library/clearance";
import "../hostel/clearance";
import { applyStatus, StudentProblem } from "./students";
import { STUDYING, type StudentStatusKey } from "./labels";

const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

export async function startLeaving(tx: Tx, ctx: SchoolContext, input: { studentId: string; type: LeavingType; reason: string; lastDate: Date; destinationSchool: string | null; documentFileIds?: string[] }) {
  const student = await tx.student.findFirst({ where: { id: input.studentId, archivedAt: null } });
  if (!student) throw new StudentProblem("Choose the student.", "studentId");
  if (!STUDYING.includes(student.status as StudentStatusKey) && student.status !== "INACTIVE") {
    throw new StudentProblem(`${student.fullName} is not studying here now (status: ${student.status.toLowerCase()}).`, "studentId");
  }
  const open = await tx.leavingRequest.findFirst({ where: { studentId: input.studentId, status: "IN_PROGRESS" } });
  if (open) throw new StudentProblem(`${student.fullName} already has a leaving request in progress.`, "studentId");
  if (input.reason.trim().length < 3) throw new StudentProblem("Choose or write the reason.", "reason");
  if (input.type === "TRANSFER" && !input.destinationSchool?.trim()) throw new StudentProblem("For a transfer, write the school the student is going to.", "destinationSchool");
  const req = await tx.leavingRequest.create({
    data: {
      schoolId: ctx.schoolId, studentId: input.studentId, type: input.type, reason: input.reason.trim(), lastDate: input.lastDate,
      destinationSchool: input.destinationSchool?.trim() || null, documentFileIds: input.documentFileIds ?? [], previousStatus: student.status, createdById: ctx.userId,
    },
  });
  await refreshClearance(tx, ctx, req.id);
  await writeAudit(tx, ctx, { action: "created", recordType: "Leaving Request", recordId: req.id, after: { studentId: input.studentId, type: input.type, reason: input.reason, lastDate: input.lastDate.toISOString().slice(0, 10) } });
  return req;
}

/** Runs the clearance checks again; waived checks stay waived, asked waivers stay asked. */
export async function refreshClearance(tx: Tx, ctx: SchoolContext, leavingRequestId: string) {
  const req = await tx.leavingRequest.findUniqueOrThrow({ where: { id: leavingRequestId }, include: { checks: true } });
  const results = await runClearanceChecks(tx, ctx, req.studentId);
  for (const r of results) {
    const existing = req.checks.find((c) => c.name === r.name);
    const keep = existing && (existing.status === "WAIVED" || (existing.status === "WAIVER_ASKED" && !r.clear));
    const status = keep ? existing.status : r.clear ? "CLEAR" : "PENDING";
    const data = { status, detail: r.detail, amountPaise: r.amountPaise ?? null, actionHref: r.actionHref ?? null, actionLabel: r.actionLabel ?? null, checkedAt: new Date() };
    if (existing) await tx.studentClearanceCheck.update({ where: { id: existing.id }, data });
    else await tx.studentClearanceCheck.create({ data: { schoolId: ctx.schoolId, leavingRequestId, name: r.name, ...data } });
  }
  return tx.studentClearanceCheck.findMany({ where: { leavingRequestId }, orderBy: { name: "asc" } });
}

export function isCleared(checks: { status: string }[]) {
  return checks.every((c) => c.status === "CLEAR" || c.status === "WAIVED");
}

/** "TC blocked: ₹4,500 fees due and 1 library book not returned", or null when the TC may be issued. */
export function blockMessage(checks: { name: string; status: string; detail: string }[]) {
  const pending = checks.filter((c) => c.status === "PENDING" || c.status === "WAIVER_ASKED");
  if (pending.length === 0) return null;
  const words = pending.map((c) => c.detail.charAt(0).toLowerCase() + c.detail.slice(1));
  const joined = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `TC blocked: ${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

/** A pending check waived only by someone allowed to approve it, with a reason, through Approvals. */
export async function askWaiver(tx: Tx, ctx: SchoolContext, checkId: string, reason: string) {
  if (reason.trim().length < 5) throw new StudentProblem("Give a reason of at least 5 characters.", "reason");
  const check = await tx.studentClearanceCheck.findUnique({ where: { id: checkId }, include: { request: true } });
  if (!check || check.request.status !== "IN_PROGRESS" && check.request.status !== "LEFT") throw new StudentProblem("This check was not found.");
  if (check.status !== "PENDING") throw new StudentProblem(check.status === "WAIVER_ASKED" ? "A waiver for this check is already waiting in Approvals." : "This check is already clear.");
  const student = await tx.student.findUniqueOrThrow({ where: { id: check.request.studentId } });
  const approval = await requestApproval(tx, ctx, {
    type: "clearance-waiver",
    recordType: "Clearance Check",
    recordId: check.id,
    summary: `Waive ${check.name} clearance for ${student.fullName} (${student.admissionNo}): ${check.detail}`,
    amountPaise: check.amountPaise,
    reason: reason.trim(),
  });
  await tx.studentClearanceCheck.update({ where: { id: check.id }, data: { status: "WAIVER_ASKED", waiverReason: reason.trim(), approvalId: approval.id } });
  return approval;
}

/** Approvals calls this when a waiver is decided. */
export async function waiverDecided(tx: Tx, ctx: SchoolContext, checkId: string, approved: boolean, note: string | null) {
  const check = await tx.studentClearanceCheck.findUnique({ where: { id: checkId } });
  if (!check) return;
  await tx.studentClearanceCheck.update({ where: { id: checkId }, data: { status: approved ? "WAIVED" : "PENDING" } });
  await writeAudit(tx, ctx, { action: approved ? "clearance-waived" : "clearance-waiver-refused", recordType: "Clearance Check", recordId: checkId, before: { status: check.status }, after: { status: approved ? "WAIVED" : "PENDING", note, amount: check.amountPaise ? formatRupees(check.amountPaise) : null } });
}

/** On the last date: the student's status changes and the year's enrolment is marked left. */
export async function completeLeaving(tx: Tx, ctx: SchoolContext, leavingRequestId: string, on: Date = today()) {
  const req = await tx.leavingRequest.findUniqueOrThrow({ where: { id: leavingRequestId } });
  if (req.status !== "IN_PROGRESS") throw new StudentProblem("This leaving request is not in progress.");
  if (req.lastDate > on) throw new StudentProblem("The last date has not come yet. The status changes on the last date.");
  const to = req.type === "TRANSFER" ? "TRANSFERRED" : req.type === "GRADUATION" ? "GRADUATED" : "WITHDRAWN";
  await applyStatus(tx, ctx, req.studentId, to, req.lastDate, req.reason, `leaving:${req.id}`, { leavingDate: req.lastDate, leavingReason: req.reason });
  const years = await tx.academicYear.findMany({ where: { startDate: { lte: req.lastDate } }, select: { id: true } });
  await tx.enrolment.updateMany({ where: { studentId: req.studentId, status: "STUDYING", archivedAt: null, academicYearId: { in: years.map((y) => y.id) } }, data: { status: "LEFT" } });
  await tx.leavingRequest.update({ where: { id: req.id }, data: { status: "LEFT", leftOn: req.lastDate } });
  await writeAudit(tx, ctx, { action: "left", recordType: "Leaving Request", recordId: req.id, after: { status: to, lastDate: req.lastDate.toISOString().slice(0, 10) } });
}

/** The family changed its mind: cancel before the TC is issued; the student stays active. */
export async function cancelLeaving(tx: Tx, ctx: SchoolContext, leavingRequestId: string, reason: string) {
  if (reason.trim().length < 5) throw new StudentProblem("Give a reason of at least 5 characters.", "reason");
  const req = await tx.leavingRequest.findUniqueOrThrow({ where: { id: leavingRequestId } });
  if (req.status !== "IN_PROGRESS") throw new StudentProblem("Only a leaving request in progress can be cancelled.");
  const tc = await tx.certificate.findFirst({ where: { leavingRequestId, type: "TC", status: "ISSUED" } });
  if (tc) throw new StudentProblem(`A TC (${tc.number}) was already issued. Cancel the TC first, with a reason.`);
  await tx.certificate.updateMany({ where: { leavingRequestId, status: { in: ["REQUESTED", "APPROVED"] } }, data: { status: "CANCELLED", cancelReason: "Leaving request cancelled" } });
  await tx.leavingRequest.update({ where: { id: req.id }, data: { status: "CANCELLED", cancelReason: reason.trim() } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Leaving Request", recordId: req.id, before: { status: "IN_PROGRESS" }, after: { status: "CANCELLED", reason: reason.trim() } });
}

/** Runs every day: leaving requests whose last date has come complete by themselves. Safe to run twice. */
export async function completeDueLeaving(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const due = await tx.leavingRequest.findMany({ where: { status: "IN_PROGRESS", lastDate: { lte: now } } });
  for (const r of due) await completeLeaving(tx, ctx, r.id, now);
  return due.length;
}

/** Graduated students become alumni (Leaving & Alumni). */
export async function markAlumni(tx: Tx, ctx: SchoolContext, studentIds: string[]) {
  let done = 0;
  for (const id of studentIds) {
    const s = await tx.student.findFirst({ where: { id, status: "GRADUATED" } });
    if (!s) continue;
    const lastEnr = await tx.enrolment.findFirst({ where: { studentId: id, archivedAt: null }, orderBy: { createdAt: "desc" }, include: { student: false } });
    const year = lastEnr ? await tx.academicYear.findUnique({ where: { id: lastEnr.academicYearId } }) : null;
    await applyStatus(tx, ctx, id, "ALUMNI", today(), "Marked as alumni", "alumni");
    const guardianPhone = (await tx.studentGuardian.findFirst({ where: { studentId: id, isPrimary: true, archivedAt: null }, include: { guardian: true } }))?.guardian.phone ?? null;
    await tx.alumniRecord.upsert({
      where: { studentId: id },
      create: { schoolId: ctx.schoolId, studentId: id, graduationYear: year?.name ?? String((s.leavingDate ?? today()).getUTCFullYear()), phone: guardianPhone, createdById: ctx.userId },
      update: { archivedAt: null },
    });
    done++;
  }
  if (done) await writeAudit(tx, ctx, { action: "alumni-marked", recordType: "Alumni Record", recordId: null, after: { students: done } });
  return done;
}

export async function saveAlumni(tx: Tx, ctx: SchoolContext, id: string, a: { phone: string | null; email: string | null; career: string | null; higherEducation: string | null; achievements: string | null; isMentor: boolean }) {
  const before = await tx.alumniRecord.findFirst({ where: { id, archivedAt: null } });
  if (!before) throw new StudentProblem("This alumni record was not found.");
  await tx.alumniRecord.update({ where: { id }, data: a });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Alumni Record", recordId: id, before: { phone: before.phone, email: before.email, career: before.career, higherEducation: before.higherEducation, achievements: before.achievements, isMentor: before.isMentor }, after: a });
}

export async function addDonation(tx: Tx, ctx: SchoolContext, d: { alumniId: string; amountPaise: bigint; date: Date; purpose: string; receiptRef: string | null }) {
  if (d.amountPaise <= BigInt(0)) throw new StudentProblem("Amount must be more than ₹0.", "amount");
  const row = await tx.alumniDonation.create({ data: { schoolId: ctx.schoolId, ...d, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Alumni Donation", recordId: row.id, after: { alumniId: d.alumniId, amount: formatRupees(d.amountPaise), purpose: d.purpose } });
  return row;
}

export async function linkMentor(tx: Tx, ctx: SchoolContext, alumniId: string, studentId: string, note: string | null) {
  const a = await tx.alumniRecord.findFirst({ where: { id: alumniId, archivedAt: null } });
  if (!a) throw new StudentProblem("Choose the alumnus.", "alumniId");
  const existing = await tx.alumniMentorship.findUnique({ where: { alumniId_studentId: { alumniId, studentId } } });
  if (existing && !existing.archivedAt) throw new StudentProblem("This mentor is already linked to the student.");
  const row = existing
    ? await tx.alumniMentorship.update({ where: { id: existing.id }, data: { archivedAt: null, note } })
    : await tx.alumniMentorship.create({ data: { schoolId: ctx.schoolId, alumniId, studentId, note, createdById: ctx.userId } });
  if (!a.isMentor) await tx.alumniRecord.update({ where: { id: alumniId }, data: { isMentor: true } });
  await writeAudit(tx, ctx, { action: "mentor-linked", recordType: "Alumni Mentorship", recordId: row.id, after: { alumniId, studentId } });
  return row;
}

export async function postJob(tx: Tx, ctx: SchoolContext, j: { title: string; organisation: string; location: string | null; description: string; contact: string; applyBy: Date | null }) {
  const row = await tx.jobPost.create({ data: { schoolId: ctx.schoolId, ...j, postedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Job Post", recordId: row.id, after: { title: j.title, organisation: j.organisation } });
  return row;
}
