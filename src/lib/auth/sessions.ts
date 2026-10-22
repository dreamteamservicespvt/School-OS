// Signed-in devices. The browser keeps a random token in a cookie; the
// database keeps only its hash, with the device and when it was last used.

import { prisma } from "../db";
import { deviceKeyOf, hashToken, newToken } from "./tokens";
import { forgetAllDevices } from "./remembered";

export { deviceKeyOf };

/** A session ends after this long without use (inferred until Settings sets time-outs). */
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
/** lastUsedAt is refreshed at most this often, to keep page loads light. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

/**
 * The browser a request comes from. `deviceId` is the browser's own random id
 * (a long-lived cookie, see signInDevice in lib/current.ts); only its hash is kept.
 */
export type DeviceInfo = { userAgent?: string | null; ipAddress?: string | null; deviceId?: string | null };

export async function createSession(userLoginId: string, schoolId: string | null, device: DeviceInfo, now = new Date(), opts: { signedInWithCode?: boolean } = {}) {
  const token = newToken();
  const session = await prisma.session.create({
    data: {
      userLoginId,
      tokenHash: hashToken(token),
      schoolId,
      userAgent: device.userAgent?.slice(0, 400) ?? null,
      ipAddress: device.ipAddress ?? null,
      deviceKey: deviceKeyOf(device.deviceId),
      signedInWithCode: opts.signedInWithCode ?? false,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
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

/** Finds a live session for a cookie token, or null. Disabled logins have no live sessions. */
export async function findSession(token: string | undefined | null, now = new Date()) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { userLogin: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  if (session.userLogin.status !== "ACTIVE" || session.userLogin.archivedAt) return null;

  if (now.getTime() - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_IDLE_MS) },
    });
  }
  return session;
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
