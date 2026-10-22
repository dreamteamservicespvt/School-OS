// Applications (02 §2): the admission form at the counter or online, with a
// unique application number, the papers checklist for the class, sibling
// detection from the parent's phone, the age rule, review, send back,
// moving between stages and withdrawing.
import "server-only";

import type { Application, ApplicationStage, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { encryptField } from "../crypto";
import { nextNumber, formatNumber } from "../sequences";
import { formatDate } from "../format";
import { assertYearOpen, currentEnrolment } from "../academic/years";
import { requestApproval } from "../approvals";
import { AdmissionProblem } from "./act";
import { requireFull, requireOwnCampus, type Viewer } from "./access";
import { DuplicateProblem, systemStatus, type Match } from "./enquiries";
import { applicationPrefix, classList, classRule, needsPreviousSchool, stageOn, yearOnCampus, type Settings } from "./settings";
import { messageParent } from "./notify-parents";

export const STAGES: { value: ApplicationStage; label: string }[] = [
  { value: "SUBMITTED", label: "Submitted" },
  { value: "SUBMITTED_ONLINE", label: "Submitted online" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "DOCUMENTS", label: "Documents" },
  { value: "TEST_INTERVIEW", label: "Test & Interview" },
  { value: "DECISION", label: "Waiting for decision" },
  { value: "APPROVED", label: "Approved" },
  { value: "WAITING_LIST", label: "Waiting list" },
  { value: "REJECTED", label: "Not approved" },
  { value: "ADMITTED", label: "Admitted" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];
export const stageLabel = (v: string) => STAGES.find((s) => s.value === v)?.label ?? v;
export const OPEN_STAGES: ApplicationStage[] = ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION"];
export const CLOSED_STAGES: ApplicationStage[] = ["REJECTED", "ADMITTED", "WITHDRAWN"];

export const GENDERS = ["Male", "Female", "Other"] as const;
export const RELATIONS = ["Father", "Mother", "Guardian", "Grandparent", "Uncle", "Aunt", "Brother", "Sister"] as const;

export type ApplicationInput = {
  classId: string;
  yearId: string;
  firstName: string;
  lastName: string | null;
  dateOfBirth: Date;
  gender: string;
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string;
  previousSchool: string | null;
  previousClass: string | null;
  previousMarks: string | null;
  preferences: { secondLanguage?: string | null; transportNeeded?: boolean; transportStop?: string | null; hostelNeeded?: boolean };
  category: string | null;
  religion: string | null;
  motherTongue: string | null;
  occupation: string | null;
  aadhaar: string | null;
  customFields?: Prisma.InputJsonValue;
};

export async function activity(tx: Tx, ctx: SchoolContext, applicationId: string, kind: string, text: string, data?: Prisma.InputJsonValue) {
  return tx.applicationActivity.create({ data: { schoolId: ctx.schoolId, applicationId, kind, text, data, byId: ctx.userId } });
}

/** Age in whole years on a date. */
export function ageOn(dob: Date, on: Date) {
  let years = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) years--;
  return years;
}

function ageWords(dob: Date, on: Date) {
  let months = (on.getUTCFullYear() - dob.getUTCFullYear()) * 12 + (on.getUTCMonth() - dob.getUTCMonth());
  if (on.getUTCDate() < dob.getUTCDate()) months--;
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return `${y} year${y === 1 ? "" : "s"}${mo ? ` ${mo} month${mo === 1 ? "" : "s"}` : ""}`;
}

/** The class age rule is checked on 31 March of the year the admission year starts (inferred). */
export function ageCutoff(year: { startDate: Date }) {
  return new Date(Date.UTC(year.startDate.getUTCFullYear(), 2, 31));
}

/** Brother or sister already studying here: a guardian with this phone who has a current student. */
export async function findSibling(tx: Tx, phones: (string | null)[]) {
  const list = phones.filter((p): p is string => Boolean(p));
  if (list.length === 0) return null;
  const link = await tx.studentGuardian.findFirst({
    where: { archivedAt: null, guardian: { phone: { in: list }, archivedAt: null }, student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] } } },
    include: { student: true },
    orderBy: { createdAt: "asc" },
  });
  return link?.student ?? null;
}

/**
 * Checks the form. The application is for the campus of the class applied
 * for, in that campus's year (each campus has its own years): the year chosen,
 * or the campus's open year of the same name. `limit`: a person limited to one
 * campus applies only for its classes. `campusId`: an existing application's
 * campus, which a change of class keeps.
 */
async function checkInput(tx: Tx, input: ApplicationInput, s: Settings, opts: { limit?: { campusId?: string | null } | null; campusId?: string | null } = {}) {
  const all = await classList(tx);
  const cls = all.find((c) => c.id === input.classId);
  if (!cls) throw new AdmissionProblem("Choose the class applied for.", "classId");
  requireOwnCampus(opts.limit ?? {}, cls.campusId, "classId");
  if (opts.campusId && cls.campusId !== opts.campusId) throw new AdmissionProblem("Choose a class of this application's campus. For another campus, make a new application.", "classId");
  const classes = all.filter((c) => c.campusId === cls.campusId);
  const year = await yearOnCampus(tx, input.yearId, cls.campusId);
  if (!year) throw new AdmissionProblem("Choose the admission year.", "yearId");
  await assertYearOpen(tx, year.id);
  if (!GENDERS.includes(input.gender as (typeof GENDERS)[number])) throw new AdmissionProblem("Choose the gender.", "gender");
  if (!input.fatherName && !input.motherName && !input.guardianName) throw new AdmissionProblem("Give the father's, mother's or guardian's name: at least one.", "fatherName");
  if (input.guardianName && !input.guardianRelation) throw new AdmissionProblem("Say how the guardian is related to the child.", "guardianRelation");
  if (input.altPhone && input.altPhone === input.phone) throw new AdmissionProblem("The second phone is the same as the first. Leave it empty or give another number.", "altPhone");
  const today = new Date();
  if (input.dateOfBirth > today) throw new AdmissionProblem("Date of birth cannot be in the future.", "dateOfBirth");
  if (ageOn(input.dateOfBirth, today) > 25) throw new AdmissionProblem("Date of birth looks wrong: the child would be over 25 years old.", "dateOfBirth");
  const rule = await classRule(tx, cls.id);
  const cutoff = ageCutoff(year);
  const age = ageOn(input.dateOfBirth, cutoff);
  if ((rule.minAge !== null && age < rule.minAge) || (rule.maxAge !== null && age > rule.maxAge)) {
    const range = rule.minAge !== null && rule.maxAge !== null ? `${rule.minAge} to ${rule.maxAge} years old` : rule.minAge !== null ? `at least ${rule.minAge} years old` : `at most ${rule.maxAge} years old`;
    throw new AdmissionProblem(`For ${cls.name} the child must be ${range} on ${formatDate(cutoff)} (Admission Settings). ${input.firstName} will be ${ageWords(input.dateOfBirth, cutoff)}.`, "dateOfBirth");
  }
  if (needsPreviousSchool(cls, classes) && !input.previousSchool) throw new AdmissionProblem(`For ${cls.name}, give the previous school.`, "previousSchool");
  if (input.category && s.quotaOn === false && input.category.length > 40) throw new AdmissionProblem("Category is too long.", "category");
  return { cls, year, rule };
}

/**
 * Same child already here: name and date of birth with the same phone, as a student or an open application (workflow 1).
 * campusId: a person limited to one campus is shown that campus's matches only.
 */
export async function childDuplicates(tx: Tx, input: { fullName: string; dateOfBirth: Date; phone: string }, excludeId?: string, campusId?: string | null): Promise<Match[]> {
  const out: Match[] = [];
  const campus = campusId ? { campusId } : {};
  const apps = await tx.application.findMany({
    where: { archivedAt: null, id: excludeId ? { not: excludeId } : undefined, stage: { notIn: ["WITHDRAWN", "REJECTED"] }, dateOfBirth: input.dateOfBirth, fullName: { equals: input.fullName, mode: "insensitive" }, ...campus },
    take: 3,
  });
  for (const a of apps) out.push({ kind: "application", id: a.id, href: `/admission-management/applications/${a.id}`, text: `${a.fullName}, born ${formatDate(a.dateOfBirth)}, already has application ${a.applicationNo}.` });
  const students = await tx.student.findMany({
    where: { archivedAt: null, dateOfBirth: input.dateOfBirth, fullName: { equals: input.fullName, mode: "insensitive" }, guardians: { some: { archivedAt: null, guardian: { phone: input.phone } } }, ...campus },
    take: 3,
  });
  for (const st of students) {
    // The class this year, in the student's own campus's current year.
    const en = await currentEnrolment(tx, st.id);
    const sec = en ? await tx.section.findUnique({ where: { id: en.sectionId }, include: { schoolClass: true } }) : null;
    out.push({ kind: "parent", id: st.id, href: `/student-management?q=${encodeURIComponent(st.admissionNo)}`, text: `A student with this name, date of birth and parent phone already exists${sec ? ` in ${sec.schoolClass.name} ${sec.name}` : ""} (admission no. ${st.admissionNo}).` });
  }
  return out;
}

/** Makes the papers checklist rows for the class (Not received). Rows already there are kept. */
export async function ensureChecklist(tx: Tx, ctx: SchoolContext, app: Pick<Application, "id" | "classId">) {
  const rule = await classRule(tx, app.classId);
  const have = await tx.applicationDocument.findMany({ where: { applicationId: app.id }, select: { id: true, docType: true, required: true } });
  for (const d of rule.documents) {
    const row = have.find((h) => h.docType === d.type);
    if (row) {
      if (row.required !== d.required) await tx.applicationDocument.update({ where: { id: row.id }, data: { required: d.required } });
      continue;
    }
    await tx.applicationDocument.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, docType: d.type, required: d.required } });
  }
  // Papers no longer on the class list (after a class change) stop counting as required.
  for (const h of have) {
    if (h.required && !rule.documents.some((d) => d.type === h.docType)) await tx.applicationDocument.update({ where: { id: h.id }, data: { required: false } });
  }
}

/** campusId is kept for older callers: the application's campus is always its class's (and year's) campus. */
export type CreateOptions = { campusId?: string; channel: "counter" | "online"; enquiryId?: string | null; force?: boolean };

/**
 * Saves a new application. Fields already known from the enquiry are filled
 * on the form; the same child twice is stopped unless the person chose
 * "Save anyway". It is for the campus of the class applied for.
 */
export async function createApplication(tx: Tx, ctx: SchoolContext, v: Viewer | null, s: Settings, input: ApplicationInput, opts: CreateOptions) {
  if (v) requireFull(v, "applications");
  const { cls, year, rule } = await checkInput(tx, input, s, { limit: v });
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ");
  if (!opts.force) {
    const dupes = await childDuplicates(tx, { fullName, dateOfBirth: input.dateOfBirth, phone: input.phone }, undefined, v?.campusId);
    if (dupes.length) throw new DuplicateProblem(dupes);
  }
  let enquiry = opts.enquiryId ? await tx.enquiry.findFirst({ where: { id: opts.enquiryId, archivedAt: null, ...(v?.campusId ? { campusId: v.campusId } : {}) } }) : null;
  if (opts.enquiryId && !enquiry) throw new AdmissionProblem("The enquiry this application came from was not found.");
  if (enquiry && (await tx.application.count({ where: { enquiryId: enquiry.id, archivedAt: null, stage: { notIn: ["WITHDRAWN", "REJECTED"] } } })) > 0) {
    throw new AdmissionProblem("This enquiry already has an application.", undefined, { href: `/admission-management/enquiries/${enquiry.id}`, label: "Open the enquiry" });
  }
  if (!enquiry && opts.channel === "online") {
    // An online form from a family already in Enquiries joins their enquiry.
    enquiry = await tx.enquiry.findFirst({ where: { archivedAt: null, phone: input.phone, status: { notIn: ["applied", "admitted"] }, campusId: cls.campusId }, orderBy: { createdAt: "desc" } });
  }
  const sibling = await findSibling(tx, [input.phone, input.altPhone]);
  const n = await nextNumber(tx, ctx, `application:${year.name}`);
  const applicationNo = formatNumber(applicationPrefix(s.applicationPrefix, year.name), n, 4);
  const app = await tx.application.create({
    data: {
      schoolId: ctx.schoolId, campusId: cls.campusId, academicYearId: year.id, applicationNo, enquiryId: enquiry?.id ?? null, classId: cls.id,
      firstName: input.firstName, lastName: input.lastName, fullName, dateOfBirth: input.dateOfBirth, gender: input.gender,
      fatherName: input.fatherName, motherName: input.motherName, guardianName: input.guardianName, guardianRelation: input.guardianRelation,
      phone: input.phone, altPhone: input.altPhone, email: input.email, address: input.address,
      previousSchool: input.previousSchool, previousClass: input.previousClass, previousMarks: input.previousMarks,
      preferences: input.preferences as Prisma.InputJsonValue, siblingStudentId: sibling?.id ?? null, category: input.category,
      religion: input.religion, motherTongue: input.motherTongue, occupation: input.occupation,
      aadhaarEnc: input.aadhaar ? encryptField(input.aadhaar) : null, customFields: input.customFields ?? {},
      channel: opts.channel, stage: opts.channel === "online" ? "SUBMITTED_ONLINE" : "SUBMITTED",
      feeDuePaise: s.applicationFeeOn && rule.feePaise && rule.feePaise > BigInt(0) ? rule.feePaise : null,
      createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
  await ensureChecklist(tx, ctx, app);
  await activity(tx, ctx, app.id, "created", `Application ${applicationNo} ${opts.channel === "online" ? "submitted online by the parent" : "filled at the counter"} for ${cls.name}.${sibling ? ` Sibling in school: ${sibling.fullName}.` : ""}`);
  if (enquiry) await systemStatus(tx, ctx, s, enquiry, "applied", `Application ${applicationNo} made for ${fullName}.`);
  await writeAudit(tx, ctx, { action: "created", recordType: "Application", recordId: app.id, after: { applicationNo, fullName, classId: cls.id, phone: app.phone, channel: opts.channel, enquiryId: enquiry?.id ?? null, sibling: sibling?.id ?? null } });
  return app;
}

/**
 * An application by id. `limit` (the Viewer, or anything with campusId): for
 * a person limited to one campus, another campus's application is not found.
 */
export async function loadApplication(tx: Tx, id: string, limit?: { campusId?: string | null } | null) {
  const app = await tx.application.findFirst({ where: { id, archivedAt: null, ...(limit?.campusId ? { campusId: limit.campusId } : {}) } });
  if (!app) throw new AdmissionProblem("This application was not found. It may have been archived.");
  return app;
}

/** Edit the form while it is still open (not decided). */
export async function editApplication(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, input: ApplicationInput) {
  requireFull(v, "applications");
  const app = await loadApplication(tx, id, v);
  if (!OPEN_STAGES.includes(app.stage) && app.stage !== "WAITING_LIST") throw new AdmissionProblem(`This application is ${stageLabel(app.stage).toLowerCase()}, so its form can no longer be changed.`);
  // The class stays on the campus of the application's year (the year decides where the child is admitted).
  const appYear = await tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { campusId: true } });
  const { cls, rule } = await checkInput(tx, { ...input, yearId: app.academicYearId }, s, { limit: v, campusId: appYear?.campusId ?? app.campusId });
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ");
  const sibling = await findSibling(tx, [input.phone, input.altPhone]);
  const before = { classId: app.classId, fullName: app.fullName, dateOfBirth: app.dateOfBirth.toISOString().slice(0, 10), phone: app.phone, address: app.address, previousSchool: app.previousSchool, previousMarks: app.previousMarks };
  const changed = await tx.application.update({
    where: { id },
    data: {
      classId: cls.id, campusId: cls.campusId, firstName: input.firstName, lastName: input.lastName, fullName, dateOfBirth: input.dateOfBirth, gender: input.gender,
      fatherName: input.fatherName, motherName: input.motherName, guardianName: input.guardianName, guardianRelation: input.guardianRelation,
      phone: input.phone, altPhone: input.altPhone, email: input.email, address: input.address, previousSchool: input.previousSchool,
      previousClass: input.previousClass, previousMarks: input.previousMarks, preferences: input.preferences as Prisma.InputJsonValue,
      siblingStudentId: sibling?.id ?? null, category: input.category, religion: input.religion, motherTongue: input.motherTongue, occupation: input.occupation,
      ...(input.aadhaar ? { aadhaarEnc: encryptField(input.aadhaar) } : {}),
      ...(input.customFields ? { customFields: input.customFields } : {}),
      feeDuePaise: app.classId !== cls.id ? (s.applicationFeeOn && rule.feePaise && rule.feePaise > BigInt(0) ? rule.feePaise : null) : app.feeDuePaise,
      updatedById: ctx.userId,
    },
  });
  if (app.classId !== cls.id) await ensureChecklist(tx, ctx, changed);
  const after = { classId: cls.id, fullName, dateOfBirth: input.dateOfBirth.toISOString().slice(0, 10), phone: input.phone, address: input.address, previousSchool: input.previousSchool, previousMarks: input.previousMarks };
  await activity(tx, ctx, id, "edited", "Form details changed.", { before, after });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Application", recordId: id, before, after });
  return changed;
}

/** Review: mark "Reviewed" with a note. */
export async function review(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, note: string | null) {
  requireFull(v, "reviews");
  const app = await loadApplication(tx, id, v);
  if (app.stage !== "SUBMITTED" && app.stage !== "SUBMITTED_ONLINE") throw new AdmissionProblem("This application is already past review.");
  await tx.application.update({ where: { id }, data: { stage: "REVIEWED", reviewedAt: new Date(), reviewedById: ctx.userId, reviewNote: note, sentBackAt: null, updatedById: ctx.userId } });
  await activity(tx, ctx, id, "reviewed", `Reviewed.${note ? ` ${note}` : ""}`);
  await writeAudit(tx, ctx, { action: "reviewed", recordType: "Application", recordId: id, before: { stage: app.stage }, after: { stage: "REVIEWED", note } });
}

/** Send back to the parent for missing details, by message. */
export async function sendBack(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, id: string, note: string) {
  requireFull(v, "applications");
  const app = await loadApplication(tx, id, v);
  if (CLOSED_STAGES.includes(app.stage)) throw new AdmissionProblem("This application is closed.");
  if (note.trim().length < 5) throw new AdmissionProblem("Say what is missing, so the parent knows what to send.", "note");
  const parent = app.fatherName ?? app.motherName ?? app.guardianName ?? "Parent";
  const r = await messageParent(tx, ctx, { to: { name: parent, phone: app.phone, email: app.email }, template: "admission-details-missing", text: `Dear ${parent}, application ${app.applicationNo} for ${app.fullName} at ${schoolName} needs a few more details: ${note.trim()}. Please share them with the school office.`, about: { recordType: "Application", recordId: id } });
  await tx.application.update({ where: { id }, data: { sentBackAt: new Date(), sentBackNote: note.trim(), updatedById: ctx.userId } });
  await activity(tx, ctx, id, "sent-back", `Sent back to the parent for missing details: ${note.trim()}${r.status === "skipped" ? ` (message not sent: ${(r.note ?? "no valid phone").toLowerCase()})` : ""}`);
  await writeAudit(tx, ctx, { action: "sent-back", recordType: "Application", recordId: id, after: { note: note.trim(), message: r.status } });
}

const MOVE_ORDER: ApplicationStage[] = ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION"];

/** Where an application can be moved by hand (buttons and the pipeline board). */
export function movableTo(s: Settings, from: ApplicationStage): ApplicationStage[] {
  if (!MOVE_ORDER.includes(from) && from !== "WAITING_LIST") return [];
  const targets: ApplicationStage[] = [];
  if (stageOn(s, "documents") && from !== "DOCUMENTS") targets.push("DOCUMENTS");
  if ((stageOn(s, "test") || stageOn(s, "interview")) && from !== "TEST_INTERVIEW") targets.push("TEST_INTERVIEW");
  if (from !== "DECISION") targets.push("DECISION");
  return targets;
}

/** Fee confirmed (or none due)? Used when the payment stage is on. */
export async function feeSettled(tx: Tx, app: Pick<Application, "id" | "feeDuePaise">) {
  if (!app.feeDuePaise) return true;
  const paid = await tx.applicationFeePayment.aggregate({ where: { applicationId: app.id, status: "CONFIRMED", cancelledAt: null }, _sum: { amountPaise: true } });
  return (paid._sum.amountPaise ?? BigInt(0)) >= app.feeDuePaise;
}

/** Move to Documents, Test & Interview or Decision, with the same checks wherever it is done. */
export async function moveStage(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, to: ApplicationStage) {
  requireFull(v, "moving applications");
  const app = await loadApplication(tx, id, v);
  if (app.stage === to) return app;
  if (!movableTo(s, app.stage).includes(to)) {
    if (to === "TEST_INTERVIEW") throw new AdmissionProblem("Tests and interviews are switched off in Admission Settings.");
    throw new AdmissionProblem(`An application that is ${stageLabel(app.stage).toLowerCase()} cannot be moved to ${stageLabel(to)}.`);
  }
  if (to === "DECISION") return sendForDecision(tx, ctx, v, s, app);
  await tx.application.update({ where: { id }, data: { stage: to, updatedById: ctx.userId } });
  await activity(tx, ctx, id, "stage", `Moved from ${stageLabel(app.stage)} to ${stageLabel(to)}.`, { from: app.stage, to });
  await writeAudit(tx, ctx, { action: "stage-changed", recordType: "Application", recordId: id, before: { stage: app.stage }, after: { stage: to } });
  return app;
}

/**
 * Ready for a decision. When the Decision stage needs an approval (Admission
 * Settings), the request goes to Approvals for the people who decide it.
 */
export async function sendForDecision(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, app: Application) {
  if (stageOn(s, "payment") && !(await feeSettled(tx, app))) throw new AdmissionProblem("The application fee is not paid yet, and your school's stages need it before the decision (Admission Settings). Collect the fee first.");
  const fromWaiting = app.stage === "WAITING_LIST";
  let approvalId: string | null = null;
  const needsApproval = s.stageList.find((x) => x.key === "decision")?.needsApproval ?? true;
  if (needsApproval) {
    const open = app.approvalId ? await tx.approval.findFirst({ where: { id: app.approvalId, status: { in: ["WAITING", "ESCALATED"] } } }) : null;
    if (open) approvalId = open.id;
    else {
      const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
      try {
        const approval = await requestApproval(tx, ctx, { type: "admission", recordType: "Application", recordId: app.id, summary: `Admission: ${app.fullName}, ${cls?.name ?? "class"} (${app.applicationNo})` });
        approvalId = approval.id;
      } catch (e) {
        throw new AdmissionProblem(e instanceof Error ? e.message : "Nobody can decide this admission yet.");
      }
    }
  }
  await tx.application.update({
    where: { id: app.id },
    data: { stage: "DECISION", approvalId, ...(fromWaiting ? { waitingRank: null, waitingReason: null, waitingSince: null } : {}), updatedById: ctx.userId },
  });
  if (fromWaiting && app.waitingRank !== null) await closeRankGap(tx, app);
  await activity(tx, ctx, app.id, "stage", `${fromWaiting ? "Seat offered from the waiting list" : `Moved from ${stageLabel(app.stage)}`}; ready for a decision${needsApproval ? " (in Approvals)" : ""}.`, { from: app.stage, to: "DECISION" });
  await writeAudit(tx, ctx, { action: "sent-for-decision", recordType: "Application", recordId: app.id, before: { stage: app.stage }, after: { stage: "DECISION", approvalId } });
  return app;
}

/** After someone leaves the waiting list, the people below move up one. */
export async function closeRankGap(tx: Tx, app: Pick<Application, "academicYearId" | "classId" | "waitingRank">) {
  if (app.waitingRank === null) return;
  await tx.application.updateMany({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", waitingRank: { gt: app.waitingRank } }, data: { waitingRank: { decrement: 1 } } });
}

/** Withdraw: the parent is no longer interested. Needs a reason. */
export async function withdraw(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, reason: string) {
  requireFull(v, "withdrawing applications");
  const app = await loadApplication(tx, id, v);
  if (CLOSED_STAGES.includes(app.stage)) throw new AdmissionProblem(app.stage === "ADMITTED" ? "This child is already admitted. Use Leaving & Alumni in Student Management instead." : "This application is already closed.");
  if (reason.trim().length < 5) throw new AdmissionProblem("Give the reason the family is withdrawing.", "reason");
  await tx.application.update({ where: { id }, data: { stage: "WITHDRAWN", withdrawnReason: reason.trim(), withdrawnAt: new Date(), waitingRank: null, updatedById: ctx.userId } });
  if (app.stage === "WAITING_LIST") await closeRankGap(tx, app);
  if (app.approvalId) {
    await tx.approval.updateMany({ where: { id: app.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decidedAt: new Date(), decisionReason: `Application withdrawn: ${reason.trim()}` } });
    await tx.notification.updateMany({ where: { link: `/approvals/${app.approvalId}`, doneAt: null }, data: { doneAt: new Date() } });
  }
  await activity(tx, ctx, id, "withdrawn", `Withdrawn: ${reason.trim()}`, { from: app.stage });
  await writeAudit(tx, ctx, { action: "withdrawn", recordType: "Application", recordId: id, before: { stage: app.stage }, after: { stage: "WITHDRAWN", reason: reason.trim() } });
}

export function parentName(app: Pick<Application, "fatherName" | "motherName" | "guardianName">) {
  return app.fatherName ?? app.motherName ?? app.guardianName ?? "Parent";
}
