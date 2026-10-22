// Column matches the school confirmed, remembered for the next file from the
// same source (gap list G18). An export from the same old software (Fedena,
// Entab, a hand-made sheet used every year) has the same headings, so the
// match the person checked and imported once is used again by itself, and
// shown as "matched as last time" for them to check. Kept by heading text,
// never by column number, so it still fits when the columns move.
import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import type { ColumnMatch } from "./match";
import { plain } from "./tidy";

/** One key per set of headings: tidied, without repeats, sorted, hashed. */
export const headerKeyOf = (headers: string[]) =>
  createHash("sha256").update([...new Set(headers.map(plain).filter(Boolean))].sort().join("|")).digest("hex");

/** School OS column key → the tidied headings that fill it, from a confirmed match. */
export function headingsOf(match: ColumnMatch, headers: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of Object.keys(match).sort()) {
    const hs = (match[key] ?? []).map((c) => plain(headers[c] ?? ""));
    if (hs.length && hs.every(Boolean)) out[key] = hs;
  }
  return out;
}

/** The remembered headings laid on this file: key → column numbers. A key whose headings are not all here is left out. */
export function applyRemembered(columns: Record<string, string[]>, headers: string[]): ColumnMatch {
  const at = new Map<string, number>();
  headers.forEach((h, i) => { const p = plain(h); if (p && !at.has(p)) at.set(p, i); });
  const out: ColumnMatch = {};
  for (const [key, hs] of Object.entries(columns)) {
    const cols = hs.map((h) => at.get(h));
    if (cols.length && cols.every((c) => c !== undefined)) out[key] = cols as number[];
  }
  return out;
}

/** The rules' match with the remembered one on top; a rule match that used a remembered column gives way. */
export function mergeRemembered(rules: ColumnMatch, remembered: ColumnMatch): ColumnMatch {
  const taken = new Set(Object.values(remembered).flat());
  const out: ColumnMatch = {};
  for (const [k, cols] of Object.entries(rules)) if (!remembered[k] && !cols.some((c) => taken.has(c))) out[k] = cols;
  return { ...out, ...remembered };
}

/** Share of a mapping's headings found in this file. */
export function fitOf(headings: string[], headers: string[]) {
  if (!headings.length) return 0;
  const here = new Set(headers.map(plain).filter(Boolean));
  return headings.filter((h) => here.has(h)).length / headings.length;
}

export type Recalled = { id: string; source: string | null; fileName: string; updatedAt: Date; match: ColumnMatch };

/** The match this school confirmed for files with these headings: the same headings first, else one whose headings are nearly all here. */
export async function recallMapping(tx: Tx, kind: string, headers: string[]): Promise<Recalled | null> {
  let row = await tx.importMapping.findFirst({ where: { kind, headerKey: headerKeyOf(headers), archivedAt: null } });
  if (!row) {
    const all = await tx.importMapping.findMany({ where: { kind, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: 50 });
    let best: { r: (typeof all)[number]; fit: number } | null = null;
    for (const r of all) {
      const headings = r.headings as string[];
      const fit = fitOf(headings, headers);
      if (headings.length >= 3 && fit >= 0.8 && (!best || fit > best.fit)) best = { r, fit };
    }
    row = best?.r ?? null;
  }
  if (!row) return null;
  const match = applyRemembered(row.columns as Record<string, string[]>, headers);
  if (!Object.keys(match).length) return null;
  return { id: row.id, source: row.source, fileName: row.fileName, updatedAt: row.updatedAt, match };
}

/** Counts a remembered match as used for one more file. */
export async function markRecalled(tx: Tx, id: string, now = new Date()) {
  await tx.importMapping.update({ where: { id }, data: { timesUsed: { increment: 1 }, lastUsedAt: now } });
}

/**
 * Keeps the column match the person confirmed by bringing the file in, for the
 * next file with these headings. Audited when it is new or changed.
 */
export async function rememberMapping(tx: Tx, ctx: SchoolContext, input: { kind: string; headers: string[]; match: ColumnMatch; fileName: string }) {
  const columns = headingsOf(input.match, input.headers);
  if (!Object.keys(columns).length) return null;
  const headerKey = headerKeyOf(input.headers);
  const headings = [...new Set(input.headers.map(plain).filter(Boolean))];
  const plan = await tx.moveInPlan.findUnique({ where: { schoolId: ctx.schoolId }, select: { oldSoftware: true } });
  const source = plan?.oldSoftware?.trim().slice(0, 80) || null;
  const before = await tx.importMapping.findUnique({ where: { schoolId_kind_headerKey: { schoolId: ctx.schoolId, kind: input.kind, headerKey } } });
  if (before && !before.archivedAt && JSON.stringify(before.columns) === JSON.stringify(columns)) return before;
  const data = { columns: columns as Prisma.InputJsonValue, headings, source: source ?? before?.source ?? null, fileName: input.fileName.slice(0, 200), archivedAt: null };
  const row = await tx.importMapping.upsert({
    where: { schoolId_kind_headerKey: { schoolId: ctx.schoolId, kind: input.kind, headerKey } },
    create: { schoolId: ctx.schoolId, kind: input.kind, headerKey, createdById: ctx.userId, ...data },
    update: data,
  });
  await writeAudit(tx, ctx, {
    action: before ? "changed" : "created", recordType: "Import Mapping", recordId: row.id,
    before: before ? { columns: before.columns as Prisma.InputJsonValue } : null,
    after: { kind: input.kind, source: data.source, fileName: data.fileName, columns: columns as Prisma.InputJsonValue },
  });
  return row;
}
