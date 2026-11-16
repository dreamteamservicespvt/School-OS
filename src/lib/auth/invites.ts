// New users set their own password from an invite link. DREAM TEAM never
// types or knows a school user's password (08-platform-security.md §2).

import { prisma, withSchool } from "../db";
import { writeAudit } from "../audit";
import { formatDateTime } from "../format";
import { schoolsFor } from "./access";
import { hashPassword, verifyPassword } from "./password";
import { keepOldPassword, newPasswordProblem } from "./password-rules";
import { securityAlert } from "./security-alert";
import { revokeAllSessions } from "./sessions";
import { hashToken, newToken } from "./tokens";

/** How long an invite link works (inferred: 7 days). */
export const INVITE_VALID_MS = 7 * 24 * 60 * 60 * 1000;
/** How long the link to choose one's own password after a temporary one works (inferred: 30 minutes, as for a code sign-in). */
export const FIRST_CHANGE_VALID_MS = 30 * 60 * 1000;

/**
 * A login with a temporary password (09 Add Staff) has signed in with it: a
 * short link to choose their own password, on the invite page. No session is
 * made until they have (08 §2).
 */
export async function startFirstChange(userLoginId: string, now = new Date()) {
  const token = newToken();
  await prisma.userLogin.update({
    where: { id: userLoginId },
    data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(now.getTime() + FIRST_CHANGE_VALID_MS) },
  });
  return token;
}

export async function createInvite(userLoginId: string, now = new Date()) {
  const token = newToken();
  await prisma.userLogin.update({
    where: { id: userLoginId },
    data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(now.getTime() + INVITE_VALID_MS) },
  });
  return token;
}

export async function findInvite(token: string, now = new Date()) {
  const user = await prisma.userLogin.findUnique({ where: { inviteTokenHash: hashToken(token) } });
  if (!user || !user.inviteExpiresAt || user.inviteExpiresAt <= now || user.archivedAt) return null;
  return user;
}

export type AcceptResult = { ok: true; userLoginId: string; username: string } | { ok: false; message: string };

const USED = "This invite link has expired or was already used. Ask the person who sent it for a new one.";

export async function acceptInvite(token: string, password: string, now = new Date(), device: { userAgent?: string | null; ipAddress?: string | null } = {}): Promise<AcceptResult> {
  const user = await findInvite(token, now);
  if (!user) return { ok: false, message: USED };
  // A temporary password from the school, or one that expired (password-rules.ts), is never chosen again.
  if (user.passwordHash && (await verifyPassword(user.passwordHash, password))) {
    return { ok: false, message: user.mustChangePassword ? "Choose a new password, not the temporary one your school gave you." : "Choose a new password, not the one you have now." };
  }
  // The school's password rules (the strictest of the person's schools) and their earlier passwords.
  const problem = await newPasswordProblem(user.id, password);
  if (problem) return { ok: false, message: problem };
  const passwordHash = await hashPassword(password);
  // The link works once (security review 2026-11-15): only the request that still finds this link's
  // hash on the login sets the password; a second one sent at the same moment finds nothing.
  const claimed = await prisma.userLogin.updateMany({
    where: { id: user.id, inviteTokenHash: hashToken(token), inviteExpiresAt: { gt: now }, archivedAt: null },
    data: {
      passwordHash,
      status: user.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      inviteTokenHash: null,
      inviteExpiresAt: null,
      passwordChangedAt: now,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  if (claimed.count === 0) return { ok: false, message: USED };
  await keepOldPassword(user.id, user.passwordHash, now);
  // A login that had a password (a "Reset password" link, or a temporary or expired one): as when a
  // password is changed (08 §2), every device is signed out and forgotten, and the person is told.
  if (user.passwordHash) await afterReset(user.id, now, device);
  return { ok: true, userLoginId: user.id, username: user.username };
}

async function afterReset(userLoginId: string, now: Date, device: { userAgent?: string | null; ipAddress?: string | null }) {
  const others = await revokeAllSessions(userLoginId, "Password reset by sign-in link");
  const schools = await schoolsFor(userLoginId);
  for (const [i, school] of schools.entries()) {
    const ctx = { schoolId: school.id, userId: userLoginId };
    const afterSave = await withSchool(ctx, async (tx) => {
      await writeAudit(tx, ctx, { action: "changed-password", recordType: "User Login", recordId: userLoginId, after: { with: "sign-in link", signedOutDevices: others }, device: device.userAgent, ipAddress: device.ipAddress });
      // One alert, in the person's first school: the same words as a changed password.
      if (i > 0) return async () => {};
      const zone = await tx.school.findUnique({ where: { id: school.id }, select: { timeZone: true } });
      return securityAlert(tx, school.id, userLoginId, {
        subject: "Your School OS password was changed",
        key: others === 0
          ? "Your School OS password was changed on {when}. Not you? Tell your School Admin or DREAM TEAM at once."
          : others === 1
            ? "Your School OS password was changed on {when} and 1 other device was signed out. Not you? Tell your School Admin or DREAM TEAM at once."
            : "Your School OS password was changed on {when} and {n} other devices were signed out. Not you? Tell your School Admin or DREAM TEAM at once.",
        values: { when: formatDateTime(now, zone?.timeZone), n: others },
        link: "/profile#password",
      });
    });
    await afterSave();
  }
}
