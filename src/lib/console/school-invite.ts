// A School Admin's invite or reset link (07-super-admin.md §4): open the
// link, confirm a 6-digit code sent to the mobile on the invite, then set
// their own password. DREAM TEAM never sees or types it. Using the link is a
// line in the console's Activity Log and a notice to the people who sent it.
import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import type { SchoolInvite } from "@prisma/client";
import { prisma, withConsole } from "../db";
import { checkNewPassword, hashPassword } from "../auth/password";
import { hashToken, newToken } from "../auth/tokens";
import { createSession, revokeAllSessions, type DeviceInfo } from "../auth/sessions";
import { hitLimit, limitMessage } from "../rate-limit";
import { logActivity, maskMobile, SYSTEM_ACTOR } from "./activity";
import { notifyTeam } from "./notify";
import { codesByWhatsapp, deliver } from "./outbox";
import { inviteState } from "./schools";
import { logOneTimeCode } from "../dev-codes";

export const INVITE_CODE_TTL_MS = 10 * 60 * 1000;
export const INVITE_CODE_TRIES = 5;

const codeHashOf = (inviteId: string, code: string) => hashToken(`${inviteId}:${code}`);

export type InviteLook =
  | { state: "missing" }
  | { state: "used" | "cancelled" | "replaced" | "expired"; invite: SchoolInvite; schoolName: string }
  | { state: "ok"; invite: SchoolInvite; schoolName: string };

/** The invite behind a link. The first open is noted, so DREAM TEAM sees "opened, not finished". */
export async function findSchoolInvite(token: string | null | undefined, now = new Date()): Promise<InviteLook> {
  if (!token || token.length < 20 || token.length > 200) return { state: "missing" };
  return withConsole(async (tx) => {
    const invite = await tx.schoolInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite) return { state: "missing" } as const;
    const card = await tx.consoleSchool.findUnique({ where: { id: invite.forSchoolId }, select: { name: true, status: true } });
    const schoolName = card?.name ?? "your school";
    if (!card || card.status === "CLOSED") return { state: "cancelled", invite, schoolName } as const;
    const s = inviteState(invite, now);
    if (s === "used" || s === "cancelled" || s === "replaced" || s === "expired") return { state: s, invite, schoolName } as const;
    if (!invite.openedAt) await tx.schoolInvite.update({ where: { id: invite.id }, data: { openedAt: now } });
    return { state: "ok", invite, schoolName } as const;
  });
}

/** Sends (or sends again) the 6-digit code to the mobile on the invite. */
export async function sendSchoolInviteCode(token: string, ip: string | null, now = new Date()) {
  const look = await findSchoolInvite(token, now);
  if (look.state !== "ok") return { ok: false as const, message: "This link no longer works. Ask DREAM TEAM for a new one." };
  const limit = await hitLimit(`invite-code:${look.invite.id}`, 5, 900, now);
  if (!limit.ok) return { ok: false as const, message: limitMessage(limit) };
  const ipLimit = await hitLimit(`invite-code-ip:${ip ?? "unknown"}`, 30, 900, now);
  if (!ipLimit.ok) return { ok: false as const, message: limitMessage(ipLimit) };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await withConsole((tx) => tx.schoolInvite.update({ where: { id: look.invite.id }, data: { codeHash: codeHashOf(look.invite.id, code), codeSentAt: now, codeAttempts: 0, codeOkAt: null } }));
  const text = `${code} is your School OS code for ${look.schoolName}. It works for 10 minutes. Never share it with anyone, including DREAM TEAM.`;
  const safe = text.replace(code, "••••••");
  const sent = await deliver([codesByWhatsapp()
    ? { channel: "whatsapp", to: look.invite.phone, purpose: "code", text, safeText: safe, templateParams: [code], buttonParam: code }
    : { channel: "sms", to: look.invite.phone, purpose: "code", text, safeText: safe, templateParams: [code] }]);
  if (sent.every((s) => s.status === "FAILED")) return { ok: false as const, message: "The code could not be sent just now. Try again in a minute." };
  logOneTimeCode({ to: look.invite.phone, purpose: "school invite", code, carriedBy: sent.every((s) => s.status === "TEST") ? "none" : "real" });
  return { ok: true as const, sentTo: maskMobile(look.invite.phone), by: sent[0]?.channel === "whatsapp" ? "WhatsApp" : "SMS", test: sent.every((s) => s.status === "TEST") };
}

export type FinishResult = { ok: true; token: string } | { ok: false; message: string; field?: "code" | "password"; restart?: boolean };

/** Checks the code, saves the new password, marks the link used and signs the person in. */
export async function finishSchoolInvite(token: string, code: string, password: string, device: DeviceInfo, now = new Date()): Promise<FinishResult> {
  const look = await findSchoolInvite(token, now);
  if (look.state !== "ok") return { ok: false, message: "This link no longer works. Ask DREAM TEAM for a new one.", restart: true };
  const inv = look.invite;
  if (!inv.codeHash || !inv.codeSentAt || inv.codeSentAt.getTime() + INVITE_CODE_TTL_MS <= now.getTime()) return { ok: false, message: "This code has timed out. Send a new code.", field: "code" };
  if (inv.codeAttempts >= INVITE_CODE_TRIES) return { ok: false, message: "Too many wrong codes. Send a new code.", field: "code" };
  const typed = code.replace(/\D/g, "");
  const right = typed.length === 6 && timingSafeEqual(Buffer.from(codeHashOf(inv.id, typed)), Buffer.from(inv.codeHash));
  if (!right) {
    await withConsole((tx) => tx.schoolInvite.update({ where: { id: inv.id }, data: { codeAttempts: { increment: 1 } } }));
    return { ok: false, message: "That code is not right. Check the SMS and type it again.", field: "code" };
  }
  const bad = checkNewPassword(password);
  if (bad) return { ok: false, message: bad, field: "password" };
  const passwordHash = await hashPassword(password);

  // Claim the link once: a second tab cannot use it again.
  const claimed = await withConsole((tx) => tx.schoolInvite.updateMany({ where: { id: inv.id, usedAt: null, cancelledAt: null, replacedAt: null }, data: { usedAt: now, codeOkAt: now, codeHash: null } }));
  if (claimed.count === 0) return { ok: false, message: "This link was already used. Sign in with your mobile number and password.", restart: true };

  const login = await prisma.userLogin.findUnique({ where: { id: inv.userLoginId } });
  if (!login || login.archivedAt || login.status === "DISABLED") return { ok: false, message: "This login was switched off. Ask DREAM TEAM for help.", restart: true };
  await prisma.userLogin.update({
    where: { id: login.id },
    data: { passwordHash, status: "ACTIVE", passwordChangedAt: now, failedAttempts: 0, lockedUntil: null, inviteTokenHash: null, inviteExpiresAt: null },
  });
  if (inv.kind === "RESET") await revokeAllSessions(login.id, "password reset by DREAM TEAM link");

  const what = inv.kind === "RESET" ? "used the reset link and set a new password" : "used the invite and set a password";
  await withConsole(async (tx) => {
    await logActivity(tx, { ...SYSTEM_ACTOR }, { type: "login", school: { id: inv.forSchoolId, name: look.schoolName }, text: `${inv.name} ${what} at ${look.schoolName}, after confirming the code on +91 ${maskMobile(inv.phone)}.`, ...(inv.kind === "INVITE" ? { from: "Invited", to: "Active" } : {}) });
    await notifyTeam(tx, { roles: ["OWNER", "ONBOARDING"], alsoUserId: inv.sentById, text: `${inv.name} ${what} at ${look.schoolName}.`, link: `/console/schools/${inv.forSchoolId}`, tone: "ok" });
  });
  const { token: sessionToken } = await createSession(login.id, inv.forSchoolId, device, now);
  return { ok: true, token: sessionToken };
}

/** A fresh, unguessable token: only for tests that need a link. */
export const testToken = () => newToken();
