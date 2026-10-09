// Behaviour & Counselling (03 §2). Incidents, warnings, suspensions and
// rewards for one or more students; points (optional); counselling cases with
// confidential notes seen only by the Counsellor role; career guidance.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { currentYear, assertYearOpen } from "../academic/years";
import { decryptField, encryptField } from "../crypto";
import { getStudentSettings } from "./settings";
import { StudentProblem } from "./students";
import { BEHAVIOUR_KIND_LABEL, type BehaviourKind } from "./labels";

export type NewIncident = {
  studentIds: string[];
  typeKey: string;
  description: string;
  date: Date;
  actionTaken?: string | null;
  informParent?: boolean;
  points?: number | null;
  suspensionFrom?: Date | null;
  suspensionTo?: Date | null;
  approvedBy?: string | null;
  photoFileId?: string | null;
};

export async function reportIncident(tx: Tx, ctx: SchoolContext, input: NewIncident) {
  const settings = await getStudentSettings(tx, ctx);
  const type = settings.incidentTypes.find((t) => t.key === input.typeKey);
  if (!type) throw new StudentProblem("Choose the type.", "typeKey");
  const ids = [...new Set(input.studentIds)];
  if (ids.length === 0) throw new StudentProblem("Choose at least one student.", "studentIds");
  if (input.description.trim().length < 3) throw new StudentProblem("Write what happened, in a few words.", "description");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if (input.date > today) throw new StudentProblem("The date cannot be in the future.", "date");
  if (type.kind === "suspension") {
    if (!input.suspensionFrom || !input.suspensionTo) throw new StudentProblem("A suspension needs a from date and a to date.", "suspensionFrom");
    if (input.suspensionTo < input.suspensionFrom) throw new StudentProblem("The to date is before the from date.", "suspensionTo");
    if (!input.approvedBy?.trim()) throw new StudentProblem("Say who approved the suspension.", "approvedBy");
  }
  const year = await currentYear(tx, ctx);
  if (!year) throw new StudentProblem("No academic year is open. Open one in Academic Management.");
  await assertYearOpen(tx, year.id);

  const incident = await tx.behaviourIncident.create({
    data: {
      schoolId: ctx.schoolId,
      academicYearId: year.id,
      typeKey: type.key,
      kind: type.kind,
      date: input.date,
      description: input.description.trim(),
      actionTaken: input.actionTaken?.trim() || null,
      suspensionFrom: type.kind === "suspension" ? input.suspensionFrom : null,
      suspensionTo: type.kind === "suspension" ? input.suspensionTo : null,
      approvedBy: type.kind === "suspension" ? input.approvedBy?.trim() : null,
      photoFileId: input.photoFileId ?? null,
      parentInformed: Boolean(input.informParent),
      status: type.kind === "reward" || type.kind === "recognition" ? "CLOSED" : "OPEN",
      reportedById: ctx.userId,
      students: { create: ids.map((studentId) => ({ schoolId: ctx.schoolId, studentId })) },
    },
  });
  const points = settings.pointsOn ? (input.points ?? type.points) : 0;
  if (points) {
    for (const studentId of ids) {
      await tx.behaviourPointEntry.create({ data: { schoolId: ctx.schoolId, studentId, points, reason: type.label, incidentId: incident.id, createdById: ctx.userId } });
    }
  }
  if (input.informParent) {
    // messaging: tell the primary contact of each student in `ids` about this
    // incident with the school's "behaviour-incident" template (11 Communication's sendMessage).
  }
  await writeAudit(tx, ctx, {
    action: "created",
    recordType: "Behaviour Incident",
    recordId: incident.id,
    after: { kind: type.kind, type: type.label, students: ids.length, points, informParent: Boolean(input.informParent) },
  });
  return incident;
}

export async function closeIncident(tx: Tx, ctx: SchoolContext, incidentId: string, actionTaken: string | null) {
  const inc = await tx.behaviourIncident.findFirst({ where: { id: incidentId, archivedAt: null } });
  if (!inc) throw new StudentProblem("This record was not found.");
  await tx.behaviourIncident.update({ where: { id: incidentId }, data: { status: inc.status === "OPEN" ? "CLOSED" : "OPEN", actionTaken: actionTaken ?? inc.actionTaken } });
  await writeAudit(tx, ctx, { action: inc.status === "OPEN" ? "closed" : "reopened", recordType: "Behaviour Incident", recordId: incidentId, before: { status: inc.status, actionTaken: inc.actionTaken }, after: { status: inc.status === "OPEN" ? "CLOSED" : "OPEN", actionTaken: actionTaken ?? inc.actionTaken } });
}

export async function archiveIncident(tx: Tx, ctx: SchoolContext, incidentId: string) {
  const inc = await tx.behaviourIncident.findFirst({ where: { id: incidentId, archivedAt: null } });
  if (!inc) throw new StudentProblem("This record was already archived.");
  await tx.behaviourIncident.update({ where: { id: incidentId }, data: { archivedAt: new Date() } });
  // Points that came from it are reversed, not deleted.
  const entries = await tx.behaviourPointEntry.findMany({ where: { incidentId } });
  for (const e of entries) {
    await tx.behaviourPointEntry.create({ data: { schoolId: ctx.schoolId, studentId: e.studentId, points: -e.points, reason: `Reversed: ${e.reason} (record archived)`, incidentId, createdById: ctx.userId } });
  }
  await writeAudit(tx, ctx, { action: "archived", recordType: "Behaviour Incident", recordId: incidentId, before: { status: inc.status }, after: { pointsReversed: entries.length } });
}

/** Add or remove behaviour points with a reason (optional). */
export async function adjustPoints(tx: Tx, ctx: SchoolContext, studentId: string, points: number, reason: string) {
  const settings = await getStudentSettings(tx, ctx);
  if (!settings.pointsOn) throw new StudentProblem("Behaviour points are switched off (Student Settings, Behaviour).");
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100) throw new StudentProblem("Points must be a whole number from -100 to 100, not 0.", "points");
  if (reason.trim().length < 3) throw new StudentProblem("Give a reason.", "reason");
  const row = await tx.behaviourPointEntry.create({ data: { schoolId: ctx.schoolId, studentId, points, reason: reason.trim(), createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "points-adjusted", recordType: "Student", recordId: studentId, after: { points, reason: reason.trim() } });
  return row;
}

export async function pointsTotal(tx: Tx, studentId: string) {
  const sum = await tx.behaviourPointEntry.aggregate({ where: { studentId }, _sum: { points: true } });
  return sum._sum.points ?? 0;
}

export const kindLabel = (k: string) => BEHAVIOUR_KIND_LABEL[k as BehaviourKind] ?? k;

// ---- Counselling (optional, highly restricted) ------------------------------

/** People who hold the Counsellor role (enabled) in this school. */
export async function counsellors(tx: Tx, ctx: SchoolContext) {
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: "counsellor", isEnabled: true, archivedAt: null } } } },
    include: { userLogin: { select: { id: true, displayName: true } } },
  });
  return rows.map((r) => r.userLogin);
}

/** Refer to counselling: opens a case and tells the counsellor. */
export async function referToCounselling(tx: Tx, ctx: SchoolContext, input: { studentId: string; reason: string; counsellorId?: string | null; incidentId?: string | null }) {
  const settings = await getStudentSettings(tx, ctx);
  if (!settings.counsellingOn) throw new StudentProblem("Counselling is switched off (Student Settings, Behaviour).");
  if (input.reason.trim().length < 5) throw new StudentProblem("Say why, in at least 5 characters.", "reason");
  const open = await tx.counsellingCase.findFirst({ where: { studentId: input.studentId, status: "OPEN", archivedAt: null } });
  if (open) throw new StudentProblem("This student already has an open counselling case. Add a session to it instead.");
  const all = await counsellors(tx, ctx);
  const counsellorId = input.counsellorId && all.some((c) => c.id === input.counsellorId) ? input.counsellorId : all[0]?.id ?? null;
  const student = await tx.student.findUniqueOrThrow({ where: { id: input.studentId }, select: { fullName: true } });
  const c = await tx.counsellingCase.create({
    data: {
      schoolId: ctx.schoolId, studentId: input.studentId, counsellorId, reason: input.reason.trim(), referredById: ctx.userId,
      incidentId: input.incidentId ?? null, openedOn: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
    },
  });
  if (counsellorId) {
    await notify(tx, ctx, { to: counsellorId, type: "counselling-referral", text: `New counselling referral: ${student.fullName}`, link: `/student-management/behaviour/counselling/${c.id}` });
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Counselling Case", recordId: c.id, after: { studentId: input.studentId, counsellorId } });
  return c;
}

export async function saveCase(tx: Tx, ctx: SchoolContext, caseId: string, p: { actionPlan: string | null; outsideReferral: string | null; nextSessionOn: Date | null; counsellorId: string | null; status: "OPEN" | "CLOSED" }) {
  const before = await tx.counsellingCase.findFirst({ where: { id: caseId, archivedAt: null } });
  if (!before) throw new StudentProblem("This case was not found.");
  await tx.counsellingCase.update({
    where: { id: caseId },
    data: { ...p, closedOn: p.status === "CLOSED" ? before.closedOn ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") : null },
  });
  // Plans and referrals are counselling details: the audit says what changed, not what was written.
  await writeAudit(tx, ctx, { action: "changed", recordType: "Counselling Case", recordId: caseId, before: { status: before.status, counsellorId: before.counsellorId }, after: { status: p.status, counsellorId: p.counsellorId, planChanged: p.actionPlan !== before.actionPlan, referralChanged: p.outsideReferral !== before.outsideReferral } });
}

export async function addSession(tx: Tx, ctx: SchoolContext, caseId: string, s: { date: Date; summary: string; confidential: string | null; followUpOn: Date | null }, mayWriteConfidential: boolean) {
  const c = await tx.counsellingCase.findFirst({ where: { id: caseId, archivedAt: null } });
  if (!c) throw new StudentProblem("This case was not found.");
  if (c.status === "CLOSED") throw new StudentProblem("This case is closed. Reopen it to add a session.");
  if (s.summary.trim().length < 3) throw new StudentProblem("Write what was done in the session.", "summary");
  if (s.confidential && !mayWriteConfidential) throw new StudentProblem("Only the Counsellor can write confidential notes.", "confidential");
  const row = await tx.counsellingSession.create({
    data: { schoolId: ctx.schoolId, caseId, date: s.date, summary: s.summary.trim(), confidentialEnc: s.confidential?.trim() ? encryptField(s.confidential.trim()) : null, followUpOn: s.followUpOn, createdById: ctx.userId },
  });
  await tx.counsellingCase.update({ where: { id: caseId }, data: { nextSessionOn: s.followUpOn ?? c.nextSessionOn } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Counselling Session", recordId: row.id, after: { caseId, date: s.date.toISOString().slice(0, 10), confidential: Boolean(row.confidentialEnc) } });
  return row;
}

/** Confidential notes, readable only by the Counsellor role. */
export function readConfidential(enc: string | null, mayRead: boolean) {
  if (!enc || !mayRead) return null;
  try {
    return decryptField(enc);
  } catch {
    return null;
  }
}

// ---- Career guidance (optional, secondary schools) --------------------------

export async function addCareerRecord(tx: Tx, ctx: SchoolContext, r: { studentId: string; kind: string; title: string; details: string | null; college: string | null; course: string | null; status: string | null; deadline: Date | null }) {
  const settings = await getStudentSettings(tx, ctx);
  if (!settings.careerOn) throw new StudentProblem("Career guidance is switched off (Student Settings, Behaviour).");
  if (r.title.trim().length < 2) throw new StudentProblem("Give a title.", "title");
  const row = await tx.careerRecord.create({ data: { schoolId: ctx.schoolId, ...r, title: r.title.trim(), createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Career Record", recordId: row.id, after: { kind: r.kind, title: r.title, status: r.status } });
  return row;
}

export async function updateApplicationStatus(tx: Tx, ctx: SchoolContext, id: string, status: string) {
  const before = await tx.careerRecord.findFirst({ where: { id, archivedAt: null } });
  if (!before) throw new StudentProblem("This record was not found.");
  await tx.careerRecord.update({ where: { id }, data: { status } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Career Record", recordId: id, before: { status: before.status }, after: { status } });
}
