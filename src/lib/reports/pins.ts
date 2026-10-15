// Pinned and recently used reports (19 §2, inferred): each person's own,
// at the top of All Reports. Analytics charts can be pinned to the person's
// Dashboard the same way (kind "chart").
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type PinKind = "report" | "chart";

export async function pinsOf(tx: Tx, ctx: SchoolContext, kind: PinKind) {
  if (!ctx.userId) return [];
  const rows = await tx.reportPin.findMany({ where: { userId: ctx.userId, kind }, orderBy: { createdAt: "asc" }, select: { key: true } });
  return rows.map((r) => r.key);
}

/** Pins or unpins; returns whether it is pinned now. */
export async function togglePin(tx: Tx, ctx: SchoolContext, kind: PinKind, key: string, on?: boolean) {
  if (!ctx.userId) throw new Error("Sign in first.");
  const where = { schoolId_userId_kind_key: { schoolId: ctx.schoolId, userId: ctx.userId, kind, key } };
  const have = await tx.reportPin.findUnique({ where });
  const want = on ?? !have;
  if (want && !have) await tx.reportPin.create({ data: { schoolId: ctx.schoolId, userId: ctx.userId, kind, key } });
  // A pin is the person's own shortcut, not a school record: unpinning removes the shortcut row.
  if (!want && have) await tx.reportPin.update({ where, data: { key: `${key}#off#${Date.now()}`, kind: `${kind}-off` } });
  return want;
}

/** Remembers that the person opened a report. */
export async function recordUse(tx: Tx, ctx: SchoolContext, key: string, now = new Date()) {
  if (!ctx.userId) return;
  await tx.reportUse.upsert({
    where: { schoolId_userId_key: { schoolId: ctx.schoolId, userId: ctx.userId, key } },
    create: { schoolId: ctx.schoolId, userId: ctx.userId, key, usedAt: now },
    update: { usedAt: now },
  });
}

export async function recentUses(tx: Tx, ctx: SchoolContext, take = 6) {
  if (!ctx.userId) return [];
  const rows = await tx.reportUse.findMany({ where: { userId: ctx.userId }, orderBy: { usedAt: "desc" }, take, select: { key: true } });
  return rows.map((r) => r.key);
}
