// New users set their own password from an invite link. DREAM TEAM never
// types or knows a school user's password (08-platform-security.md §2).

import { prisma } from "../db";
import { hashPassword, verifyPassword } from "./password";
import { keepOldPassword, newPasswordProblem } from "./password-rules";
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

export async function acceptInvite(token: string, password: string, now = new Date()): Promise<AcceptResult> {
  const user = await findInvite(token, now);
  if (!user) return { ok: false, message: "This invite link has expired or was already used. Ask your School Admin for a new one." };
  // A temporary password from the school, or one that expired (password-rules.ts), is never chosen again.
  if (user.passwordHash && (await verifyPassword(user.passwordHash, password))) {
    return { ok: false, message: user.mustChangePassword ? "Choose a new password, not the temporary one your school gave you." : "Choose a new password, not the one you have now." };
  }
  // The school's password rules (the strictest of the person's schools) and their earlier passwords.
  const problem = await newPasswordProblem(user.id, password);
  if (problem) return { ok: false, message: problem };
  await keepOldPassword(user.id, user.passwordHash, now);
  await prisma.userLogin.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      status: user.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      inviteTokenHash: null,
      inviteExpiresAt: null,
      passwordChangedAt: now,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  return { ok: true, userLoginId: user.id, username: user.username };
}
