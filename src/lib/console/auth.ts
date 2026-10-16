// Signing in to the Super Admin console (07-super-admin.md §2, §8).
//
// - Its own people (Super Admin Users), its own sign-in page and its own
//   cookie: a school login can never open the console, and a console login
//   has no School Access, so it can never open a school's School Master.
// - Two-step login is always on: the password, then a 6-digit code sent to
//   the person's phone, on every device that has not passed a code in the last
//   30 days.
// - Signed out after 30 minutes without use.
// - Five wrong passwords lock the login for 15 minutes.
// - Every sign-in, sign-out and lock goes in the Activity Log.
import "server-only";

import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { SuperAdminUser } from "@prisma/client";
import { withConsole, type Tx } from "../db";
import { burnPasswordCheck, checkNewPassword, hashPassword, verifyPassword } from "../auth/password";
import { hashToken, newToken } from "../auth/tokens";
import { hitLimit, limitMessage } from "../rate-limit";
import type { DeviceInfo } from "../auth/sessions";
import { logActivity, maskMobile, tenDigits, type ConsoleActor } from "./activity";
import { deliver, type ConsoleOutgoing } from "./outbox";
import { isTestCopy } from "../test-copy-env";

export const CONSOLE_COOKIE = "sos_console";
export const CONSOLE_STEP_COOKIE = "sos_console_step";
export const CONSOLE_DEVICE_COOKIE = "sos_console_device";

/** Signed out after this long without use (07-super-admin.md §8, inferred 30 minutes). */
export const CONSOLE_IDLE_MS = 30 * 60 * 1000;
/** lastUsedAt is refreshed at most this often. */
const TOUCH_EVERY_MS = 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_TRIES = 5;
export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const DEVICE_DAYS = 30;
/** A team member's welcome link works for 3 days, like a School Admin's invite. */
export const WELCOME_VALID_MS = 3 * 24 * 60 * 60 * 1000;

const WRONG = "The mobile number or password is wrong. Check both and try again.";

export const actorOf = (u: Pick<SuperAdminUser, "id" | "name" | "role">, ipAddress?: string | null): ConsoleActor => ({ id: u.id, name: u.name, role: u.role, ipAddress: ipAddress ?? null });

function codeHash(challenge: string, code: string) {
  return createHash("sha256").update(`${challenge}:${code}`).digest("hex");
}

/** A console login typed as a mobile number or an email (only when exactly one login has it). */
async function findByPhone(tx: Tx, typed: string) {
  const t = typed.trim().toLowerCase();
  if (t.includes("@")) {
    const list = await tx.superAdminUser.findMany({ where: { email: { equals: t, mode: "insensitive" }, archivedAt: null }, take: 2 });
    return list.length === 1 ? list[0] : null;
  }
  const d = tenDigits(typed);
  if (!d) return null;
  return tx.superAdminUser.findUnique({ where: { phone: d } });
}

/**
 * Vercel test copy only (deploy/vercel/README.md): it has no SMS or email, so
 * the owner chose to have the sign-in page show the code. The code is worked
 * out from the challenge, so the page can show it without storing it.
 * Everywhere else this is null and codes stay random and unseen.
 */
export function testCopyCode(challenge: string | null | undefined): string | null {
  if (!challenge || !isTestCopy()) return null;
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) return null;
  const n = createHmac("sha256", key).update(`console-code:${challenge}`).digest().readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Makes and sends a 6-digit code; ends earlier codes for the same purpose. */
async function sendCode(user: SuperAdminUser, purpose: "sign-in" | "welcome", now: Date) {
  const limit = await hitLimit(`console-code:${user.id}`, 5, 900, now);
  if (!limit.ok) return { ok: false as const, message: limitMessage(limit) };
  const challenge = newToken();
  const code = testCopyCode(challenge) ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  await withConsole(async (tx) => {
    await tx.consoleCode.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: now } });
    await tx.consoleCode.create({
      data: { userId: user.id, purpose, challengeHash: hashToken(challenge), codeHash: codeHash(challenge, code), sentTo: maskMobile(user.phone), expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
    });
  });
  const text = `${code} is your School OS Console ${purpose === "sign-in" ? "sign-in" : "set-up"} code. It works for 10 minutes. Never share it with anyone.`;
  const safe = text.replace(code, "••••••");
  const messages: ConsoleOutgoing[] = [{ channel: "sms", to: user.phone, purpose: "code", text, safeText: safe, templateParams: [code] }];
  if (user.email) messages.push({ channel: "email", to: user.email, purpose: "code", subject: `${code} is your School OS Console code`, text: `Hello ${user.name},\n\n${text}\n\nIf you did not try to sign in, tell the Owner at once.\n`, safeText: safe });
  const sent = await deliver(messages);
  if (sent.every((s) => s.status === "FAILED")) return { ok: false as const, message: "The code could not be sent just now. Try again in a minute." };
  return { ok: true as const, challenge, sentTo: maskMobile(user.phone), test: sent.every((s) => s.status === "TEST") };
}

export type ConsoleSignInResult =
  | { kind: "session"; token: string; user: SuperAdminUser }
  | { kind: "code"; challenge: string; sentTo: string; test: boolean }
  | { kind: "error"; message: string };

type Opts = { now?: Date; sleep?: (ms: number) => Promise<void>; trustedDevice?: string | null };

/** Step 1: mobile number and password. */
export async function consoleSignIn(phone: string, password: string, device: DeviceInfo, opts: Opts = {}): Promise<ConsoleSignInResult> {
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limit = await hitLimit(`console-sign-in:${device.ipAddress ?? "unknown"}`, 30, 900, now);
  if (!limit.ok) return { kind: "error", message: limitMessage(limit) };
  const user = await withConsole((tx) => findByPhone(tx, phone));
  if (!user || user.archivedAt || !user.passwordHash) {
    await burnPasswordCheck(password);
    if (user?.status === "INVITED") return { kind: "error", message: "This login is not set up yet. Open the welcome link the Owner sent you." };
    return { kind: "error", message: WRONG };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    return { kind: "error", message: `This login is locked for ${minutes} more minute${minutes === 1 ? "" : "s"} after too many wrong passwords.` };
  }
  if (user.failedAttempts >= 3) await sleep(Math.min(user.failedAttempts - 2, 4) * 500);
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedAttempts + 1;
    const locks = failed >= MAX_FAILED;
    await withConsole(async (tx) => {
      await tx.superAdminUser.update({ where: { id: user.id }, data: { failedAttempts: locks ? 0 : failed, lockedUntil: locks ? new Date(now.getTime() + LOCK_MS) : null } });
      if (locks) await logActivity(tx, { ...actorOf(user, device.ipAddress) }, { type: "signin", text: `${user.name}'s console login was locked for 15 minutes after ${MAX_FAILED} wrong passwords.` });
    });
    if (locks) return { kind: "error", message: "Too many wrong passwords. This login is locked for 15 minutes." };
    const left = MAX_FAILED - failed;
    return { kind: "error", message: left <= 2 ? `${WRONG} ${left} more wrong ${left === 1 ? "try locks" : "tries lock"} this login for 15 minutes.` : WRONG };
  }
  if (user.status !== "ACTIVE") return { kind: "error", message: "This login is switched off. Ask the Owner." };
  await withConsole((tx) => tx.superAdminUser.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } }));

  if (await isTrustedConsoleDevice(user.id, opts.trustedDevice, now)) {
    const token = await openSession(user, device, now, "a trusted device");
    return { kind: "session", token, user };
  }
  const sent = await sendCode(user, "sign-in", now);
  if (!sent.ok) return { kind: "error", message: sent.message };
  return { kind: "code", challenge: sent.challenge, sentTo: sent.sentTo, test: sent.test };
}

/** The masked number a pending code went to, or null when it can no longer be used. */
export async function pendingCode(challenge: string | null | undefined, now = new Date()) {
  if (!challenge) return null;
  const c = await withConsole((tx) => tx.consoleCode.findUnique({ where: { challengeHash: hashToken(challenge) } }));
  if (!c || c.usedAt || c.expiresAt <= now || c.attempts >= MAX_CODE_TRIES) return null;
  return { sentTo: c.sentTo, purpose: c.purpose, userId: c.userId };
}

export type CodeResult = { ok: true; userId: string } | { ok: false; message: string; restart?: boolean };

/** Checks a typed code. Five wrong codes end it. */
export async function checkConsoleCode(challenge: string | null | undefined, typed: string, purpose: "sign-in" | "welcome", now = new Date()): Promise<CodeResult> {
  const code = typed.replace(/\s/g, "");
  if (!challenge) return { ok: false, message: "Your sign-in has timed out. Start again.", restart: true };
  const c = await withConsole((tx) => tx.consoleCode.findUnique({ where: { challengeHash: hashToken(challenge) } }));
  if (!c || c.purpose !== purpose || c.usedAt) return { ok: false, message: "This code has already been used or replaced. Start again.", restart: true };
  if (c.expiresAt <= now) return { ok: false, message: "This code has expired after 10 minutes. Start again to get a new one.", restart: true };
  if (c.attempts >= MAX_CODE_TRIES) return { ok: false, message: "Too many wrong codes. Start again to get a new one.", restart: true };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Type the 6 digits of the code." };
  const right = timingSafeEqual(Buffer.from(codeHash(challenge, code)), Buffer.from(c.codeHash));
  if (!right) {
    const updated = await withConsole((tx) => tx.consoleCode.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } }));
    const left = MAX_CODE_TRIES - updated.attempts;
    if (left <= 0) {
      await withConsole((tx) => tx.consoleCode.update({ where: { id: c.id }, data: { usedAt: now } }));
      return { ok: false, message: "Too many wrong codes. This code no longer works. Start again.", restart: true };
    }
    return { ok: false, message: `That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.` };
  }
  const claimed = await withConsole((tx) => tx.consoleCode.updateMany({ where: { id: c.id, usedAt: null }, data: { usedAt: now } }));
  if (claimed.count !== 1) return { ok: false, message: "This code has already been used. Start again.", restart: true };
  return { ok: true, userId: c.userId };
}

/** Step 2: the code. Returns the new session, and a trusted-device token when asked. */
export async function finishConsoleSignIn(challenge: string | null | undefined, typed: string, trust: boolean, device: DeviceInfo, now = new Date()) {
  const checked = await checkConsoleCode(challenge, typed, "sign-in", now);
  if (!checked.ok) return checked;
  const user = await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: checked.userId } }));
  if (!user || user.status !== "ACTIVE" || user.archivedAt) return { ok: false as const, message: "This login is switched off. Ask the Owner.", restart: true };
  const token = await openSession(user, device, now, null);
  let deviceToken: string | null = null;
  if (trust) {
    deviceToken = newToken();
    await withConsole((tx) =>
      tx.consoleDevice.create({ data: { userId: user.id, tokenHash: hashToken(deviceToken!), userAgent: device.userAgent?.slice(0, 400) ?? null, expiresAt: new Date(now.getTime() + DEVICE_DAYS * 86_400_000) } }),
    );
  }
  return { ok: true as const, token, deviceToken, user };
}

/** Sends a new code for the same sign-in. */
export async function resendConsoleCode(challenge: string | null | undefined, now = new Date()) {
  const pending = await pendingCode(challenge, now);
  if (!pending) return { ok: false as const, message: "Your sign-in has timed out. Start again." };
  const user = await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: pending.userId } }));
  if (!user || user.status === "DISABLED") return { ok: false as const, message: "This login is switched off. Ask the Owner." };
  return sendCode(user, pending.purpose === "welcome" ? "welcome" : "sign-in", now);
}

export async function isTrustedConsoleDevice(userId: string, token: string | null | undefined, now = new Date()) {
  if (!token) return false;
  const d = await withConsole((tx) => tx.consoleDevice.findUnique({ where: { tokenHash: hashToken(token) } }));
  return Boolean(d && d.userId === userId && !d.revokedAt && d.expiresAt > now);
}

async function openSession(user: SuperAdminUser, device: DeviceInfo, now: Date, via: string | null) {
  const token = newToken();
  await withConsole(async (tx) => {
    await tx.consoleSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        userAgent: device.userAgent?.slice(0, 400) ?? null,
        ipAddress: device.ipAddress ?? null,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + CONSOLE_IDLE_MS),
      },
    });
    await tx.superAdminUser.update({ where: { id: user.id }, data: { lastSignInAt: now } });
    await logActivity(tx, actorOf(user, device.ipAddress), { type: "signin", text: `${user.name} signed in to the console${via ? ` from ${via}` : " with a one-time code"}.` });
  });
  return token;
}

/** A live console session for a cookie token, or null. Ends after 30 minutes without use. */
export async function findConsoleSession(token: string | null | undefined, now = new Date()) {
  if (!token) return null;
  const s = await withConsole((tx) => tx.consoleSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }));
  if (!s || s.revokedAt || s.expiresAt <= now) return null;
  if (s.user.status !== "ACTIVE" || s.user.archivedAt) return null;
  if (now.getTime() - s.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await withConsole((tx) => tx.consoleSession.update({ where: { id: s.id }, data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + CONSOLE_IDLE_MS) } }));
  }
  return s;
}

export async function endConsoleSession(token: string | null | undefined, why: "signed-out" | "idle" = "signed-out") {
  if (!token) return;
  await withConsole(async (tx) => {
    const s = await tx.consoleSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!s || s.revokedAt) return;
    await tx.consoleSession.update({ where: { id: s.id }, data: { revokedAt: new Date(), revokedReason: why } });
    await logActivity(tx, actorOf(s.user), { type: "signin", text: `${s.user.name} signed out of the console.` });
  });
}

// ---------------------------------------------------------------------------
// A new team member's welcome link: confirm a code on their phone, then set a password.
// ---------------------------------------------------------------------------

export async function findWelcome(token: string | null | undefined, now = new Date()) {
  if (!token) return { state: "missing" as const };
  const u = await withConsole((tx) => tx.superAdminUser.findUnique({ where: { inviteTokenHash: hashToken(token) } }));
  if (!u || u.status === "DISABLED" || u.archivedAt) return { state: "missing" as const };
  if (u.status === "ACTIVE") return { state: "used" as const };
  if (!u.inviteExpiresAt || u.inviteExpiresAt <= now) return { state: "expired" as const, user: u };
  return { state: "ok" as const, user: u };
}

export async function startWelcomeCode(token: string, now = new Date()) {
  const w = await findWelcome(token, now);
  if (w.state !== "ok") return { ok: false as const, message: "This welcome link no longer works. Ask the Owner for a new one." };
  return sendCode(w.user, "welcome", now);
}

export async function finishWelcome(token: string, challenge: string | null | undefined, code: string, password: string, device: DeviceInfo, now = new Date()) {
  const w = await findWelcome(token, now);
  if (w.state !== "ok") return { ok: false as const, message: "This welcome link no longer works. Ask the Owner for a new one." };
  const bad = checkNewPassword(password);
  if (bad) return { ok: false as const, message: bad, field: "password" };
  const checked = await checkConsoleCode(challenge, code, "welcome", now);
  if (!checked.ok) return { ...checked, field: "code" };
  if (checked.userId !== w.user.id) return { ok: false as const, message: "This code is for another login. Start again.", restart: true };
  const passwordHash = await hashPassword(password);
  await withConsole(async (tx) => {
    await tx.superAdminUser.update({ where: { id: w.user.id }, data: { passwordHash, passwordChangedAt: now, status: "ACTIVE", inviteTokenHash: null, inviteExpiresAt: null } });
    await logActivity(tx, actorOf(w.user, device.ipAddress), { type: "team", text: `${w.user.name} confirmed the code on ${maskMobile(w.user.phone)} and set a password. Their console login is active.`, from: "Invited", to: "Active" });
  });
  const tokenOut = await openSession({ ...w.user, status: "ACTIVE" }, device, now, null);
  return { ok: true as const, token: tokenOut };
}
