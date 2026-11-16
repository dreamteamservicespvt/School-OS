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
import "server-only";

import { randomBytes } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { sendMessage } from "../messaging/send";
import { channelSetups, whatsappIsLive } from "../messaging/channels";
import { inTestMode } from "../messaging/providers";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import { messageSettings } from "../messaging/settings";
import { CODE_MASK } from "../messaging/one-time-code";
import { logCodeSentBy, mayLogCode } from "../dev-codes";
import { OPEN_LINK } from "../students/guardian-access";
import { codeHash, linkUrl, linkUsable, placeholderFor, TAP_GONE } from "../parent-link/links";
import { FrontOfficeProblem } from "./problem";
import { clockAt } from "./time";
import { maskPhone } from "./words";

/** The ready WhatsApp card that carries a pickup request (../messaging/ready-whatsapp.ts). */
export const PICKUP_TAP_KEY = "pickup-approve";
/** How a WhatsApp approval shows in a gate pass's "Checked with". */
export const TAP_CHECK = "WhatsApp approval";
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

/** Asks the guardian collecting to approve the pickup in their own WhatsApp. */
export async function askPickupApproval(tx: Tx, ctx: SchoolContext, input: { studentId: string; guardianId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const { studentId, guardianId } = input;
  const sg = await tx.studentGuardian.findFirst({ where: { studentId, guardianId, archivedAt: null, student: { archivedAt: null } }, include: { guardian: true, student: { select: { fullName: true } } } });
  if (!sg || !sg.canPickUp || sg.restriction?.trim() || sg.guardian.archivedAt) throw new FrontOfficeProblem("This person is not on the student’s pickup list. Call a registered guardian.");
  const first = sg.guardian.name.split(" ")[0];
  const phone = sg.guardian.phone;
  if (!phone) throw new FrontOfficeProblem(`${first} has no phone, so approval cannot be asked on WhatsApp. Call another registered guardian, or add the phone in Student Management.`);
  const carrier = await pickupTapCarrier(tx, ctx);
  if (!carrier) throw new FrontOfficeProblem("Approval cannot be asked on WhatsApp right now. Check the photo, ID proof or call a guardian instead.");
  const link = await pickupApproverLink(tx, studentId, guardianId);
  if (!link || (await linkUsable(tx, ctx, link.id))) throw new FrontOfficeProblem(noLinkWords(first));
  const recent = await tx.parentLinkCode.count({ where: { parentLinkId: link.id, purpose: "pickup", createdAt: { gte: new Date(now.getTime() - PICKUP_TAP_WINDOW_MS), lte: now } } });
  if (recent >= PICKUP_TAP_LIMIT) throw new FrontOfficeProblem("Three requests were already sent in the last 10 minutes. Wait a little, or check by calling the guardian.");
  // An earlier request for this child that is not answered stops working.
  await tx.parentLinkCode.updateMany({ where: { parentLinkId: link.id, purpose: "pickup", usedAt: null, expiresAt: { gt: now }, detail: { path: ["studentId"], equals: studentId } }, data: { expiresAt: now } });
  const minutes = (await messageSettings(tx, ctx)).parentLink.codeMinutes;
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
    perPerson: { [guardianId]: { link: `${placeholderFor(link.id)}.${CODE_MASK}`, visitor_name: sg.guardian.name, student_name: sg.student.fullName } },
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
  /** No Parent Link (or no phone): the desk checks the photo, ID proof or calls. */
  | { state: "no-link" }
  /** Nothing asked yet, or the last answer is too old or was used. */
  | { state: "none" }
  | { state: "waiting"; askedAt: string }
  | { state: "approved"; by: string; at: string }
  | { state: "declined"; by: string; at: string }
  /** Asked, but no answer came in time, or the approval ran out before the release. */
  | { state: "expired" };

type Row = { id: string; createdAt: Date; usedAt: Date | null; expiresAt: Date; answer: string | null; answeredAt: Date | null; releasedAt: Date | null; detail: unknown };

/** The guardian's newest pickup request for this child, on their active link. */
async function newestRequest(tx: Tx, linkId: string, studentId: string): Promise<Row | null> {
  return tx.parentLinkCode.findFirst({
    where: { parentLinkId: linkId, purpose: "pickup", detail: { path: ["studentId"], equals: studentId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, usedAt: true, expiresAt: true, answer: true, answeredAt: true, releasedAt: true, detail: true },
  });
}

function stateOf(row: Row | null, minutes: number, timeZone: string, now: Date): PickupApproval {
  if (!row || row.releasedAt) return { state: "none" };
  const window = minutes * 60_000;
  const by = String((row.detail as { personName?: string } | null)?.personName ?? "");
  if (row.answer && row.answeredAt) {
    if (now.getTime() - row.answeredAt.getTime() > window) return { state: "none" };
    return { state: row.answer === "approved" ? "approved" : "declined", by, at: clockAt(row.answeredAt, timeZone) };
  }
  if (!row.usedAt && row.expiresAt > now) return { state: "waiting", askedAt: clockAt(row.createdAt, timeZone) };
  return now.getTime() - row.expiresAt.getTime() <= window ? { state: "expired" } : { state: "none" };
}

/** Where a pickup approval stands for the desk: for each guardian collecting, by id. */
export async function pickupApprovals(tx: Tx, ctx: SchoolContext, studentId: string, guardianIds: string[], timeZone: string, now = new Date()): Promise<Record<string, PickupApproval>> {
  const minutes = (await messageSettings(tx, ctx)).parentLink.codeMinutes;
  const out: Record<string, PickupApproval> = {};
  for (const g of guardianIds) {
    const link = await pickupApproverLink(tx, studentId, g);
    out[g] = link ? stateOf(await newestRequest(tx, link.id, studentId), minutes, timeZone, now) : { state: "no-link" };
  }
  return out;
}

/**
 * At release, when approvals apply: the guardian's approval for this child is
 * checked on the server and used once. Null when the guardian has no Parent
 * Link (the photo, ID or call check stands); "used" when an approval was used;
 * else a FrontOfficeProblem says what to do.
 */
export async function spendApproval(tx: Tx, ctx: SchoolContext, who: { studentId: string; guardianId: string; first: string; student: string; timeZone: string }, now = new Date()): Promise<"used" | null> {
  const link = await pickupApproverLink(tx, who.studentId, who.guardianId);
  if (!link) return null;
  const minutes = (await messageSettings(tx, ctx)).parentLink.codeMinutes;
  const row = await newestRequest(tx, link.id, who.studentId);
  const state = stateOf(row, minutes, who.timeZone, now);
  if (state.state === "declined") throw new FrontOfficeProblem(`${who.first} said no on WhatsApp at ${state.at}. Do not release ${who.student}. Call ${who.first}, or ask again.`, "approval");
  if (state.state === "waiting") throw new FrontOfficeProblem(`${who.first} has not approved on WhatsApp yet. Wait for the answer, or ask again.`, "approval");
  if (state.state === "expired") throw new FrontOfficeProblem(`The approval on WhatsApp ran out. Ask ${who.first} again.`, "approval");
  if (state.state !== "approved" || !row) throw new FrontOfficeProblem(`Ask ${who.first} to approve on WhatsApp first.`, "approval");
  // Used once only: marking it used succeeds for just one release.
  const claimed = await tx.parentLinkCode.updateMany({ where: { id: row.id, answer: "approved", releasedAt: null }, data: { releasedAt: now } });
  if (claimed.count !== 1) throw new FrontOfficeProblem(`This approval was already used. Ask ${who.first} again.`, "approval");
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
  const sg = await tx.studentGuardian.findFirst({ where: { studentId: detail.studentId, guardianId, ...OPEN_LINK, student: { archivedAt: null, status: "ACTIVE" } }, select: { student: { select: { id: true, firstName: true } } } });
  return sg?.student ?? null;
}

export type PickupAnswer = "approved" | "declined";

/** Records the guardian's answer to a pickup request, once. The caller has checked that the link is usable. */
export async function answerPickup(tx: Tx, ctx: SchoolContext, req: { id: string; detail: Record<string, unknown> }, guardianId: string, answer: PickupAnswer, device: { userAgent: string | null; ipAddress: string | null }, now = new Date()): Promise<{ ok: true; answer: PickupAnswer; person: string; student: string } | { ok: false; message: string }> {
  const child = await ownChild(tx, guardianId, req.detail);
  if (!child) return { ok: false, message: "This request is not for your child. Please call the school." };
  const claimed = await tx.parentLinkCode.updateMany({ where: { id: req.id, purpose: "pickup", usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now, answer, answeredAt: now, attempts: { increment: 1 } } });
  if (claimed.count !== 1) return { ok: false, message: TAP_GONE };
  const person = String(req.detail.personName ?? "");
  await writeAudit(tx, ctx, { action: answer === "approved" ? "pickup-approved" : "pickup-declined", recordType: "Student", recordId: child.id, after: { guardianId, person, how: "by a tap on the school's WhatsApp message" }, device: device.userAgent, ipAddress: device.ipAddress });
  return { ok: true, answer, person, student: child.firstName };
}
