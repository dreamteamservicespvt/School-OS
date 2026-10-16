// Signed-in devices. The browser keeps a random token in a cookie; the
// database keeps only its hash, with the device and when it was last used.

import { prisma } from "../db";
import { hashToken, newToken } from "./tokens";

/** A session ends after this long without use (inferred until Settings sets time-outs). */
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
/** lastUsedAt is refreshed at most this often, to keep page loads light. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type DeviceInfo = { userAgent?: string | null; ipAddress?: string | null };

export async function createSession(userLoginId: string, schoolId: string | null, device: DeviceInfo, now = new Date()) {
  const token = newToken();
  const session = await prisma.session.create({
    data: {
      userLoginId,
      tokenHash: hashToken(token),
      schoolId,
      userAgent: device.userAgent?.slice(0, 400) ?? null,
      ipAddress: device.ipAddress ?? null,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    },
  });
  return { token, session };
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
 * after a password change, and when a login is disabled or its roles change
 * (08-platform-security.md §2).
 */
export async function revokeAllSessions(userLoginId: string, reason: string, exceptSessionId?: string) {
  const result = await prisma.session.updateMany({
    where: { userLoginId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function setSessionSchool(sessionId: string, schoolId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { schoolId } });
}
