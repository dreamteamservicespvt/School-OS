// Confirm admission (02 §2, automation A2 "Admission approved"): an approved
// application becomes one Student, exactly once (04-data-model.md rule 5).
// The student is made by Student Management's createStudent, so there is one
// way to make a student (admission number from Student Settings, roll number,
// Enrolment, fee plan hooks). Guardians are linked to the existing ones when
// the phone matches and the name matches too (brothers and sisters; close
// spellings allowed, src/lib/students/name-match.ts); a phone on record under
// another name is never merged silently: the admissions person says whether
// it is the same family. Every received or verified paper becomes the
// student's document (papers.ts; a verified photo becomes the student's
// photo), and the previous school keeps its last class and marks.
// The consent given on the form becomes each guardian's Consent Records;
// Parent Link is created and sent; the welcome message goes through
// Communication's automatic rule. "Undo admission" works for 10 minutes
// while nothing else has happened (no payment, attendance or marks), and
// takes back what it made: the student, the class place, the new parents and
// their Parent Links, the fee plan rows (marked removed, "Admission undone")
// and the documents. A fee payment is never deleted, so once one is recorded
// (even a cancelled one) the undo is refused and the student is withdrawn in
// Leaving & Alumni instead. The application fee stays with the application.
import "server-only";

import { Prisma, type Application, type Guardian } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { assertYearOpen } from "../academic/years";
import { createStudent, StudentProblem } from "../students/students";
import { createGuardian, linkGuardian } from "../students/guardians";
import { recordConsentGiven } from "../students/consent";
import { namesAlike } from "../students/name-match";
import { refreshBalances } from "../fees/dues";
import { sendLinksOnAdmission } from "../parent-link/links";
import { MessagingProblem, sendAutomatic } from "../messaging";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, feeSettled, loadApplication } from "./applications";
import { classRule, loadSettings, stageOn } from "./settings";
import { carryPapers } from "./papers";
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
  /** The received and verified papers made into Student Documents (same files). */
  studentDocumentIds?: string[];
  /** The photo paper, set as the student's photo. */
  photoFileId?: string | null;
  /** The fee plan rows (Student Fee Due) made for the student. */
  feeDueIds?: string[];
  /** "same:<guardianId>" or "new", when the phone was on record under another name. */
  family?: string | null;
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

export type ConfirmInput = {
  sectionId: string | null;
  admissionDate: Date;
  /** Only when the form's phone is on record under another name: "same:<guardianId>" or "new". */
  family?: string | null;
};

type Wanted = { relationship: string; name: string };

/** The parents named on the form, in order. The first owns the main phone. */
function parentsOnForm(app: Pick<Application, "fatherName" | "motherName" | "guardianName" | "guardianRelation">): Wanted[] {
  const wanted: Wanted[] = [];
  if (app.fatherName) wanted.push({ relationship: "Father", name: app.fatherName });
  if (app.motherName) wanted.push({ relationship: "Mother", name: app.motherName });
  if (app.guardianName) wanted.push({ relationship: app.guardianRelation ?? "Guardian", name: app.guardianName });
  return wanted;
}

const sameRelation = (g: Pick<Guardian, "relationship">, w: Pick<Wanted, "relationship">) => g.relationship.toLowerCase() === w.relationship.toLowerCase();

/** Parents on record with the form's phones, with the names of their children in school. */
async function parentsWithPhones(tx: Tx, app: Pick<Application, "phone" | "altPhone">) {
  const phones = [app.phone, app.altPhone].filter((p): p is string => Boolean(p));
  return tx.guardian.findMany({
    where: { archivedAt: null, phone: { in: phones } },
    orderBy: { createdAt: "asc" },
    include: { students: { where: { archivedAt: null, student: { archivedAt: null } }, include: { student: { select: { fullName: true } } }, orderBy: { createdAt: "asc" }, take: 3 } },
  });
}

/** The family already in school: these parents and the other parents of their children. */
async function familyOf(tx: Tx, anchors: Guardian[]) {
  if (!anchors.length) return anchors;
  const links = await tx.studentGuardian.findMany({ where: { archivedAt: null, guardianId: { in: anchors.map((g) => g.id) } }, select: { studentId: true } });
  const siblingLinks = await tx.studentGuardian.findMany({ where: { archivedAt: null, studentId: { in: links.map((l) => l.studentId) } }, include: { guardian: true } });
  return [...new Map([...anchors, ...siblingLinks.map((l) => l.guardian).filter((g) => !g.archivedAt)].map((g) => [g.id, g])).values()];
}

export type FamilyQuestion = { question: string; options: { value: string; label: string }[] };

/**
 * When the form's phone already belongs to parents on record and none of them
 * has the name of a parent on the form (close spellings allowed), the
 * admissions person says whether this is the same family before the
 * admission is confirmed: never merged silently. Null when nothing needs asking.
 */
export async function familyQuestion(tx: Tx, app: Application): Promise<FamilyQuestion | null> {
  const wanted = parentsOnForm(app);
  const onPhone = await parentsWithPhones(tx, app);
  if (!onPhone.length || onPhone.some((g) => wanted.some((w) => namesAlike(g.name, w.name)))) return null;
  const phone = onPhone[0].phone;
  const kidsOf = (g: (typeof onPhone)[number]) => g.students.map((x) => x.student.fullName);
  const who = onPhone.slice(0, 3).map((g) => `${g.name}${kidsOf(g).length ? ` (parent of ${kidsOf(g).join(", ")})` : ""}`).join(", ");
  const named = wanted.map((w) => w.name).join(" and ");
  return {
    question: `Phone ${phone} is already on record for ${who}, not for ${named} named on this form. Say whether this is the same family.`,
    options: [
      ...onPhone.slice(0, 3).map((g) => ({ value: `same:${g.id}`, label: `Same family: link to ${g.name} (${g.relationship}${kidsOf(g).length ? `, parent of ${kidsOf(g).join(", ")}` : ""})` })),
      { value: "new", label: `A different family: add ${named} as ${wanted.length === 1 ? "a new parent" : "new parents"} with this phone` },
    ],
  };
}

/** Confirm admission: once per application. A second try opens the existing student. */
export async function confirmAdmission(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string, input: ConfirmInput) {
  requireFull(v, "confirming admissions");
  const app = await loadApplication(tx, applicationId, v);
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

  // Who the guardians are: the parents named on the form, in order. A parent
  // already on record is reused only when the phone and the name both match
  // (close spellings allowed), or when the person said it is the same family.
  const wanted = parentsOnForm(app);
  const onPhone = await parentsWithPhones(tx, app);
  const named = onPhone.filter((g) => wanted.some((w) => namesAlike(g.name, w.name)));
  let chosen: Guardian | null = null;
  let anchors: Guardian[] = named;
  if (onPhone.length && !named.length) {
    if (!input.family) throw new AdmissionProblem((await familyQuestion(tx, app))?.question ?? "Say whether this is the same family.", "family");
    if (input.family === "new") anchors = [];
    else {
      chosen = onPhone.find((g) => `same:${g.id}` === input.family) ?? null;
      if (!chosen) throw new AdmissionProblem("The family chosen is not offered any more. Choose again.", "family");
      anchors = [chosen];
    }
  }

  // Claim the application first, so two people pressing at once make one student.
  const claimed = await tx.application.updateMany({ where: { id: app.id, studentId: null, stage: "APPROVED" }, data: { stage: "ADMITTED", admittedAt: new Date(), admittedById: ctx.userId } });
  if (claimed.count === 0) throw new AlreadyAdmittedProblem("This application was admitted a moment ago by someone else.", undefined, { href: `/admission-management/decision/${app.id}/admitted`, label: "Open the admission" });

  const family = await familyOf(tx, anchors);
  const used = new Set<string>();
  const pick = (w: Wanted): Guardian | undefined => {
    const byName = family.filter((x) => !used.has(x.id) && namesAlike(x.name, w.name));
    let g = byName.find((x) => sameRelation(x, w)) ?? byName[0];
    // "Same family": the parent on record is this parent, written another way.
    if (!g && chosen && !used.has(chosen.id) && sameRelation(chosen, w)) g = chosen;
    if (g) used.add(g.id);
    return g;
  };
  const primary = wanted[0];
  const primaryReuse = pick(primary);

  let made;
  try {
    made = await createStudent(tx, ctx, {
      fullName: app.fullName, sectionId: section.id, dateOfBirth: app.dateOfBirth, gender: app.gender,
      guardianName: primary.name, guardianRelation: primary.relationship, guardianPhone: app.phone, linkGuardianId: primaryReuse?.id ?? null,
      admissionDate: input.admissionDate, applyFeePlan: true,
      // The family was checked for duplicates when the application was made.
      duplicateReason: `Admitted from application ${app.applicationNo}`,
      category: app.category, religion: app.religion, motherTongue: app.motherTongue, address: app.address,
      previousSchool: app.previousSchool, previousClass: app.previousClass, previousMarks: app.previousMarks,
    });
  } catch (e) {
    if (e instanceof StudentProblem) throw new AdmissionProblem(`${e.message} (Student Management)`, e.field === "sectionId" ? "sectionId" : undefined);
    throw e;
  }
  const { student, enrolment } = made;
  await tx.student.update({ where: { id: student.id }, data: { applicationId: app.id, aadhaarEnc: app.aadhaarEnc, updatedById: ctx.userId } });
  // The fee plan rows made for the new student, so Undo can take them off again.
  const feeDueIds = (await tx.studentFeeDue.findMany({ where: { studentId: student.id }, select: { id: true } })).map((d) => d.id);
  const papers = await carryPapers(tx, ctx, app, student.id);

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
    const reuse = pick(w);
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
  // "Same family" with a parent the form did not name (the other parent): the child is theirs too.
  if (chosen && !used.has(chosen.id)) {
    const link = await linkGuardian(tx, ctx, student.id, chosen.id, { relationship: chosen.relationship, emergency: true });
    linkedGuardianIds.push(chosen.id);
    linkIds.push(link.id);
    guardianIds.push(chosen.id);
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

  const conversion: Conversion = {
    enrolmentId: enrolment.id, sectionId: section.id, rollNo: enrolment.rollNo ?? 0, newGuardianIds, linkedGuardianIds, linkIds, admissionNo: student.admissionNo, consentRecordIds, parentLinkIds, welcome,
    studentDocumentIds: papers.documentIds, photoFileId: papers.photoFileId, feeDueIds, family: input.family ?? null,
  };
  await tx.application.update({ where: { id: app.id }, data: { studentId: student.id, conversion: conversion as unknown as Prisma.InputJsonValue, updatedById: ctx.userId } });
  if (app.enquiryId) {
    const e = await tx.enquiry.findUnique({ where: { id: app.enquiryId } });
    if (e) await systemStatus(tx, ctx, s, e, "admitted", `Admitted as ${student.fullName}, admission no. ${student.admissionNo}.`);
  }
  const docsWords = papers.documentIds.length ? ` ${papers.documentIds.length} paper${papers.documentIds.length === 1 ? "" : "s"} added to the student's documents${papers.notVerified ? ` (${papers.notVerified} not verified yet)` : ""}${papers.photoFileId ? ", with the photo" : ""}.` : "";
  const familyWords = input.family === "new" && !chosen ? " The phone was on record for another family: new parent records made, as chosen." : chosen ? ` Linked to ${chosen.name} as the same family, as chosen.` : "";
  await activity(tx, ctx, app.id, "admitted", `Admitted as ${student.fullName}, admission no. ${student.admissionNo}, ${cls?.name ?? ""} ${section.name}, roll no. ${enrolment.rollNo}. ${newGuardianIds.length} new parent record${newGuardianIds.length === 1 ? "" : "s"}${linkedGuardianIds.length ? `, ${linkedGuardianIds.length} linked to an existing parent (sibling)` : ""}.${docsWords}${familyWords}`, conversion as unknown as Prisma.InputJsonValue);
  await writeAudit(tx, ctx, { action: "admitted", recordType: "Application", recordId: app.id, before: { stage: "APPROVED" }, after: { studentId: student.id, admissionNo: student.admissionNo, sectionId: section.id, rollNo: enrolment.rollNo, newGuardianIds, linkedGuardianIds, documents: papers.documentIds.length, feeRows: feeDueIds.length, family: input.family ?? null } });
  return { student, enrolment, conversion, welcome };
}

/** What has already happened to a new student, in plain words; empty when the admission can still be undone. */
async function happenedSince(tx: Tx, studentId: string, admittedAt: Date, feeDueIds: string[] | undefined) {
  const [payments, links, concessions, adjustments, otherDues, attendance, marks, edits, beds] = await Promise.all([
    tx.payment.count({ where: { studentId } }),
    tx.paymentLink.count({ where: { studentId } }),
    tx.concession.count({ where: { studentId, archivedAt: null } }),
    tx.feeAdjustment.count({ where: { studentId } }),
    // Rows added since (a charge, another plan); a late fee the daily job hung on the admission's own rows does not count.
    feeDueIds ? tx.studentFeeDue.count({ where: { studentId, id: { notIn: feeDueIds }, NOT: { kind: "LATE_FEE", parentDueId: { in: feeDueIds } } } }) : Promise.resolve(0),
    tx.attendanceMark.count({ where: { studentId } }),
    tx.marks.count({ where: { studentId } }),
    tx.auditLogEntry.count({ where: { recordId: studentId, recordType: "Student", at: { gt: new Date(admittedAt.getTime() + 60_000) } } }),
    // A hostel bed given since (Hostel Management): the warden checks the student out first.
    tx.bedAllocation.count({ where: { studentId } }),
  ]);
  const out: string[] = [];
  if (payments) out.push("a fee payment");
  else if (links) out.push("a payment link");
  if (concessions || adjustments || otherDues) out.push("a change to the fees");
  if (attendance) out.push("attendance");
  if (marks) out.push("marks");
  if (edits) out.push("a change to the student's record");
  if (beds) out.push("a hostel bed");
  return out;
}

/** Undo admission: within 10 minutes, and only if nothing else has happened to the student. */
export async function undoAdmission(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string, now = new Date()) {
  requireFull(v, "undoing an admission");
  const app = await loadApplication(tx, applicationId, v);
  if (!app.studentId || !app.admittedAt || app.stage !== "ADMITTED") throw new AdmissionProblem("This application is not admitted.");
  if (now.getTime() - app.admittedAt.getTime() > UNDO_ADMISSION_MS) throw new AdmissionProblem("Undo admission works for 10 minutes only. To reverse it now, record the student leaving in Student Management (Leaving & Alumni).");
  const c = app.conversion as unknown as Conversion | null;
  if (!c) throw new AdmissionProblem("This admission cannot be undone here.");
  const student = await tx.student.findUniqueOrThrow({ where: { id: app.studentId } });
  const enrolments = await tx.enrolment.count({ where: { studentId: student.id, archivedAt: null } });
  // Anything recorded for the student after the admission (a payment, attendance, marks, an edit) stops the undo.
  const happened = await happenedSince(tx, student.id, app.admittedAt, c.feeDueIds);
  if (enrolments !== 1) happened.push("a change of class");
  if (happened.length) {
    const what = happened.join(", ");
    throw new AdmissionProblem(`${what[0].toUpperCase()}${what.slice(1)} ${happened.length === 1 ? "is" : "are"} already recorded for this student, so the admission cannot be undone. Record the student leaving in Student Management (Leaving & Alumni) instead.`);
  }
  const at = new Date();
  // The fee plan made at admission comes off the student's fees (nothing was paid on it).
  const dues = await tx.studentFeeDue.findMany({ where: { studentId: student.id, state: "OPEN" }, select: { id: true, amountPaise: true } });
  if (dues.length) {
    await tx.studentFeeDue.updateMany({ where: { id: { in: dues.map((d) => d.id) } }, data: { state: "REMOVED", removedReason: "Admission undone", removedById: ctx.userId, removedAt: at } });
    await refreshBalances(tx, dues.map((d) => d.id));
    await writeAudit(tx, ctx, { action: "removed", recordType: "Student Fee Due", recordId: student.id, before: { rows: dues.length, total: formatRupees(dues.reduce((a, d) => a + d.amountPaise, BigInt(0))) }, after: { reason: "Admission undone" } });
  }
  // Every document on the new student: the papers carried at admission and any that followed since (papers.ts).
  const docs = await tx.studentDocument.updateMany({ where: { studentId: student.id, archivedAt: null }, data: { archivedAt: at } });
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
  await tx.student.update({ where: { id: student.id }, data: { archivedAt: at, applicationId: null, status: "INACTIVE", leavingReason: "Admission undone", ...(c.photoFileId ? { photoFileId: null } : {}) } });
  await tx.admissionConsent.updateMany({ where: { applicationId: app.id }, data: { guardianId: null, studentId: null } });
  await tx.application.update({ where: { id: app.id }, data: { stage: "APPROVED", studentId: null, admittedAt: null, admittedById: null, conversion: Prisma.DbNull, updatedById: ctx.userId } });
  if (app.enquiryId) {
    const e = await tx.enquiry.findUnique({ where: { id: app.enquiryId } });
    if (e && e.status === "admitted") await tx.enquiry.update({ where: { id: e.id }, data: { status: "applied", closedAt: null } });
  }
  await activity(tx, ctx, app.id, "admission-undone", `Admission undone: ${student.fullName} (${c.admissionNo}) archived, with the new parent records, their Parent Links, the class place${dues.length ? `, the fee plan (${dues.length} row${dues.length === 1 ? "" : "s"})` : ""}${docs.count ? ` and the documents (${docs.count})` : ""}. The application fee stays with the application.`);
  await writeAudit(tx, ctx, { action: "admission-undone", recordType: "Application", recordId: app.id, before: { studentId: student.id, admissionNo: c.admissionNo }, after: { stage: "APPROVED" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student", recordId: student.id, after: { reason: "Admission undone within 10 minutes" } });
  return c.admissionNo;
}
