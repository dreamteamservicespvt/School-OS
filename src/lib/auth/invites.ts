// New users set their own password from an invite link. DREAM TEAM never
// types or knows a school user's password (08-platform-security.md §2).

import { prisma } from "../db";
import { checkNewPassword, hashPassword } from "./password";
import { hashToken, newToken } from "./tokens";

/** How long an invite link works (inferred: 7 days). */
export const INVITE_VALID_MS = 7 * 24 * 60 * 60 * 1000;

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
  const problem = checkNewPassword(password);
  if (problem) return { ok: false, message: problem };
  await prisma.userLogin.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      status: user.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      inviteTokenHash: null,
      inviteExpiresAt: null,
      passwordChangedAt: now,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  return { ok: true, userLoginId: user.id, username: user.username };
}
