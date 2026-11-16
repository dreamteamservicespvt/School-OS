// Data consent on the application (DPDP Act 2023, decided 9 October 2026,
// D8a): the guardian agrees to the school's consent text, confirmed by a
// one-time code sent to their mobile; photo consent is its own type. Each
// consent keeps the version of the text agreed to. The code is stored only
// as a hash, works for 10 minutes and for 5 tries.
// Decision 23 (16 November 2026): WhatsApp never delivers one-time codes to
// Indian (+91) numbers and SMS is off, so at the counter the office can also
// record a consent form the parent signed on paper (recordPaperConsent), with
// who recorded it and a photo or scan of the form. Parent Link (tap) is apart.
import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { DOCUMENT_TYPES, FileProblem, saveFile } from "../files";
import { codeChannels } from "../messaging/channels";
import { hitLimit, limitMessage } from "../rate-limit";
import { consentLabel, READY_TEXTS } from "../data-security/consent";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, loadApplication } from "./applications";
import { messageParent } from "./notify-parents";
import { CODE_MASK, withCode } from "../messaging/one-time-code";
import { channelInTestMode, channelWord, codeNotSentParentWords, codeNotSentWords, logCodeSentBy, PARENT_CODE_NOT_SENT } from "../dev-codes";
import { codeFailedWords, deliverCodeNow } from "../messaging/code-now";

export const DATA_CONSENT = "data-processing";
export const PHOTO_CONSENT = "photo";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_TRIES = 5;
/** Codes sent to one phone in 15 minutes, at most. */
export const OTP_MAX_SENDS = 5;
/** howGiven for a consent form the parent signed on paper at the counter (decision 23). */
export const PAPER_HOW = "admission-paper-form";
/** A photo or scan of the signed form is at most 5 MB, like admission papers. */
export const MAX_PAPER_BYTES = 5 * 1024 * 1024;

/** A consent that stands: not withdrawn, and confirmed by a one-time code or given on a signed paper form. */
export const CONSENT_STANDS = { withdrawnAt: null, OR: [{ otpVerifiedAt: { not: null } }, { howGiven: PAPER_HOW }] } satisfies Prisma.AdmissionConsentWhereInput;

export function consentStands(c: { withdrawnAt: Date | null; otpVerifiedAt: Date | null; howGiven: string }) {
  return !c.withdrawnAt && (c.otpVerifiedAt !== null || c.howGiven === PAPER_HOW);
}

/**
 * Can a one-time code reach a parent's phone from the counter? Only by SMS that is on
 * and not in Test mode: WhatsApp never delivers codes to +91 numbers (WHATSAPP_NO_CODES),
 * and Test mode only records the message. While it cannot, the signed paper form is the way.
 */
export async function counterCodeCanGo(tx: Tx, ctx: SchoolContext) {
  const can = await codeChannels(tx, ctx);
  return can.has("sms") && !(await channelInTestMode(tx, ctx, "sms"));
}

export type ConsentTextView = { type: string; label: string; title: string; text: string; version: number; required: boolean };

/** The consent texts asked on the admission form: data (required), photo, and any others the school asks on admission. */
export async function admissionConsentTexts(tx: Tx, schoolName: string, lang = "en"): Promise<ConsentTextView[]> {
  const rows = await tx.consentText.findMany({ where: { isCurrent: true } });
  const pick = (type: string): ConsentTextView | null => {
    const r = rows.find((x) => x.consentType === type);
    if (r && !r.askedOnAdmission && type !== DATA_CONSENT) return null;
    const texts = (r?.text ?? {}) as Record<string, string>;
    const body = texts[lang] ?? texts.en ?? Object.values(texts)[0] ?? READY_TEXTS[type]?.en ?? "";
    if (!body) return null;
    return { type, label: consentLabel(type), title: r?.title ?? READY_TEXTS[type]?.title ?? consentLabel(type), text: body.replace(/\{school\}/g, schoolName), version: r?.version ?? 0, required: type === DATA_CONSENT };
  };
  const out = [pick(DATA_CONSENT), pick(PHOTO_CONSENT)].filter((x): x is ConsentTextView => Boolean(x));
  for (const r of rows) {
    if (r.askedOnAdmission && ![DATA_CONSENT, PHOTO_CONSENT, "apaar", "message-opt-in"].includes(r.consentType)) {
      const v = pick(r.consentType);
      if (v) out.push(v);
    }
  }
  return out;
}

function hashCode(id: string, code: string) {
  return createHash("sha256").update(`${id}:${code}`).digest("hex");
}

type Deliver = (phone: string, text: string) => Promise<boolean>;

/** Sends a new one-time code to a parent's mobile for one purpose (ending any earlier one). */
export async function startOtp(tx: Tx, ctx: SchoolContext, input: { phone: string; purpose: string; schoolName: string; about: { recordType: "Application" | "Enquiry"; recordId: string } | null }, opts: { now?: Date; deliver?: Deliver; forParent?: boolean } = {}) {
  const now = opts.now ?? new Date();
  if (!/^[6-9]\d{9}$/.test(input.phone)) throw new AdmissionProblem("Give a 10-digit Indian mobile number for the code.", "phone");
  const limit = await hitLimit(`admission-otp:${ctx.schoolId}:${input.phone}`, OTP_MAX_SENDS, 900, now);
  if (!limit.ok) throw new AdmissionProblem(limitMessage(limit));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await tx.admissionOtp.updateMany({ where: { purpose: input.purpose, usedAt: null }, data: { usedAt: now } });
  const row = await tx.admissionOtp.create({ data: { schoolId: ctx.schoolId, phone: input.phone, purpose: input.purpose, codeHash: "pending", expiresAt: new Date(now.getTime() + OTP_TTL_MS) } });
  await tx.admissionOtp.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });
  // The message keeps "••••••"; the code goes only to the provider (QA SEC-01).
  const text = `${CODE_MASK} is your code to confirm consent for admission at ${input.schoolName}. It works for 10 minutes. Do not share it with anyone else.`;
  const sentTo = `•••••${input.phone.slice(-4)}`;
  if (opts.deliver) {
    if (!(await opts.deliver(input.phone, withCode(text, code)))) throw new AdmissionProblem("The code could not be sent just now. Please try again in a minute.");
    return { sentTo, channel: "sms", testMode: false, inLog: false };
  }
  const r = await messageParent(tx, ctx, { to: { name: "Parent", phone: input.phone }, template: "admission-consent-code", channel: "sms", text, code, values: { school_name: input.schoolName }, about: input.about ?? { recordType: "Application", recordId: input.purpose } });
  // Say why (for example no SMS set up), so the office does not blame the parent's number.
  // A parent (online form) is never shown staff words or settings paths.
  if (r.status !== "queued") throw new AdmissionProblem(opts.forParent ? PARENT_CODE_NOT_SENT : r.status === "skipped" && r.note ? `The code could not be sent. ${r.note}.` : "The code could not be sent to this number.");
  // Test mode only records the message: the screen must not say "Code sent" (QA ADMIT-03).
  const testMode = await channelInTestMode(tx, ctx, r.channel);
  const inLog = await logCodeSentBy(tx, ctx, r.channel, { to: input.phone, purpose: "admission consent", code });
  return { sentTo, channel: r.channel, testMode, inLog, messageId: r.messageId ?? null };
}

/**
 * What the parent's online form says once startOtp has run. A code Test mode kept back
 * is refused (ok false) except on a tester's computer, where the code is in the server log.
 */
export function otpSentParentWords(r: { channel: string; testMode: boolean; inLog: boolean }, to: string): { ok: boolean; message: string } {
  if (r.testMode) return { ok: r.inLog, message: codeNotSentParentWords(r.inLog) };
  return { ok: true, message: `Code sent to ${to} by ${channelWord(r.channel)}. It works for 10 minutes.` };
}

/** What the screen says once startOtp has run: sent, and how, or kept back by Test mode. */
export function otpSentWords(r: { channel: string; testMode: boolean; inLog: boolean }, to: string): string {
  return r.testMode ? codeNotSentWords({ to, channel: r.channel, inLog: r.inLog }) : `Code sent to ${to} by ${channelWord(r.channel)}. It works for 10 minutes.`;
}

/**
 * After the code was queued and the transaction saved: hands it to WhatsApp or
 * SMS now and says what really happened (messaging/code-now.ts). Before, the
 * screen said "Code sent" for a code WhatsApp then refused (owner test 2026-11-05).
 * `forParent`: the online form's words, with no staff words or settings.
 */
export async function confirmOtpSent(ctx: SchoolContext, r: { channel: string; testMode: boolean; inLog: boolean; messageId?: string | null }, to: string, forParent = false): Promise<{ ok: boolean; message: string; testMode?: boolean }> {
  if (r.testMode || !r.messageId) return forParent ? otpSentParentWords(r, to) : { ok: true, message: otpSentWords(r, to), testMode: r.testMode };
  const out = await deliverCodeNow(ctx, r.messageId);
  if (out.state === "failed") return { ok: false, message: forParent ? PARENT_CODE_NOT_SENT : codeFailedWords(r.channel, out.reason) };
  if (out.state === "pending") return { ok: true, message: `The code is on its way to ${to} by ${channelWord(r.channel)}. If it has not come in 2 minutes, tap Send again.` };
  return forParent ? otpSentParentWords(r, to) : { ok: true, message: otpSentWords(r, to) };
}

export type OtpResult = { ok: true } | { ok: false; message: string };

/**
 * Checks a typed code without throwing, so a wrong try is saved when the
 * caller's transaction commits (a thrown error would roll the count back).
 * With consume off it only checks, so a form can confirm the code before it
 * is saved. After 5 wrong tries or 10 minutes a new code is needed.
 */
export async function tryOtp(tx: Tx, input: { purpose: string; phone: string; code: string }, now = new Date(), consume = true): Promise<OtpResult> {
  const code = input.code.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, message: "Type the 6-digit code sent to the parent's mobile." };
  const row = await tx.admissionOtp.findFirst({ where: { purpose: input.purpose, phone: input.phone, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row) return { ok: false, message: "No code is waiting for this number. Send a new code." };
  if (row.expiresAt <= now) return { ok: false, message: "This code has expired (codes work for 10 minutes). Send a new code." };
  if (row.attempts >= OTP_MAX_TRIES) return { ok: false, message: "Too many wrong codes. Send a new code." };
  // Counted before the compare, in one statement that refuses a sixth (security review 2026-11-15),
  // so wrong codes sent at the same moment cannot all read the same count.
  const counted = await tx.admissionOtp.updateMany({ where: { id: row.id, usedAt: null, attempts: { lt: OTP_MAX_TRIES } }, data: { attempts: { increment: 1 } } });
  if (counted.count === 0) return { ok: false, message: "Too many wrong codes. Send a new code." };
  if (row.codeHash !== hashCode(row.id, code)) {
    const left = OTP_MAX_TRIES - (await tx.admissionOtp.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } })).attempts;
    return { ok: false, message: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not right. Send a new code." };
  }
  // A right code is not a wrong try (a form checks it before saving, then again on save).
  await tx.admissionOtp.update({ where: { id: row.id }, data: { attempts: { decrement: 1 } } });
  if (consume) await tx.admissionOtp.update({ where: { id: row.id }, data: { usedAt: now } });
  return { ok: true };
}

/** Like tryOtp, but throws on a wrong code (so the wrong try is not kept). Check with tryOtp first in its own transaction. */
export async function verifyOtp(tx: Tx, input: { purpose: string; phone: string; code: string }, now = new Date(), consume = true) {
  const r = await tryOtp(tx, input, now, consume);
  if (!r.ok) throw new AdmissionProblem(r.message, "code");
  return true;
}

type Paper = { recordedById: string | null; recordedByName: string; fileId: string | null };

/**
 * Saves the consents given, with the text version agreed to. Data consent is required.
 * Confirmed by a one-time code, or (PAPER_HOW) given on a signed paper form the office recorded.
 */
export async function recordConsents(tx: Tx, ctx: SchoolContext, app: { id: string; phone: string }, input: { types: string[]; givenByName: string; howGiven: "admission-form-counter" | "admission-form-online" | typeof PAPER_HOW; texts: ConsentTextView[]; verifiedAt: Date; paper?: Paper }) {
  const paper = input.howGiven === PAPER_HOW ? input.paper ?? { recordedById: ctx.userId, recordedByName: "Staff", fileId: null } : null;
  if (!input.types.includes(DATA_CONSENT)) throw new AdmissionProblem("The data consent is needed for admission. The guardian must agree to it.", "consent_data-processing");
  if (input.givenByName.trim().length < 2) throw new AdmissionProblem(paper ? "Type the parent's name as signed on the form." : "Give the name of the guardian giving consent.", paper ? "signedName" : "givenByName");
  // A code-confirmed consent keeps no paper details; a paper one has no code time.
  const how = paper
    ? { howGiven: PAPER_HOW, otpVerifiedAt: null, recordedById: paper.recordedById, paperFileId: paper.fileId }
    : { howGiven: input.howGiven, otpVerifiedAt: input.verifiedAt, recordedById: null, paperFileId: null };
  const saved: string[] = [];
  for (const type of input.types) {
    const t = input.texts.find((x) => x.type === type);
    if (!t) continue;
    const existing = await tx.admissionConsent.findUnique({ where: { applicationId_consentType: { applicationId: app.id, consentType: type } } });
    if (existing && !existing.withdrawnAt) continue;
    if (existing) await tx.admissionConsent.update({ where: { id: existing.id }, data: { version: t.version, givenByName: input.givenByName.trim(), phone: app.phone, givenAt: input.verifiedAt, withdrawnAt: null, ...how } });
    else await tx.admissionConsent.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, consentType: type, version: t.version, givenByName: input.givenByName.trim(), phone: app.phone, givenAt: input.verifiedAt, ...how } });
    saved.push(type);
  }
  if (saved.length) {
    const list = saved.map((t) => `${consentLabel(t)} (version ${input.texts.find((x) => x.type === t)?.version || "ready text"})`).join("; ");
    const versions = saved.map((t) => input.texts.find((x) => x.type === t)?.version ?? 0);
    if (paper) {
      await activity(tx, ctx, app.id, "consent", `Consent given on a signed paper form, recorded by ${paper.recordedByName}: ${list}. Signed by ${input.givenByName.trim()}.${paper.fileId ? " A photo of the form is kept." : ""}`, { how: PAPER_HOW, types: saved, fileId: paper.fileId });
      await writeAudit(tx, ctx, { action: "consent-given", recordType: "Application", recordId: app.id, after: { types: saved, versions, givenBy: input.givenByName.trim(), how: PAPER_HOW, recordedBy: paper.recordedById, fileId: paper.fileId } });
    } else {
      await activity(tx, ctx, app.id, "consent", `Consent given by ${input.givenByName.trim()}, confirmed by a one-time code: ${list}.`);
      await writeAudit(tx, ctx, { action: "consent-given", recordType: "Application", recordId: app.id, after: { types: saved, versions, givenBy: input.givenByName.trim(), how: input.howGiven } });
    }
  }
  return saved;
}

/** At the counter: send the code to the parent's mobile. */
export async function sendConsentCode(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, applicationId: string, opts: { deliver?: Deliver } = {}) {
  requireFull(v, "consent");
  const app = await loadApplication(tx, applicationId, v);
  return startOtp(tx, ctx, { phone: app.phone, purpose: `consent:${app.id}`, schoolName, about: { recordType: "Application", recordId: app.id } }, opts);
}

/** At the counter: the parent reads out the code; the consents are saved with the text version. */
export async function confirmConsentAtCounter(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, applicationId: string, input: { code: string; types: string[]; givenByName: string }) {
  requireFull(v, "consent");
  const app = await loadApplication(tx, applicationId, v);
  if (!input.types.includes(DATA_CONSENT)) throw new AdmissionProblem("The data consent is needed for admission. The guardian must agree to it.", "consent_data-processing");
  await verifyOtp(tx, { purpose: `consent:${app.id}`, phone: app.phone, code: input.code });
  const texts = await admissionConsentTexts(tx, schoolName);
  return recordConsents(tx, ctx, app, { types: input.types, givenByName: input.givenByName, howGiven: "admission-form-counter", texts, verifiedAt: new Date() });
}

/** The staff member's name for "recorded by": their staff record, else their login's name. */
async function staffNameOf(tx: Tx, userId: string | null) {
  if (!userId) return "Staff";
  const staff = await tx.staff.findFirst({ where: { userLoginId: userId }, select: { fullName: true } });
  if (staff) return staff.fullName;
  return (await tx.userLogin.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? "Staff";
}

/**
 * At the counter, when no code can go (decision 23): the parent signed a paper consent
 * form. The office ticks what the parent agreed to, types the name as signed and may add
 * a photo or scan of the form. Recorded like a code-confirmed consent, marked paper form.
 */
export async function recordPaperConsent(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, applicationId: string, input: { types: string[]; signedName: string; file: File | null }) {
  requireFull(v, "consent");
  const app = await loadApplication(tx, applicationId, v);
  if (!input.types.includes(DATA_CONSENT)) throw new AdmissionProblem("Data consent is needed for the admission. Tick it once the parent has signed for it.", `consent_${DATA_CONSENT}`);
  if (input.signedName.trim().length < 2) throw new AdmissionProblem("Type the parent's name as signed on the form.", "signedName");
  const texts = await admissionConsentTexts(tx, schoolName);
  const standing = await tx.admissionConsent.findMany({ where: { applicationId: app.id, consentType: { in: input.types }, withdrawnAt: null }, select: { consentType: true } });
  const todo = input.types.filter((t) => texts.some((x) => x.type === t) && !standing.some((s) => s.consentType === t));
  if (!todo.length) throw new AdmissionProblem("These consents are already given on this application.");
  // Data consent already stands: the rest are added without it.
  const types = todo.includes(DATA_CONSENT) ? todo : [DATA_CONSENT, ...todo];
  let fileId: string | null = null;
  if (input.file) {
    if (input.file.size > MAX_PAPER_BYTES) throw new FileProblem(`This file is ${(input.file.size / 1024 / 1024).toFixed(1)} MB. The photo of the form can be at most 5 MB. Take a smaller photo or scan at a lower size.`);
    fileId = (await saveFile(tx, ctx, { file: input.file, purpose: "admission-consent-form", allowed: DOCUMENT_TYPES, maxImageWidth: 2000 })).id;
  }
  return recordConsents(tx, ctx, app, { types, givenByName: input.signedName, howGiven: PAPER_HOW, texts, verifiedAt: new Date(), paper: { recordedById: ctx.userId, recordedByName: await staffNameOf(tx, ctx.userId), fileId } });
}

/** The purpose of the code for a new application at the counter: one per staff member, so two desks never mix codes. */
export const counterFormPurpose = (userId: string | null) => `counter-form:${userId ?? "none"}`;

export async function hasDataConsent(tx: Tx, applicationId: string) {
  return Boolean(await tx.admissionConsent.findFirst({ where: { applicationId, consentType: DATA_CONSENT, ...CONSENT_STANDS } }));
}
