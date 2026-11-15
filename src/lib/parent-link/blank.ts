// The {parent_link} blank (owner's phone test 15 Nov 2026: "Please open your
// Parent Link to read it and agree" reached a parent with no link in it).
// Every message that sends a parent to Parent Link carries their own link,
// the way a fee reminder's {how_to_pay} does (src/lib/fees/reminder-pay.ts):
// - a parent with an active Parent Link gets it as a placeholder, which
//   becomes the real link only when the message is handed to WhatsApp or SMS
//   (./token.ts), so Message History never holds a link that opens;
// - a parent with none, or a school with Parent Link switched off, gets
//   "Ask the school office for your Parent Link.", never an empty blank.
// This file only reads. ./message-links.ts makes the missing links before a
// message goes, as "Send Parent Link" makes them.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { messageSettings } from "../messaging/settings";
import { placeholderFor } from "./token";

export const PARENT_LINK_BLANK = "parent_link";
/** What {parent_link} says when the parent has no Parent Link to give. */
export const NO_PARENT_LINK = "Ask the school office for your Parent Link.";

/** Does any of these texts have the {parent_link} blank? */
export const usesParentLink = (...texts: (string | null | undefined)[]) => texts.some((t) => Boolean(t?.includes(`{${PARENT_LINK_BLANK}}`)));

/** {parent_link} for each of these guardians: their own active link (a placeholder), or the office line. Makes nothing. */
export async function parentLinkBlanks(tx: Tx, ctx: SchoolContext, guardianIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(guardianIds)];
  const out: Record<string, string> = Object.fromEntries(ids.map((id) => [id, NO_PARENT_LINK]));
  if (!ids.length || !(await messageSettings(tx, ctx)).parentLink.on) return out;
  const links = await tx.parentLink.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: ids }, status: "ACTIVE" }, select: { id: true, guardianId: true } });
  for (const l of links) out[l.guardianId] = placeholderFor(l.id);
  return out;
}
