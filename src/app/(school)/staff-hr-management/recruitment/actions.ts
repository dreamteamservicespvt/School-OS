"use server";

import type { ApplicationStatus, VacancyStatus } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { checkIndianMobile } from "@/lib/format";
import { act, dateOf, dateTimeOf, file, FieldProblem, id, optionalDateOf, optionalId, rupeesOf, str } from "@/lib/staff/act";
import { HrOnlyError, viewerFor } from "@/lib/staff/access";
import { offCampus } from "@/lib/staff/list";
import { hrFeaturesOn, type HrFeature } from "@/lib/staff/settings";
import {
  addApplication, addTraining, APPLICATION_STATUSES, closeCycle, makeOffer, openVacancy, recordOutcome, recordPromotion, saveReview, scheduleInterview, setApplicationStatus, setOfferStatus,
  setVacancyStatus, startCycle, TalentProblem, VACANCY_STATUSES,
} from "@/lib/staff/talent";

type Ctx = Awaited<ReturnType<typeof requireAction>>["current"];

/** HR work in one switched-on feature. */
async function hrIn(feature: HrFeature, fd: FormData, work: (tx: Tx, current: Ctx) => Promise<unknown>) {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  if (reach !== "all") throw new HrOnlyError("this");
  return withSchool(current.ctx, async (tx) => {
    if (!(await hrFeaturesOn(tx, current.ctx)).has(feature)) throw new TalentProblem("This is switched off in HR Settings.");
    return work(tx, current);
  }, { timeout: 30_000 });
}

const text = (fd: FormData, k: string, max = 500) => str(fd, k).slice(0, max) || null;

/** One campus: staff of another campus cannot be chosen (the same words as a choice not on the list). */
async function onCampus(tx: Tx, current: Ctx, staffIds: string[], problem: TalentProblem) {
  if (!current.campusId) return;
  const viewer = await viewerFor(tx, current.ctx, current);
  if (staffIds.some((s) => offCampus(viewer, s))) throw problem;
}

export async function vacancyAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const openings = Number(str(fd, "openings") || "1");
    if (!Number.isInteger(openings) || openings < 1 || openings > 100) throw new FieldProblem("Openings must be a whole number from 1.", "openings");
    await hrIn("hr-recruitment", fd, (tx, c) => openVacancy(tx, c.ctx, { designation: str(fd, "designation"), departmentId: optionalId(fd, "departmentId"), openings, closingDate: optionalDateOf(fd, "closingDate", "Closing date"), details: text(fd, "details", 2000) }));
  }, () => "Vacancy opened.");
}

export async function vacancyStatusAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const status = str(fd, "status") as VacancyStatus;
    if (!VACANCY_STATUSES.some((s) => s.value === status)) throw new FieldProblem("Choose a status.", "status");
    await hrIn("hr-recruitment", fd, (tx, c) => setVacancyStatus(tx, c.ctx, id(fd, "vacancyId", "vacancy"), status));
  }, () => "Vacancy updated.");
}

export async function applicationAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const phone = str(fd, "phone");
    const p = checkIndianMobile(phone);
    if (p) throw new FieldProblem(p, "phone");
    const exp = str(fd, "experienceYears");
    if (exp && !/^\d{1,2}$/.test(exp)) throw new FieldProblem("Experience must be whole years, like 6.", "experienceYears");
    const resume = file(fd, "resume");
    await hrIn("hr-recruitment", fd, async (tx, c) => {
      const resumeFileId = resume ? (await saveFile(tx, c.ctx, { file: resume, purpose: "resume", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
      const name = str(fd, "name");
      if (name.length < 2) throw new FieldProblem("Name is needed.", "name");
      return addApplication(tx, c.ctx, { vacancyId: id(fd, "vacancyId", "vacancy"), name: name.slice(0, 120), phone: phone.replace(/\D/g, "").slice(-10), email: text(fd, "email", 120), qualification: text(fd, "qualification", 200), experienceYears: exp ? Number(exp) : null, resumeFileId, notes: text(fd, "notes", 1000) });
    });
  }, () => "Application added.");
}

export async function applicationStatusAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const status = str(fd, "status") as ApplicationStatus;
    if (!APPLICATION_STATUSES.some((s) => s.value === status) || status === "HIRED") throw new FieldProblem("Choose a status.", "status");
    await hrIn("hr-recruitment", fd, (tx, c) => setApplicationStatus(tx, c.ctx, id(fd, "applicationId", "applicant"), status));
  }, () => "Application updated.");
}

export async function interviewAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const minutes = Number(str(fd, "minutes") || "30");
    const interviewerIds = fd.getAll("interviewerIds").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
    await hrIn("hr-recruitment", fd, async (tx, c) => {
      await onCampus(tx, c, interviewerIds, new TalentProblem("Choose the interviewers from the list.", "interviewerIds"));
      return scheduleInterview(tx, c.ctx, {
        applicationId: id(fd, "applicationId", "applicant"), startsAt: dateTimeOf(fd, "startsAt", "Date and time", c.school.timeZone), minutes,
        interviewerIds, place: text(fd, "place", 120),
      }, c.school.timeZone);
    });
  }, () => "Interview scheduled. The interviewers were told.");
}

export async function outcomeAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    await hrIn("hr-recruitment", fd, (tx, c) => recordOutcome(tx, c.ctx, id(fd, "interviewId", "interview"), str(fd, "outcome"), text(fd, "notes", 1000)));
  }, () => "Interview outcome saved.");
}

export async function offerAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const monthlyPaise = rupeesOf(fd, "monthly", "Monthly salary");
    await hrIn("hr-recruitment", fd, (tx, c) => makeOffer(tx, c.ctx, {
      applicationId: id(fd, "applicationId", "applicant"), designation: str(fd, "designation"), departmentId: optionalId(fd, "departmentId"),
      joiningDate: dateOf(fd, "joiningDate", "Joining date"), monthlyPaise, respondBy: optionalDateOf(fd, "respondBy", "Reply by"),
    }));
  }, () => "Offer made. Print the offer letter from the list.");
}

export async function offerStatusAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    await hrIn("hr-recruitment", fd, (tx, c) => setOfferStatus(tx, c.ctx, id(fd, "offerId", "offer"), str(fd, "status")));
  }, () => "Offer updated.");
}

export async function cycleAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const criteria = str(fd, "criteria").split("\n").map((c) => c.trim()).filter(Boolean).slice(0, 15);
    const name = str(fd, "name");
    if (name.length < 3) throw new FieldProblem("Name is needed, like Appraisal 2026-27.", "name");
    await hrIn("hr-appraisal", fd, (tx, c) => startCycle(tx, c.ctx, { name: name.slice(0, 80), academicYearId: id(fd, "academicYearId", "academic year"), criteria, startDate: dateOf(fd, "startDate", "Start date"), endDate: dateOf(fd, "endDate", "End date") }, { campusId: c.campusId }));
  }, () => "Appraisal cycle started. Every staff member was asked for a self review.");
}

export async function closeCycleAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    await hrIn("hr-appraisal", fd, (tx, c) => closeCycle(tx, c.ctx, id(fd, "cycleId", "cycle"), { campusId: c.campusId }));
  }, () => "Appraisal cycle closed.");
}

/** Self review by the staff member, or the review by their reviewer (or HR). */
export async function reviewAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await requireAction("staff-hr-management", "view");
    const appraisalId = id(fd, "appraisalId", "appraisal");
    const by = str(fd, "by") === "manager" ? "manager" : "self";
    await withSchool(current.ctx, async (tx) => {
      if (!(await hrFeaturesOn(tx, current.ctx)).has("hr-appraisal")) throw new TalentProblem("Appraisal is switched off in HR Settings.");
      const viewer = await viewerFor(tx, current.ctx, current);
      const a = await tx.appraisal.findFirst({ where: { id: appraisalId }, include: { cycle: true } });
      // One campus: another campus's appraisal is not found, unless they are its reviewer.
      if (!a || (offCampus(viewer, a.staffId) && a.reviewerId !== viewer.staffId)) throw new TalentProblem("This appraisal was not found.");
      if (by === "self" && a.staffId !== viewer.staffId) throw new HrOnlyError("someone else's self review");
      if (by === "manager") {
        if (a.staffId === viewer.staffId) throw new TalentProblem("Nobody can review themselves as the reviewer.");
        if (a.reviewerId !== viewer.staffId && viewer.change !== "all") throw new HrOnlyError("this review");
      }
      const ratings: Record<string, number> = {};
      a.cycle.criteria.forEach((c, i) => { ratings[c] = Number(str(fd, `r${i}`)); });
      await saveReview(tx, current.ctx, a.id, by, ratings, text(fd, "comment", 2000));
    });
    return by;
  }, (by) => (by === "self" ? "Self review sent to your reviewer." : "Review saved."));
}

export async function trainingAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const hours = Number(str(fd, "hours"));
    const cert = file(fd, "certificate");
    const course = str(fd, "course");
    if (course.length < 2) throw new FieldProblem("Course is needed.", "course");
    await hrIn("hr-training", fd, async (tx, c) => {
      await onCampus(tx, c, [id(fd, "staffId", "staff member")], new TalentProblem("Choose the staff member.", "staffId"));
      const certificateFileId = cert ? (await saveFile(tx, c.ctx, { file: cert, purpose: "training-certificate", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
      return addTraining(tx, c.ctx, { staffId: id(fd, "staffId", "staff member"), course: course.slice(0, 150), provider: text(fd, "provider", 120), fromDate: dateOf(fd, "fromDate", "From date"), toDate: dateOf(fd, "toDate", "To date"), hours, certificateFileId });
    });
  }, () => "Training added.");
}

export async function promotionAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const reason = str(fd, "reason");
    if (reason.length < 3) throw new FieldProblem("Reason is needed.", "reason");
    await hrIn("hr-promotions", fd, async (tx, c) => {
      const staffId = id(fd, "staffId", "staff member");
      await onCampus(tx, c, [staffId], new TalentProblem("Choose the staff member.", "staffId"));
      return recordPromotion(tx, c.ctx, { staffId, toDesignation: str(fd, "toDesignation"), toDepartmentId: optionalId(fd, "toDepartmentId"), effectiveFrom: dateOf(fd, "effectiveFrom", "Effective from"), reason: reason.slice(0, 500) });
    });
  }, () => "Promotion recorded. Change the salary in Salary Management if needed.");
}
