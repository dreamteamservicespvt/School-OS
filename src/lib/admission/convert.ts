// Confirm admission (02 §2, automation A2 "Admission approved"): an approved
// application becomes one Student, exactly once (04-data-model.md rule 5).
// The student is made by Student Management's createStudent, so there is one
// way to make a student (admission number from Student Settings, roll number,
// Enrolment, fee plan hooks). Guardians are linked to the existing ones when
// the phone matches (brothers and sisters); the consent given on the form
// becomes each guardian's Consent Records; Parent Link is created and sent;
// the welcome message goes through Communication's automatic rule. "Undo
// admission" works for 10 minutes while nothing else has happened.
import "server-only";

import { Prisma, type Application, type Guardian } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { assertYearOpen } from "../academic/years";
import { createStudent, StudentProblem } from "../students/students";
import { createGuardian, linkGuardian } from "../students/guardians";
import { recordConsentGiven } from "../students/consent";
import { sendLinksOnAdmission } from "../parent-link/links";
import { MessagingProblem, sendAutomatic } from "../messaging";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, feeSettled, loadApplication } from "./applications";
import { classRule, loadSettings, stageOn } from "./settings";
import { progressOf } from "./documents";
import { hasDataConsent } from "./consent";
import { seatsFor } from "./seats";
import { systemStatus } from "./enquiries";

export const UNDO_ADMISSION_MS = 10 * 60 * 1000;

export type Conversion = {
  enrolmentId: string;
  sectionId: string;
  rollNo: number;
  newGuardianIds: string[];
  linkedGuardianIds: string[];
  linkIds: string[];
  admissionNo: string;
  consentRecordIds?: string[];
  parentLinkIds?: string[];
  welcome?: string;
};

export class AlreadyAdmittedProblem extends AdmissionProblem {}

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

/** The family already in school: parents with this phone and the other parents of their children. */
async function familyOf(tx: Tx, phones: string[]) {
  const matched = await tx.guardian.findMany({ where: { archivedAt: null, phone: { in: phones } } });
  if (!matched.length) return { matched, family: matched };
  const links = await tx.studentGuardian.findMany({ where: { archivedAt: null, guardianId: { in: matched.map((g) => g.id) } }, select: { studentId: true } });
  const siblingLinks = await tx.studentGuardian.findMany({ where: { archivedAt: null, studentId: { in: links.map((l) => l.studentId) } }, include: { guardian: true } });
  const family = [...new Map([...matched, ...siblingLinks.map((l) => l.guardian).filter((g) => !g.archivedAt)].map((g) => [g.id, g])).values()];
  return { matched, family };
}

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

  // The section with most free seats, unless one is chosen (inferred rule).
  const s = await loadSettings(tx, ctx);
  const seats = (await seatsFor(tx, year.id, [app.classId])).get(app.classId);
  if (!seats || seats.sections.length === 0) throw new AdmissionProblem("This class has no sections in the admission year. Add them in Academic Management, Classes & Sections.");
  const section = input.sectionId ? seats.sections.find((x) => x.id === input.sectionId) : [...seats.sections].sort((a, b) => b.free - a.free || a.name.localeCompare(b.name))[0];
  if (!section) throw new AdmissionProblem("Choose a section of the class.", "sectionId");
  if (section.free <= 0) {
    throw new AdmissionProblem(`${seats.className} ${section.name} is full (${section.enrolled} of ${section.seats}). Choose another section, or increase the seats in Academic Management, Classes & Sections.`, "sectionId");
  }

  // Claim the application first, so two people pressing at once make one student.
  const claimed = await tx.application.updateMany({ where: { id: app.id, studentId: null, stage: "APPROVED" }, data: { stage: "ADMITTED", admittedAt: new Date(), admittedById: ctx.userId } });
  if (claimed.count === 0) throw new AlreadyAdmittedProblem("This application was admitted a moment ago by someone else.", undefined, { href: `/admission-management/decision/${app.id}/admitted`, label: "Open the admission" });

  // Who the guardians are: the parents named on the form, in order.
  const wanted: { relationship: string; name: string }[] = [];
  if (app.fatherName) wanted.push({ relationship: "Father", name: app.fatherName });
  if (app.motherName) wanted.push({ relationship: "Mother", name: app.motherName });
  if (app.guardianName) wanted.push({ relationship: app.guardianRelation ?? "Guardian", name: app.guardianName });
  // The first on the form owns the main phone; when that phone is already a parent of the school, that parent is reused.
  const { matched, family } = await familyOf(tx, [app.phone, app.altPhone].filter((p): p is string => Boolean(p)));
  const used = new Set<string>();
  const pick = (w: { relationship: string }, first: boolean): Guardian | undefined => {
    const g = family.find((x) => !used.has(x.id) && x.relationship.toLowerCase() === w.relationship.toLowerCase())
      ?? (first ? matched.find((x) => !used.has(x.id) && x.phone === app.phone) : undefined);
    if (g) used.add(g.id);
    return g;
  };
  const primary = wanted[0];
  const primaryReuse = pick(primary, true);

  let made;
  try {
    made = await createStudent(tx, ctx, {
      fullName: app.fullName, sectionId: section.id, dateOfBirth: app.dateOfBirth, gender: app.gender,
      guardianName: primary.name, guardianRelation: primary.relationship, guardianPhone: app.phone, linkGuardianId: primaryReuse?.id ?? null,
      admissionDate: input.admissionDate, applyFeePlan: true,
      // The family was checked for duplicates when the application was made.
      duplicateReason: `Admitted from application ${app.applicationNo}`,
      category: app.category, religion: app.religion, motherTongue: app.motherTongue, address: app.address, previousSchool: app.previousSchool,
    });
  } catch (e) {
    if (e instanceof StudentProblem) throw new AdmissionProblem(`${e.message} (Student Management)`, e.field === "sectionId" ? "sectionId" : undefined);
    throw e;
  }
  const { student, enrolment } = made;
  await tx.student.update({ where: { id: student.id }, data: { applicationId: app.id, aadhaarEnc: app.aadhaarEnc, updatedById: ctx.userId } });

  const newGuardianIds: string[] = [];
  const linkedGuardianIds: string[] = [];
  const firstLink = await tx.studentGuardian.findFirstOrThrow({ where: { studentId: student.id, archivedAt: null } });
  if (primaryReuse) linkedGuardianIds.push(primaryReuse.id);
  else {
    newGuardianIds.push(firstLink.guardianId);
    await tx.guardian.update({ where: { id: firstLink.guardianId }, data: { email: app.email, occupation: app.occupation, address: app.address, altPhone: wanted.length === 1 ? app.altPhone : null } });
  }
  const linkIds = [firstLink.id];
  const guardianIds = [firstLink.guardianId];
  for (const w of wanted.slice(1)) {
    const reuse = pick(w, false);
    let guardianId: string;
    if (reuse) {
      guardianId = reuse.id;
      linkedGuardianIds.push(reuse.id);
    } else {
      const g = await createGuardian(tx, ctx, { name: w.name, relationship: w.relationship, phone: app.altPhone ?? app.phone, address: app.address }, { addAnyway: true });
      guardianId = g.id;
      newGuardianIds.push(g.id);
    }
    const link = await linkGuardian(tx, ctx, student.id, guardianId, { relationship: w.relationship, emergency: true });
    linkIds.push(link.id);
    guardianIds.push(guardianId);
  }

  // The consent given on the application becomes each guardian's Consent Records, with the text version agreed to.
  const consentRecordIds: string[] = [];
  const consents = await tx.admissionConsent.findMany({ where: { applicationId: app.id, withdrawnAt: null, otpVerifiedAt: { not: null } } });
  for (const c of consents) {
    const text = (c.version > 0 ? await tx.consentText.findFirst({ where: { consentType: c.consentType, version: c.version } }) : null)
      ?? await tx.consentText.findFirst({ where: { consentType: c.consentType, isCurrent: true } });
    if (!text) continue;
    for (const guardianId of guardianIds) {
      const row = await recordConsentGiven(tx, ctx, { guardianId, studentId: student.id, consentType: c.consentType, method: "admission-form", consentTextId: text.id });
      consentRecordIds.push(row.id);
    }
  }
  await tx.admissionConsent.updateMany({ where: { applicationId: app.id }, data: { guardianId: firstLink.guardianId, studentId: student.id } });

  // Parent Link for each guardian (Communication), then the welcome message.
  const linksBefore = new Set((await tx.parentLink.findMany({ where: { guardianId: { in: guardianIds } }, select: { id: true } })).map((l) => l.id));
  await sendLinksOnAdmission(tx, ctx, student.id);
  const parentLinkIds = (await tx.parentLink.findMany({ where: { guardianId: { in: guardianIds } }, select: { id: true } })).map((l) => l.id).filter((id) => !linksBefore.has(id));
  const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
  let welcome = "not sent";
  try {
    const r = await sendAutomatic(tx, ctx, {
      rule: "admission-welcome",
      event: { key: `admission:${student.id}`, label: `Admitted: ${student.fullName}` },
      to: { guardiansOf: [student.id] },
      perStudent: { [student.id]: { class: `${cls?.name ?? ""} ${section.name}`.trim(), admission_no: student.admissionNo } },
      source: { type: "Application", id: app.id },
    });
    welcome = r.status;
  } catch (e) {
    if (!(e instanceof MessagingProblem)) throw e;
  }

  const conversion: Conversion = { enrolmentId: enrolment.id, sectionId: section.id, rollNo: enrolment.rollNo ?? 0, newGuardianIds, linkedGuardianIds, linkIds, admissionNo: student.admissionNo, consentRecordIds, parentLinkIds, welcome };
  await tx.application.update({ where: { id: app.id }, data: { studentId: student.id, conversion: conversion as unknown as Prisma.InputJsonValue, updatedById: ctx.userId } });
  if (app.enquiryId) {
    const e = await tx.enquiry.findUnique({ where: { id: app.enquiryId } });
    if (e) await systemStatus(tx, ctx, s, e, "admitted", `Admitted as ${student.fullName}, admission no. ${student.admissionNo}.`);
  }
  await activity(tx, ctx, app.id, "admitted", `Admitted as ${student.fullName}, admission no. ${student.admissionNo}, ${cls?.name ?? ""} ${section.name}, roll no. ${enrolment.rollNo}. ${newGuardianIds.length} new parent record${newGuardianIds.length === 1 ? "" : "s"}${linkedGuardianIds.length ? `, ${linkedGuardianIds.length} linked to an existing parent (sibling)` : ""}.`, conversion as unknown as Prisma.InputJsonValue);
  await writeAudit(tx, ctx, { action: "admitted", recordType: "Application", recordId: app.id, before: { stage: "APPROVED" }, after: { studentId: student.id, admissionNo: student.admissionNo, sectionId: section.id, rollNo: enrolment.rollNo, newGuardianIds, linkedGuardianIds } });
  return { student, enrolment, conversion, welcome };
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
  // Anything recorded for the student after the admission (a payment, attendance, an edit) stops the undo.
  const others = await tx.auditLogEntry.count({ where: { recordId: student.id, recordType: "Student", at: { gt: new Date(app.admittedAt.getTime() + 60_000) } } });
  if (enrolments !== 1 || others > 0) throw new AdmissionProblem("Something else has already happened to this student, so the admission cannot be undone. Record the student leaving in Student Management instead.");
  const at = new Date();
  await tx.studentGuardian.updateMany({ where: { id: { in: c.linkIds } }, data: { archivedAt: at } });
  if (c.newGuardianIds.length) {
    const stillUsed = await tx.studentGuardian.findMany({ where: { guardianId: { in: c.newGuardianIds }, archivedAt: null }, select: { guardianId: true } });
    const free = c.newGuardianIds.filter((g) => !stillUsed.some((u) => u.guardianId === g));
    if (free.length) await tx.guardian.updateMany({ where: { id: { in: free } }, data: { archivedAt: at } });
  }
  if (c.parentLinkIds?.length) await tx.parentLink.updateMany({ where: { id: { in: c.parentLinkIds }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: at, revokedById: ctx.userId, revokeReason: "Admission undone" } });
  if (c.consentRecordIds?.length) await tx.consentRecord.updateMany({ where: { id: { in: c.consentRecordIds }, withdrawnAt: null }, data: { withdrawnAt: at, withdrawnHow: "Admission undone" } });
  await tx.enrolment.update({ where: { id: c.enrolmentId }, data: { archivedAt: at } });
  // The student record is archived and released from the application, so the application can be admitted again.
  await tx.student.update({ where: { id: student.id }, data: { archivedAt: at, applicationId: null, status: "INACTIVE", leavingReason: "Admission undone" } });
  await tx.admissionConsent.updateMany({ where: { applicationId: app.id }, data: { guardianId: null, studentId: null } });
  await tx.application.update({ where: { id: app.id }, data: { stage: "APPROVED", studentId: null, admittedAt: null, admittedById: null, conversion: Prisma.DbNull, updatedById: ctx.userId } });
  if (app.enquiryId) {
    const e = await tx.enquiry.findUnique({ where: { id: app.enquiryId } });
    if (e && e.status === "admitted") await tx.enquiry.update({ where: { id: e.id }, data: { status: "applied", closedAt: null } });
  }
  await activity(tx, ctx, app.id, "admission-undone", `Admission undone: ${student.fullName} (${c.admissionNo}) archived, with the new parent records, their Parent Links and the class place.`);
  await writeAudit(tx, ctx, { action: "admission-undone", recordType: "Application", recordId: app.id, before: { studentId: student.id, admissionNo: c.admissionNo }, after: { stage: "APPROVED" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student", recordId: student.id, after: { reason: "Admission undone within 10 minutes" } });
  return c.admissionNo;
}
