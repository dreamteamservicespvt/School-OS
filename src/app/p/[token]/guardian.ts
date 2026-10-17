// The guardian behind a Parent Link request (no login), shared by every
// action and download under /p/[token]: the link from the token, this
// phone's key from its cookie, and guardianAccess() from the links module,
// which checks the link, Parent Link on, the school open, the phone confirmed
// and the section's switch on, again on the server.
import "server-only";

import { cookies } from "next/headers";
import { ACCESS_WORDS, deviceCookieName, findLink, guardianAccess, type GuardianAccess } from "@/lib/parent-link/links";

/** The Message Settings switch each kind of guardian action belongs to (see the Parent Link sections). */
export type SectionSwitch = "fees" | "consent" | "events" | "report-cards";

export async function guardianFor(token: string, section: SectionSwitch | null): Promise<GuardianAccess> {
  const found = await findLink(token);
  if (!found) return { ok: false, reason: "gone", message: ACCESS_WORDS.gone };
  const key = (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null;
  return guardianAccess(found, key, section);
}
