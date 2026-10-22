// Data consent on the application (DPDP Act 2023, decided 9 October 2026,
// D8a): the guardian agrees to the school's consent text, confirmed by a
// one-time code sent to their mobile; photo consent is its own type. Each
// consent keeps the version of the text agreed to. The code is stored only
// as a hash, works for 10 minutes and for 5 tries.
import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { hitLimit, limitMessage } from "../rate-limit";
import { consentLabel, READY_TEXTS } from "../data-security/consent";
import { AdmissionProblem } from "./act";
import { requireFull, type Viewer } from "./access";
import { activity, loadApplication } from "./applications";
import { messageParent } from "./notify-parents";
import { logCodeSentBy } from "../dev-codes";

export const DATA_CONSENT = "data-processing";
export const PHOTO_CONSENT = "photo";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_TRIES = 5;
/** Codes sent to one phone in 15 minutes, at most. */
export const OTP_MAX_SENDS = 5;

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
export async function startOtp(tx: Tx, ctx: SchoolContext, input: { phone: string; purpose: string; schoolName: string; about: { recordType: "Application" | "Enquiry"; recordId: string } | null }, opts: { now?: Date; deliver?: Deliver } = {}) {
  const now = opts.now ?? new Date();
  if (!/^[6-9]\d{9}$/.test(input.phone)) throw new AdmissionProblem("Give a 10-digit Indian mobile number for the code.", "phone");
  const limit = await hitLimit(`admission-otp:${ctx.schoolId}:${input.phone}`, OTP_MAX_SENDS, 900, now);
  if (!limit.ok) throw new AdmissionProblem(limitMessage(limit));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await tx.admissionOtp.updateMany({ where: { purpose: input.purpose, usedAt: null }, data: { usedAt: now } });
  const row = await tx.admissionOtp.create({ data: { schoolId: ctx.schoolId, phone: input.phone, purpose: input.purpose, codeHash: "pending", expiresAt: new Date(now.getTime() + OTP_TTL_MS) } });
  await tx.admissionOtp.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });
  const text = `${code} is your code to confirm consent for admission at ${input.schoolName}. It works for 10 minutes. Do not share it with anyone else.`;
  if (opts.deliver) {
    if (!(await opts.deliver(input.phone, text))) throw new AdmissionProblem("The code could not be sent just now. Please try again in a minute.");
  } else {
    const r = await messageParent(tx, ctx, { to: { name: "Parent", phone: input.phone }, template: "admission-consent-code", channel: "sms", text, secret: true, about: input.about ?? { recordType: "Application", recordId: input.purpose } });
    // Say why (for example no SMS set up), so the office does not blame the parent's number.
    if (r.status !== "queued") throw new AdmissionProblem(r.status === "skipped" && r.note ? `The code could not be sent. ${r.note}.` : "The code could not be sent to this number.");
    await logCodeSentBy(tx, ctx, r.channel, { to: input.phone, purpose: "admission consent", code });
  }
  return { sentTo: `•••••${input.phone.slice(-4)}` };
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
  if (row.codeHash !== hashCode(row.id, code)) {
    await tx.admissionOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = OTP_MAX_TRIES - row.attempts - 1;
    return { ok: false, message: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code is not right. Send a new code." };
  }
  if (consume) await tx.admissionOtp.update({ where: { id: row.id }, data: { usedAt: now } });
  return { ok: true };
}

/** Like tryOtp, but throws on a wrong code (so the wrong try is not kept). Check with tryOtp first in its own transaction. */
export async function verifyOtp(tx: Tx, input: { purpose: string; phone: string; code: string }, now = new Date(), consume = true) {
  const r = await tryOtp(tx, input, now, consume);
  if (!r.ok) throw new AdmissionProblem(r.message, "code");
  return true;
}

/** Saves the consents given, with the text version agreed to. Data consent is required. */
export async function recordConsents(tx: Tx, ctx: SchoolContext, app: { id: string; phone: string }, input: { types: string[]; givenByName: string; howGiven: "admission-form-counter" | "admission-form-online"; texts: ConsentTextView[]; verifiedAt: Date }) {
  if (!input.types.includes(DATA_CONSENT)) throw new AdmissionProblem("The data consent is needed for admission. The guardian must agree to it.", "consent_data-processing");
  if (input.givenByName.trim().length < 2) throw new AdmissionProblem("Give the name of the guardian giving consent.", "givenByName");
  const saved: string[] = [];
  for (const type of input.types) {
    const t = input.texts.find((x) => x.type === type);
    if (!t) continue;
    const existing = await tx.admissionConsent.findUnique({ where: { applicationId_consentType: { applicationId: app.id, consentType: type } } });
    if (existing && !existing.withdrawnAt) continue;
    if (existing) await tx.admissionConsent.update({ where: { id: existing.id }, data: { version: t.version, givenByName: input.givenByName.trim(), phone: app.phone, howGiven: input.howGiven, givenAt: input.verifiedAt, otpVerifiedAt: input.verifiedAt, withdrawnAt: null } });
    else await tx.admissionConsent.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, consentType: type, version: t.version, givenByName: input.givenByName.trim(), phone: app.phone, howGiven: input.howGiven, givenAt: input.verifiedAt, otpVerifiedAt: input.verifiedAt } });
    saved.push(type);
  }
  if (saved.length) {
    await activity(tx, ctx, app.id, "consent", `Consent given by ${input.givenByName.trim()}, confirmed by a one-time code: ${saved.map((t) => `${consentLabel(t)} (version ${input.texts.find((x) => x.type === t)?.version || "ready text"})`).join("; ")}.`);
    await writeAudit(tx, ctx, { action: "consent-given", recordType: "Application", recordId: app.id, after: { types: saved, versions: saved.map((t) => input.texts.find((x) => x.type === t)?.version ?? 0), givenBy: input.givenByName.trim(), how: input.howGiven } });
  }
  return saved;
}

/** At the counter: send the code to the parent's mobile. */
export async function sendConsentCode(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, applicationId: string, opts: { deliver?: Deliver } = {}) {
  requireFull(v, "consent");
  const app = await loadApplication(tx, applicationId);
  return startOtp(tx, ctx, { phone: app.phone, purpose: `consent:${app.id}`, schoolName, about: { recordType: "Application", recordId: app.id } }, opts);
}

/** At the counter: the parent reads out the code; the consents are saved with the text version. */
export async function confirmConsentAtCounter(tx: Tx, ctx: SchoolContext, v: Viewer, schoolName: string, applicationId: string, input: { code: string; types: string[]; givenByName: string }) {
  requireFull(v, "consent");
  const app = await loadApplication(tx, applicationId);
  if (!input.types.includes(DATA_CONSENT)) throw new AdmissionProblem("The data consent is needed for admission. The guardian must agree to it.", "consent_data-processing");
  await verifyOtp(tx, { purpose: `consent:${app.id}`, phone: app.phone, code: input.code });
  const texts = await admissionConsentTexts(tx, schoolName);
  return recordConsents(tx, ctx, app, { types: input.types, givenByName: input.givenByName, howGiven: "admission-form-counter", texts, verifiedAt: new Date() });
}

/** The purpose of the code for a new application at the counter: one per staff member, so two desks never mix codes. */
export const counterFormPurpose = (userId: string | null) => `counter-form:${userId ?? "none"}`;

export async function hasDataConsent(tx: Tx, applicationId: string) {
  return Boolean(await tx.admissionConsent.findFirst({ where: { applicationId, consentType: DATA_CONSENT, withdrawnAt: null, otpVerifiedAt: { not: null } } }));
}
