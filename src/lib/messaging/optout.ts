// Consent and opt-out (11-communication.md §6): a parent who opted out gets no
// normal message, only emergency broadcasts. Every change keeps a record of
// when and how, and the guardian's flag in Student Management follows it.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MessagingProblem } from "./send";

export const OPT_OUT_WAYS = ["Phone call", "Visit to school", "Letter", "WhatsApp reply", "Email", "Other"] as const;

export async function setOptOut(tx: Tx, ctx: SchoolContext, guardianId: string, optOut: boolean, how: string, note: string | null) {
  const g = await tx.guardian.findFirst({ where: { id: guardianId, schoolId: ctx.schoolId, archivedAt: null } });
  if (!g) throw new MessagingProblem("This parent was not found.");
  if (g.optedOut === optOut) throw new MessagingProblem(optOut ? `${g.name} has already opted out.` : `${g.name} already gets messages.`);
  await tx.guardian.update({ where: { id: g.id }, data: { optedOut: optOut, updatedById: ctx.userId } });
  await tx.optOutRecord.create({ data: { schoolId: ctx.schoolId, guardianId: g.id, action: optOut ? "opted-out" : "opted-in", how, note, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: optOut ? "opted-out-of-messages" : "opted-in-to-messages", recordType: "Guardian", recordId: g.id, before: { optedOut: g.optedOut }, after: { optedOut: optOut, how, note } });
  return g;
}

/** A parent replied STOP (or START) on WhatsApp. Every guardian on that number follows it. */
export async function optOutByPhone(tx: Tx, ctx: SchoolContext, phone: string, optOut: boolean) {
  const guardians = await tx.guardian.findMany({ where: { schoolId: ctx.schoolId, phone, archivedAt: null, optedOut: !optOut } });
  for (const g of guardians) await setOptOut(tx, ctx, g.id, optOut, "WhatsApp reply", optOut ? "Replied STOP" : "Replied START");
  return guardians.length;
}
