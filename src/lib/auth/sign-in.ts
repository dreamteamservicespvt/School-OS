// Signing in, with slow-down and lock after wrong passwords
// (08-platform-security.md §2).

import { prisma, withSchool } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession, type DeviceInfo } from "./sessions";
import { schoolsFor } from "./access";

/** Wrong passwords before the login is locked (inferred). */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long a locked login stays locked (inferred: 15 minutes). */
export const LOCK_MS = 15 * 60 * 1000;
/** From this many wrong passwords on, each try is slowed down. */
export const SLOW_DOWN_AFTER = 3;

export type SignInResult =
  | { ok: true; token: string; userLoginId: string; schoolId: string }
  | { ok: false; message: string };

const WRONG = "The username or password is wrong. Check both and try again.";

type Options = { now?: Date; sleep?: (ms: number) => Promise<void> };
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function signIn(usernameInput: string, password: string, device: DeviceInfo, opts: Options = {}): Promise<SignInResult> {
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? realSleep;
  const username = usernameInput.trim().toLowerCase();

  const user = await prisma.userLogin.findUnique({ where: { username } });
  if (!user || user.archivedAt || !user.passwordHash) {
    await burnPasswordCheck(password);
    if (user?.status === "INVITED") {
      return { ok: false, message: "This login has not been set up yet. Open the invite link your school sent you to set your password." };
    }
    return { ok: false, message: WRONG };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    return { ok: false, message: `This login is locked for ${minutes} more minute${minutes === 1 ? "" : "s"} after too many wrong passwords. Try again later, or ask your School Admin.` };
  }

  if (user.failedAttempts >= SLOW_DOWN_AFTER) {
    await sleep(Math.min(user.failedAttempts - SLOW_DOWN_AFTER + 1, 4) * 500);
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);

  if (!passwordOk) {
    const failedAttempts = user.failedAttempts + 1;
    const locks = failedAttempts >= MAX_FAILED_ATTEMPTS;
    await prisma.userLogin.update({
      where: { id: user.id },
      data: { failedAttempts: locks ? 0 : failedAttempts, lockedUntil: locks ? new Date(now.getTime() + LOCK_MS) : null },
    });
    if (locks) {
      await reportLock(user.id, user.displayName, device);
      return { ok: false, message: "Too many wrong passwords. This login is locked for 15 minutes. Your School Admin has been told." };
    }
    const left = MAX_FAILED_ATTEMPTS - failedAttempts;
    return { ok: false, message: left <= 2 ? `${WRONG} ${left} more wrong ${left === 1 ? "try locks" : "tries lock"} this login for 15 minutes.` : WRONG };
  }

  if (user.status !== "ACTIVE") {
    return { ok: false, message: "This login is switched off. Ask your School Admin to switch it on." };
  }

  const schools = await schoolsFor(user.id);
  if (schools.length === 0) {
    return { ok: false, message: "Your login is not linked to any school yet. Ask your School Admin to give you access." };
  }
  const schoolId = schools[0].id;

  await prisma.userLogin.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastSignInAt: now },
  });
  const { token } = await createSession(user.id, schoolId, device, now);
  await withSchool({ schoolId, userId: user.id }, (tx) =>
    writeAudit(tx, { schoolId, userId: user.id }, {
      action: "signed-in",
      recordType: "User Login",
      recordId: user.id,
      device: device.userAgent,
      ipAddress: device.ipAddress,
    }),
  );
  return { ok: true, token, userLoginId: user.id, schoolId };
}

/** Tells the person and their schools' School Admins, and writes it to each school's audit log. */
async function reportLock(userLoginId: string, displayName: string, device: DeviceInfo) {
  const schools = await schoolsFor(userLoginId);
  for (const school of schools) {
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      await writeAudit(tx, ctx, {
        action: "locked-after-wrong-passwords",
        recordType: "User Login",
        recordId: userLoginId,
        device: device.userAgent,
        ipAddress: device.ipAddress,
      });
      const admins = await tx.schoolAccess.findMany({
        where: { schoolId: school.id, archivedAt: null, roles: { some: { role: { key: "school-admin" } } } },
        select: { userLoginId: true },
      });
      const to = new Set([userLoginId, ...admins.map((a) => a.userLoginId)]);
      for (const person of to) {
        await notify(tx, ctx, {
          to: person,
          type: "security",
          text: person === userLoginId
            ? "Your login was locked for 15 minutes after 5 wrong passwords. If this was not you, change your password."
            : `${displayName}'s login was locked for 15 minutes after 5 wrong passwords.`,
          link: person === userLoginId ? "/profile" : "/settings",
        });
      }
    });
  }
}
