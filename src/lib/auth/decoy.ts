// "Forgot password? Sign in with a one-time code" must never tell anyone which logins exist (owner decisions
// 2026-11-12, self-test B6, and 15 Nov 2026, decision 2). Every request, for a real login or not, gets the same
// answer, the same code page and the same answers to a typed code, at the same speed:
// - the browser always holds a "blind" token (`decoy.<kind><random>.<tries>`);
// - for a real login the code is made and sent after the answer has gone (code-sign-in.ts), on a challenge
//   whose token is the inner part of that blind token; for an unknown login nothing is made;
// - a typed code is checked against that challenge when there is a live one, else answered here, with the
//   same words a real challenge gives.
import { randomBytes } from "node:crypto";
import { MAX_CODE_TRIES } from "./two-step";

const PREFIX = "decoy.";

/** What was typed on the sign-in page: a mobile number, an email or a username. It only picks the words. */
export type TypedKind = "n" | "e" | "u";

export function typedKind(typed: string): TypedKind {
  const v = typed.trim();
  if (v.includes("@")) return "e";
  return /^\+?[\d\s()-]{10,16}$/.test(v) && v.replace(/\D/g, "").length >= 10 ? "n" : "u";
}

/** Shown on the first code page instead of the masked contact, the same for a real and an unknown login. */
export const CODE_SIGN_IN_SENT_TO = "the mobile number or email on that login, if it is on School OS";

/** The first code page's words (owner decision 2, 15 Nov 2026), by what was typed; never a masked contact. */
export const CODE_SIGN_IN_NOTICE: Record<TypedKind, string> = {
  n: "If this number has a School OS login, a code is on its way.",
  e: "If this email has a School OS login, a code is on its way.",
  u: "If this username has a School OS login, a code is on its way.",
};

/** "Send a new code" on a blind code page, for a real and an unknown login alike. */
export const CODE_SIGN_IN_RESENT = "If there is a School OS login, a new code is on its way. The earlier code no longer works.";

export function newDecoyToken(tries = 0, kind: TypedKind = "u"): string {
  return `${PREFIX}${kind}${randomBytes(24).toString("base64url")}.${tries}`;
}

export function isDecoyToken(token: string | null | undefined): token is string {
  return !!token && token.startsWith(PREFIX) && token.lastIndexOf(".") > PREFIX.length;
}

/** The token of the real challenge behind a blind token (it has none for an unknown login). */
export function innerToken(token: string): string {
  return token.slice(PREFIX.length, token.lastIndexOf("."));
}

/** What was typed when this blind token was made ("u" for an older token). */
export function kindOf(token: string): TypedKind {
  const k = token.charAt(PREFIX.length);
  return k === "n" || k === "e" ? k : "u";
}

/** The same blind token with one more try counted, as a wrong code to an unknown login gives. */
export function withOneMoreTry(token: string): string {
  const tries = Number(token.slice(token.lastIndexOf(".") + 1));
  return `${token.slice(0, token.lastIndexOf("."))}.${(Number.isFinite(tries) ? tries : 0) + 1}`;
}

/** The same words verifyChallenge gives for a wrong code; `token` is the cookie value to keep (null: start again). */
export function decoyAnswer(token: string, typed: string): { message: string; restart?: boolean; token: string | null } {
  if (!/^\d{6}$/.test(typed.replace(/\s/g, ""))) return { message: "Type the 6 digits of the code.", token };
  const tries = Number(token.slice(token.lastIndexOf(".") + 1)) + 1;
  const left = MAX_CODE_TRIES - (Number.isFinite(tries) ? tries : MAX_CODE_TRIES);
  if (left <= 0) return { message: "Too many wrong codes. This code no longer works. Sign in again to get a new one.", restart: true, token: null };
  return { message: `That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.`, token: `${token.slice(0, token.lastIndexOf("."))}.${tries}` };
}
