// Consent forms on Parent Link (D8, DPDP Act 2023; 04-data-model.md rule 33).
// A guardian agrees or withdraws for their children with a one-time code to
// their registered mobile. Each record keeps the text version agreed to; a
// new version never changes past records; a withdrawal keeps the record with
// its date.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { sendMessage } from "../messaging/send";
import { channelSetups } from "../messaging/channels";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import { checkCode, ParentLinkProblem, sendCode } from "./links";
import { childrenOfGuardian } from "../students/guardian-access";

export type ConsentTextRow = { id: string; consentType: string; title: string; version: number; text: Record<string, string> };

export const CONSENT_TYPE_LABEL: Record<string, string> = {
  "data-processing": "Data processing (DPDP Act 2023)",
  photo: "Photo consent",
  apaar: "APAAR ID consent",
  "message-opt-in": "Messages opt-in",
};
export const consentTypeLabel = (t: string) => CONSENT_TYPE_LABEL[t] ?? t.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The current text of each consent type (from Settings, Data Backup & Security). */
export async function currentConsentTexts(tx: Tx, ctx: SchoolContext): Promise<ConsentTextRow[]> {
  const rows = await tx.consentText.findMany({ where: { schoolId: ctx.schoolId, isCurrent: true }, orderBy: [{ consentType: "asc" }, { version: "desc" }] });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.consentType) ? false : (seen.add(r.consentType), true))).map((r) => ({ id: r.id, consentType: r.consentType, title: r.title, version: r.version, text: (r.text ?? {}) as Record<string, string> }));
}

export function consentWording(t: ConsentTextRow, language: string) {
  return t.text[language] ?? t.text.en ?? Object.values(t.text)[0] ?? "";
}

/** The standing consent (latest record not withdrawn) per guardian, student and type. */
export async function standingConsents(tx: Tx, ctx: SchoolContext, where: { guardianIds?: string[]; studentIds?: string[]; consentType?: string }) {
  return tx.consentRecord.findMany({
    where: {
      schoolId: ctx.schoolId,
      withdrawnAt: null,
      ...(where.guardianIds ? { guardianId: { in: where.guardianIds } } : {}),
      ...(where.studentIds ? { studentId: { in: where.studentIds } } : {}),
      ...(where.consentType ? { consentType: where.consentType } : {}),
    },
    orderBy: { givenAt: "desc" },
  });
}

export type ConsentAction = { consentTextId: string; studentIds: string[]; action: "give" | "withdraw" };

/** Step 1 on Parent Link: send a code for this consent action. */
export async function askConsentCode(tx: Tx, ctx: SchoolContext, linkId: string, guardianId: string, action: ConsentAction) {
  const text = await tx.consentText.findFirst({ where: { id: action.consentTextId, schoolId: ctx.schoolId, isCurrent: true } });
  if (!text) throw new ParentLinkProblem("This consent form has changed. Please open the page again.");
  const mine = await childrenOfGuardian(tx, ctx, guardianId, { studying: true });
  if (!action.studentIds.length || action.studentIds.some((id) => !mine.includes(id))) throw new ParentLinkProblem("Choose your child for this consent.");
  return sendCode(tx, ctx, linkId, "consent", { detail: action });
}

/** Step 2: the right code records the consent (or its withdrawal) for each child. */
export async function confirmConsent(tx: Tx, ctx: SchoolContext, linkId: string, guardianId: string, typed: string, device: { userAgent: string | null; ipAddress: string | null }) {
  const check = await checkCode(tx, ctx, linkId, "consent", typed, null);
  if (!check.ok) return check;
  const action = check.code.detail as ConsentAction;
  const text = await tx.consentText.findFirst({ where: { id: action.consentTextId, schoolId: ctx.schoolId } });
  if (!text) return { ok: false as const, message: "This consent form has changed. Please open the page again." };
  // Checked again: a custody restriction set after the code was sent stops it too.
  const mine = await childrenOfGuardian(tx, ctx, guardianId, { studying: true });
  const students = action.studentIds.filter((id) => mine.includes(id));
  if (!students.length) return { ok: false as const, message: "Choose your child for this consent." };
  const now = new Date();
  for (const studentId of students) {
    const standing = await tx.consentRecord.findFirst({ where: { schoolId: ctx.schoolId, guardianId, studentId, consentType: text.consentType, withdrawnAt: null } });
    if (action.action === "give") {
      if (standing && standing.consentTextId === text.id) continue;
      // Agreeing to a new version replaces the old one, which stays on record as withdrawn.
      if (standing) await tx.consentRecord.update({ where: { id: standing.id }, data: { withdrawnAt: now, withdrawnHow: "replaced by a newer version" } });
      const rec = await tx.consentRecord.create({ data: { schoolId: ctx.schoolId, guardianId, studentId, consentType: text.consentType, consentTextId: text.id, textVersion: text.version, givenAt: now, how: "parent-link", parentLinkId: linkId } });
      await writeAudit(tx, ctx, { action: "consent-given", recordType: "Consent Record", recordId: rec.id, after: { type: text.consentType, version: text.version, how: "Parent Link, confirmed by a one-time code" }, device: device.userAgent, ipAddress: device.ipAddress });
    } else if (standing) {
      await tx.consentRecord.update({ where: { id: standing.id }, data: { withdrawnAt: now, withdrawnHow: "parent-link" } });
      await writeAudit(tx, ctx, { action: "consent-withdrawn", recordType: "Consent Record", recordId: standing.id, before: { withdrawnAt: null }, after: { withdrawnAt: now.toISOString(), how: "Parent Link, confirmed by a one-time code" }, device: device.userAgent, ipAddress: device.ipAddress });
    }
  }
  return { ok: true as const, action: action.action, count: students.length, title: text.title };
}

/** Request consent: one consent form to a set of guardians, by message, with a reply-by date. */
export async function requestConsent(tx: Tx, ctx: SchoolContext, input: { consentTextId: string; guardianIds: string[]; audienceLabel: string; replyBy: Date }) {
  const text = await tx.consentText.findFirst({ where: { id: input.consentTextId, schoolId: ctx.schoolId, isCurrent: true } });
  if (!text) throw new ParentLinkProblem("Choose a consent type.");
  if (!input.guardianIds.length) throw new ParentLinkProblem("Every parent chosen has already given this consent.");
  const req = await tx.consentRequest.create({ data: { schoolId: ctx.schoolId, consentType: text.consentType, consentTextId: text.id, audienceLabel: input.audienceLabel, guardianIds: input.guardianIds, replyBy: input.replyBy, createdById: ctx.userId } });
  const sent = await notifyConsent(tx, ctx, req.id, input.guardianIds, text.title, "Consent request");
  await tx.consentRequest.update({ where: { id: req.id }, data: { messageId: sent?.messageId ?? null } });
  await writeAudit(tx, ctx, { action: "requested-consent", recordType: "Consent Request", recordId: req.id, after: { type: text.consentType, version: text.version, guardians: input.guardianIds.length, replyBy: input.replyBy.toISOString().slice(0, 10) } });
  return { request: req, message: sent };
}

async function notifyConsent(tx: Tx, ctx: SchoolContext, requestId: string, guardianIds: string[], title: string, trigger: string) {
  await ensureReadyTemplates(tx, ctx);
  const setups = await channelSetups(tx, ctx);
  if (!setups.whatsapp.isOn) return null; // Shown on Parent Link either way.
  const t = await templateByKey(tx, ctx, "consent-request", "whatsapp");
  if (!t) return null;
  return sendMessage(tx, ctx, { to: { guardianIds }, channels: ["whatsapp"], templates: { whatsapp: t.id }, values: { title }, trigger, source: { type: "Consent Request", id: requestId } });
}

/** Given, waiting and withdrawn for one request. */
export async function requestStatus(tx: Tx, ctx: SchoolContext, requestId: string) {
  const req = await tx.consentRequest.findFirstOrThrow({ where: { id: requestId, schoolId: ctx.schoolId } });
  const records = await tx.consentRecord.findMany({ where: { schoolId: ctx.schoolId, consentType: req.consentType, guardianId: { in: req.guardianIds } }, orderBy: { givenAt: "desc" } });
  const given = new Set<string>();
  const withdrawn = new Set<string>();
  for (const g of req.guardianIds) {
    const mine = records.filter((r) => r.guardianId === g);
    if (mine.some((r) => !r.withdrawnAt)) given.add(g);
    else if (mine.some((r) => r.withdrawnAt && r.withdrawnHow !== "replaced by a newer version")) withdrawn.add(g);
  }
  const waiting = req.guardianIds.filter((g) => !given.has(g) && !withdrawn.has(g));
  return { request: req, given: [...given], withdrawn: [...withdrawn], waiting };
}

/** Reminder for those still waiting (until the reply-by date). */
export async function remindConsent(tx: Tx, ctx: SchoolContext, requestId: string) {
  const { request, waiting } = await requestStatus(tx, ctx, requestId);
  const today = new Date(new Date().toISOString().slice(0, 10));
  if (request.replyBy < today) throw new ParentLinkProblem("The reply-by date has passed, so reminders have stopped. Send a new request if needed.");
  if (!waiting.length) throw new ParentLinkProblem("Nobody is waiting: every parent has answered.");
  const text = await tx.consentText.findUniqueOrThrow({ where: { id: request.consentTextId } });
  const sent = await notifyConsent(tx, ctx, request.id, waiting, text.title, "Consent reminder");
  if (!sent) throw new ParentLinkProblem("WhatsApp is switched off, so the reminder cannot be sent. Parents still see the form on their Parent Link.");
  await tx.consentRequest.update({ where: { id: request.id }, data: { lastReminderAt: new Date() } });
  await writeAudit(tx, ctx, { action: "reminded-consent", recordType: "Consent Request", recordId: request.id, after: { guardians: waiting.length } });
  return { count: waiting.length, messageId: sent.messageId };
}
