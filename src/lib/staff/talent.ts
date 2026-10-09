// Recruitment & Appraisal (optional page, 09 §2): vacancies, applications,
// interviews with no double booking of interviewers, offers, the appraisal
// cycle, training records and promotions.
import "server-only";

import type { ApplicationStatus, Prisma, VacancyStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { nextNumber, formatNumber } from "../sequences";
import { formatDateTime } from "../format";

export class TalentProblem extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "TalentProblem";
  }
}

export const VACANCY_STATUSES: { value: VacancyStatus; label: string }[] = [
  { value: "OPEN", label: "Open" }, { value: "ON_HOLD", label: "On hold" }, { value: "FILLED", label: "Filled" }, { value: "CLOSED", label: "Closed" },
];
export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "NEW", label: "New" }, { value: "SHORTLISTED", label: "Shortlisted" }, { value: "INTERVIEW", label: "Interview" },
  { value: "OFFERED", label: "Offered" }, { value: "HIRED", label: "Hired" }, { value: "REJECTED", label: "Not selected" }, { value: "WITHDRAWN", label: "Withdrawn" },
];
export const INTERVIEW_OUTCOMES = [
  { value: "PENDING", label: "Scheduled" }, { value: "PASSED", label: "Selected" }, { value: "FAILED", label: "Not selected" },
  { value: "NO_SHOW", label: "Did not come" }, { value: "CANCELLED", label: "Cancelled" },
];
export const OFFER_STATUSES = [
  { value: "MADE", label: "Made" }, { value: "ACCEPTED", label: "Accepted" }, { value: "DECLINED", label: "Declined" }, { value: "WITHDRAWN", label: "Withdrawn" },
];
export const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

// ---------------------------------------------------------------- recruitment

export async function openVacancy(tx: Tx, ctx: SchoolContext, input: { designation: string; departmentId: string | null; openings: number; closingDate: Date | null; details: string | null }) {
  const d = await tx.designation.findFirst({ where: { schoolId: ctx.schoolId, name: input.designation, archivedAt: null } });
  if (!d) throw new TalentProblem("Choose the post from the list of designations.", "designation");
  const v = await tx.vacancy.create({ data: { schoolId: ctx.schoolId, ...input, departmentId: input.departmentId ?? d.defaultDepartmentId, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Vacancy", recordId: v.id, after: { designation: v.designation, openings: v.openings } });
  return v;
}

export async function setVacancyStatus(tx: Tx, ctx: SchoolContext, id: string, status: VacancyStatus) {
  const v = await tx.vacancy.findFirstOrThrow({ where: { id, archivedAt: null } });
  await tx.vacancy.update({ where: { id }, data: { status } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Vacancy", recordId: id, before: { status: v.status }, after: { status } });
}

export async function addApplication(tx: Tx, ctx: SchoolContext, input: { vacancyId: string; name: string; phone: string; email: string | null; qualification: string | null; experienceYears: number | null; resumeFileId: string | null; notes: string | null }) {
  const v = await tx.vacancy.findFirst({ where: { id: input.vacancyId, archivedAt: null } });
  if (!v) throw new TalentProblem("Choose the vacancy.", "vacancyId");
  if (v.status !== "OPEN") throw new TalentProblem(`The ${v.designation} vacancy is not open. Open it again to add applications.`, "vacancyId");
  const dup = await tx.jobApplication.findFirst({ where: { vacancyId: v.id, phone: input.phone, archivedAt: null } });
  if (dup) throw new TalentProblem(`${dup.name} has already applied for this vacancy with this phone.`, "phone");
  const a = await tx.jobApplication.create({ data: { schoolId: ctx.schoolId, ...input, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Job Application", recordId: a.id, after: { name: a.name, vacancy: v.designation } });
  return a;
}

export async function setApplicationStatus(tx: Tx, ctx: SchoolContext, id: string, status: ApplicationStatus) {
  const a = await tx.jobApplication.findFirstOrThrow({ where: { id, archivedAt: null } });
  if (a.status === "HIRED") throw new TalentProblem(`${a.name} is already hired.`);
  await tx.jobApplication.update({ where: { id }, data: { status } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Job Application", recordId: id, before: { status: a.status }, after: { status } });
}

/** Schedules an interview. An interviewer cannot be in two interviews at the same time (inferred). */
export async function scheduleInterview(tx: Tx, ctx: SchoolContext, input: { applicationId: string; startsAt: Date; minutes: number; interviewerIds: string[]; place: string | null }, timeZone = "Asia/Kolkata") {
  const a = await tx.jobApplication.findFirst({ where: { id: input.applicationId, archivedAt: null }, include: { vacancy: true } });
  if (!a) throw new TalentProblem("Choose the applicant.", "applicationId");
  if (["HIRED", "REJECTED", "WITHDRAWN"].includes(a.status)) throw new TalentProblem(`${a.name}'s application is closed.`, "applicationId");
  if (input.interviewerIds.length === 0) throw new TalentProblem("Choose at least one interviewer.", "interviewerIds");
  if (input.minutes < 10 || input.minutes > 480) throw new TalentProblem("Length must be between 10 and 480 minutes.", "minutes");
  const end = new Date(input.startsAt.getTime() + input.minutes * 60_000);
  const others = await tx.interview.findMany({
    where: { schoolId: ctx.schoolId, outcome: "PENDING", interviewerIds: { hasSome: input.interviewerIds }, startsAt: { lt: end, gte: new Date(input.startsAt.getTime() - 8 * 3600_000) } },
  });
  const clash = others.find((o) => new Date(o.startsAt.getTime() + o.minutes * 60_000) > input.startsAt);
  if (clash) {
    const who = clash.interviewerIds.find((i) => input.interviewerIds.includes(i));
    const staff = who ? await tx.staff.findUnique({ where: { id: who }, select: { fullName: true } }) : null;
    throw new TalentProblem(`${staff?.fullName ?? "An interviewer"} already has an interview at ${formatDateTime(clash.startsAt, timeZone)}. Choose another time or interviewer.`, "startsAt");
  }
  const i = await tx.interview.create({ data: { schoolId: ctx.schoolId, ...input, createdById: ctx.userId } });
  if (["NEW", "SHORTLISTED"].includes(a.status)) await tx.jobApplication.update({ where: { id: a.id }, data: { status: "INTERVIEW" } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Interview", recordId: i.id, after: { applicant: a.name, startsAt: input.startsAt.toISOString(), interviewers: input.interviewerIds.length } });
  const logins = await tx.staff.findMany({ where: { id: { in: input.interviewerIds }, userLoginId: { not: null } }, select: { userLoginId: true } });
  for (const l of logins) {
    await notify(tx, ctx, { to: l.userLoginId!, type: "interview", text: `Interview of ${a.name} for ${a.vacancy.designation} at ${formatDateTime(input.startsAt, timeZone)}`, link: "/staff-hr-management/recruitment?view=interviews" });
  }
  return i;
}

export async function recordOutcome(tx: Tx, ctx: SchoolContext, id: string, outcome: string, notes: string | null) {
  if (!INTERVIEW_OUTCOMES.some((o) => o.value === outcome)) throw new TalentProblem("Choose the outcome.", "outcome");
  const i = await tx.interview.findFirstOrThrow({ where: { id } });
  await tx.interview.update({ where: { id }, data: { outcome, notes } });
  if (outcome === "FAILED") await tx.jobApplication.updateMany({ where: { id: i.applicationId, status: { in: ["INTERVIEW", "SHORTLISTED", "NEW"] } }, data: { status: "REJECTED" } });
  await writeAudit(tx, ctx, { action: "interview-outcome", recordType: "Interview", recordId: id, before: { outcome: i.outcome }, after: { outcome, notes } });
}

export async function makeOffer(tx: Tx, ctx: SchoolContext, input: { applicationId: string; designation: string; departmentId: string | null; joiningDate: Date; monthlyPaise: bigint | null; respondBy: Date | null }) {
  const a = await tx.jobApplication.findFirst({ where: { id: input.applicationId, archivedAt: null } });
  if (!a) throw new TalentProblem("Choose the applicant.", "applicationId");
  if (["HIRED", "REJECTED", "WITHDRAWN"].includes(a.status)) throw new TalentProblem(`${a.name}'s application is closed.`, "applicationId");
  const open = await tx.offer.findFirst({ where: { applicationId: a.id, status: { in: ["MADE", "ACCEPTED"] } } });
  if (open) throw new TalentProblem(`${a.name} already has an offer (${open.offerNo}).`, "applicationId");
  const n = await nextNumber(tx, ctx, "offer-letter");
  const offer = await tx.offer.create({ data: { schoolId: ctx.schoolId, ...input, offerNo: formatNumber(`OFR/${input.joiningDate.getUTCFullYear()}/`, n, 4), createdById: ctx.userId } });
  await tx.jobApplication.update({ where: { id: a.id }, data: { status: "OFFERED" } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Offer", recordId: offer.id, after: { applicant: a.name, offerNo: offer.offerNo, designation: offer.designation, monthly: input.monthlyPaise?.toString() ?? null } });
  return offer;
}

export async function setOfferStatus(tx: Tx, ctx: SchoolContext, id: string, status: string) {
  if (!OFFER_STATUSES.some((o) => o.value === status)) throw new TalentProblem("Choose the offer status.");
  const o = await tx.offer.findFirstOrThrow({ where: { id } });
  await tx.offer.update({ where: { id }, data: { status } });
  if (status === "DECLINED" || status === "WITHDRAWN") await tx.jobApplication.updateMany({ where: { id: o.applicationId, status: "OFFERED" }, data: { status: status === "DECLINED" ? "WITHDRAWN" : "REJECTED" } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Offer", recordId: id, before: { status: o.status }, after: { status } });
}

/** An accepted offer became a staff member through Add Staff. */
export async function markHired(tx: Tx, ctx: SchoolContext, applicationId: string, staffId: string) {
  const a = await tx.jobApplication.findFirst({ where: { id: applicationId, archivedAt: null }, include: { vacancy: true } });
  if (!a) return;
  await tx.jobApplication.update({ where: { id: a.id }, data: { status: "HIRED", hiredStaffId: staffId } });
  await tx.offer.updateMany({ where: { applicationId: a.id, status: "MADE" }, data: { status: "ACCEPTED" } });
  const hired = await tx.jobApplication.count({ where: { vacancyId: a.vacancyId, status: "HIRED" } });
  if (hired >= a.vacancy.openings) await tx.vacancy.update({ where: { id: a.vacancyId }, data: { status: "FILLED" } });
  await writeAudit(tx, ctx, { action: "hired", recordType: "Job Application", recordId: a.id, after: { staffId } });
}

// ---------------------------------------------------------------- appraisal

export async function startCycle(tx: Tx, ctx: SchoolContext, input: { name: string; academicYearId: string; criteria: string[]; startDate: Date; endDate: Date }) {
  if (input.criteria.length === 0) throw new TalentProblem("Add at least one thing to rate, one per line.", "criteria");
  if (input.endDate < input.startDate) throw new TalentProblem("End date is before the start date.", "endDate");
  if (await tx.appraisalCycle.findFirst({ where: { schoolId: ctx.schoolId, name: input.name } })) throw new TalentProblem(`A cycle named ${input.name} already exists.`, "name");
  const cycle = await tx.appraisalCycle.create({ data: { schoolId: ctx.schoolId, ...input, createdById: ctx.userId } });
  const staff = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, include: { department: true } });
  await tx.appraisal.createMany({
    data: staff.map((s) => ({
      schoolId: ctx.schoolId, cycleId: cycle.id, staffId: s.id,
      reviewerId: s.reportingToId ?? (s.department?.headStaffId && s.department.headStaffId !== s.id ? s.department.headStaffId : null),
    })),
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Appraisal Cycle", recordId: cycle.id, after: { name: cycle.name, staff: staff.length, criteria: input.criteria } });
  for (const s of staff) {
    if (s.userLoginId) await notify(tx, ctx, { to: s.userLoginId, type: "appraisal", text: `${cycle.name} has started. Fill your self review.`, link: "/staff-hr-management/recruitment?view=appraisal", groupKey: "appraisal" });
  }
  return cycle;
}

const cleanRatings = (criteria: string[], raw: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const c of criteria) {
    const v = raw[c];
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new TalentProblem(`Rate "${c}" from 1 to 5.`, "ratings");
    out[c] = v;
  }
  return out;
};

/** The staff member's self review, then the reviewer's; the final rating is the reviewer's average. */
export async function saveReview(tx: Tx, ctx: SchoolContext, appraisalId: string, by: "self" | "manager", ratings: Record<string, number>, comment: string | null) {
  const a = await tx.appraisal.findFirstOrThrow({ where: { id: appraisalId }, include: { cycle: true } });
  if (a.cycle.status !== "OPEN") throw new TalentProblem("This appraisal cycle is closed.");
  const clean = cleanRatings(a.cycle.criteria, ratings);
  if (by === "self") {
    if (a.status !== "SELF_REVIEW") throw new TalentProblem("The self review is already done.");
    await tx.appraisal.update({ where: { id: a.id }, data: { selfRatings: clean, selfComment: comment, status: "MANAGER_REVIEW" } });
    if (a.reviewerId) {
      const r = await tx.staff.findUnique({ where: { id: a.reviewerId }, select: { userLoginId: true } });
      const s = await tx.staff.findUnique({ where: { id: a.staffId }, select: { fullName: true } });
      if (r?.userLoginId) await notify(tx, ctx, { to: r.userLoginId, type: "appraisal", text: `${s?.fullName} finished the self review. Your review is next.`, link: "/staff-hr-management/recruitment?view=appraisal", groupKey: "appraisal-review" });
    }
  } else {
    if (a.status === "DONE") throw new TalentProblem("This review is already done.");
    const values = Object.values(clean);
    const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
    await tx.appraisal.update({ where: { id: a.id }, data: { managerRatings: clean, managerComment: comment, status: "DONE", finalRating: avg } });
  }
  await writeAudit(tx, ctx, { action: `appraisal-${by}-review`, recordType: "Appraisal", recordId: a.id, after: { ratings: clean, comment } as Prisma.InputJsonValue });
}

export async function closeCycle(tx: Tx, ctx: SchoolContext, cycleId: string) {
  const c = await tx.appraisalCycle.findFirstOrThrow({ where: { id: cycleId } });
  if (c.status === "CLOSED") throw new TalentProblem("This cycle is already closed.");
  await tx.appraisalCycle.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "closed", recordType: "Appraisal Cycle", recordId: c.id, before: { status: "OPEN" }, after: { status: "CLOSED" } });
}

// ---------------------------------------------------------------- training and promotions

export async function addTraining(tx: Tx, ctx: SchoolContext, input: { staffId: string; course: string; provider: string | null; fromDate: Date; toDate: Date; hours: number; certificateFileId: string | null }) {
  if (input.toDate < input.fromDate) throw new TalentProblem("To date is before the from date.", "toDate");
  if (!(input.hours > 0 && input.hours <= 2000)) throw new TalentProblem("Hours must be more than 0.", "hours");
  const s = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!s) throw new TalentProblem("Choose the staff member.", "staffId");
  const t = await tx.trainingRecord.create({ data: { schoolId: ctx.schoolId, ...input, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Training Record", recordId: t.id, after: { staff: s.fullName, course: t.course, hours: input.hours } });
  return t;
}

/** A promotion changes the designation (and department) from a date; salary changes go to Salary Structures. */
export async function recordPromotion(tx: Tx, ctx: SchoolContext, input: { staffId: string; toDesignation: string; toDepartmentId: string | null; effectiveFrom: Date; reason: string }) {
  const s = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!s) throw new TalentProblem("Choose the staff member.", "staffId");
  const d = await tx.designation.findFirst({ where: { schoolId: ctx.schoolId, name: input.toDesignation, archivedAt: null } });
  if (!d) throw new TalentProblem("Choose the new designation from the list.", "toDesignation");
  if (d.name === s.designation && (input.toDepartmentId ?? s.departmentId) === s.departmentId) throw new TalentProblem(`${s.fullName} is already ${s.designation}.`, "toDesignation");
  if (input.reason.trim().length < 3) throw new TalentProblem("Reason is needed.", "reason");
  const p = await tx.promotionRecord.create({
    data: {
      schoolId: ctx.schoolId, staffId: s.id, fromDesignation: s.designation, toDesignation: d.name,
      fromDepartmentId: s.departmentId, toDepartmentId: input.toDepartmentId ?? s.departmentId, effectiveFrom: input.effectiveFrom, reason: input.reason.trim(), createdById: ctx.userId,
    },
  });
  await tx.staff.update({ where: { id: s.id }, data: { designation: d.name, staffType: d.staffType, departmentId: input.toDepartmentId ?? s.departmentId, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "promoted", recordType: "Staff", recordId: s.id, before: { designation: s.designation, departmentId: s.departmentId }, after: { designation: d.name, departmentId: input.toDepartmentId ?? s.departmentId, from: input.effectiveFrom.toISOString().slice(0, 10), reason: input.reason } });
  return p;
}
