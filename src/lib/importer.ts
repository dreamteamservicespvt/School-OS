// The import kinds and the steps every import ends with (00-global.md P10):
// each kind's own check, save and undo, the row-by-row preview, importing
// the good rows (each on its own), the history for Undo and the rows with
// problems to download. Files are read, matched and tidied by the Switching
// to School OS engine (src/lib/move-in), the one way into School OS.
import "server-only";

import { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "./db";
import { writeAudit } from "./audit";

export type ImportColumn = { key: string; label: string; required?: boolean; example?: string; help?: string; aliases?: string[] };

/**
 * A choice a person makes for one row before it can be imported, such as
 * "Same student: update Arjun Rao" for a row that may already be on record.
 * Nothing is merged until a person picks one.
 */
export type RowChoice = { value: string; label: string };

export type RowResult<T> = { ok: true; value: T } | { ok: false; problems: string[]; choices?: RowChoice[] };

/** Where a row is in the file (from 2, after the headings) and the choice made for it, if any. */
export type RowPlace = { line: number; decision?: string };

/**
 * A row that cannot be saved, in plain words. The importer lists the row with
 * this reason and carries on with the others; any other error stops the import.
 */
export class RowProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowProblem";
  }
}

export type ImportKind<T> = {
  key: string;
  label: string;
  columns: ImportColumn[];
  /**
   * Checks one row; may look things up. Problems are in plain words. A row
   * that needs a person's choice says so with `choices`; the choice made comes
   * back in `place.decision`.
   */
  check: (tx: Tx, ctx: SchoolContext, row: Record<string, string>, seen: Set<string>, place?: RowPlace) => Promise<RowResult<T>>;
  /**
   * A row the kind leaves out on purpose, before any check: returns the
   * words it is counted under in the result (for example "No old dues" for a
   * row with no amount, in a sheet listing every student), or null to check
   * the row. Such a row is not a problem and has nothing to fix.
   */
  leaveOut?: (row: Record<string, string>) => string | null;
  /**
   * Saves one good row; returns the record's id and whether it was created.
   * An import that changes existing records returns what it changed
   * (`before` and `after`), so Undo can put the old values back.
   */
  save: (tx: Tx, ctx: SchoolContext, value: T) => Promise<{ id: string; created: boolean; before?: Record<string, unknown>; after?: Record<string, unknown> }>;
  /** Undoes the records an import created (archives them). */
  undo: (tx: Tx, ctx: SchoolContext, ids: string[]) => Promise<void>;
  /** Puts back the values an import changed; returns how many records were put back. */
  revert?: (tx: Tx, ctx: SchoolContext, rows: UpdatedRow[]) => Promise<number>;
  /**
   * The same import with the choices made with the upload (kept with the file
   * and handed to the import job), such as Student Management's section for
   * rows with no class. Unknown or wrong choices are ignored.
   */
  withOptions?: (options: Record<string, unknown>) => ImportKind<T>;
};

export type UpdatedRow = { id: string; before: Record<string, unknown>; after: Record<string, unknown> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kinds = new Map<string, ImportKind<any>>();
export function defineImport<T>(kind: ImportKind<T>) {
  kinds.set(kind.key, kind);
}
export function importKind(key: string) {
  return kinds.get(key);
}
export function importKinds() {
  return [...kinds.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const norm = (s: string) => s.toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9]/g, "");

export type BadRow = { line: number; row: Record<string, string>; problems: string[]; choices?: RowChoice[] };

/** A row left out on purpose (ImportKind.leaveOut), with the words it is counted under. */
export type LeftRow = { line: number; reason: string };

export type Preview<T> = {
  good: { line: number; value: T; row: Record<string, string> }[];
  bad: BadRow[];
  left: LeftRow[];
};

/** Rows left out on purpose, counted by reason, for the result: [{ reason: "No old dues", count: 300 }]. */
export function leftCounts(left: LeftRow[]): { reason: string; count: number }[] {
  const by = new Map<string, number>();
  for (const l of left) by.set(l.reason, (by.get(l.reason) ?? 0) + 1);
  return [...by.entries()].map(([reason, count]) => ({ reason, count }));
}

/** The counts as words: "300 no old dues". */
export function leftWords(counts: { reason: string; count: number }[]): string {
  return counts.map((c) => `${c.count} ${c.reason.toLowerCase()}`).join(", ");
}

/** Choices made for rows, by line in the file (from 2): "update:<id>", "new"... Only the kind that offered them reads them. */
export type Decisions = Record<number, string>;

/**
 * Checks every row (step 4). `lines` gives each row's line in the person's own
 * file when the rows were cleaned first (Switching to School OS), so problems
 * and choices name the rows as the person sees them; otherwise row i is line i + 2.
 */
export async function previewImport<T>(tx: Tx, ctx: SchoolContext, kind: ImportKind<T>, rows: string[][], match: Record<string, number>, decisions: Decisions = {}, lines?: number[]): Promise<Preview<T>> {
  const out: Preview<T> = { good: [], bad: [], left: [] };
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const line = lines?.[i] ?? i + 2;
    const place: RowPlace = { line, decision: decisions[line] || undefined };
    const row: Record<string, string> = {};
    for (const c of kind.columns) row[c.key] = match[c.key] !== undefined ? (rows[i][match[c.key]] ?? "").trim() : "";
    const leave = kind.leaveOut?.(row);
    if (leave) {
      out.left.push({ line, reason: leave });
      continue;
    }
    const empty = kind.columns.filter((c) => c.required && !row[c.key]);
    if (empty.length) {
      // Show every problem of the row at once, so the office fixes it in one go:
      // the empty columns, then what the row's own check finds in the rest
      // (checked against a copy of `seen`, so a skipped row holds no seat or number).
      const problems = empty.map((c) => `${c.label} is empty.`);
      const labels = empty.map((c) => norm(c.label));
      try {
        const r = await kind.check(tx, ctx, row, new Set(seen), place);
        if (!r.ok) problems.push(...r.problems.filter((p) => !labels.some((l) => norm(p).startsWith(l)) && !problems.includes(p)));
      } catch {
        // A check that cannot read a row with empty columns adds nothing.
      }
      out.bad.push({ line, row, problems });
      continue;
    }
    const r = await kind.check(tx, ctx, row, seen, place);
    if (r.ok) out.good.push({ line, value: r.value, row });
    else out.bad.push({ line, row, problems: r.problems, ...(r.choices?.length ? { choices: r.choices } : {}) });
  }
  return out;
}

/** The plain reason a row could not be saved, or null when the error is not about the row (it then stops the import). */
export function rowRefusal(e: unknown): string | null {
  if (e instanceof RowProblem) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return "Another record already has the same number or name, so this row was not added. Check the row and bring it in again.";
  }
  return null;
}

/**
 * Imports the good rows only (step 5) and keeps the history for Undo. Each
 * row is saved on its own (a savepoint): a row that cannot be saved is listed
 * with the reason and the others still go in.
 */
export async function runImport<T>(tx: Tx, ctx: SchoolContext, kind: ImportKind<T>, fileName: string, preview: Preview<T>, opts: { left?: { reason: string; count: number }[] } = {}) {
  const createdIds: string[] = [];
  const updatedRows: UpdatedRow[] = [];
  const bad: BadRow[] = [...preview.bad];
  let updated = 0;
  for (const g of preview.good) {
    await tx.$executeRawUnsafe("SAVEPOINT import_row");
    let saved: Awaited<ReturnType<ImportKind<T>["save"]>>;
    try {
      saved = await kind.save(tx, ctx, g.value);
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT import_row");
    } catch (e) {
      const why = rowRefusal(e);
      if (why === null) throw e;
      // Everything this row wrote is taken back; the import carries on.
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT import_row");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT import_row");
      bad.push({ line: g.line, row: g.row, problems: [why] });
      continue;
    }
    if (saved.created) createdIds.push(saved.id);
    else updated++;
    if (!saved.created && saved.before && saved.after) updatedRows.push({ id: saved.id, before: saved.before, after: saved.after });
  }
  bad.sort((a, b) => a.line - b.line);
  // Rows left out on purpose, counted here or before the rows were handed over (Switching to School OS checks first).
  const left = new Map<string, number>();
  for (const l of [...leftCounts(preview.left ?? []), ...(opts.left ?? [])]) left.set(l.reason, (left.get(l.reason) ?? 0) + l.count);
  const leftOut = [...left.entries()].map(([reason, count]) => ({ reason, count }));
  const batch = await tx.importBatch.create({
    data: {
      schoolId: ctx.schoolId,
      kind: kind.key,
      fileName: fileName.slice(0, 200),
      added: createdIds.length,
      updated,
      skipped: bad.length,
      leftOut,
      createdIds,
      updatedRows: updatedRows as unknown as Prisma.InputJsonValue,
      errorReport: bad.map((b) => ({ line: b.line, row: b.row, problems: b.problems })),
      importedById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "imported", recordType: "Import", recordId: batch.id, after: { kind: kind.key, fileName, added: createdIds.length, updated, skipped: bad.length, leftOut } });
  return batch;
}

export async function undoImport(tx: Tx, ctx: SchoolContext, batchId: string) {
  const batch = await tx.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.undoneAt) throw new Error("This import was already undone.");
  const kind = kinds.get(batch.kind);
  if (!kind) throw new Error("This import cannot be undone.");
  const created = batch.createdIds as string[];
  if (created.length) await kind.undo(tx, ctx, created);
  const changed = (batch.updatedRows ?? []) as unknown as UpdatedRow[];
  const putBack = changed.length && kind.revert ? await kind.revert(tx, ctx, changed) : 0;
  await tx.importBatch.update({ where: { id: batchId }, data: { undoneAt: new Date(), undoneById: ctx.userId } });
  // The file it came from opens again, wherever the Undo was pressed, so the corrected rows can be brought in (workflow 15).
  await tx.moveInFile.updateMany({ where: { batchId, status: "imported", archivedAt: null }, data: { status: "open", batchId: null, importFileId: null } });
  await writeAudit(tx, ctx, { action: "import-undone", recordType: "Import", recordId: batchId, after: { kind: batch.kind, archived: created.length, putBack } });
  return { archived: created.length, putBack };
}

/** The bad rows with their problems, to fix and import again. */
export function errorCsv(kind: Pick<ImportKind<unknown>, "columns">, bad: { line: number; row: Record<string, string>; problems: string[] }[]) {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = [...kind.columns.map((c) => c.label), "Problems"].map(q).join(",");
  const lines = bad.map((b) => [...kind.columns.map((c) => b.row[c.key] ?? ""), b.problems.join(" ")].map(q).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}
