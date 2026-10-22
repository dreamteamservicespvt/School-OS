// How the Audit Log marks a change a person confirmed from something the AI
// prepared (00-global.md §2.1 rule 6): "prepared by AI, confirmed by <person>".
import type { SchoolContext, Tx } from "../db";

export const aiConfirmedWords = (person: string) => `prepared by AI, confirmed by ${person}`;

/** The note for the Audit Log entry of a change the signed-in person confirmed from an AI suggestion. */
export async function aiConfirmedNote(tx: Tx, ctx: SchoolContext): Promise<string> {
  const user = ctx.userId ? await tx.userLogin.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }).catch(() => null) : null;
  return aiConfirmedWords(user?.displayName ?? "a school user");
}
