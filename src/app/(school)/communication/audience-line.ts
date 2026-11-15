// Send Message, "1. Who gets it" (adopt item 10): one live line under the
// audience buttons with the people count and the credit cost, from the same
// server preview as "3. Check and send" (P4), so the two never disagree.

const fmt = (n: number) => n.toLocaleString("en-IN");

export type AudienceFacts = {
  /** The preview is being worked out again. */
  checking: boolean;
  /** The audience is complete (a class chosen, a person added...). */
  ready: boolean;
  /** People the preview reaches, or null before the first preview. */
  people: number | null;
  /** "parents", "students", "staff", "people" (singular for one). */
  noun: string;
  /** Credits it uses (Test mode uses none). */
  credits: number;
  /** SMS backup counts "up to" its credits. */
  upTo: boolean;
  /** Every paid channel is in Test mode. */
  test: boolean;
  /** Only free channels (app notice, email). */
  free: boolean;
  /** People left out (opted out, no phone). */
  leftOut: number;
};

/** "1,181 parents · 1,181 credits", "12 staff · free", "3 parents · no credits (Test mode)", or null. */
export function audienceLine(f: AudienceFacts): string | null {
  if (!f.ready) return null;
  if (f.people === null) return f.checking ? "Counting…" : null;
  if (f.people === 0) return "Nobody to send to";
  const cost = f.credits > 0 ? `${f.upTo ? "up to " : ""}${fmt(f.credits)} ${f.credits === 1 ? "credit" : "credits"}` : f.test ? "no credits (Test mode)" : f.free ? "free" : "no credits";
  return [`${fmt(f.people)} ${f.noun}`, cost, f.leftOut ? `${fmt(f.leftOut)} left out` : null].filter(Boolean).join(" · ");
}
