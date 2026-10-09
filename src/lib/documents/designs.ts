// Document designs: the school's chosen ready design for each document and
// its adjustments. Every save is a new version; old versions are kept and can
// be used again (20-settings.md, Document Designs).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { allFields, findDocType } from "./types";
import { BASES, defaultOptions, optionsSchema, withDefaults, type BaseKey, type DesignOptions } from "./designs-shared";

export { BASES, CARD_SIZES, defaultOptions, optionsSchema, withDefaults, type BaseKey, type DesignOptions } from "./designs-shared";

export type Design = { docType: string; base: BaseKey; options: DesignOptions; version: number; id: string | null; createdAt: Date | null };

/** The design in use for a document, or the ready Classic design if the school has not chosen one. */
export async function currentDesign(tx: Tx, docType: string): Promise<Design> {
  const t = findDocType(docType);
  if (!t) throw new Error(`Unknown document type ${docType}`);
  const row = await tx.documentDesign.findFirst({ where: { docType, isCurrent: true }, orderBy: { version: "desc" } });
  if (!row) return { docType, base: "classic", options: defaultOptions(t), version: 0, id: null, createdAt: null };
  return { docType, base: row.base as BaseKey, options: withDefaults(t, row.base, row.options), version: row.version, id: row.id, createdAt: row.createdAt };
}

export class DesignProblem extends Error {}

/** Checks merge fields and signatories, then saves a new version and keeps the old one. */
export async function saveDesign(tx: Tx, ctx: SchoolContext, docType: string, base: string, options: unknown, note = "changed") {
  const t = findDocType(docType);
  if (!t) throw new DesignProblem("This document type is not known.");
  if (!BASES.some((b) => b.key === base)) throw new DesignProblem("Choose a ready design.");
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) throw new DesignProblem(parsed.error.issues[0]?.message ?? "Some design choices are not right.");
  const opts = parsed.data;
  const known = new Set(allFields(t).map((x) => x.key));
  const unknown = [...(opts.body + opts.headerNote + opts.footer + opts.title).matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !known.has(k));
  if (unknown.length) throw new DesignProblem(`These merge fields are not known for a ${t.label.toLowerCase()}: ${[...new Set(unknown)].join(", ")}. Pick fields from the list.`);
  opts.fields = opts.fields.filter((k) => known.has(k));
  opts.table = opts.table.filter((k) => known.has(k));
  if (opts.signatoryIds.length) {
    const found = await tx.signatory.count({ where: { id: { in: opts.signatoryIds }, archivedAt: null } });
    if (found !== opts.signatoryIds.length) throw new DesignProblem("A chosen signatory was archived. Choose again.");
  }
  if (opts.card.backgroundFileId) {
    const file = await tx.storedFile.findUnique({ where: { id: opts.card.backgroundFileId } });
    if (!file) opts.card.backgroundFileId = null;
  }
  const previous = await tx.documentDesign.findFirst({ where: { docType, isCurrent: true }, orderBy: { version: "desc" } });
  const last = await tx.documentDesign.findFirst({ where: { docType }, orderBy: { version: "desc" }, select: { version: true } });
  await tx.documentDesign.updateMany({ where: { docType, isCurrent: true }, data: { isCurrent: false } });
  const row = await tx.documentDesign.create({
    data: { schoolId: ctx.schoolId, docType, base, options: opts as unknown as Prisma.InputJsonValue, version: (last?.version ?? 0) + 1, isCurrent: true, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, {
    action: note,
    recordType: "Document Design",
    recordId: row.id,
    before: previous ? { docType, base: previous.base, version: previous.version, options: previous.options as Prisma.InputJsonValue } : null,
    after: { docType, base, version: row.version, options: opts as unknown as Prisma.InputJsonValue },
  });
  return row;
}

/** Uses an earlier version again, as a new version, so history is never rewritten. */
export async function useVersion(tx: Tx, ctx: SchoolContext, docType: string, version: number) {
  const old = await tx.documentDesign.findFirst({ where: { docType, version } });
  if (!old) throw new DesignProblem("That version was not found.");
  const t = findDocType(docType)!;
  return saveDesign(tx, ctx, docType, old.base, withDefaults(t, old.base, old.options), `restored-version-${version}`);
}
