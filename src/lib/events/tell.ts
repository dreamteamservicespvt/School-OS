// Telling parents about a calendar change, an event or a PTM never blocks the
// change itself. When the message cannot go (no WhatsApp or SMS connected,
// parents without the app, nobody registered), the change is still saved and
// the person is told in plain words why nobody was messaged.
import "server-only";

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
