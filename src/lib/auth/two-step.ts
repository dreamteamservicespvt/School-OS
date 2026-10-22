// Two-step login (08-platform-security.md §2): after the right password, a
// person in a role that needs it types a 6-digit one-time code. The code is
// stored only as a hash, works for 10 minutes and for 5 tries, and is sent by
// email when the person has one, else by SMS through Communication when the
// school's SMS channel is on (with a DLT template, rule 34). A person may
// trust their own device for 30 days. The School Feature "two-step-login" is
// on from the first day (Add School); a School Admin can switch it off in
// Settings, Data Backup & Security. Nobody is locked out: a person no code can
// reach signs in with the password and is shown how to fix it (sign-in.ts).

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma, withSchool } from "../db";
import { writeAudit } from "../audit";
import { hitLimit, limitMessage } from "../rate-limit";
import { hashToken, newToken } from "./tokens";
import { mailIsSetUp, sendMail } from "./mail";
import { CODE_PURPOSE_WORDS, sendCodeBySms, signInSmsTemplate } from "./two-step-sms";
import { logOneTimeCode, mayLogCode } from "../dev-codes";
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
  // A person may switch it on for themselves in My profile, whatever the school's setting.
  const own = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { twoStepChosen: true } });
  if (own?.twoStepChosen) return true;
  return roleNeedsTwoStep(userLoginId, schoolId);
}

/** Whether the school makes this person's role type a code (they cannot switch it off). */
export async function roleNeedsTwoStep(userLoginId: string, schoolId: string): Promise<boolean> {
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
/** A code that could not go. `unreachable`: no email or SMS could even be tried for this person (not a passing fault). */
export type NotSent = { problem: string; unreachable?: boolean };
export type Deliver = (to: CodeTo, code: string, purpose?: "sign-in" | ContactKind) => Promise<{ channel: string; sentTo: string } | NotSent>;

/** What a code is for: signing in, or confirming a new phone or email on My profile. */
export type CodePurpose = "sign-in" | "change-phone" | "change-email" | (string & {});

const PURPOSE_WORDS: Record<string, string> = { "sign-in": "sign-in code", "change-phone": "code to confirm your new mobile number", "change-email": "code to confirm your new email address" };

/**
 * Sends a one-time code: by email first when the person has one and email is
 * set up on the server; else by SMS through Communication when the school's
 * SMS channel is on and its one-time-code template has a DLT template ID
 * (rule 34). On a tester's computer with neither, writes it to the server
 * log only (dev-codes.ts); there every code sent is also written there.
 */
export async function deliverCodeTo(to: CodeTo, code: string, purpose: CodePurpose = "sign-in"): Promise<{ channel: string; sentTo: string } | NotSent> {
  const what = PURPOSE_WORDS[purpose] ?? "confirmation code";
  let mailProblem: string | null = null;
  if (to.email && mailIsSetUp()) {
    try {
      if (purpose === "change-email") await sendMail(to.email, `${code} confirms your new email for School OS`, `Hello ${to.name},\n\nType ${code} in My profile to confirm this email address. It works for 10 minutes.\n\nIf you did not ask for this, you can ignore this email.\n`);
      else await sendMail(to.email, `${code} is your School OS ${purpose === "sign-in" ? "sign-in code" : "confirmation code"}`, `Hello ${to.name},\n\nYour School OS ${what} is ${code}. It works for 10 minutes.\n\nIf you did not ask for this, change your password and tell your School Admin.\n`);
      logOneTimeCode({ to: to.email, purpose: CODE_PURPOSE_WORDS[purpose] ?? purpose, code, carriedBy: "real" });
      return { channel: "email", sentTo: maskEmail(to.email) };
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "two-step-mail-failed", error: e instanceof Error ? e.message : String(e) }));
      mailProblem = "The code could not be sent by email just now. Please try again in a minute.";
    }
  }
  if (to.phone && to.schoolId && to.userLoginId) {
    const sms = await sendCodeBySms({ schoolId: to.schoolId, userLoginId: to.userLoginId, phone: to.phone, code, key: to.key ?? null, purpose });
    // Test mode only records the SMS (allowed for codes on a tester's computer only): say so, not "sent to" the phone (QA ADMIT-03).
    if (sms.sent) return { channel: "sms", sentTo: sms.testMode ? `the server log (Test mode, not sent to ${maskPhone(to.phone)} by SMS)` : maskPhone(to.phone) };
  }
  if (mailProblem) return { problem: mailProblem };
  if (mayLogCode("none")) {
    logOneTimeCode({ to: to.phone ?? to.email, purpose: CODE_PURPOSE_WORDS[purpose] ?? purpose, code, carriedBy: "none" });
    return { channel: "log", sentTo: "the server log (email is not set up on this computer)" };
  }
  return { unreachable: true, problem: unreachableWords(to) };
}

function unreachableWords(to: { email: string | null; phone: string | null }) {
  if (!to.email && !to.phone) return "Your login has no email address or mobile number for the code.";
  if (to.phone && !to.email) return "Codes to your mobile go by your school's SMS, which is not set up yet, and your login has no email address.";
  return "Neither email nor SMS is set up to send the code just now.";
}

/**
 * What the person can do so codes reach them, for My profile: add a mobile
 * number or email (a code confirms it), or ask for SMS to be set up.
 */
export function twoStepHelp(user: { email: string | null; phone: string | null }): string {
  if (!user.email && !user.phone) return "Add your mobile number or email with Edit details at the top of this page. A one-time code confirms it, and from then on the sign-in code goes there.";
  if (!user.email) return "Add your email with Edit details at the top of this page, or ask your School Admin to set up SMS (Settings, Communication), so the sign-in code can reach you.";
  return "Ask your School Admin to set up SMS (Settings, Communication), or DREAM TEAM to set up email, so the sign-in code can reach you.";
}

/**
 * Which of a person's contacts a sign-in code can go to right now. On a
 * developer's computer the server log stands in for both.
 */
export async function codeChannels(user: { id: string; email: string | null; phone: string | null }, schoolId: string): Promise<{ email: boolean; phone: boolean }> {
  const devLog = mayLogCode("none");
  const email = Boolean(user.email) && (mailIsSetUp() || devLog);
  let phone = false;
  if (user.phone) {
    if (devLog) phone = true;
    else {
      const ctx = { schoolId, userId: user.id };
      phone = Boolean(await withSchool(ctx, (tx) => signInSmsTemplate(tx, ctx)));
    }
  }
  return { email, phone };
}

/** The sign-in code (two-step login). */
/** Sign-in codes, and codes confirming a new phone ("phone") or email ("email") on My profile. */
export const deliverCode: Deliver = (to, code, purpose = "sign-in") =>
  deliverCodeTo(to, code, purpose === "phone" ? "change-phone" : purpose === "email" ? "change-email" : "sign-in");

export type StartResult = { ok: true; token: string; sentTo: string; channel: string } | { ok: false; message: string; unreachable?: boolean };

/**
 * What a sign-in code is for: "sign-in" comes after the right password;
 * "code-sign-in" stands in for the password ("Forgot password?"); and
 * "code-sign-in-second" is the second code, on the other contact, that a
 * person whose role needs two-step login types after a "code-sign-in" code.
 */
export type SignInPurpose = "sign-in" | "code-sign-in" | "code-sign-in-second";
export const SIGN_IN_PURPOSES: readonly SignInPurpose[] = ["sign-in", "code-sign-in", "code-sign-in-second"];
const isSignInPurpose = (p: string): p is SignInPurpose => (SIGN_IN_PURPOSES as readonly string[]).includes(p);

/** Makes a new code for this person (ending any earlier one) and sends it; `only` keeps it to the email or the mobile. */
export async function startChallenge(
  userLoginId: string, schoolId: string, device: DeviceInfo,
  opts: { now?: Date; deliver?: Deliver; purpose?: SignInPurpose; only?: "email" | "phone" } = {},
): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const purpose = opts.purpose ?? "sign-in";
  const limit = await hitLimit(`two-step:send:${userLoginId}`, MAX_SENDS, 900, now);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { email: true, phone: true, displayName: true } });
  if (!user) return { ok: false, message: "This login was not found. Sign in again." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = newToken();
  const to = { email: opts.only === "phone" ? null : user.email, phone: opts.only === "email" ? null : user.phone };
  const sent = await (opts.deliver ?? deliverCode)({ ...to, name: user.displayName, schoolId, userLoginId, key: hashToken(token).slice(0, 40) }, code);
  if ("problem" in sent) return { ok: false, message: sent.problem, unreachable: sent.unreachable };
  await prisma.twoStepChallenge.updateMany({ where: { userLoginId, purpose: { in: [...SIGN_IN_PURPOSES] }, usedAt: null }, data: { usedAt: now } });
  await prisma.twoStepChallenge.create({
    data: {
      userLoginId, purpose, tokenHash: hashToken(token), codeHash: codeHash(token, code), channel: sent.channel, sentTo: sent.sentTo,
      schoolId, userAgent: device.userAgent?.slice(0, 400) ?? null, ipAddress: device.ipAddress ?? null, expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });
  await withSchool({ schoolId, userId: userLoginId }, (tx) =>
    writeAudit(tx, { schoolId, userId: userLoginId }, { action: "two-step-code-sent", recordType: "User Login", recordId: userLoginId, after: { channel: sent.channel, ...(purpose === "sign-in" ? {} : { purpose }) }, device: device.userAgent, ipAddress: device.ipAddress }),
  );
  return { ok: true, token, sentTo: sent.sentTo, channel: sent.channel };
}

/** The pending sign-in challenge for a browser's token, if it can still be used. */
export async function findChallenge(token: string | null | undefined, now = new Date()) {
  if (!token) return null;
  const c = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c || !isSignInPurpose(c.purpose) || c.usedAt || c.expiresAt <= now || c.attempts >= MAX_CODE_TRIES) return null;
  return { ...c, purpose: c.purpose as SignInPurpose };
}

export type VerifyResult =
  | { ok: true; userLoginId: string; schoolId: string; purpose: SignInPurpose; channel: string }
  | { ok: false; message: string; restart?: boolean };

/** Checks a typed code. Five wrong codes end it; the person then signs in again. */
export async function verifyChallenge(token: string | null | undefined, typed: string, device: DeviceInfo, now = new Date()): Promise<VerifyResult> {
  const code = typed.replace(/\s/g, "");
  if (!token) return { ok: false, message: "Your sign-in has timed out. Sign in again.", restart: true };
  const c = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c || !isSignInPurpose(c.purpose) || c.usedAt) return { ok: false, message: "This code has already been used or replaced. Sign in again.", restart: true };
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
  await withSchool(ctx, (tx) => writeAudit(tx, ctx, { action: "two-step-passed", recordType: "User Login", recordId: c.userLoginId, after: c.purpose === "sign-in" ? undefined : { purpose: c.purpose }, device: device.userAgent, ipAddress: device.ipAddress }));
  return { ok: true, userLoginId: c.userLoginId, schoolId: c.schoolId, purpose: c.purpose as SignInPurpose, channel: c.channel };
}

// Changing the mobile number or email in My profile (00-global.md §1.4): a code
// goes to the NEW number or address, and the change is saved only once it is typed.

export type ContactKind = "phone" | "email";

/** "98765 43210" for a 10-digit Indian mobile number, or null if it is not one. */
export function cleanMobile(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

export function cleanEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200 ? v : null;
}

/** Sends a code that confirms a new mobile number or email. */
export async function startContactChange(
  userLoginId: string, schoolId: string, kind: ContactKind, input: string, device: DeviceInfo,
  opts: { now?: Date; deliver?: Deliver } = {},
): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const value = kind === "phone" ? cleanMobile(input) : cleanEmail(input);
  if (!value) return { ok: false, message: kind === "phone" ? "Type a 10-digit mobile number." : "Type an email address like name@example.com." };
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { phone: true, email: true, displayName: true } });
  if (!user) return { ok: false, message: "This login was not found. Sign in again." };
  if ((kind === "phone" ? user.phone : user.email) === value) return { ok: false, message: `This is already your ${kind === "phone" ? "mobile number" : "email"}.` };
  // A mobile number or email signs in only one login, so it cannot be shared.
  const digits = value.replace(/\D/g, "").slice(-10);
  const taken = kind === "phone"
    ? (await prisma.userLogin.findMany({ where: { id: { not: userLoginId }, archivedAt: null, phone: { endsWith: digits.slice(-4) } }, select: { phone: true } }))
        .some((u) => (u.phone ?? "").replace(/\D/g, "").endsWith(digits))
    : (await prisma.userLogin.count({ where: { id: { not: userLoginId }, archivedAt: null, email: { equals: value, mode: "insensitive" } } })) > 0;
  if (taken) return { ok: false, message: `Another login already uses this ${kind === "phone" ? "mobile number" : "email"}. Ask your School Admin.` };
  const limit = await hitLimit(`contact-change:send:${userLoginId}`, MAX_SENDS, 900, now);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = newToken();
  const sent = await (opts.deliver ?? deliverCode)(kind === "phone" ? { email: null, phone: value, name: user.displayName, schoolId, userLoginId } : { email: value, phone: null, name: user.displayName }, code, kind);
  if ("problem" in sent) return { ok: false, message: sent.problem };
  await prisma.twoStepChallenge.updateMany({ where: { userLoginId, purpose: kind, usedAt: null }, data: { usedAt: now } });
  await prisma.twoStepChallenge.create({
    data: {
      userLoginId, purpose: kind, newValue: value, tokenHash: hashToken(token), codeHash: codeHash(token, code), channel: sent.channel, sentTo: sent.sentTo,
      schoolId, userAgent: device.userAgent?.slice(0, 400) ?? null, ipAddress: device.ipAddress ?? null, expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });
  return { ok: true, token, sentTo: sent.sentTo, channel: sent.channel };
}

/** Checks the code for a new mobile number or email and saves it. */
export async function confirmContactChange(
  userLoginId: string, token: string | null | undefined, typed: string, device: DeviceInfo, now = new Date(),
): Promise<{ ok: true; kind: ContactKind; value: string } | { ok: false; message: string; restart?: boolean }> {
  const code = typed.replace(/\s/g, "");
  if (!token) return { ok: false, message: "Send a new code first.", restart: true };
  const c = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!c || c.userLoginId !== userLoginId || (c.purpose !== "phone" && c.purpose !== "email") || !c.newValue || c.usedAt) {
    return { ok: false, message: "This code has been used or replaced. Send a new code.", restart: true };
  }
  if (c.expiresAt <= now) return { ok: false, message: "This code has expired after 10 minutes. Send a new code.", restart: true };
  if (c.attempts >= MAX_CODE_TRIES) return { ok: false, message: "Too many wrong codes. Send a new code.", restart: true };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Type the 6 digits of the code." };
  if (!timingSafeEqual(Buffer.from(codeHash(token, code)), Buffer.from(c.codeHash))) {
    const updated = await prisma.twoStepChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_CODE_TRIES - updated.attempts;
    if (left <= 0) return { ok: false, message: "Too many wrong codes. Send a new code.", restart: true };
    return { ok: false, message: `That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.` };
  }
  const claimed = await prisma.twoStepChallenge.updateMany({ where: { id: c.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return { ok: false, message: "This code has already been used. Send a new code.", restart: true };
  const kind = c.purpose as ContactKind;
  const before = await prisma.userLogin.findUniqueOrThrow({ where: { id: userLoginId }, select: { phone: true, email: true } });
  await prisma.userLogin.update({ where: { id: userLoginId }, data: kind === "phone" ? { phone: c.newValue } : { email: c.newValue } });
  if (c.schoolId) {
    const ctx = { schoolId: c.schoolId, userId: userLoginId };
    await withSchool(ctx, (tx) => writeAudit(tx, ctx, {
      action: kind === "phone" ? "changed-own-phone" : "changed-own-email", recordType: "User Login", recordId: userLoginId,
      before: { [kind]: kind === "phone" ? (before.phone ? maskPhone(before.phone) : null) : (before.email ? maskEmail(before.email) : null) },
      after: { [kind]: kind === "phone" ? maskPhone(c.newValue!) : maskEmail(c.newValue!) },
      device: device.userAgent, ipAddress: device.ipAddress,
    }));
  }
  return { ok: true, kind, value: c.newValue };
}
