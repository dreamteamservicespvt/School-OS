// Confirm admission (02 §2, automation A2 "Admission approved"): an approved
// application becomes one Student, exactly once (04-data-model.md rule 5),
// with an admission number, class, section and roll number, Guardians made or
// linked to the existing ones when the phone matches (brothers and sisters),
// the consent given on the form moved to the guardian, the enquiry closed as
// Admitted and a welcome message to the parent. "Undo admission" works for 10
// minutes while nothing else has happened to the new student.
import "server-only";

import { Prisma, type Application } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { nextNumber, formatNumber } from "../sequences";
import { formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, feeSettled, loadApplication, parentName } from "./applications";
import { classRule, loadSettings, stageOn } from "./settings";
import { progressOf } from "./documents";
import { hasDataConsent } from "./consent";
import { seatsFor } from "./seats";
import { systemStatus } from "./enquiries";
import { messageParent } from "./notify-parents";

export const UNDO_ADMISSION_MS = 10 * 60 * 1000;

export type Conversion = {
  enrolmentId: string;
  sectionId: string;
  rollNo: number;
  newGuardianIds: string[];
  linkedGuardianIds: string[];
  linkIds: string[];
  admissionNo: string;
};

export class AlreadyAdmittedProblem extends AdmissionProblem {}

/** The admission number for a new student: SCHOOL/YYYY/0001 (the running number is shared with Student Management). */
export async function newAdmissionNo(tx: Tx, ctx: SchoolContext, yearName: string) {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { code: true } });
  return formatNumber(`${school?.code ?? "SCH"}/${yearName.slice(0, 4)}/`, await nextNumber(tx, ctx, "admission"), 4);
}

/** What still stops the admission, in plain words. Empty when it can be confirmed. */
export async function blockers(tx: Tx, ctx: SchoolContext, app: Application) {
  const s = await loadSettings(tx, ctx);
  const out: string[] = [];
  if (app.stage !== "APPROVED") out.push(app.stage === "ADMITTED" ? "Already admitted." : "The application is not approved yet.");
  if (!(await hasDataConsent(tx, app.id))) out.push("Data consent is not given yet. The guardian must agree, confirmed by a one-time code.");
  const rule = await classRule(tx, app.classId);
  const docs = await tx.applicationDocument.findMany({ where: { applicationId: app.id } });
  const p = progressOf(docs, rule.documents);
  if (!p.complete && !s.admitWithPapersPending && !app.papersException) out.push(...p.unverifiedRequired.map((d) => `${d} not verified.`));
  if (stageOn(s, "payment") && !(await feeSettled(tx, app))) out.push("The application fee is not paid yet.");
  return out;
}

export type ConfirmInput = { sectionId: string | null; admissionDate: Date };

/** Confirm admission: once per application. A second try opens the existing student. */
export async function confirmAdmission(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string, input: ConfirmInput) {
  requireFull(v, "confirming admissions");
  const app = await loadApplication(tx, applicationId);
  if (app.studentId) {
    const st = await tx.student.findUnique({ where: { id: app.studentId } });
    throw new AlreadyAdmittedProblem(`This application is already admitted as ${st?.fullName ?? app.fullName}, admission no. ${st?.admissionNo ?? "?"}.`, undefined, { href: `/admission-management/decision/${app.id}/admitted`, label: "Open the admission" });
  }
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: app.academicYearId } });
  await assertYearOpen(tx, year.id);
  const problems = await blockers(tx, ctx, app);
  if (problems.length) throw new AdmissionProblem(problems.join(" "));

  // Seats, section with most free seats unless one is chosen (inferred rule).
  const s = await loadSettings(tx, ctx);
  const seats = (await seatsFor(tx, year.id, [app.classId])).get(app.classId);
  if (!seats || seats.sections.length === 0) throw new AdmissionProblem("This class has no sections in the admission year. Add them in Academic Management, Classes & Sections.");
  const section = input.sectionId ? seats.sections.find((x) => x.id === input.sectionId) : [...seats.sections].sort((a, b) => b.free - a.free || a.name.localeCompare(b.name))[0];
  if (!section) throw new AdmissionProblem("Choose a section of the class.", "sectionId");
  if (section.free <= 0) {
    const may = s.allowOverCapacity && v.overCapacity;
    if (!may) throw new AdmissionProblem(`${seats.className} ${section.name} is full (${section.enrolled} of ${section.seats}). Choose another section, or increase the seats in Classes & Sections.`, "sectionId");
  }

  // Claim the application first, so two people pressing at once make one student.
  const claimed = await tx.application.updateMany({ where: { id: app.id, studentId: null, stage: "APPROVED" }, data: { stage: "ADMITTED", admittedAt: new Date(), admittedById: ctx.userId } });
  if (claimed.count === 0) throw new AlreadyAdmittedProblem("This application was admitted a moment ago by someone else.", undefined, { href: `/admission-management/decision/${app.id}/admitted`, label: "Open the admission" });

  const admissionNo = await newAdmissionNo(tx, ctx, year.name);
  const today = new Date();
  const student = await tx.student.create({
    data: {
      schoolId: ctx.schoolId, campusId: app.campusId, admissionNo, firstName: app.firstName, lastName: app.lastName, fullName: app.fullName,
      dateOfBirth: app.dateOfBirth, gender: app.gender, category: app.category, religion: app.religion, motherTongue: app.motherTongue,
      address: app.address, aadhaarEnc: app.aadhaarEnc, previousSchool: app.previousSchool,
      status: year.status === "UPCOMING" || input.admissionDate > today ? "ADMITTED" : "ACTIVE",
      joiningDate: input.admissionDate, applicationId: app.id, createdById: ctx.userId, updatedById: ctx.userId,
    },
  });

  // Guardians: reuse the family's guardians when the phone matches a current parent.
  const phones = [app.phone, app.altPhone].filter((p): p is string => Boolean(p));
  const matched = await tx.guardian.findMany({ where: { archivedAt: null, phone: { in: phones } } });
  let family = matched;
  if (matched.length) {
    const links = await tx.studentGuardian.findMany({ where: { archivedAt: null, guardianId: { in: matched.map((g) => g.id) } }, select: { studentId: true } });
    const siblingLinks = await tx.studentGuardian.findMany({ where: { archivedAt: null, studentId: { in: links.map((l) => l.studentId) } }, include: { guardian: true } });
    family = [...new Map([...matched, ...siblingLinks.map((l) => l.guardian).filter((g) => !g.archivedAt)].map((g) => [g.id, g])).values()];
  }
  const wanted: { relationship: string; name: string }[] = [];
  if (app.fatherName) wanted.push({ relationship: "Father", name: app.fatherName });
  if (app.motherName) wanted.push({ relationship: "Mother", name: app.motherName });
  if (app.guardianName) wanted.push({ relationship: app.guardianRelation ?? "Guardian", name: app.guardianName });
  const newGuardianIds: string[] = [];
  const linkedGuardianIds: string[] = [];
  const linkIds: string[] = [];
  const used = new Set<string>();
  let phoneOwnerId: string | null = null;
  for (const [i, w] of wanted.entries()) {
    const reuse = family.find((g) => !used.has(g.id) && g.relationship.toLowerCase() === w.relationship.toLowerCase())
      ?? (i === 0 ? matched.find((g) => !used.has(g.id) && g.phone === app.phone) : undefined);
    let guardianId: string;
    if (reuse) {
      guardianId = reuse.id;
      linkedGuardianIds.push(reuse.id);
    } else {
      const g = await tx.guardian.create({
        data: {
          schoolId: ctx.schoolId, name: w.name, relationship: w.relationship,
          phone: i === 0 ? app.phone : app.altPhone ?? app.phone, email: i === 0 ? app.email : null,
          occupation: i === 0 ? app.occupation : null, address: app.address, createdById: ctx.userId, updatedById: ctx.userId,
        },
      });
      guardianId = g.id;
      newGuardianIds.push(g.id);
    }
    used.add(guardianId);
    if (i === 0) phoneOwnerId = guardianId;
    const link = await tx.studentGuardian.create({ data: { schoolId: ctx.schoolId, studentId: student.id, guardianId, relationship: w.relationship, isPrimary: i === 0, emergencyOrder: i + 1 } });
    linkIds.push(link.id);
  }

  // Roll number: the next free number in the section (inferred).
  const last = await tx.enrolment.aggregate({ where: { sectionId: section.id, academicYearId: year.id, archivedAt: null }, _max: { rollNo: true } });
  const rollNo = (last._max.rollNo ?? 0) + 1;
  const enrolment = await tx.enrolment.create({ data: { schoolId: ctx.schoolId, studentId: student.id, academicYearId: year.id, classId: app.classId, sectionId: section.id, rollNo, createdById: ctx.userId } });

  // The consent given on the application moves to the guardian who gave it.
  await tx.admissionConsent.updateMany({ where: { applicationId: app.id }, data: { guardianId: phoneOwnerId, studentId: student.id } });

  const conversion: Conversion = { enrolmentId: enrolment.id, sectionId: section.id, rollNo, newGuardianIds, linkedGuardianIds, linkIds, admissionNo };
  await tx.application.update({ where: { id: app.id }, data: { studentId: student.id, conversion: conversion as unknown as Prisma.InputJsonValue, updatedById: ctx.userId } });
  if (app.enquiryId) {
    const e = await tx.enquiry.findUnique({ where: { id: app.enquiryId } });
    if (e) await systemStatus(tx, ctx, s, e, "admitted", `Admitted as ${student.fullName}, admission no. ${admissionNo}.`);
  }
  const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } });
  const name = parentName(app);
  const welcome = await messageParent(tx, ctx, { to: { name, phone: app.phone, email: app.email }, template: "admission-confirmed", text: `Dear ${name}, welcome to ${school?.name ?? "our school"}! ${student.fullName} is admitted to ${cls?.name ?? "the class"} ${section.name}, admission no. ${admissionNo}, from ${formatDate(input.admissionDate)}.`, about: { recordType: "Application", recordId: app.id } });
  await activity(tx, ctx, app.id, "admitted", `Admitted as ${student.fullName}, admission no. ${admissionNo}, ${cls?.name ?? ""} ${section.name}, roll no. ${rollNo}. ${newGuardianIds.length} new parent record${newGuardianIds.length === 1 ? "" : "s"}${linkedGuardianIds.length ? `, ${linkedGuardianIds.length} linked to an existing parent (sibling)` : ""}.`, conversion as unknown as Prisma.InputJsonValue);
  await writeAudit(tx, ctx, { action: "admitted", recordType: "Application", recordId: app.id, before: { stage: "APPROVED" }, after: { studentId: student.id, admissionNo, sectionId: section.id, rollNo, newGuardianIds, linkedGuardianIds } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Student", recordId: student.id, after: { admissionNo, fullName: student.fullName, from: `application ${app.applicationNo}` } });
  return { student, enrolment, conversion, welcome: welcome.status };
}

/** Undo admission: within 10 minutes, and only if nothing else has happened to the student. */
export async function undoAdmission(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string, now = new Date()) {
  requireFull(v, "undoing an admission");
  const app = await loadApplication(tx, applicationId);
  if (!app.studentId || !app.admittedAt || app.stage !== "ADMITTED") throw new AdmissionProblem("This application is not admitted.");
  if (now.getTime() - app.admittedAt.getTime() > UNDO_ADMISSION_MS) throw new AdmissionProblem("Undo admission works for 10 minutes only. To reverse it now, record the student leaving in Student Management (Leaving & Alumni).");
  const c = app.conversion as unknown as Conversion | null;
  if (!c) throw new AdmissionProblem("This admission cannot be undone here.");
  const student = await tx.student.findUniqueOrThrow({ where: { id: app.studentId } });
  const enrolments = await tx.enrolment.count({ where: { studentId: student.id, archivedAt: null } });
  const others = await tx.auditLogEntry.count({ where: { recordId: student.id, recordType: { not: "Application" }, at: { gt: app.admittedAt }, action: { notIn: ["created"] } } });
  if (enrolments !== 1 || others > 0) throw new AdmissionProblem("Something else has already happened to this student, so the admission cannot be undone. Record the student leaving in Student Management instead.");
  const at = new Date();
  await tx.studentGuardian.updateMany({ where: { id: { in: c.linkIds } }, data: { archivedAt: at } });
  if (c.newGuardianIds.length) {
    const stillUsed = await tx.studentGuardian.findMany({ where: { guardianId: { in: c.newGuardianIds }, archivedAt: null }, select: { guardianId: true } });
    const free = c.newGuardianIds.filter((g) => !stillUsed.some((u) => u.guardianId === g));
    if (free.length) await tx.guardian.updateMany({ where: { id: { in: free } }, data: { archivedAt: at } });
  }
  await tx.enrolment.update({ where: { id: c.enrolmentId }, data: { archivedAt: at } });
  // The student record is archived and released from the application, so the application can be admitted again.
  await tx.student.update({ where: { id: student.id }, data: { archivedAt: at, applicationId: null, status: "INACTIVE", leavingReason: "Admission undone" } });
  await tx.admissionConsent.updateMany({ where: { applicationId: app.id }, data: { guardianId: null, studentId: null } });
  await tx.application.update({ where: { id: app.id }, data: { stage: "APPROVED", studentId: null, admittedAt: null, admittedById: null, conversion: Prisma.DbNull, updatedById: ctx.userId } });
  if (app.enquiryId) {
    const e = await tx.enquiry.findUnique({ where: { id: app.enquiryId } });
    if (e && e.status === "admitted") await tx.enquiry.update({ where: { id: e.id }, data: { status: "applied", closedAt: null } });
  }
  await activity(tx, ctx, app.id, "admission-undone", `Admission undone: ${student.fullName} (${c.admissionNo}) archived, with the new parent records and the class place.`);
  await writeAudit(tx, ctx, { action: "admission-undone", recordType: "Application", recordId: app.id, before: { studentId: student.id, admissionNo: c.admissionNo }, after: { stage: "APPROVED" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student", recordId: student.id, after: { reason: "Admission undone within 10 minutes" } });
  return c.admissionNo;
}
