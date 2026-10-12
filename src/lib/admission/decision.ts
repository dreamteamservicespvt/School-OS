// Admission Decision (02 §2): approve or reject with remarks (also through
// Approvals), seats checked before approving, the waiting list ranked by the
// school's rules with hand moves that need a reason, and the offer letter.
import "server-only";

import type { Application } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { decide as decideApproval, DecisionProblem, type Decision } from "../approvals";
import { nextNumber, formatNumber } from "../sequences";
import { formatDate } from "../format";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, loadApplication, parentName, sendForDecision, stageLabel } from "./applications";
import { loadSettings, type Settings } from "./settings";
import { fullWords, seatsFor } from "./seats";
import { bestTestPct } from "./tests";
import { messageParent } from "./notify-parents";

async function schoolName(tx: Tx, ctx: SchoolContext) {
  return (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "the school";
}

/** May the person admit beyond the seats? Only when the school allows it and they are the Principal or School Admin. */
async function mayExceedSeats(tx: Tx, ctx: SchoolContext, s: Settings) {
  if (!s.allowOverCapacity || !ctx.userId) return false;
  const n = await tx.schoolAccess.count({ where: { schoolId: ctx.schoolId, userLoginId: ctx.userId, archivedAt: null, roles: { some: { role: { key: { in: ["principal", "school-admin"] }, isEnabled: true } } } } });
  return n > 0;
}

/** The seat check before an approval (02 §5): blocked when no seat is free, unless allowed. */
export async function checkSeat(tx: Tx, ctx: SchoolContext, s: Settings, app: Pick<Application, "academicYearId" | "classId">) {
  const seats = (await seatsFor(tx, app.academicYearId, [app.classId])).get(app.classId);
  if (!seats || seats.seats === 0) {
    const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
    throw new DecisionProblem(`${cls?.name ?? "This class"} has no sections in this year yet. Add them in Academic Management, Classes & Sections, before approving.`);
  }
  if (seats.free > 0) return seats;
  if (await mayExceedSeats(tx, ctx, s)) return seats;
  throw new DecisionProblem(`${fullWords(seats)} Put on the waiting list, or increase the seats in Classes & Sections.`);
}

/** What happens to the application when the decision is made (here or in Approvals). */
export async function applyDecision(tx: Tx, ctx: SchoolContext, app: Application, decision: Decision, note: string | null) {
  const s = await loadSettings(tx, ctx);
  const name = await schoolName(tx, ctx);
  const parent = parentName(app);
  if (decision === "approve") {
    if (app.stage !== "DECISION") throw new DecisionProblem(`This application is ${stageLabel(app.stage).toLowerCase()}, not waiting for a decision.`);
    await checkSeat(tx, ctx, s, app);
    await tx.application.update({ where: { id: app.id }, data: { stage: "APPROVED", decisionRemarks: note, decidedById: ctx.userId, decidedAt: new Date() } });
    await activity(tx, ctx, app.id, "decision", `Approved.${note ? ` Remarks: ${note}` : ""}`, { decision: "approved" });
    await messageParent(tx, ctx, { to: { name: parent, phone: app.phone, email: app.email }, template: "admission-approved", text: `Dear ${parent}, we are happy to tell you that ${app.fullName}'s admission at ${name} is approved (application ${app.applicationNo}). The school office will contact you to complete the admission.`, about: { recordType: "Application", recordId: app.id } });
  } else if (decision === "reject") {
    if (!note || note.trim().length < 5) throw new DecisionProblem("Give remarks of at least 5 characters, so the family knows why.");
    await tx.application.update({ where: { id: app.id }, data: { stage: "REJECTED", decisionRemarks: note, decidedById: ctx.userId, decidedAt: new Date() } });
    await activity(tx, ctx, app.id, "decision", `Not approved. Remarks: ${note}`, { decision: "rejected" });
    await messageParent(tx, ctx, { to: { name: parent, phone: app.phone, email: app.email }, template: "admission-not-approved", text: `Dear ${parent}, we are sorry that we cannot offer ${app.fullName} admission at ${name} this time (application ${app.applicationNo}). ${note}`, about: { recordType: "Application", recordId: app.id } });
  } else if (decision === "ask-change") {
    await tx.application.update({ where: { id: app.id }, data: { stage: "REVIEWED", approvalId: null } });
    await activity(tx, ctx, app.id, "decision", `Sent back before the decision: ${note ?? ""}`, { decision: "ask-change" });
  } else if (decision === "withdraw") {
    if (app.stage === "DECISION") await tx.application.update({ where: { id: app.id }, data: { stage: "REVIEWED", approvalId: null } });
    await activity(tx, ctx, app.id, "decision", "The request for a decision was withdrawn.", { decision: "withdrawn" });
  }
  await writeAudit(tx, ctx, { action: `decision-${decision}`, recordType: "Application", recordId: app.id, before: { stage: app.stage }, after: { decision, note } });
}

/** onDecision("admission") — the Approvals list runs this. */
export async function onAdmissionDecision(tx: Tx, ctx: SchoolContext, approval: { recordId: string }, decision: Decision, note: string | null) {
  const app = await tx.application.findFirst({ where: { id: approval.recordId, archivedAt: null } });
  if (!app) throw new DecisionProblem("The application behind this request was not found.");
  await applyDecision(tx, ctx, app, decision, note);
}

/**
 * Approve or reject from the Admission Decision page. When the decision goes
 * through Approvals, this decides that request (same rules: nobody approves
 * their own request); otherwise it applies the decision directly.
 */
export async function decideApplication(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, decision: "approve" | "reject", remarks: string | null) {
  requireFull(v, "admission decisions");
  const app = await loadApplication(tx, id);
  if (decision === "reject" && (!remarks || remarks.trim().length < 5)) throw new AdmissionProblem("Write the remarks: a rejection is never made without them.", "remarks");
  if (app.stage !== "DECISION") throw new AdmissionProblem(`This application is ${stageLabel(app.stage).toLowerCase()}, not waiting for a decision. Send it for a decision first.`);
  const approval = app.approvalId ? await tx.approval.findFirst({ where: { id: app.approvalId } }) : null;
  if (approval && ["WAITING", "ESCALATED"].includes(approval.status)) {
    await decideApproval(tx, ctx, approval.id, decision, remarks?.trim() || null);
    return;
  }
  const s = await loadSettings(tx, ctx);
  if (s.stageList.find((x) => x.key === "decision")?.needsApproval) throw new AdmissionProblem("This decision goes through Approvals. Send it for a decision first.");
  await applyDecision(tx, ctx, app, decision, remarks?.trim() || null);
}

export type RankInfo = { score: number; reasons: string[] };

/** Waiting-list priority by the school's rules: sibling, quota category, test score, then date applied (02 §2). */
export async function rankInfo(tx: Tx, s: Settings, app: Application): Promise<RankInfo> {
  const reasons: string[] = [];
  let score = 0;
  if (s.siblingPriorityOn && app.siblingStudentId) {
    score += s.siblingWeight;
    reasons.push("Sibling in school");
  }
  if (s.quotaOn && app.category && s.quotaList.some((q) => q.category === app.category && q.sharePct > 0)) {
    score += 10;
    reasons.push(`${app.category} quota`);
  }
  const bookings = await tx.admissionTestBooking.findMany({ where: { applicationId: app.id, archivedAt: null }, include: { test: { select: { maxMarks: true } } } });
  const pct = bestTestPct(bookings);
  if (pct !== null) {
    score += pct;
    reasons.push(`Test ${Math.round(pct)}%`);
  }
  reasons.push(`Applied ${formatDate(app.createdAt)}`);
  return { score, reasons };
}

/** Put on the waiting list, ranked by the rules among those already waiting for the class. */
export async function addToWaitingList(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, note: string | null) {
  requireFull(v, "the waiting list");
  const s = await loadSettings(tx, ctx);
  if (!s.waitingListOn) throw new AdmissionProblem("The waiting list is switched off in Admission Settings.");
  const app = await loadApplication(tx, id);
  if (!["DECISION", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "SUBMITTED", "SUBMITTED_ONLINE", "APPROVED"].includes(app.stage)) throw new AdmissionProblem(`This application is ${stageLabel(app.stage).toLowerCase()}, so it cannot go on the waiting list.`);
  if (app.studentId) throw new AdmissionProblem("This child is already admitted.");
  const mine = await rankInfo(tx, s, app);
  const waiting = await tx.application.findMany({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", archivedAt: null }, orderBy: { waitingRank: "asc" } });
  let rank = waiting.length + 1;
  for (const w of waiting) {
    const theirs = await rankInfo(tx, s, w);
    // Hand-moved entries keep their place; the new one goes above anyone with a lower score.
    if (!w.waitingReason?.startsWith("Moved by hand") && mine.score > theirs.score) { rank = w.waitingRank ?? rank; break; }
  }
  await tx.application.updateMany({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", waitingRank: { gte: rank } }, data: { waitingRank: { increment: 1 } } });
  if (app.approvalId && app.stage === "DECISION") {
    await tx.approval.updateMany({ where: { id: app.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decidedAt: new Date(), decisionReason: "Put on the waiting list" } });
    await tx.notification.updateMany({ where: { link: `/approvals/${app.approvalId}`, doneAt: null }, data: { doneAt: new Date() } });
  }
  await tx.application.update({ where: { id }, data: { stage: "WAITING_LIST", waitingRank: rank, waitingReason: mine.reasons.join(" · "), waitingSince: new Date(), approvalId: null, decisionRemarks: note ?? app.decisionRemarks, updatedById: ctx.userId } });
  await activity(tx, ctx, id, "waiting-list", `Put on the waiting list at position ${rank} (${mine.reasons.join(", ")}).${note ? ` ${note}` : ""}`, { rank, score: mine.score });
  await writeAudit(tx, ctx, { action: "waiting-listed", recordType: "Application", recordId: id, before: { stage: app.stage }, after: { stage: "WAITING_LIST", rank, reasons: mine.reasons } });
  if (app.stage !== "APPROVED") {
    const name = parentName(app);
    await messageParent(tx, ctx, { to: { name, phone: app.phone, email: app.email }, template: "admission-waiting-list", text: `Dear ${name}, ${app.fullName} (application ${app.applicationNo}) is on our waiting list at position ${rank}. We will tell you as soon as a seat is free.`, about: { recordType: "Application", recordId: app.id } });
  }
  return rank;
}

/** Move someone up or down by hand: needs a reason, written to the history (Done when 8). */
export async function moveOnWaitingList(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, toRank: number, reason: string) {
  requireFull(v, "the waiting list");
  const app = await loadApplication(tx, id);
  if (app.stage !== "WAITING_LIST" || app.waitingRank === null) throw new AdmissionProblem("This applicant is not on the waiting list.");
  const count = await tx.application.count({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", archivedAt: null } });
  if (!Number.isInteger(toRank) || toRank < 1 || toRank > count) throw new AdmissionProblem(`Choose a position from 1 to ${count}.`, "toRank");
  if (toRank === app.waitingRank) throw new AdmissionProblem("That is already the position.", "toRank");
  const target = await tx.application.findFirst({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", waitingRank: toRank } });
  if (reason.trim().length < 5) throw new AdmissionProblem(target ? `Give a reason for moving ${app.firstName} ${toRank < app.waitingRank ? "above" : "below"} ${target.firstName}.` : "Give a reason for the move.", "reason");
  const from = app.waitingRank;
  if (toRank < from) {
    await tx.application.updateMany({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", waitingRank: { gte: toRank, lt: from } }, data: { waitingRank: { increment: 1 } } });
  } else {
    await tx.application.updateMany({ where: { academicYearId: app.academicYearId, classId: app.classId, stage: "WAITING_LIST", waitingRank: { gt: from, lte: toRank } }, data: { waitingRank: { decrement: 1 } } });
  }
  await tx.application.update({ where: { id }, data: { waitingRank: toRank, waitingReason: `Moved by hand: ${reason.trim()}`, updatedById: ctx.userId } });
  await activity(tx, ctx, id, "waiting-list", `Moved on the waiting list from ${from} to ${toRank}${target ? ` (${toRank < from ? "above" : "below"} ${target.fullName})` : ""}. Reason: ${reason.trim()}`, { from, to: toRank, reason: reason.trim() });
  await writeAudit(tx, ctx, { action: "waiting-list-moved", recordType: "Application", recordId: id, before: { rank: from }, after: { rank: toRank, reason: reason.trim() } });
}

/** Re-rank a class's waiting list by the rules (clears hand moves; needs a reason). */
export async function rerankWaitingList(tx: Tx, ctx: SchoolContext, v: Viewer, yearId: string, classId: string, reason: string) {
  requireFull(v, "the waiting list");
  if (reason.trim().length < 5) throw new AdmissionProblem("Give a reason for re-ranking the list.", "reason");
  const s = await loadSettings(tx, ctx);
  const waiting = await tx.application.findMany({ where: { academicYearId: yearId, classId, stage: "WAITING_LIST", archivedAt: null } });
  const scored = [];
  for (const w of waiting) scored.push({ w, info: await rankInfo(tx, s, w) });
  scored.sort((a, b) => b.info.score - a.info.score || a.w.createdAt.getTime() - b.w.createdAt.getTime());
  for (const [i, x] of scored.entries()) {
    await tx.application.update({ where: { id: x.w.id }, data: { waitingRank: i + 1, waitingReason: x.info.reasons.join(" · ") } });
    if (x.w.waitingRank !== i + 1) await activity(tx, ctx, x.w.id, "waiting-list", `Re-ranked by the rules from ${x.w.waitingRank} to ${i + 1}. Reason: ${reason.trim()}`, { from: x.w.waitingRank, to: i + 1 });
  }
  await writeAudit(tx, ctx, { action: "waiting-list-reranked", recordType: "Application", recordId: null, after: { classId, yearId, count: waiting.length, reason: reason.trim() } });
  return waiting.length;
}

/** Offer letter: a number, the date sent (and how), and the date accepted. */
export async function markOfferSent(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, channel: "whatsapp" | "email" | "printed", schoolInfo: { name: string; code: string }) {
  requireFull(v, "offer letters");
  const s = await loadSettings(tx, ctx);
  if (!s.offerLettersOn) throw new AdmissionProblem("Offer letters are switched off in Admission Settings.");
  const app = await loadApplication(tx, id);
  if (app.stage !== "APPROVED" && app.stage !== "ADMITTED") throw new AdmissionProblem("An offer letter is given only after the admission is approved.");
  if (channel === "email" && !app.email) throw new AdmissionProblem("This application has no email address. Send it by WhatsApp or print it.", "channel");
  let letterNo = app.offerLetterNo;
  if (!letterNo) {
    const year = await tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { name: true } });
    letterNo = formatNumber(`${schoolInfo.code}/OL/${(year?.name ?? "").slice(0, 4)}/`, await nextNumber(tx, ctx, "admission-offer-letter"), 4);
  }
  await tx.application.update({ where: { id }, data: { offerLetterNo: letterNo, offerSentAt: new Date(), updatedById: ctx.userId } });
  if (channel !== "printed") {
    const name = parentName(app);
    await messageParent(tx, ctx, { to: { name, phone: app.phone, email: app.email }, template: "admission-offer-letter", channel, text: `Dear ${name}, please find the offer letter ${letterNo} for ${app.fullName}'s admission at ${schoolInfo.name}. Kindly confirm your acceptance with the school office.`, about: { recordType: "Application", recordId: app.id } });
  }
  await activity(tx, ctx, id, "offer", `Offer letter ${letterNo} ${channel === "printed" ? "printed and handed over" : `sent by ${channel === "email" ? "email" : "WhatsApp"}`}.`);
  await writeAudit(tx, ctx, { action: "offer-sent", recordType: "Application", recordId: id, after: { letterNo, channel } });
  return letterNo;
}

export async function markOfferAccepted(tx: Tx, ctx: SchoolContext, v: Viewer, id: string) {
  requireFull(v, "offer letters");
  const app = await loadApplication(tx, id);
  if (!app.offerSentAt) throw new AdmissionProblem("Send the offer letter first.");
  if (app.offerAcceptedAt) throw new AdmissionProblem("The offer is already marked as accepted.");
  await tx.application.update({ where: { id }, data: { offerAcceptedAt: new Date(), updatedById: ctx.userId } });
  await activity(tx, ctx, id, "offer", "The family accepted the offer.");
  await writeAudit(tx, ctx, { action: "offer-accepted", recordType: "Application", recordId: id });
}

/** Take a waiting-list applicant back to a decision when a seat is free. */
export async function offerSeat(tx: Tx, ctx: SchoolContext, v: Viewer, id: string) {
  requireFull(v, "the waiting list");
  const app = await loadApplication(tx, id);
  if (app.stage !== "WAITING_LIST") throw new AdmissionProblem("This applicant is not on the waiting list.");
  const s = await loadSettings(tx, ctx);
  await sendForDecision(tx, ctx, v, s, app);
}
