// Before a message with the {parent_link} blank goes to parents (exam
// reminder, results, consent request): each parent in it who has no Parent
// Link yet gets one, made by the same createLink as "Send Parent Link" (its
// audit line "created"), so the message carries their own link (./blank.ts
// fills it). After the message, the links made for it count as sent, as
// "Send Parent Link" records them (lastSentAt and the audit line "sent").
// A parent who cannot have a link (no phone, Parent Link switched off) gets
// "Ask the school office for your Parent Link." in the message instead.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { messageSettings } from "../messaging/settings";
import { resolveAudience, SYSTEM_SCOPE } from "../messaging/recipients";
import type { SendInput } from "../messaging/send";
import { createLink, guardiansWithoutLinks, ParentLinkProblem } from "./links";
import { usesParentLink } from "./blank";

/** Makes the missing Parent Links for the parents a message with {parent_link} goes to. Returns the new links' ids. */
export async function makeParentLinksFor(tx: Tx, ctx: SchoolContext, input: SendInput): Promise<string[]> {
  const templateIds = Object.values(input.templates ?? {}).filter((id): id is string => Boolean(id));
  const bodies = templateIds.length
    ? (await tx.templateVersion.findMany({ where: { schoolId: ctx.schoolId, templateId: { in: templateIds }, isCurrent: true }, select: { body: true } })).map((v) => v.body)
    : [];
  if (!usesParentLink(input.text, ...bodies)) return [];
  if (!(await messageSettings(tx, ctx)).parentLink.on) return [];
  const people = await resolveAudience(tx, ctx, input.to, input.scope ?? SYSTEM_SCOPE);
  const parents = people.filter((c) => c.type === "guardian" && c.inScope && c.phone && !input.exclude?.(c.key) && (!c.optedOut || input.emergency || input.systemMessage));
  const made: string[] = [];
  for (const id of await guardiansWithoutLinks(tx, ctx, [...new Set(parents.map((c) => c.id))])) {
    try {
      made.push((await createLink(tx, ctx, id)).id);
    } catch (e) {
      // This parent cannot have a link now: the message tells them to ask the school office.
      if (!(e instanceof ParentLinkProblem)) throw e;
    }
  }
  return made;
}

/** The links made for a message count as sent with it. */
export async function noteParentLinksSent(tx: Tx, ctx: SchoolContext, linkIds: string[], messageId: string | null | undefined) {
  if (!linkIds.length || !messageId) return;
  await tx.parentLink.updateMany({ where: { id: { in: linkIds } }, data: { lastSentAt: new Date() } });
  for (const id of linkIds) await writeAudit(tx, ctx, { action: "sent", recordType: "Parent Link", recordId: id, after: { message: messageId } });
}
