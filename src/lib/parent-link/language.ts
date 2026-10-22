// The language of a guardian's Parent Link: the language chosen on this phone (if the school
// has it on), then the guardian's message language, then the school's default language.
import "server-only";

import { withSchool } from "../db";
import { findLink } from "./links";
import { makeT, publicLanguage } from "../i18n/server";
import { screenMessage } from "../i18n/messages";
import type { Lang } from "../i18n/languages";
import type { T } from "../i18n/t";

export async function parentLinkLanguage(found: { schoolId: string; linkId: string }): Promise<{ lang: Lang; choices: Lang[] }> {
  const ctx = { schoolId: found.schoolId, userId: null };
  const { school, guardianLanguage } = await withSchool(ctx, async (tx) => {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { languages: true, defaultLanguage: true } });
    const link = await tx.parentLink.findUnique({ where: { id: found.linkId }, select: { guardianId: true } });
    const guardian = link ? await tx.guardian.findFirst({ where: { id: link.guardianId }, select: { language: true } }) : null;
    return { school, guardianLanguage: guardian?.language ?? null };
  });
  return publicLanguage(school, guardianLanguage);
}

/** The translator for a Parent Link action's messages; English when the link is not found. */
export async function parentLinkWords(token: string): Promise<T> {
  const found = await findLink(token);
  return makeT(found ? (await parentLinkLanguage(found)).lang : "en");
}

/** A message from the Parent Link rules in the page's language (src/lib/i18n/messages.ts). */
export function parentMessage(t: T, message: string | undefined): string | undefined {
  return screenMessage(t, message);
}
