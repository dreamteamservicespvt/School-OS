// One-time codes and personal links on a tester's own computer. A tester reads
// every code that is sent (two-step and sign-in codes, Parent Link, admission
// consent, pickup and console codes) from the server log, one line each:
//
//   [dev] one-time code for xxxxxx3210 (sign-in): 123456
//
// and, while the school's messages are in Test mode, the personal links that
// would have gone (Parent Link, invites, surveys).
//
// A live server never writes them. They are written on a development server
// (`next dev`, the tests), or under `next start` only when APP_URL is set to
// this computer (localhost), where no parent or staff member could open a
// link anyway, and then only for what no real provider carried: the school's
// messages are in Test mode, or nothing is set up to send them.
import "server-only";

import type { SchoolContext, Tx } from "./db";
import { channelSetups, type ProviderChannel } from "./messaging/channels";
import { inTestMode } from "./messaging/providers";

/** How a code went: a real email/SMS/WhatsApp provider, Test mode (nothing left School OS), or nothing set up. */
export type CarriedBy = "real" | "test" | "none";

/** APP_URL is set, and it is this computer. */
function appUrlIsThisComputer(): boolean {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

const development = () => process.env.NODE_ENV !== "production";

/** Whether a code that went this way may be written to the server log. Never for a real provider on a production build. */
export function mayLogCode(carriedBy: CarriedBy): boolean {
  if (development()) return true;
  return carriedBy !== "real" && appUrlIsThisComputer();
}

/**
 * Test mode can stand in for SMS for sign-in codes: the code is then read
 * from the log. On a live server it cannot (the person would get no code).
 */
export const testModeCarriesCodes = () => mayLogCode("test");

/** "xxxxxx3210" for a phone, "ra***@example.com" for an email. */
export function contactForLog(to: string | null | undefined): string {
  const v = (to ?? "").trim();
  if (v.includes("@")) {
    const [name, domain] = v.split("@");
    return `${name.slice(0, 2)}***@${domain ?? ""}`;
  }
  const digits = v.replace(/\D/g, "");
  return digits ? `xxxxxx${digits.slice(-4)}` : "(no contact)";
}

/** Writes one code to the server log when allowed (see the top of this file). Says whether it did. */
export function logOneTimeCode(input: { to: string | null | undefined; purpose: string; code: string; carriedBy: CarriedBy }): boolean {
  if (!mayLogCode(input.carriedBy)) return false;
  console.info(`[dev] one-time code for ${contactForLog(input.to)} (${input.purpose}): ${input.code}`);
  return true;
}

/** A code sent through one of the school's channels: Test mode, or a real provider. */
export async function logCodeSentBy(tx: Tx, ctx: SchoolContext, channel: string, input: { to: string | null | undefined; purpose: string; code: string }): Promise<boolean> {
  // On a live server nothing is written, so there is nothing to look up.
  if (!mayLogCode("test")) return false;
  const setup = (await channelSetups(tx, ctx))[channel as ProviderChannel];
  return logOneTimeCode({ ...input, carriedBy: setup && inTestMode(setup) ? "test" : "real" });
}

/** A personal link that Test mode did not send, on a tester's computer only. */
export function logTestModeLink(input: { to: string | null | undefined; what: string; url: string }): boolean {
  if (!mayLogCode("test")) return false;
  console.info(`[dev] ${input.what} for ${contactForLog(input.to)} (Test mode, not sent): ${input.url}`);
  return true;
}
