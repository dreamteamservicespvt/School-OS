// "Confirm it is you" (owner decision 3, 15 Nov 2026): before a person changes
// their own mobile number or email, or switches off two-step login, in My
// profile, they type their current password. A person with no password gets a
// one-time code on their current email or mobile instead. So someone who finds
// a signed-in screen cannot move the login to their own phone or email.
// The code is stored as a hash, works for 10 minutes and 5 tries, and is used
// once; the tries are limited per person, as on the sign-in page.
import { randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../db";
import { hitLimit, limitMessage } from "../rate-limit";
import { hashToken, newToken } from "./tokens";
import { verifyPassword } from "./password";
import { CODE_TTL_MS, MAX_CODE_TRIES, MAX_SENDS, codeHash, countTry, deliverCodeTo, maskEmail, maskPhone, type CodeTo, type StartResult } from "./two-step";
import type { DeviceInfo } from "./sessions";

export const CONFIRM_PURPOSE = "confirm-me";
/** The browser keeps the code's token here, on My profile only. */
export const CONFIRM_COOKIE = "sos_confirm_me";

/** How this person confirms it is them: their password, a code to their current contact, or nothing to check against. */
export type ConfirmWay = { kind: "password" } | { kind: "code"; to: string } | { kind: "none" };

export function confirmWay(user: { passwordHash: string | null; email: string | null; phone: string | null }): ConfirmWay {
  if (user.passwordHash) return { kind: "password" };
  if (user.email) return { kind: "code", to: maskEmail(user.email) };
  if (user.phone) return { kind: "code", to: maskPhone(user.phone) };
  return { kind: "none" };
}

export const CONFIRM_WORDS = {
  password: "Type your current password first.",
  wrongPassword: "Your current password is not right. Check it and try again.",
  sendCode: "Send the code to your current mobile number or email, then type it here.",
  noPassword: "Your login has a password, so type it instead of a code.",
} as const;

/** A code to the person's current email (else mobile), for a person with no password. */
export async function sendConfirmCode(
  userLoginId: string, schoolId: string, device: DeviceInfo,
  opts: { now?: Date; deliver?: (to: CodeTo, code: string) => ReturnType<typeof deliverCodeTo> } = {},
): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { passwordHash: true, email: true, phone: true, displayName: true } });
  if (!user) return { ok: false, message: "This login was not found. Sign in again." };
  if (user.passwordHash) return { ok: false, message: CONFIRM_WORDS.noPassword };
  if (!user.email && !user.phone) return { ok: false, message: "Your login has no mobile number or email for the code." };
  const limit = await hitLimit(`confirm-me:send:${userLoginId}`, MAX_SENDS, 900, now);
  if (!limit.ok) return { ok: false, message: limitMessage(limit) };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = newToken();
  const to: CodeTo = { email: user.email, phone: user.phone, name: user.displayName, schoolId, userLoginId, key: hashToken(token).slice(0, 40) };
  const sent = await (opts.deliver ?? ((t, c) => deliverCodeTo(t, c, CONFIRM_PURPOSE)))(to, code);
  if ("problem" in sent) return { ok: false, message: sent.problem, unreachable: sent.unreachable };
  await prisma.twoStepChallenge.updateMany({ where: { userLoginId, purpose: CONFIRM_PURPOSE, usedAt: null }, data: { usedAt: now } });
  await prisma.twoStepChallenge.create({
    data: {
      userLoginId, purpose: CONFIRM_PURPOSE, tokenHash: hashToken(token), codeHash: codeHash(token, code), channel: sent.channel, sentTo: sent.sentTo,
      schoolId, userAgent: device.userAgent?.slice(0, 400) ?? null, ipAddress: device.ipAddress ?? null, expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });
  return { ok: true, token, sentTo: sent.sentTo, channel: sent.channel };
}

export type Proof = { password?: string | null; token?: string | null; code?: string | null };
export type ProofField = "confirmPassword" | "confirmCode";
export type ProofResult = { ok: true; by: "password" | "code" | "none" } | { ok: false; message: string; field: ProofField };

/**
 * Checks that it is really the person: their current password, or the code
 * sent to their current contact when they have no password. A person with
 * neither a password nor a contact has nothing to check against and passes.
 */
export async function checkProof(userLoginId: string, proof: Proof, now = new Date()): Promise<ProofResult> {
  const user = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { passwordHash: true, email: true, phone: true } });
  if (!user) return { ok: false, message: "This login was not found. Sign in again.", field: "confirmPassword" };
  const way = confirmWay(user);
  if (way.kind === "none") return { ok: true, by: "none" };
  const limit = await hitLimit(`confirm-me:check:${userLoginId}`, 10, 600, now);
  if (!limit.ok) return { ok: false, message: limitMessage(limit), field: way.kind === "password" ? "confirmPassword" : "confirmCode" };

  if (way.kind === "password") {
    const password = proof.password ?? "";
    if (!password) return { ok: false, message: CONFIRM_WORDS.password, field: "confirmPassword" };
    if (!(await verifyPassword(user.passwordHash!, password))) return { ok: false, message: CONFIRM_WORDS.wrongPassword, field: "confirmPassword" };
    return { ok: true, by: "password" };
  }

  const code = (proof.code ?? "").replace(/\s/g, "");
  if (!proof.token) return { ok: false, message: CONFIRM_WORDS.sendCode, field: "confirmCode" };
  const c = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(proof.token) } });
  if (!c || c.userLoginId !== userLoginId || c.purpose !== CONFIRM_PURPOSE || c.usedAt) return { ok: false, message: "This code has been used or replaced. Send a new code.", field: "confirmCode" };
  if (c.expiresAt <= now) return { ok: false, message: "This code has expired after 10 minutes. Send a new code.", field: "confirmCode" };
  if (c.attempts >= MAX_CODE_TRIES) return { ok: false, message: "Too many wrong codes. Send a new code.", field: "confirmCode" };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Type the 6 digits of the code.", field: "confirmCode" };
  if (!(await countTry(c.id))) return { ok: false, message: "Too many wrong codes. Send a new code.", field: "confirmCode" };
  if (!timingSafeEqual(Buffer.from(codeHash(proof.token, code)), Buffer.from(c.codeHash))) {
    const updated = await prisma.twoStepChallenge.findUniqueOrThrow({ where: { id: c.id }, select: { attempts: true } });
    const left = MAX_CODE_TRIES - updated.attempts;
    if (left <= 0) {
      await prisma.twoStepChallenge.update({ where: { id: c.id }, data: { usedAt: now } });
      return { ok: false, message: "Too many wrong codes. Send a new code.", field: "confirmCode" };
    }
    return { ok: false, message: `That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.`, field: "confirmCode" };
  }
  // Used once, and only by one request: a second change needs a new code.
  const claimed = await prisma.twoStepChallenge.updateMany({ where: { id: c.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return { ok: false, message: "This code has already been used. Send a new code.", field: "confirmCode" };
  return { ok: true, by: "code" };
}
