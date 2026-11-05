// Telling parents about a calendar change, an event or a PTM never blocks the
// change itself. When the message cannot go (no WhatsApp or SMS connected,
// parents without the app, nobody registered), the change is still saved and
// the person is told in plain words why nobody was messaged.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { MessagingProblem } from "../messaging/send";
import { EventsProblem } from "./problem";

export type Told = { people: number; problem: string | null };

export async function tellSafely(send: () => Promise<{ people: number }>): Promise<Told> {
  try {
    return { people: (await send()).people, problem: null };
  } catch (e) {
    if (e instanceof MessagingProblem || e instanceof EventsProblem) return { people: 0, problem: e.message };
    throw e;
  }
}

/** " 12 parents told." or " Nobody was told: <why>" (empty when nobody was to be told). */
export function toldWords(t: Told | null, who = "parent") {
  if (!t) return "";
  if (t.problem) return ` Nobody was told: ${t.problem}`;
  return t.people ? ` ${t.people} ${t.people === 1 ? who : `${who}s`} told.` : "";
}

/**
 * A holiday or vacation added to the School Calendar also goes to every staff
 * login's bell (testing 2026-11-05: a holiday was announced and nothing came
 * in the software). Staff of the entry's campus only, when it has one; the
 * person who added it is not told (notify rule 4). Returns how many were told.
 */
export async function tellStaffInApp(
  tx: Tx,
  ctx: SchoolContext,
  entry: { id: string; title: string; campusId: string | null },
  words: string,
): Promise<number> {
  const [{ staffSideLogins }, { notify }] = await Promise.all([import("../communication/notices"), import("../notifications")]);
  const logins = await staffSideLogins(tx, ctx, { roleKeys: [], campusIds: entry.campusId ? [entry.campusId] : [] });
  let told = 0;
  for (const to of logins) if (await notify(tx, ctx, { to, type: "notice", text: words, link: "/events-calendar" })) told++;
  return told;
}
