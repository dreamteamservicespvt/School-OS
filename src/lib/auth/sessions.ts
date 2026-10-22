// Signed-in devices. The browser keeps a random token in a cookie; the
// database keeps only its hash, with the device and when it was last used.

import { prisma } from "../db";
import { deviceKeyOf, hashToken, newToken } from "./tokens";
import { forgetAllDevices } from "./remembered";
import { sessionEnds, sessionRulesFor, TIMED_OUT_REASONS, type SessionRules, type TimeOut } from "./session-rules";

export { deviceKeyOf };

/** lastUsedAt is refreshed at most this often, to keep page loads light (more often for short time-outs). */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
const touchEvery = (idleMinutes: number) => Math.min(TOUCH_EVERY_MS, (idleMinutes * 60_000) / 5);

/**
 * The browser a request comes from. `deviceId` is the browser's own random id
 * (a long-lived cookie, see signInDevice in lib/current.ts); only its hash is kept.
 */
export type DeviceInfo = { userAgent?: string | null; ipAddress?: string | null; deviceId?: string | null };

export async function createSession(userLoginId: string, schoolId: string | null, device: DeviceInfo, now = new Date(), opts: { signedInWithCode?: boolean } = {}) {
  const token = newToken();
  const rules = await sessionRulesFor(schoolId, now.getTime());
  const userAgent = device.userAgent?.slice(0, 400) ?? null;
  const session = await prisma.session.create({
    data: {
      userLoginId,
      tokenHash: hashToken(token),
      schoolId,
      userAgent,
      ipAddress: device.ipAddress ?? null,
      deviceKey: deviceKeyOf(device.deviceId),
      signedInWithCode: opts.signedInWithCode ?? false,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: sessionEnds({ userAgent, createdAt: now, lastUsedAt: now }, rules).at,
    },
  });
  return { token, session };
}

/** After signing in with a one-time code (a forgotten password), a new password may be set without the old one for this long. */
export const NEW_PASSWORD_AFTER_CODE_MS = 30 * 60 * 1000;

/** Whether this session may set a new password without typing the old one. */
export function mayResetWithoutOld(session: { signedInWithCode?: boolean | null; createdAt?: Date | null }, now = new Date()) {
  return Boolean(session.signedInWithCode && session.createdAt && now.getTime() - session.createdAt.getTime() < NEW_PASSWORD_AFTER_CODE_MS);
}

/**
 * Finds a live session for a cookie token, or null. Disabled logins have no
 * live sessions. The school's session rules are applied here, on the server,
 * to every request: a session not used for longer than the school allows, or
 * older than its longest sign-in, ends now (with the reason, for the sign-in
 * page). A remembered device is not forgotten by it.
 */
export async function findSession(token: string | undefined | null, now = new Date()) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { userLogin: true },
  });
  if (!session || session.revokedAt) return null;
  if (session.userLogin.status !== "ACTIVE" || session.userLogin.archivedAt) return null;

  // The school's rules as they are now decide, so a changed rule applies at once (expiresAt only mirrors them).
  const rules = await sessionRulesFor(session.schoolId, now.getTime());
  const end = sessionEnds(session, rules);
  if (end.at <= now) {
    await prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now, revokedReason: TIMED_OUT_REASONS[end.why] } });
    return null;
  }
  if (now.getTime() - session.lastUsedAt.getTime() > touchEvery(end.idleMinutes)) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: sessionEnds({ ...session, lastUsedAt: now }, rules).at },
    });
  }
  return session;
}

export type SignedOutBy = { why: TimeOut; minutes: number };

/**
 * Why the session behind this cookie ended by itself, for "You were signed out
 * because you were away": time without use, or the longest sign-in. Null when
 * it is live, was signed out by a person, or is unknown.
 */
export async function whySignedOut(token: string | undefined | null, now = new Date()): Promise<SignedOutBy | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return null;
  const rules: SessionRules = await sessionRulesFor(session.schoolId, now.getTime());
  const end = sessionEnds(session, rules);
  const why = session.revokedAt
    ? (Object.entries(TIMED_OUT_REASONS).find(([, words]) => words === session.revokedReason)?.[0] as TimeOut | undefined)
    : end.at <= now ? end.why : undefined;
  if (!why) return null;
  return { why, minutes: why === "too-long" ? rules.maxSession ?? end.idleMinutes : end.idleMinutes };
}

export async function revokeSession(sessionId: string, userLoginId: string, reason: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, userLoginId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Signs a person out everywhere at once: used for "Sign out everywhere",
 * after a password change or reset, and "Sign out everywhere else"
 * (08-platform-security.md §2). Their remembered devices are forgotten too, so
 * each asks for the two-step code again; `keepRememberedToken` keeps the one
 * the person is using when they stay signed in here.
 */
export async function revokeAllSessions(userLoginId: string, reason: string, exceptSessionId?: string, opts: { keepRememberedToken?: string | null } = {}) {
  const result = await prisma.session.updateMany({
    where: { userLoginId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  await forgetAllDevices(prisma, userLoginId, { keepToken: exceptSessionId ? opts.keepRememberedToken : null });
  return result.count;
}

export async function setSessionSchool(sessionId: string, schoolId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { schoolId } });
}
