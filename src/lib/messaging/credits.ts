// Message credits (Credit Ledger Entry): added when the school buys them,
// used when messages go out. Credits left = the sum of the ledger, by channel.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Channel } from "./channels";
import { smsParts } from "./templates";

/** Channels that cost credits. Email and app notifications are free (inferred). */
export const PAID_CHANNELS: ReadonlySet<Channel> = new Set(["whatsapp", "sms"]);

/** Credits one message costs on a channel: 1 per WhatsApp message, 1 per SMS part. */
export function creditsFor(channel: Channel, text: string): number {
  if (channel === "sms") return smsParts(text);
  if (channel === "whatsapp") return 1;
  return 0;
}

export async function creditBalances(tx: Tx, ctx: SchoolContext): Promise<Record<"whatsapp" | "sms", number>> {
  const rows = await tx.creditLedgerEntry.groupBy({ by: ["channel"], where: { schoolId: ctx.schoolId }, _sum: { amount: true } });
  const get = (c: string) => rows.find((r) => r.channel === c)?._sum.amount ?? 0;
  return { whatsapp: get("whatsapp"), sms: get("sms") };
}

export class NotEnoughCredits extends Error {}

/** "Needs 480 credits. You have 92." — checked before anything is sent. */
export function creditProblem(needs: Partial<Record<Channel, number>>, have: Record<"whatsapp" | "sms", number>): string | null {
  const lines: string[] = [];
  for (const c of ["whatsapp", "sms"] as const) {
    const n = needs[c] ?? 0;
    if (n > have[c]) lines.push(`${c === "sms" ? "SMS" : "WhatsApp"} needs ${n.toLocaleString("en-IN")} credits. You have ${have[c].toLocaleString("en-IN")}.`);
  }
  return lines.length ? `${lines.join(" ")} Top up in Settings, SMS, WhatsApp & Email, or send by app only.` : null;
}

export async function useCredits(tx: Tx, ctx: SchoolContext, channel: Channel, amount: number, note: string, messageId: string | null) {
  if (amount === 0 || !PAID_CHANNELS.has(channel)) return;
  await tx.creditLedgerEntry.create({ data: { schoolId: ctx.schoolId, channel, amount: -amount, note: note.slice(0, 200), messageId, createdById: ctx.userId } });
}

export async function returnCredits(tx: Tx, ctx: SchoolContext, channel: Channel, amount: number, note: string, messageId: string | null) {
  if (amount === 0 || !PAID_CHANNELS.has(channel)) return;
  await tx.creditLedgerEntry.create({ data: { schoolId: ctx.schoolId, channel, amount, note: note.slice(0, 200), messageId, createdById: ctx.userId } });
}
