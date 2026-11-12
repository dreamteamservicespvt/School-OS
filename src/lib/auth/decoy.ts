// "Forgot password? Sign in with a one-time code" for a login that does not exist (owner decision 2026-11-12,
// self-test B6): the person sees the same code page and the same answers as for a real login, so nobody can
// find out which logins exist by trying names. The decoy lives only in the challenge cookie; no code is made.
import { randomBytes } from "node:crypto";
import { MAX_CODE_TRIES } from "./two-step";

const PREFIX = "decoy.";

/** Shown on the first code page instead of the masked contact, the same for a real and an unknown login. */
export const CODE_SIGN_IN_SENT_TO = "the mobile number or email on that login, if it is on School OS";

export function newDecoyToken(tries = 0): string {
  return `${PREFIX}${randomBytes(16).toString("base64url")}.${tries}`;
}

export function isDecoyToken(token: string | null | undefined): token is string {
  return !!token && token.startsWith(PREFIX);
}

/** The same words verifyChallenge gives for a wrong code; `token` is the cookie value to keep (null: start again). */
export function decoyAnswer(token: string, typed: string): { message: string; restart?: boolean; token: string | null } {
  if (!/^\d{6}$/.test(typed.replace(/\s/g, ""))) return { message: "Type the 6 digits of the code.", token };
  const tries = Number(token.slice(token.lastIndexOf(".") + 1)) + 1;
  const left = MAX_CODE_TRIES - (Number.isFinite(tries) ? tries : MAX_CODE_TRIES);
  if (left <= 0) return { message: "Too many wrong codes. This code no longer works. Sign in again to get a new one.", restart: true, token: null };
  return { message: `That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.`, token: `${token.slice(0, token.lastIndexOf("."))}.${tries}` };
}
