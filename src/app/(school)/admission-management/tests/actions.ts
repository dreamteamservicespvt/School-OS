"use server";

import type { InterviewOutcome } from "@prisma/client";
import type { FormState } from "@/lib/forms";
import { AdmissionProblem, dateTimeOf, id, maybe, need, optionalId, str, UUID_RE, zonedToInstant } from "@/lib/admission/act";
import { admissionAct, inSchool } from "@/lib/admission/server";
import { requireFull } from "@/lib/admission/access";
import { addToTest, cancelInterview, freeSlots, OUTCOMES, recordInterview, recordScores, scheduleInterview, scheduleTest } from "@/lib/admission/tests";

const BASE = "/admission-management/tests";

const appIds = (fd: FormData) => fd.getAll("applicationIds").map(String).filter((x) => UUID_RE.test(x));

export async function scheduleTestAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("create", fd, (w) => {
    const max = str(fd, "maxMarks") || "100";
    if (!/^\d{1,4}$/.test(max)) throw new AdmissionProblem("Maximum marks must be a whole number from 1 to 1000.", "maxMarks");
    return scheduleTest(w.tx, w.ctx, w.v, w.s, w.current.school, {
      title: need(fd, "title", "Test name", 120),
      classId: optionalId(fd, "classId"),
      startsAt: dateTimeOf(fd, "startsAt", "Date and time", w.tz),
      venue: maybe(fd, "venue", "Venue", 120),
      maxMarks: Number(max),
      applicationIds: appIds(fd),
    });
  }, (r) => ({ message: `Test scheduled for ${r.booked} ${r.booked === 1 ? "applicant" : "applicants"}. ${r.messaged} ${r.messaged === 1 ? "parent was" : "parents were"} sent the details.`, link: { href: `${BASE}/${r.test.id}`, label: "Open test" } }));
}

export async function addToTestAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => addToTest(w.tx, w.ctx, w.v, w.s, w.current.school, id(fd, "testId", "test"), appIds(fd)), (n) => `Applicants added. ${n} ${n === 1 ? "parent was" : "parents were"} sent the details.`);
}

export async function scoresAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const rows = fd.getAll("row").map(String).filter((x) => UUID_RE.test(x)).map((applicationId) => ({
      applicationId,
      marks: str(fd, `marks_${applicationId}`),
      absent: str(fd, `absent_${applicationId}`) === "on",
      remarks: maybe(fd, `remarks_${applicationId}`, "Remarks", 300),
    }));
    return recordScores(w.tx, w.ctx, w.v, w.s, id(fd, "testId", "test"), rows);
  }, (n) => (n === 0 ? "Nothing changed." : `${n} ${n === 1 ? "score" : "scores"} saved.`));
}

export async function scheduleInterviewAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("create", fd, (w) => {
    const slot = str(fd, "slot");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) throw new AdmissionProblem("Choose a free slot.", "slot");
    return scheduleInterview(w.tx, w.ctx, w.v, w.s, w.current.school, {
      applicationId: id(fd, "applicationId", "applicant"),
      interviewerStaffId: id(fd, "interviewerStaffId", "interviewer"),
      startsAt: zonedToInstant(slot, w.tz),
    });
  }, () => ({ message: "Interview booked. The parent was sent the time.", link: { href: `${BASE}?tab=interviews`, label: "See interviews" } }));
}

export async function outcomeAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => {
    const outcome = str(fd, "outcome") as InterviewOutcome;
    if (!OUTCOMES.some((o) => o.value === outcome)) throw new AdmissionProblem("Choose the outcome.", "outcome");
    return recordInterview(w.tx, w.ctx, w.v, w.s, id(fd, "slotId", "interview"), outcome, maybe(fd, "notes", "Notes", 1000));
  }, () => "Interview outcome saved.");
}

/** Free 15-minute slots for one interviewer on one day, for the Schedule interview sheet. */
export async function freeSlotsAction(interviewerStaffId: string, day: string): Promise<{ value: string; label: string }[]> {
  if (!UUID_RE.test(interviewerStaffId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return inSchool("create", (w) => {
    requireFull(w.v, "interviews");
    return freeSlots(w.tx, interviewerStaffId, day, w.tz);
  });
}

export async function cancelInterviewAction(_: FormState<unknown>, fd: FormData) {
  return admissionAct("edit", fd, (w) => cancelInterview(w.tx, w.ctx, w.v, id(fd, "slotId", "interview"), str(fd, "reason")), () => "Interview cancelled.");
}
