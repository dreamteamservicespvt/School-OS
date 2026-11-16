// Pickup "tap to approve" (owner decision 21, 16 Nov 2026). WhatsApp never
// delivers one-time codes to Indian (+91) numbers, so with "Pickup code check"
// on no code could go and the desk fell back to the photo, ID or a call. As
// Parent Link already does for a new phone (../parent-link/tap.ts), the desk
// now asks the guardian in their own WhatsApp:
// - "Ask {guardian} to approve on WhatsApp" sends the "pickup-approve" card
//   (UTILITY, plain facts: Meta refused code-like words) to the guardian's
//   registered mobile. Its "Open Parent Link" button carries the guardian's own
//   link and a one-time secret (/p/<token>.<secret>): 144 random bits, kept only
//   as a hash (a Parent Link Code, purpose "pickup"), running out with the code
//   minutes (Message Settings, Parent Link).
// - The guardian's page shows "Approve: {person} takes {student} home now?"
//   with Approve and "No, call the school". The answer is recorded once, after
//   checking again that the link is usable, the request has not run out and
//   the child is the guardian's own (with no custody restriction).
// - The desk sees the answer. releaseStudent (./pickup.ts) checks the approval
//   itself and uses it once: an approved request for this child and guardian,
//   not used yet, answered within the code minutes. A "No" blocks the release.
// - With no active Parent Link, no phone, Parent Link off, WhatsApp off, or (on
//   a real account) the card not approved by WhatsApp, the desk checks the
//   photo, ID proof or calls a guardian, as before.
// - Test mode: the card goes to the sandbox and the tap link is written to the
//   server log on a tester's computer, like other links (../dev-codes.ts).
// - A "No" warns the Principal, the School Admins and the class teacher, and
//   blocks every pickup release of that child, to anyone, for the code minutes
//   (security review 16 Nov: the desk could choose another guardian with no
//   Parent Link and tick "called"). Only a Principal or School Admin can allow
//   a release then, with a note; that is audited. The same leader note lets a
//   child go when the guardian cannot answer, so no child is ever stuck.
// - A request that did not reach WhatsApp is a real, audited fallback: the desk
//   calls the guardian and ticks that they confirmed on the call.
// - Every refused release (a No, waiting, ran out) is kept in the audit log.
// - Campus: a person kept to one campus asks, reads and releases only their
//   campus's children (../campus.ts).
import "server-only";

import { randomBytes } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { currentYearIds } from "../academic/years";
import { inCampus, type CampusLimit } from "../campus";
import { sendMessage } from "../messaging/send";
import { channelSetups, whatsappIsLive } from "../messaging/channels";
import { inTestMode } from "../messaging/providers";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import { messageSettings } from "../messaging/settings";
import { CODE_MASK } from "../messaging/one-time-code";
import { logCodeSentBy, mayLogCode } from "../dev-codes";
import { OPEN_LINK } from "../students/guardian-access";
import { codeHash, linkUrl, linkUsable, placeholderFor, TAP_GONE } from "../parent-link/links";
import { FrontOfficeProblem, KeptRefusal } from "./problem";
import { loginsWithRole } from "./people";
import { clockAt } from "./time";
import { maskPhone } from "./words";

/** The ready WhatsApp card that carries a pickup request (../messaging/ready-whatsapp.ts). */
export const PICKUP_TAP_KEY = "pickup-approve";
/** How a WhatsApp approval shows in a gate pass's "Checked with". */
export const TAP_CHECK = "WhatsApp approval";
/** The request could not reach WhatsApp, so the desk called the guardian. */
export const TAP_FALLBACK_CHECK = "call to a guardian (WhatsApp approval could not be sent)";
/** A Principal or School Admin allowed the release, with a note. */
export const LEADER_CHECK = "allowed by the Principal or a School Admin";
/** Requests to one guardian for one child in PICKUP_TAP_WINDOW_MS before the desk must wait. */
const PICKUP_TAP_LIMIT = 3;
const PICKUP_TAP_WINDOW_MS = 10 * 60_000;

const noLinkWords = (first: string) => `${first} has no Parent Link, so approval cannot be asked on WhatsApp. Check the photo, ID proof or call a guardian instead.`;

/**
 * The WhatsApp template a pickup request goes in now, or null when none can go:
 * Parent Link is off, WhatsApp is off, or on a real account WhatsApp has not
 * approved the card yet. Test mode needs no approval (nothing reaches a phone).
 */
export async function pickupTapCarrier(tx: Tx, ctx: SchoolContext): Promise<{ templateId: string; testMode: boolean } | null> {
  if (!(await messageSettings(tx, ctx)).parentLink.on) return null;
  const setups = await channelSetups(tx, ctx);
  if (!setups.whatsapp.isOn) return null;
  await ensureReadyTemplates(tx, ctx);
  const t = await templateByKey(tx, ctx, PICKUP_TAP_KEY, "whatsapp");
  if (!t) return null;
  if (whatsappIsLive(setups.whatsapp)) {
    // The current version, or the last approved one while a new version waits for WhatsApp.
    const ok = await tx.templateVersion.count({ where: { templateId: t.id, whatsappStatus: "APPROVED", whatsappName: { not: null }, OR: [{ whatsappNote: null }, { NOT: { whatsappNote: { startsWith: "Test mode" } } }] } });
    if (!ok) return null;
  }
  return { templateId: t.id, testMode: inTestMode(setups.whatsapp) };
}

/** The guardian's active Parent Link when a pickup request can go to them (on the pickup list, a phone, no restriction); else null. */
export async function pickupApproverLink(tx: Tx, studentId: string, guardianId: string): Promise<{ id: string } | null> {
  const sg = await tx.studentGuardian.findFirst({ where: { studentId, guardianId, canPickUp: true, ...OPEN_LINK, guardian: { archivedAt: null, phone: { not: null } } }, select: { guardianId: true } });
  if (!sg) return null;
  return tx.parentLink.findFirst({ where: { guardianId, status: "ACTIVE" }, select: { id: true } });
}

/** That link, only while it can be used (Parent Link on, the school open, the guardian on record); else the photo, ID or call check stands. */
async function usableLink(tx: Tx, ctx: SchoolContext, studentId: string, guardianId: string) {
  const link = await pickupApproverLink(tx, studentId, guardianId);
  return link && !(await linkUsable(tx, ctx, link.id)) ? link : null;
}

/** The student, only when on the person's campus (one-campus logins); the same words either way. */
async function studentHere(tx: Tx, studentId: string, limit: CampusLimit | null | undefined) {
  const s = await tx.student.findFirst({ where: { id: studentId, archivedAt: null, ...inCampus(limit) }, select: { id: true, firstName: true, fullName: true } });
  if (!s) throw new FrontOfficeProblem("This student was not found.");
  return s;
}

/** The Principal or a School Admin: may allow a release a guardian refused or could not answer. */
export async function isPickupLeader(tx: Tx, ctx: SchoolContext) {
  if (!ctx.userId) return false;
  for (const role of ["principal", "school-admin"]) if ((await loginsWithRole(tx, ctx, role)).includes(ctx.userId)) return true;
  return false;
}

const codeMinutesOf = async (tx: Tx, ctx: SchoolContext) => (await messageSettings(tx, ctx)).parentLink.codeMinutes;

/** Asks the guardian collecting to approve the pickup in their own WhatsApp. */
export async function askPickupApproval(tx: Tx, ctx: SchoolContext, input: { studentId: string; guardianId: string; limit?: CampusLimit | null; now?: Date }) {
  const now = input.now ?? new Date();
  const { studentId, guardianId } = input;
  const student = await studentHere(tx, studentId, input.limit);
  const sg = await tx.studentGuardian.findFirst({ where: { studentId, guardianId, archivedAt: null }, include: { guardian: true } });
  if (!sg || !sg.canPickUp || sg.restriction?.trim() || sg.guardian.archivedAt) throw new FrontOfficeProblem("This person is not on the student’s pickup list. Call a registered guardian.");
  const first = sg.guardian.name.split(" ")[0];
  const phone = sg.guardian.phone;
  if (!phone) throw new FrontOfficeProblem(`${first} has no phone, so approval cannot be asked on WhatsApp. Call another registered guardian, or add the phone in Student Management.`);
  const carrier = await pickupTapCarrier(tx, ctx);
  if (!carrier) throw new FrontOfficeProblem("Approval cannot be asked on WhatsApp right now. Check the photo, ID proof or call a guardian instead.");
  const link = await usableLink(tx, ctx, studentId, guardianId);
  if (!link) throw new FrontOfficeProblem(noLinkWords(first));
  const recent = await tx.parentLinkCode.count({ where: { parentLinkId: link.id, purpose: "pickup", createdAt: { gte: new Date(now.getTime() - PICKUP_TAP_WINDOW_MS), lte: now } } });
  if (recent >= PICKUP_TAP_LIMIT) throw new FrontOfficeProblem("Three requests were already sent in the last 10 minutes. Wait a little, or check by calling the guardian.");
  // An earlier request for this child that is not answered stops working (and the log says so).
  const cancelled = await tx.parentLinkCode.updateMany({ where: { parentLinkId: link.id, purpose: "pickup", usedAt: null, expiresAt: { gt: now }, detail: { path: ["studentId"], equals: studentId } }, data: { expiresAt: now } });
  if (cancelled.count) await writeAudit(tx, ctx, { action: "pickup-approval-cancelled", recordType: "Student", recordId: studentId, after: { guardianId, requests: cancelled.count, why: "asked again" } });
  const minutes = await codeMinutesOf(tx, ctx);
  const asker = ctx.userId ? await tx.userLogin.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null;
  const secret = randomBytes(18).toString("base64url");
  const row = await tx.parentLinkCode.create({
    data: {
      schoolId: ctx.schoolId, parentLinkId: link.id, purpose: "pickup", codeHash: codeHash(secret, link.id), createdAt: now, expiresAt: new Date(now.getTime() + minutes * 60_000),
      detail: { via: "tap", kind: "pickup", studentId, collectorId: guardianId, personName: sg.guardian.name, requestedBy: asker?.displayName ?? null, requestedById: ctx.userId },
    },
  });
  const sent = await sendMessage(tx, ctx, {
    to: { guardianIds: [guardianId] },
    channels: ["whatsapp"],
    templates: { whatsapp: carrier.templateId },
    // The secret joins the button's link only when the message is handed to WhatsApp (deliver.ts); the text keeps the mask.
    perPerson: { [guardianId]: { link: `${placeholderFor(link.id)}.${CODE_MASK}`, visitor_name: sg.guardian.name, student_name: student.fullName } },
    oneTimeCode: { code: secret, purpose: "pickup" },
    single: true,
    trigger: "Pickup approval request",
    source: { type: "Parent Link Code", id: row.id },
    idempotencyKey: `pickup-approve:${row.id}`,
  });
  await tx.parentLinkCode.update({ where: { id: row.id }, data: { messageId: sent.messageId } });
  const testMode = carrier.testMode;
  const inLog = mayLogCode(testMode ? "test" : "real") && await logCodeSentBy(tx, ctx, "whatsapp", { to: phone, purpose: "pickup approval", code: `${linkUrl(link.id)}.${secret}` });
  // Nobody can open a request Test mode kept back (outside a tester's computer): end it, so the desk does not wait for it.
  if (testMode && !inLog) await tx.parentLinkCode.update({ where: { id: row.id }, data: { expiresAt: now } });
  await writeAudit(tx, ctx, { action: "pickup-approval-asked", recordType: "Student", recordId: studentId, after: { guardianId, to: maskPhone(phone), channel: "whatsapp" } });
  return { requestId: row.id, messageId: sent.messageId, name: sg.guardian.name, to: maskPhone(phone), testMode, inLog };
}

export type PickupApproval =
  /** No usable Parent Link (or no phone): the desk checks the photo, ID proof or calls. */
  | { state: "no-link" }
  /** Nothing asked yet, or the last answer is too old or was used. */
  | { state: "none" }
  | { state: "waiting"; askedAt: string }
  | { state: "approved"; by: string; at: string }
  | { state: "declined"; by: string; at: string }
  /** Asked, but no answer came in time, or the approval ran out before the release. */
  | { state: "expired" }
  /** The request did not reach WhatsApp: the desk calls the guardian instead. */
  | { state: "failed" };

type Row = { id: string; createdAt: Date; usedAt: Date | null; expiresAt: Date; answer: string | null; answeredAt: Date | null; releasedAt: Date | null; detail: unknown; failed: boolean };

/** The guardian's newest pickup request for this child, on their link; failed: WhatsApp did not take it. */
async function newestRequest(tx: Tx, linkId: string, studentId: string): Promise<Row | null> {
  const row = await tx.parentLinkCode.findFirst({
    where: { parentLinkId: linkId, purpose: "pickup", detail: { path: ["studentId"], equals: studentId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, usedAt: true, expiresAt: true, answer: true, answeredAt: true, releasedAt: true, detail: true, messageId: true },
  });
  if (!row) return null;
  let failed = false;
  if (!row.answer && row.messageId) {
    const sent = await tx.messageRecipient.findMany({ where: { messageId: row.messageId }, select: { status: true } });
    failed = sent.length > 0 && sent.every((r) => r.status === "FAILED");
  }
  return { ...row, failed };
}

function stateOf(row: Row | null, minutes: number, timeZone: string, now: Date): PickupApproval {
  if (!row || row.releasedAt) return { state: "none" };
  const window = minutes * 60_000;
  const by = String((row.detail as { personName?: string } | null)?.personName ?? "");
  if (row.answer && row.answeredAt) {
    if (now.getTime() - row.answeredAt.getTime() > window) return { state: "none" };
    return { state: row.answer === "approved" ? "approved" : "declined", by, at: clockAt(row.answeredAt, timeZone) };
  }
  if (now.getTime() - row.expiresAt.getTime() > window) return { state: "none" };
  if (row.failed) return { state: "failed" };
  if (!row.usedAt && row.expiresAt > now) return { state: "waiting", askedAt: clockAt(row.createdAt, timeZone) };
  return { state: "expired" };
}

/** Where a pickup approval stands for the desk: for each guardian collecting, by id. Only the person's campus's children. */
export async function pickupApprovals(tx: Tx, ctx: SchoolContext, studentId: string, guardianIds: string[], opts: { timeZone: string; now?: Date; limit?: CampusLimit | null }): Promise<Record<string, PickupApproval>> {
  await studentHere(tx, studentId, opts.limit);
  const now = opts.now ?? new Date();
  const minutes = await codeMinutesOf(tx, ctx);
  const out: Record<string, PickupApproval> = {};
  for (const g of guardianIds) {
    const link = await usableLink(tx, ctx, studentId, g);
    out[g] = link ? stateOf(await newestRequest(tx, link.id, studentId), minutes, opts.timeZone, now) : { state: "no-link" };
  }
  return out;
}

export type DeclineBlock = { by: string; at: string; until: string };

/**
 * A guardian said no on WhatsApp within the code minutes: no pickup release of
 * this child, to anyone, unless a Principal or School Admin allows it. Lifted
 * when that guardian, asked again, approves.
 */
export async function pickupDeclineBlock(tx: Tx, ctx: SchoolContext, studentId: string, timeZone: string, now = new Date()): Promise<DeclineBlock | null> {
  const window = (await codeMinutesOf(tx, ctx)) * 60_000;
  const since = new Date(now.getTime() - window);
  const no = await tx.parentLinkCode.findFirst({
    where: { purpose: "pickup", answer: "declined", answeredAt: { gt: since, lte: now }, detail: { path: ["studentId"], equals: studentId } },
    orderBy: { answeredAt: "desc" },
    select: { parentLinkId: true, answeredAt: true, detail: true },
  });
  if (!no?.answeredAt) return null;
  const yesAfter = await tx.parentLinkCode.findFirst({ where: { parentLinkId: no.parentLinkId, purpose: "pickup", answer: "approved", answeredAt: { gt: no.answeredAt, lte: now }, detail: { path: ["studentId"], equals: studentId } }, select: { id: true } });
  if (yesAfter) return null;
  return { by: String((no.detail as { personName?: string } | null)?.personName ?? ""), at: clockAt(no.answeredAt, timeZone), until: clockAt(new Date(no.answeredAt.getTime() + window), timeZone) };
}

/** The desk's words for a block. */
export const declineBlockWords = (b: DeclineBlock, student: string) =>
  `${b.by} said no on WhatsApp at ${b.at}. Do not release ${student} to anyone before ${b.until}, unless the Principal or a School Admin allows it.`;

/** A refused release is kept in the audit log (it is answered as a KeptRefusal, so the line stays). */
async function refuse(tx: Tx, ctx: SchoolContext, who: { studentId: string; guardianId: string }, why: string, message: string) {
  await writeAudit(tx, ctx, { action: "pickup-release-refused", recordType: "Student", recordId: who.studentId, after: { guardianId: who.guardianId, why } });
  return new KeptRefusal(message, "approval");
}

/**
 * At release, the guardian's answer on WhatsApp, checked on the server:
 * - a block after a No (any guardian, within the code minutes): refused, unless a Principal or School Admin allows it with a note;
 * - the leader's note also lets a child go when the guardian could not answer ("leader");
 * - otherwise, with approvals on: the approval for this child and guardian, used once ("used"); the request
 *   that did not reach WhatsApp and a call instead ("fallback"); no usable Parent Link (null: the photo, ID or call check stands).
 * Every refusal is kept in the audit log.
 */
export async function checkPickupAnswer(tx: Tx, ctx: SchoolContext, who: { studentId: string; guardianId: string; first: string; student: string; timeZone: string }, input: { tapCheck: boolean; fallback: "call" | null; leaderNote: string | null }, now = new Date()): Promise<"used" | "fallback" | "leader" | null | KeptRefusal> {
  const block = await pickupDeclineBlock(tx, ctx, who.studentId, who.timeZone, now);
  const note = (input.leaderNote ?? "").trim().replace(/\s+/g, " ");
  if (note && (block || input.tapCheck)) {
    if (!(await isPickupLeader(tx, ctx))) throw new FrontOfficeProblem("Only the Principal or a School Admin can allow this release.", "leaderNote");
    if (note.length < 5) throw new FrontOfficeProblem("Write why you are allowing this release.", "leaderNote");
    if (note.length > 200) throw new FrontOfficeProblem("Keep the note to 200 characters.", "leaderNote");
    await writeAudit(tx, ctx, { action: "pickup-allowed-by-leader", recordType: "Student", recordId: who.studentId, after: { guardianId: who.guardianId, note, ...(block ? { saidNo: block.by, at: block.at } : {}) } });
    return "leader";
  }
  if (block) return refuse(tx, ctx, who, "a guardian said no on WhatsApp", declineBlockWords(block, who.student));
  if (!input.tapCheck) return null;
  const link = await usableLink(tx, ctx, who.studentId, who.guardianId);
  if (!link) return null;
  const row = await newestRequest(tx, link.id, who.studentId);
  const state = stateOf(row, await codeMinutesOf(tx, ctx), who.timeZone, now);
  if (state.state === "failed" && row) {
    if (input.fallback !== "call") return refuse(tx, ctx, who, "the request did not reach WhatsApp", `The request did not reach ${who.first}’s WhatsApp. Call ${who.first}, and tick that they confirmed on the call.`);
    const claimed = await tx.parentLinkCode.updateMany({ where: { id: row.id, releasedAt: null }, data: { releasedAt: now } });
    if (claimed.count !== 1) return refuse(tx, ctx, who, "already used", `This request was already used. Ask ${who.first} again.`);
    await writeAudit(tx, ctx, { action: "pickup-approval-fallback", recordType: "Student", recordId: who.studentId, after: { guardianId: who.guardianId, request: row.id, how: "approval could not be sent, checked by a call" } });
    return "fallback";
  }
  if (state.state === "declined") return refuse(tx, ctx, who, "said no", `${who.first} said no on WhatsApp at ${state.at}. Do not release ${who.student}.`);
  if (state.state === "waiting") return refuse(tx, ctx, who, "no answer yet", `${who.first} has not approved on WhatsApp yet. Wait for the answer, or ask again.`);
  if (state.state === "expired") return refuse(tx, ctx, who, "ran out", `The approval on WhatsApp ran out. Ask ${who.first} again.`);
  if (state.state !== "approved" || !row) return refuse(tx, ctx, who, "not asked", `Ask ${who.first} to approve on WhatsApp first.`);
  // Used once only: marking it used succeeds for just one release.
  const claimed = await tx.parentLinkCode.updateMany({ where: { id: row.id, answer: "approved", releasedAt: null }, data: { releasedAt: now } });
  if (claimed.count !== 1) return refuse(tx, ctx, who, "already used", `This approval was already used. Ask ${who.first} again.`);
  await writeAudit(tx, ctx, { action: "pickup-approval-used", recordType: "Student", recordId: who.studentId, after: { guardianId: who.guardianId, request: row.id } });
  return "used";
}

// ── The guardian's side (Parent Link, no login) ───────────────────────────

/** "Approve: {person} takes {student} home now?" for the guardian's page; null when the child is not theirs (any more). Only reads. */
export async function pickupTapView(tx: Tx, guardianId: string, detail: Record<string, unknown>): Promise<{ kind: "pickup"; person: string; student: string } | null> {
  const child = await ownChild(tx, guardianId, detail);
  return child ? { kind: "pickup", person: String(detail.personName ?? ""), student: child.firstName } : null;
}

async function ownChild(tx: Tx, guardianId: string, detail: Record<string, unknown>) {
  if (typeof detail.studentId !== "string") return null;
  const sg = await tx.studentGuardian.findFirst({ where: { studentId: detail.studentId, guardianId, ...OPEN_LINK, student: { archivedAt: null, status: "ACTIVE" } }, select: { student: { select: { id: true, firstName: true, fullName: true } } } });
  return sg?.student ?? null;
}

export type PickupAnswer = "approved" | "declined";

/** Records the guardian's answer to a pickup request, once. The caller has checked that the link is usable. A No warns the school's leaders. */
export async function answerPickup(tx: Tx, ctx: SchoolContext, req: { id: string; detail: Record<string, unknown> }, guardianId: string, answer: PickupAnswer, device: { userAgent: string | null; ipAddress: string | null }, now = new Date()): Promise<{ ok: true; answer: PickupAnswer; person: string; student: string } | { ok: false; message: string }> {
  const child = await ownChild(tx, guardianId, req.detail);
  if (!child) return { ok: false, message: "This request is not for your child. Please call the school." };
  const claimed = await tx.parentLinkCode.updateMany({ where: { id: req.id, purpose: "pickup", usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now, answer, answeredAt: now, attempts: { increment: 1 } } });
  if (claimed.count !== 1) return { ok: false, message: TAP_GONE };
  const person = String(req.detail.personName ?? "");
  await writeAudit(tx, ctx, { action: answer === "approved" ? "pickup-approved" : "pickup-declined", recordType: "Student", recordId: child.id, after: { guardianId, person, how: "by a tap on the school's WhatsApp message" }, device: device.userAgent, ipAddress: device.ipAddress });
  if (answer === "declined") await tellDecline(tx, ctx, child, person, now);
  return { ok: true, answer, person, student: child.firstName };
}

/** A No: the Principal, every School Admin and the class teacher are told at once; it opens the child on Student Pickup. */
async function tellDecline(tx: Tx, ctx: SchoolContext, child: { id: string; firstName: string; fullName: string }, guardian: string, now: Date) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const until = new Date(now.getTime() + (await codeMinutesOf(tx, ctx)) * 60_000);
  const to = new Set([...(await loginsWithRole(tx, ctx, "principal")), ...(await loginsWithRole(tx, ctx, "school-admin"))]);
  const teacher = await classTeacherLogin(tx, ctx, child.id);
  if (teacher) to.add(teacher);
  const values = { guardian, name: child.fullName, first: child.firstName, time: clockAt(now, school.timeZone), until: clockAt(until, school.timeZone) };
  for (const person of to) {
    await notify(tx, ctx, { to: person, type: "pickup-refused", key: "{guardian} said no on WhatsApp at {time} to taking {name} home. Do not release {first} to anyone before {until}, unless the Principal or a School Admin allows it.", values, link: `/front-office/pickup?student=${child.id}` }, now);
  }
}

async function classTeacherLogin(tx: Tx, ctx: SchoolContext, studentId: string): Promise<string | null> {
  const years = await currentYearIds(tx, ctx);
  if (!years.length) return null;
  const e = await tx.enrolment.findFirst({ where: { studentId, academicYearId: { in: years }, archivedAt: null }, select: { sectionId: true } });
  const staffId = e ? (await tx.section.findFirst({ where: { id: e.sectionId }, select: { classTeacherId: true } }))?.classTeacherId : null;
  if (!staffId) return null;
  return (await tx.staff.findFirst({ where: { id: staffId }, select: { userLoginId: true } }))?.userLoginId ?? null;
}
