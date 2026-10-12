// Two-step login (08-platform-security.md §2): after the right password, a
// person in a role that needs it types a 6-digit one-time code. The code is
// stored only as a hash, works for 10 minutes and for 5 tries, and is sent by
// email when the person has one, else by SMS through Communication when the
// school's SMS channel is on (with a DLT template, rule 34). A person may
// trust their own device for 30 days. The school switches it on with the
// School Feature "two-step-login" (Settings, Data Backup & Security).

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma, withSchool } from "../db";
import { writeAudit } from "../audit";
import { hitLimit, limitMessage } from "../rate-limit";
import { hashToken, newToken } from "./tokens";
import { mailIsSetUp, sendMail } from "./mail";
import { sendCodeBySms } from "./two-step-sms";
import type { DeviceInfo } from "./sessions";

export const TWO_STEP_FEATURE = "two-step-login";
/** A code works for 10 minutes. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong codes allowed before the code stops working. */
export const MAX_CODE_TRIES = 5;
/** A trusted device skips the code for 30 days. */
export const TRUST_DAYS = 30;
/** Codes sent to one person in 15 minutes, at most. */
export const MAX_SENDS = 5;

export const CHALLENGE_COOKIE = "sos_two_step";
export const TRUSTED_COOKIE = "sos_trusted";

/** Whether this person must type a code to open this school. */
export async function needsTwoStep(userLoginId: string, schoolId: string): Promise<boolean> {
  return withSchool({ schoolId, userId: userLoginId }, async (tx) => {
    const feature = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId, featureKey: TWO_STEP_FEATURE } } });
    if (!feature?.isOn) return false;
    const count = await tx.schoolAccess.count({
      where: { userLoginId, schoolId, archivedAt: null, roles: { some: { role: { requiresTwoStep: true, isEnabled: true, archivedAt: null } } } },
    });
    return count > 0;
  });
}

/** A trusted device counts only if it was trusted after the person's last two-step reset. */
export async function isTrustedDevice(userLoginId: string, token: string | null | undefined, now = new Date()): Promise<boolean> {
  if (!token) return false;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!device || device.userLoginId !== userLoginId || device.revokedAt || device.expiresAt <= now) return false;
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { twoStepResetAt: true } });
  if (user?.twoStepResetAt && device.createdAt <= user.twoStepResetAt) return false;
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: now } });
  return true;
}

export async function trustDevice(userLoginId: string, device: DeviceInfo, now = new Date()) {
  const token = newToken();
  await prisma.trustedDevice.create({
    data: { userLoginId, tokenHash: hashToken(token), userAgent: device.userAgent?.slice(0, 400) ?? null, lastUsedAt: now, expiresAt: new Date(now.getTime() + TRUST_DAYS * 86_400_000) },
  });
  return token;
}

function codeHash(token: string, code: string) {
  // Bound to this challenge's own random token, so a hash cannot be reused for another challenge.
  return createHash("sha256").update(`${token}:${code}`).digest("hex");
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}•••@${domain ?? ""}`;
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `•••••${digits.slice(-4)}`;
}

export type CodeTo = {
  email: string | null;
  phone: string | null;
  name: string;
  /** The school being opened, and the person: the SMS goes through that school's channel. */
  schoolId?: string | null;
  userLoginId?: string | null;
  /** The same key never sends twice (one per challenge). */
  key?: string | null;
};
type Deliver = (to: CodeTo, code: string) => Promise<{ channel: string; sentTo: string } | { problem: string }>;

/** What a code is for: signing in, or confirming a new phone or email on My profile. */
export type CodePurpose = "sign-in" | "change-phone" | "change-email" | (string & {});

const PURPOSE_WORDS: Record<string, string> = { "sign-in": "sign-in code", "change-phone": "code to confirm your new mobile number", "change-email": "code to confirm your new email address" };

/**
 * Sends a one-time code: by email first when the person has one and email is
 * set up on the server; else by SMS through Communication when the school's
 * SMS channel is on and its one-time-code template has a DLT template ID
 * (rule 34). In development with neither, writes it to the server log only.
 */
export async function deliverCodeTo(to: CodeTo, code: string, purpose: CodePurpose = "sign-in"): Promise<{ channel: string; sentTo: string } | { problem: string }> {
  const what = PURPOSE_WORDS[purpose] ?? "confirmation code";
  let mailProblem: string | null = null;
  if (to.email && mailIsSetUp()) {
    try {
      await sendMail(to.email, `${code} is your School OS ${purpose === "sign-in" ? "sign-in code" : "confirmation code"}`, `Hello ${to.name},\n\nYour School OS ${what} is ${code}. It works for 10 minutes.\n\nIf you did not ask for this, change your password and tell your School Admin.\n`);
      return { channel: "email", sentTo: maskEmail(to.email) };
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "two-step-mail-failed", error: e instanceof Error ? e.message : String(e) }));
      mailProblem = "The code could not be sent by email just now. Please try again in a minute.";
    }
  }
  if (to.phone && to.schoolId && to.userLoginId) {
    const sms = await sendCodeBySms({ schoolId: to.schoolId, userLoginId: to.userLoginId, phone: to.phone, code, key: to.key ?? null, purpose });
    if (sms.sent) return { channel: "sms", sentTo: maskPhone(to.phone) };
  }
  if (mailProblem) return { problem: mailProblem };
  if (process.env.NODE_ENV !== "production") {
    console.info(JSON.stringify({ level: "info", event: "two-step-code", purpose, note: "Email and SMS are not set up; development only", to: to.name, code }));
    return { channel: "log", sentTo: "the server log (email is not set up on this computer)" };
  }
  return { problem: to.email || to.phone ? "Neither email nor SMS is set up to send the code just now. Ask your School Admin or DREAM TEAM support." : "Your login has no email address or mobile number for the code. Ask your School Admin to add one in Users & Permissions." };
}

/** The sign-in code (two-step login). */
export const deliverCode: Deliver = (to, code) => deliverCodeTo(to, code, "sign-in");

export type StartResult = { ok: true; token: string; sentTo: string; channel: string } | { ok: false; message: string };

/** Makes a new code for this person (ending any earlier one) and sends it. */
export async function startChallenge(userLoginId: string, schoolId: string, device: DeviceInfo, opts: { now?: Date; deliver?: Deliver } = {}): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const limit = await hitLimit(`two-step:send:${userLoginId}`, MAX_SENDS, 900, now);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { email: true, phone: true, displayName: true } });
  if (!user) return { ok: false, message: "This login was not found. Sign in again." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = newToken();
  const sent = await (opts.deliver ?? deliverCode)({ email: user.email, phone: user.phone, name: user.displayName, schoolId, userLoginId, key: hashToken(token).slice(0, 40) }, code);
  if ("problem" in sent) return { ok: false, message: sent.problem };
  await prisma.twoStepChallenge.updateMany({ where: { userLoginId, usedAt: null }, data: { usedAt: now } });
  await prisma.twoStepChallenge.create({
    data: {
      userLoginId, tokenHash: hashToken(token), codeHash: codeHash(token, code), channel: sent.channel, sentTo: sent.sentTo,
      schoolId, userAgent: device.userAgent?.slice(0, 400) ?? null, ipAddress: device.ipAddress ?? null, expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });
  await withSchool({ schoolId, userId: userLoginId }, (tx) =>
    writeAudit(tx, { schoolId, userId: userLoginId }, { action: "two-step-code-sent", recordType: "User Login", recordId: userLoginId, after: { channel: sent.channel }, device: device.userAgent, ipAddress: device.ipAddress }),
  );
  return { ok: true, token, sentTo: sent.sentTo, channel: sent.channel };
}

/** The pending challenge for a browser's token, if it can still be used. */
export async function findChallenge(token: string | null | undefined, now = new Date()) {
  if (!token) return null;
  const c = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c || c.usedAt || c.expiresAt <= now || c.attempts >= MAX_CODE_TRIES) return null;
  return c;
}

export type VerifyResult =
  | { ok: true; userLoginId: string; schoolId: string }
  | { ok: false; message: string; restart?: boolean };

/** Checks a typed code. Five wrong codes end it; the person then signs in again. */
export async function verifyChallenge(token: string | null | undefined, typed: string, device: DeviceInfo, now = new Date()): Promise<VerifyResult> {
  const code = typed.replace(/\s/g, "");
  if (!token) return { ok: false, message: "Your sign-in has timed out. Sign in again.", restart: true };
  const c = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c || c.usedAt) return { ok: false, message: "This code has already been used or replaced. Sign in again.", restart: true };
  if (c.expiresAt <= now) return { ok: false, message: "This code has expired after 10 minutes. Sign in again to get a new one.", restart: true };
  if (c.attempts >= MAX_CODE_TRIES) return { ok: false, message: "Too many wrong codes. Sign in again to get a new one.", restart: true };
  const limit = await hitLimit(`two-step:check:${c.userLoginId}`, 20, 900, now);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Type the 6 digits of the code." };

  const right = timingSafeEqual(Buffer.from(codeHash(token, code)), Buffer.from(c.codeHash));
  const ctx = { schoolId: c.schoolId!, userId: c.userLoginId };
  if (!right) {
    // Counted in one statement, so two tries at the same moment cannot both slip through.
    const updated = await prisma.twoStepChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_CODE_TRIES - updated.attempts;
    if (c.schoolId) {
      await withSchool(ctx, (tx) => writeAudit(tx, ctx, { action: left <= 0 ? "two-step-locked" : "two-step-failed", recordType: "User Login", recordId: c.userLoginId, device: device.userAgent, ipAddress: device.ipAddress }));
    }
    if (left <= 0) {
      await prisma.twoStepChallenge.update({ where: { id: c.id }, data: { usedAt: now } });
      return { ok: false, message: "Too many wrong codes. This code no longer works. Sign in again to get a new one.", restart: true };
    }
    return { ok: false, message: `That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.` };
  }
  // Used once only: marking it used succeeds for just one request.
  const claimed = await prisma.twoStepChallenge.updateMany({ where: { id: c.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1 || !c.schoolId) return { ok: false, message: "This code has already been used. Sign in again.", restart: true };
  await withSchool(ctx, (tx) => writeAudit(tx, ctx, { action: "two-step-passed", recordType: "User Login", recordId: c.userLoginId, device: device.userAgent, ipAddress: device.ipAddress }));
  return { ok: true, userLoginId: c.userLoginId, schoolId: c.schoolId };
}
