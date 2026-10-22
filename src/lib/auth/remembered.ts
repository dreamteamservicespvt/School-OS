// Remembered devices (decided by the owner, 22 October 2026). After a person
// types the right two-step code after their password, that browser is
// remembered, with no tick needed: signing in there again with the password
// does not ask for a code, even after the session ended from being idle.
//
// A device is forgotten when the person signs out on it (or signs it out from
// My profile), signs out everywhere, changes or resets their password, has
// their login switched off, or has two-step login reset; and when it has not
// been used for REMEMBER_DAYS. "Shared computer: ask for the code every time"
// on the code page keeps a device from being remembered. A code typed instead
// of the password never makes a remembered device (sign-in.ts, afterRightCode).
//
// The browser keeps a random token in a cookie; the database keeps only its
// hash (the trusted_device table), with the browser's hashed device id.

import { prisma, type Tx } from "../db";
import { deviceKeyOf, hashToken, newToken } from "./tokens";
import type { DeviceInfo } from "./sessions";

/** A remembered device not used for this many days asks for the code again. */
export const REMEMBER_DAYS = 180;
const REMEMBER_MS = REMEMBER_DAYS * 86_400_000;
/** The cookie lives as long as the remembering, and is renewed on each use. */
export const REMEMBERED_COOKIE_MAX_AGE = REMEMBER_DAYS * 86_400;
export const REMEMBERED_COOKIE = "sos_trusted";

type Db = Pick<Tx, "trustedDevice">;

/**
 * Whether this browser is a remembered device for this person. A device counts
 * only if it was remembered after the person's last two-step reset. Each use
 * moves the 180 days on from today.
 */
export async function isRememberedDevice(userLoginId: string, token: string | null | undefined, now = new Date()): Promise<boolean> {
  if (!token) return false;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!device || device.userLoginId !== userLoginId || device.revokedAt || device.expiresAt <= now) return false;
  if (now.getTime() - device.lastUsedAt.getTime() >= REMEMBER_MS) return false;
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { twoStepResetAt: true } });
  if (user?.twoStepResetAt && device.createdAt <= user.twoStepResetAt) return false;
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + REMEMBER_MS) } });
  return true;
}

/** Remembers this browser for this person; any earlier record for the same browser is forgotten. Returns the cookie token. */
export async function rememberDevice(userLoginId: string, device: DeviceInfo, now = new Date()) {
  const token = newToken();
  const deviceKey = deviceKeyOf(device.deviceId);
  if (deviceKey) await prisma.trustedDevice.updateMany({ where: { userLoginId, deviceKey, revokedAt: null }, data: { revokedAt: now } });
  await prisma.trustedDevice.create({
    // createdAt from the same clock as a two-step reset (the app's), not the database's, so "remembered before the reset" is exact.
    data: { userLoginId, tokenHash: hashToken(token), deviceKey, userAgent: device.userAgent?.slice(0, 400) ?? null, createdAt: now, lastUsedAt: now, expiresAt: new Date(now.getTime() + REMEMBER_MS) },
  });
  return token;
}

/**
 * Signing out on a device forgets it: the browser with this cookie token, and
 * any record for the same browser (its hashed device id, as on the session).
 * Signing another device out from My profile uses that session's device id.
 */
export async function forgetDevice(userLoginId: string, which: { token?: string | null; deviceKey?: string | null }, now = new Date()) {
  const or = [...(which.token ? [{ tokenHash: hashToken(which.token) }] : []), ...(which.deviceKey ? [{ deviceKey: which.deviceKey }] : [])];
  if (or.length === 0) return 0;
  return (await prisma.trustedDevice.updateMany({ where: { userLoginId, revokedAt: null, OR: or }, data: { revokedAt: now } })).count;
}

/** "Forget" on one remembered device in My profile. */
export async function forgetRememberedDevice(userLoginId: string, id: string, now = new Date()) {
  return (await prisma.trustedDevice.updateMany({ where: { id, userLoginId, revokedAt: null }, data: { revokedAt: now } })).count;
}

/**
 * Forgets every remembered device of this person: sign out everywhere, a
 * password change or reset, a switched-off login. `keepToken` keeps the
 * device the person is using (a password change, "Sign out everywhere else").
 */
export async function forgetAllDevices(db: Db, userLoginId: string, opts: { keepToken?: string | null; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const result = await db.trustedDevice.updateMany({
    where: { userLoginId, revokedAt: null, ...(opts.keepToken ? { tokenHash: { not: hashToken(opts.keepToken) } } : {}) },
    data: { revokedAt: now },
  });
  return result.count;
}

/** This person's remembered devices still in use, newest first, for My profile. */
export async function rememberedDevices(userLoginId: string, now = new Date()) {
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { twoStepResetAt: true } });
  return prisma.trustedDevice.findMany({
    where: {
      userLoginId,
      revokedAt: null,
      expiresAt: { gt: now },
      lastUsedAt: { gt: new Date(now.getTime() - REMEMBER_MS) },
      ...(user?.twoStepResetAt ? { createdAt: { gt: user.twoStepResetAt } } : {}),
    },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, userAgent: true, deviceKey: true, lastUsedAt: true, createdAt: true },
  });
}
