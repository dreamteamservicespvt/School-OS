// Test & Interview (02 §2, optional): entrance tests for one or many
// applicants with scores and remarks, and interviews in 15-minute slots where
// an interviewer cannot be booked twice for the same time. Every change of
// interview outcome is kept in the decision history.
import "server-only";

import { Prisma, type InterviewOutcome } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDateTime, formatDate } from "../format";
import { AdmissionProblem, instantToLocal, zonedToInstant } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, loadApplication, parentName, CLOSED_STAGES } from "./applications";
import type { Settings } from "./settings";
import { messageParent } from "./notify-parents";

export const OUTCOMES: { value: InterviewOutcome; label: string }[] = [
  { value: "RECOMMENDED", label: "Recommended" },
  { value: "NOT_RECOMMENDED", label: "Not recommended" },
  { value: "HOLD", label: "Hold" },
];
export const outcomeLabel = (v: string | null | undefined) => OUTCOMES.find((o) => o.value === v)?.label ?? "Not recorded";

const EARLY: string[] = ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS"];

function requireOn(s: Settings, what: "test" | "interview") {
  if (what === "test" && !s.testsOn) throw new AdmissionProblem("Entrance tests are switched off in Admission Settings.");
  if (what === "interview" && !s.interviewsOn) throw new AdmissionProblem("Interviews are switched off in Admission Settings.");
}

export type TestInput = { title: string; classId: string | null; startsAt: Date; venue: string | null; maxMarks: number; applicationIds: string[] };

/** Schedule a test for one or many applicants. Parents get a message; the date goes on the School Calendar as "admission test". */
export async function scheduleTest(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, school: { name: string; timeZone: string }, input: TestInput, now = new Date()) {
  requireFull(v, "tests");
  requireOn(s, "test");
  if (input.title.trim().length < 3) throw new AdmissionProblem("Name the test, for example \"Class 6 entrance test\".", "title");
  if (input.startsAt.getTime() < now.getTime() - 60_000) throw new AdmissionProblem("The test date and time must be in the future.", "startsAt");
  if (!Number.isInteger(input.maxMarks) || input.maxMarks < 1 || input.maxMarks > 1000) throw new AdmissionProblem("Maximum marks must be a whole number from 1 to 1000.", "maxMarks");
  const ids = [...new Set(input.applicationIds)];
  if (ids.length === 0) throw new AdmissionProblem("Choose at least one applicant for the test.", "applicationIds");
  const apps = await tx.application.findMany({ where: { id: { in: ids }, archivedAt: null } });
  const closed = apps.filter((a) => CLOSED_STAGES.includes(a.stage));
  if (closed.length) throw new AdmissionProblem(`${closed.map((a) => a.fullName).join(", ")} ${closed.length === 1 ? "is" : "are"} no longer applying.`, "applicationIds");
  if (apps.length !== ids.length) throw new AdmissionProblem("Some applicants were not found. Refresh the page and choose again.", "applicationIds");
  const yearId = apps[0].academicYearId;
  const test = await tx.admissionTest.create({ data: { schoolId: ctx.schoolId, academicYearId: yearId, classId: input.classId, title: input.title.trim(), startsAt: input.startsAt, venue: input.venue, maxMarks: input.maxMarks, createdById: ctx.userId } });
  const day = new Date(`${instantToLocal(input.startsAt, school.timeZone).slice(0, 10)}T00:00:00Z`);
  const entry = await tx.calendarEntry.create({ data: { schoolId: ctx.schoolId, academicYearId: yearId, type: "admission_test", title: input.title.trim(), startDate: day, endDate: day, attendanceOn: true, source: `admission-test:${test.id}`, createdById: ctx.userId } });
  await tx.admissionTest.update({ where: { id: test.id }, data: { calendarEntryId: entry.id } });
  const messaged = await book(tx, ctx, school, test, apps);
  await writeAudit(tx, ctx, { action: "test-scheduled", recordType: "Admission Test", recordId: test.id, after: { title: test.title, startsAt: test.startsAt.toISOString(), venue: test.venue, maxMarks: test.maxMarks, applicants: apps.length } });
  return { test, booked: apps.length, messaged };
}

async function book(tx: Tx, ctx: SchoolContext, school: { name: string; timeZone: string }, test: { id: string; title: string; startsAt: Date; venue: string | null }, apps: { id: string; fullName: string; applicationNo: string; phone: string; email: string | null; stage: string; fatherName: string | null; motherName: string | null; guardianName: string | null }[]) {
  let messaged = 0;
  for (const a of apps) {
    await tx.admissionTestBooking.upsert({ where: { testId_applicationId: { testId: test.id, applicationId: a.id } }, create: { schoolId: ctx.schoolId, testId: test.id, applicationId: a.id }, update: { archivedAt: null } });
    if (EARLY.includes(a.stage)) await tx.application.update({ where: { id: a.id }, data: { stage: "TEST_INTERVIEW" } });
    const name = parentName(a);
    const when = formatDateTime(test.startsAt, school.timeZone);
    const r = await messageParent(tx, ctx, { to: { name, phone: a.phone, email: a.email }, template: "admission-test-scheduled", text: `Dear ${name}, ${a.fullName}'s ${test.title} at ${school.name} is on ${when}${test.venue ? ` at ${test.venue}` : ""}. Please reach 15 minutes early with application ${a.applicationNo}.`, about: { recordType: "Application", recordId: a.id } });
    if (r.status === "queued") messaged++;
    await activity(tx, ctx, a.id, "test", `Booked for ${test.title} on ${when}${test.venue ? `, ${test.venue}` : ""}.${r.status === "queued" ? " Parent told." : ""}`, { testId: test.id });
  }
  return messaged;
}

export async function addToTest(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, school: { name: string; timeZone: string }, testId: string, applicationIds: string[]) {
  requireFull(v, "tests");
  requireOn(s, "test");
  const test = await tx.admissionTest.findFirst({ where: { id: testId, archivedAt: null } });
  if (!test) throw new AdmissionProblem("This test was not found.");
  const apps = await tx.application.findMany({ where: { id: { in: applicationIds }, archivedAt: null, stage: { notIn: ["REJECTED", "WITHDRAWN", "ADMITTED"] } } });
  if (apps.length === 0) throw new AdmissionProblem("Choose at least one applicant who is still applying.", "applicationIds");
  return book(tx, ctx, school, test, apps);
}

export type ScoreRow = { applicationId: string; marks: string; absent: boolean; remarks: string | null };

/** Record test scores and remarks. */
export async function recordScores(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, testId: string, rows: ScoreRow[]) {
  requireFull(v, "test scores");
  requireOn(s, "test");
  const test = await tx.admissionTest.findFirst({ where: { id: testId, archivedAt: null }, include: { bookings: { where: { archivedAt: null }, include: { application: { select: { fullName: true } } } } } });
  if (!test) throw new AdmissionProblem("This test was not found.");
  let saved = 0;
  for (const r of rows) {
    const b = test.bookings.find((x) => x.applicationId === r.applicationId);
    if (!b) continue;
    let marks: Prisma.Decimal | null = null;
    if (!r.absent && r.marks.trim() !== "") {
      const n = Number(r.marks.trim());
      if (!Number.isFinite(n) || n < 0 || n > test.maxMarks || !/^\d+(\.\d{1,2})?$/.test(r.marks.trim())) throw new AdmissionProblem(`${b.application.fullName}: marks must be a number from 0 to ${test.maxMarks}.`, `marks_${r.applicationId}`);
      marks = new Prisma.Decimal(r.marks.trim());
    }
    const same = (b.marks?.toString() ?? null) === (marks?.toString() ?? null) && b.absent === r.absent && (b.remarks ?? null) === (r.remarks ?? null);
    if (same) continue;
    await tx.admissionTestBooking.update({ where: { id: b.id }, data: { marks, absent: r.absent, remarks: r.remarks, scoredById: ctx.userId, scoredAt: new Date() } });
    await activity(tx, ctx, b.applicationId, "test-score", r.absent ? `${test.title}: absent.` : marks !== null ? `${test.title}: ${marks.toString()} of ${test.maxMarks}.${r.remarks ? ` ${r.remarks}` : ""}` : `${test.title}: score cleared.`, { testId, marks: marks?.toString() ?? null, absent: r.absent });
    await writeAudit(tx, ctx, { action: "test-score", recordType: "Admission Test", recordId: test.id, before: { applicationId: b.applicationId, marks: b.marks?.toString() ?? null, absent: b.absent }, after: { marks: marks?.toString() ?? null, absent: r.absent, remarks: r.remarks } });
    saved++;
  }
  return saved;
}

export const SLOT_MINUTES = 15;
/** Interview hours for free slots (inferred: 9:00 AM to 1:00 PM). */
export const SLOT_HOURS = { from: "09:00", to: "13:00" };

/** Free 15-minute slots for one interviewer on one day. */
export async function freeSlots(tx: Tx, interviewerStaffId: string, dayIso: string, timeZone: string, now = new Date()) {
  const start = zonedToInstant(`${dayIso}T${SLOT_HOURS.from}`, timeZone);
  const end = zonedToInstant(`${dayIso}T${SLOT_HOURS.to}`, timeZone);
  const taken = await tx.interviewSlot.findMany({ where: { interviewerStaffId, cancelledAt: null, startsAt: { gte: new Date(start.getTime() - 60 * 60_000), lt: end } }, select: { startsAt: true, minutes: true } });
  const out: { value: string; label: string }[] = [];
  for (let t = start.getTime(); t + SLOT_MINUTES * 60_000 <= end.getTime(); t += SLOT_MINUTES * 60_000) {
    if (t < now.getTime()) continue;
    const clash = taken.some((x) => x.startsAt.getTime() < t + SLOT_MINUTES * 60_000 && x.startsAt.getTime() + x.minutes * 60_000 > t);
    if (!clash) {
      const d = new Date(t);
      out.push({ value: instantToLocal(d, timeZone), label: formatDateTime(d, timeZone).split(", ")[1] });
    }
  }
  return out;
}

/** Schedule an interview: one slot with one interviewer. The same interviewer cannot be booked twice for the same time. */
export async function scheduleInterview(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, school: { name: string; timeZone: string }, input: { applicationId: string; interviewerStaffId: string; startsAt: Date; minutes?: number }, now = new Date()) {
  requireFull(v, "interviews");
  requireOn(s, "interview");
  const app = await loadApplication(tx, input.applicationId);
  if (CLOSED_STAGES.includes(app.stage)) throw new AdmissionProblem("This application is closed.");
  const interviewer = await tx.staff.findFirst({ where: { id: input.interviewerStaffId, archivedAt: null } });
  if (!interviewer) throw new AdmissionProblem("Choose the interviewer.", "interviewerStaffId");
  if (input.startsAt.getTime() < now.getTime() - 60_000) throw new AdmissionProblem("Choose a slot in the future.", "startsAt");
  const minutes = input.minutes ?? SLOT_MINUTES;
  const clash = await tx.interviewSlot.findFirst({
    where: { interviewerStaffId: interviewer.id, cancelledAt: null, startsAt: { lt: new Date(input.startsAt.getTime() + minutes * 60_000), gte: new Date(input.startsAt.getTime() - 4 * 60 * 60_000) } },
    include: { application: { select: { fullName: true } } },
  });
  if (clash && clash.startsAt.getTime() + clash.minutes * 60_000 > input.startsAt.getTime()) {
    throw new AdmissionProblem(`${interviewer.fullName} already has an interview with ${clash.application.fullName} at ${formatDateTime(clash.startsAt, school.timeZone)}. Choose another slot.`, "startsAt");
  }
  const open = await tx.interviewSlot.findFirst({ where: { applicationId: app.id, cancelledAt: null, outcome: null } });
  if (open) throw new AdmissionProblem(`${app.fullName} already has an interview on ${formatDateTime(open.startsAt, school.timeZone)}. Record its outcome or cancel it first.`);
  const slot = await tx.interviewSlot.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, interviewerStaffId: interviewer.id, startsAt: input.startsAt, minutes, createdById: ctx.userId } });
  if (EARLY.includes(app.stage)) await tx.application.update({ where: { id: app.id }, data: { stage: "TEST_INTERVIEW" } });
  const name = parentName(app);
  const when = formatDateTime(input.startsAt, school.timeZone);
  const r = await messageParent(tx, ctx, { to: { name, phone: app.phone, email: app.email }, template: "admission-interview-scheduled", text: `Dear ${name}, your interview for ${app.fullName}'s admission at ${school.name} is on ${when} with ${interviewer.fullName}. Please come with the child 10 minutes early.`, about: { recordType: "Application", recordId: app.id } });
  await activity(tx, ctx, app.id, "interview", `Interview on ${when} with ${interviewer.fullName}.${r.status === "queued" ? " Parent told." : ""}`, { slotId: slot.id });
  if (interviewer.userLoginId && interviewer.userLoginId !== ctx.userId) {
    await notify(tx, ctx, { to: interviewer.userLoginId, type: "admission-interview", text: `Admission interview: ${app.fullName} on ${when}.`, link: `/admission-management/tests?tab=interviews`, groupKey: "admission-interview", mergedText: (n) => `${n} admission interviews booked with you` });
  }
  await writeAudit(tx, ctx, { action: "interview-scheduled", recordType: "Application", recordId: app.id, after: { interviewer: interviewer.id, startsAt: input.startsAt.toISOString(), minutes } });
  // Why the parent was not told, when no message could go (QA PEOPLE-21).
  return { slot, notSent: r.status === "queued" ? null : r.note ?? "messages are not set up" };
}

/** Record interview notes and outcome; every change is kept in the history. */
export async function recordInterview(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, slotId: string, outcome: InterviewOutcome, notes: string | null) {
  requireFull(v, "interviews");
  requireOn(s, "interview");
  const slot = await tx.interviewSlot.findFirst({ where: { id: slotId, cancelledAt: null } });
  if (!slot) throw new AdmissionProblem("This interview was not found or was cancelled.");
  if (!OUTCOMES.some((o) => o.value === outcome)) throw new AdmissionProblem("Choose the outcome.", "outcome");
  if (outcome === slot.outcome && (notes ?? null) === (slot.notes ?? null)) throw new AdmissionProblem("Nothing changed.");
  const history = [...((slot.history as object[]) ?? []), { at: new Date().toISOString(), by: ctx.userId, outcome, notes }];
  await tx.interviewSlot.update({ where: { id: slot.id }, data: { outcome, notes, history } });
  await activity(tx, ctx, slot.applicationId, "interview-outcome", slot.outcome ? `Interview outcome changed from ${outcomeLabel(slot.outcome)} to ${outcomeLabel(outcome)}.${notes ? ` ${notes}` : ""}` : `Interview outcome: ${outcomeLabel(outcome)}.${notes ? ` ${notes}` : ""}`, { slotId, from: slot.outcome, to: outcome });
  await writeAudit(tx, ctx, { action: "interview-outcome", recordType: "Application", recordId: slot.applicationId, before: { outcome: slot.outcome, notes: slot.notes }, after: { outcome, notes } });
}

export async function cancelInterview(tx: Tx, ctx: SchoolContext, v: Viewer, slotId: string, reason: string) {
  requireFull(v, "interviews");
  const slot = await tx.interviewSlot.findFirst({ where: { id: slotId, cancelledAt: null } });
  if (!slot) throw new AdmissionProblem("This interview was not found or is already cancelled.");
  if (slot.outcome) throw new AdmissionProblem("This interview already has an outcome, so it stays in the history.");
  if (reason.trim().length < 3) throw new AdmissionProblem("Give a reason for cancelling.", "reason");
  await tx.interviewSlot.update({ where: { id: slot.id }, data: { cancelledAt: new Date(), notes: `Cancelled: ${reason.trim()}` } });
  await activity(tx, ctx, slot.applicationId, "interview", `Interview on ${formatDate(slot.startsAt)} cancelled: ${reason.trim()}`, { slotId });
  await writeAudit(tx, ctx, { action: "interview-cancelled", recordType: "Application", recordId: slot.applicationId, after: { slotId, reason: reason.trim() } });
}

/** The best test result of an applicant as a percentage (for ranking), or null. */
export function bestTestPct(bookings: { marks: Prisma.Decimal | null; absent: boolean; test: { maxMarks: number } }[]) {
  const pcts = bookings.filter((b) => !b.absent && b.marks !== null).map((b) => (Number(b.marks) / b.test.maxMarks) * 100);
  return pcts.length ? Math.max(...pcts) : null;
}
