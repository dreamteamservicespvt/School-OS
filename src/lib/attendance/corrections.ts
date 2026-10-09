// Attendance corrections (05 §2 Attendance Register, rule 17): after the lock
// a change goes to Approvals. When approved the marks change; the audit log
// keeps the original. Offline saves that arrive second or late become
// corrections too (08-platform-security.md §10).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval, type Decision } from "../approvals";
import { formatDate } from "../format";
import { isoDay } from "../staff/dates";
import { AttendanceProblem, NotYoursError, type AttendanceAccess } from "./access";
import { statusList } from "./settings";

export type CorrectionEntry = { id: string; name: string; from: string | null; to: string; note: string | null };

const dayText = (d: Date) => formatDate(d, "UTC");

export async function createCorrection(tx: Tx, ctx: SchoolContext, input: {
  forWhom: "student" | "staff"; sectionId: string | null; sectionName: string | null; date: Date; periodNo: number;
  kind: "manual" | "offline-conflict" | "offline-late"; entries: CorrectionEntry[]; reason: string; versions: Prisma.InputJsonValue | null;
}) {
  const correction = await tx.attendanceCorrection.create({
    data: {
      schoolId: ctx.schoolId, forWhom: input.forWhom, sectionId: input.sectionId, date: input.date, periodNo: input.periodNo,
      entries: input.entries as unknown as Prisma.InputJsonValue, reason: input.reason, kind: input.kind, versions: input.versions ?? undefined, requestedById: ctx.userId,
    },
  });
  const who = input.entries.length === 1 ? input.entries[0].name : `${input.entries.length} ${input.forWhom === "staff" ? "staff" : "students"}`;
  const where = input.sectionName ? `${input.sectionName}, ` : "";
  const summary = `Attendance correction: ${where}${dayText(input.date)}${input.periodNo ? ` period ${input.periodNo}` : ""} (${who})${input.kind === "offline-conflict" ? ", two versions" : ""}`;
  const approval = await requestApproval(tx, ctx, { type: "attendance-correction", recordType: "Attendance Correction", recordId: correction.id, summary, reason: input.reason });
  const saved = await tx.attendanceCorrection.update({ where: { id: correction.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "attendance-correction-asked", recordType: "Attendance Correction", recordId: correction.id, after: { summary, kind: input.kind, entries: input.entries } as unknown as Prisma.InputJsonValue });
  return saved;
}

export type CorrectionInput = {
  forWhom: "student" | "staff";
  sectionId: string | null;
  date: Date;
  periodNo: number;
  changes: { id: string; to: string; note?: string | null }[];
  reason: string;
};

/** Asks for a correction to locked marks: one or more students of a section (or staff), a date, the new status and a reason. */
export async function requestCorrection(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: CorrectionInput) {
  if (input.reason.trim().length < 5) throw new AttendanceProblem("Give a reason of at least 5 characters, so the approver understands the change.", "reason");
  if (input.changes.length === 0) throw new AttendanceProblem("Choose at least one person and their new status.", "changes");
  const statuses = await statusList(tx, ctx);
  const valid = new Map(statuses.map((s) => [s.key, s]));
  for (const c of input.changes) if (!valid.has(c.to)) throw new AttendanceProblem("Choose the new status.", "status");

  let sectionName: string | null = null;
  const entries: CorrectionEntry[] = [];
  if (input.forWhom === "student") {
    if (!input.sectionId) throw new AttendanceProblem("Choose the class.", "sectionId");
    const section = await tx.section.findFirst({ where: { id: input.sectionId, archivedAt: null }, include: { schoolClass: { select: { name: true } } } });
    if (!section) throw new AttendanceProblem("This class was not found.", "sectionId");
    const mine = access.students === "all" || access.classSections.includes(section.id) || access.teachingSections.includes(section.id);
    if (!mine || access.change === "none") throw new NotYoursError();
    sectionName = `${section.schoolClass.name} ${section.name}`;
    const enrolled = await tx.enrolment.findMany({ where: { sectionId: section.id, studentId: { in: input.changes.map((c) => c.id) }, archivedAt: null }, include: { student: { select: { id: true, fullName: true } } } });
    const marks = await tx.attendanceMark.findMany({ where: { studentId: { in: input.changes.map((c) => c.id) }, date: input.date, periodNo: input.periodNo, archivedAt: null } });
    for (const c of input.changes) {
      const e = enrolled.find((x) => x.studentId === c.id);
      if (!e) throw new AttendanceProblem("One of the students is not in this class.", "changes");
      const from = marks.find((m) => m.studentId === c.id)?.statusKey ?? null;
      if (from === c.to) continue;
      entries.push({ id: c.id, name: e.student.fullName, from, to: c.to, note: c.note?.trim() || null });
    }
  } else {
    if (access.staff !== "all" || access.change === "none") throw new AttendanceProblem("Only HR, the School Admin or the Principal can correct staff attendance.");
    const staff = await tx.staff.findMany({ where: { id: { in: input.changes.map((c) => c.id) }, archivedAt: null }, select: { id: true, fullName: true } });
    const marks = await tx.attendanceMark.findMany({ where: { staffId: { in: input.changes.map((c) => c.id) }, date: input.date, periodNo: 0, archivedAt: null } });
    for (const c of input.changes) {
      const s = staff.find((x) => x.id === c.id);
      if (!s) throw new AttendanceProblem("This staff member was not found.", "changes");
      const from = marks.find((m) => m.staffId === c.id)?.statusKey ?? null;
      if (from === c.to) continue;
      entries.push({ id: c.id, name: s.fullName, from, to: c.to, note: c.note?.trim() || null });
    }
  }
  if (entries.length === 0) throw new AttendanceProblem("The new status is the same as the saved one, so there is nothing to correct.", "status");
  const open = await tx.attendanceCorrection.findFirst({ where: { schoolId: ctx.schoolId, status: "WAITING", date: input.date, periodNo: input.periodNo, forWhom: input.forWhom, sectionId: input.sectionId, archivedAt: null } });
  if (open) {
    const asked = (open.entries as CorrectionEntry[]).map((e) => e.id);
    const clash = entries.find((e) => asked.includes(e.id));
    if (clash) throw new AttendanceProblem(`A correction for ${clash.name} on ${dayText(input.date)} is already waiting in Approvals.`, "changes");
  }
  return createCorrection(tx, ctx, { forWhom: input.forWhom, sectionId: input.sectionId, sectionName, date: input.date, periodNo: input.periodNo, kind: "manual", entries, reason: input.reason.trim(), versions: null });
}

/** Changes the marks of an approved correction. The before values go to the audit log. */
export async function applyCorrection(tx: Tx, ctx: SchoolContext, correctionId: string) {
  const c = await tx.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId } });
  const entries = c.entries as CorrectionEntry[];
  const section = c.sectionId ? await tx.section.findUnique({ where: { id: c.sectionId } }) : null;
  const year = section ? { id: section.academicYearId } : await tx.academicYear.findFirst({ where: { schoolId: ctx.schoolId, startDate: { lte: c.date }, endDate: { gte: c.date }, archivedAt: null } });
  const changed: { name: string; before: string | null; after: string }[] = [];
  for (const e of entries) {
    const where = c.forWhom === "staff" ? { staffId: e.id } : { studentId: e.id };
    const mark = await tx.attendanceMark.findFirst({ where: { ...where, date: c.date, periodNo: c.periodNo, archivedAt: null } });
    if (mark) {
      await tx.attendanceMark.update({ where: { id: mark.id }, data: { statusKey: e.to, note: e.note ?? mark.note, markedById: ctx.userId, markedAt: new Date(), method: mark.method } });
    } else {
      await tx.attendanceMark.create({
        data: { schoolId: ctx.schoolId, academicYearId: year?.id ?? null, ...where, sectionId: c.sectionId, date: c.date, periodNo: c.periodNo, statusKey: e.to, note: e.note, method: "register", markedById: ctx.userId, locked: true },
      });
    }
    changed.push({ name: e.name, before: mark?.statusKey ?? null, after: e.to });
  }
  await writeAudit(tx, ctx, {
    action: "attendance-corrected", recordType: "Attendance Mark", recordId: c.id,
    before: changed.map((x) => ({ name: x.name, status: x.before })) as unknown as Prisma.InputJsonValue,
    after: { date: isoDay(c.date), period: c.periodNo || null, changes: changed.map((x) => ({ name: x.name, status: x.after })), correction: c.id } as unknown as Prisma.InputJsonValue,
  });
  return changed.length;
}

/** What happens when a correction is decided (registered with onDecision). */
export async function onCorrectionDecision(tx: Tx, ctx: SchoolContext, approval: { id: string; recordId: string }, decision: Decision, note: string | null) {
  const c = await tx.attendanceCorrection.findFirst({ where: { id: approval.recordId, status: "WAITING" } });
  if (!c) return;
  const status = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "WITHDRAWN" : "REJECTED";
  if (decision === "approve") await applyCorrection(tx, ctx, c.id);
  await tx.attendanceCorrection.update({ where: { id: c.id }, data: { status, decidedById: decision === "withdraw" ? null : ctx.userId, decidedAt: new Date(), decisionNote: note } });
  await writeAudit(tx, ctx, { action: `attendance-correction-${decision}`, recordType: "Attendance Correction", recordId: c.id, before: { status: c.status }, after: { status, note } });
}

export const CORRECTION_WORDS: Record<string, string> = { manual: "Correction", "offline-conflict": "Two versions (offline)", "offline-late": "Sent after the lock (offline)" };

export function statusName(list: { key: string; name: string }[], key: string | null) {
  if (!key) return "Not marked";
  return list.find((s) => s.key === key)?.name ?? key;
}
