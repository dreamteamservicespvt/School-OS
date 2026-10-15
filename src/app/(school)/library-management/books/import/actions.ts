"use server";

// Import the catalogue (13 Books, P10) through the one shared importer:
// upload, match columns, preview every row's problems, import the good rows,
// and undo the whole import later. Only the librarian (Books full) imports.

import { revalidatePath } from "next/cache";
import type { Tx } from "@/lib/db";
import { SHEET_TYPES, saveFile } from "@/lib/files";
import { fileStore } from "@/lib/storage";
import { autoMatch, importKind, previewImport, readSheet, runImport, undoImport } from "@/lib/importer";
import { flash } from "@/lib/flash";
import { inLibrary, need, problemState, str, UUID_RE, LibraryProblem } from "@/lib/library/act";
import { CATALOGUE_IMPORT } from "@/lib/library/import";
import { BASE } from "@/lib/library/words";

const PURPOSE = "library-import";

export type Upload = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
export type Checked = { good: number; bad: { line: number; name: string; problems: string[] }[]; sample: { line: number; name: string; detail: string }[] };
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const kind = () => importKind(CATALOGUE_IMPORT)!;
type Row = { title: string; authors: string[]; copies: number; isbn: string | null };

async function rowsOf(tx: Tx, fileId: string) {
  if (!UUID_RE.test(fileId)) throw new LibraryProblem("Upload the file again.");
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: PURPOSE } });
  if (!f) throw new LibraryProblem("Upload the file again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new LibraryProblem("Upload the file again.");
  const sheet = await readSheet(body, f.fileName);
  return { ...sheet, fileName: f.fileName };
}

function matchOf(fd: FormData, headers: string[]) {
  const match: Record<string, number> = {};
  for (const c of kind().columns) {
    const v = str(fd, `col:${c.key}`);
    if (v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < headers.length) match[c.key] = Number(v);
  }
  const missing = kind().columns.filter((c) => c.required && match[c.key] === undefined);
  if (missing.length) throw new LibraryProblem(`Choose the file's column for: ${missing.map((c) => c.label).join(", ")}.`);
  return match;
}

const fail = (e: unknown): { ok: false; message: string } => ({ ok: false, message: problemState(e).message ?? "That did not work." });

function uploaded(fd: FormData) {
  for (const v of fd.getAll("file")) if (v instanceof File && v.size > 0) return v;
  return null;
}

export async function uploadCatalogueFile(fd: FormData): Promise<Result<Upload>> {
  try {
    return { ok: true, data: await inLibrary("create", async (w) => {
      need(w.can.catalogue, "import books");
      const f = uploaded(fd);
      if (!f) throw new LibraryProblem("Choose the CSV or Excel file.");
      const saved = await saveFile(w.tx, w.ctx, { file: f, purpose: PURPOSE, allowed: SHEET_TYPES });
      const sheet = await rowsOf(w.tx, saved.id);
      if (sheet.rows.length === 0) throw new LibraryProblem("The file has headings but no rows.");
      if (sheet.rows.length > 3000) throw new LibraryProblem(`The file has ${sheet.rows.length} rows. Import at most 3000 at a time.`);
      return { fileId: saved.id, fileName: sheet.fileName, headers: sheet.headers, match: autoMatch(kind().columns, sheet.headers), rows: sheet.rows.length };
    }) };
  } catch (e) {
    return fail(e);
  }
}

export async function checkCatalogueFile(fd: FormData): Promise<Result<Checked>> {
  try {
    return { ok: true, data: await inLibrary("create", async (w) => {
      need(w.can.catalogue, "import books");
      const sheet = await rowsOf(w.tx, str(fd, "fileId"));
      const p = await previewImport(w.tx, w.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers));
      return {
        good: p.good.length,
        bad: p.bad.slice(0, 200).map((b) => ({ line: b.line, name: b.row.title || "(no title)", problems: b.problems })),
        sample: p.good.slice(0, 10).map((g) => { const v = g.value as Row; return { line: g.line, name: v.title, detail: [v.authors.join(", "), `${v.copies} cop${v.copies === 1 ? "y" : "ies"}`].filter(Boolean).join(" · ") }; }),
      };
    }, 180_000) };
  } catch (e) {
    return fail(e);
  }
}

export async function importCatalogueFile(fd: FormData): Promise<Result<{ batchId: string; added: number; skipped: number }>> {
  try {
    const batch = await inLibrary("create", async (w) => {
      need(w.can.catalogue, "import books");
      const sheet = await rowsOf(w.tx, str(fd, "fileId"));
      const p = await previewImport(w.tx, w.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers));
      if (p.good.length === 0) throw new LibraryProblem("No row is ready to import. Fix the problems and upload again.");
      return runImport(w.tx, w.ctx, kind(), sheet.fileName, p);
    }, 300_000);
    await flash({ message: `${batch.added} book${batch.added === 1 ? "" : "s"} imported${batch.skipped ? `, ${batch.skipped} rows skipped` : ""}.`, link: { href: `${BASE}/books`, label: "Books" } });
    revalidatePath("/", "layout");
    return { ok: true, data: { batchId: batch.id, added: batch.added, skipped: batch.skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoCatalogueImport(fd: FormData): Promise<Result<{ archived: number }>> {
  try {
    const batchId = str(fd, "batchId");
    if (!UUID_RE.test(batchId)) throw new LibraryProblem("This import was not found.");
    const n = await inLibrary("archive", async (w) => {
      need(w.can.catalogue, "undo a book import");
      const b = await w.tx.importBatch.findFirst({ where: { id: batchId, kind: CATALOGUE_IMPORT } });
      if (!b) throw new LibraryProblem("This import was not found.");
      if (b.undoneAt) throw new LibraryProblem("This import was already undone.");
      const ids = b.createdIds as string[];
      const out = await w.tx.bookCopy.count({ where: { bookId: { in: ids }, status: { in: ["ISSUED", "RESERVED"] } } });
      if (out) throw new LibraryProblem(`${out} cop${out === 1 ? "y of these books is" : "ies of these books are"} out with members. Return them first, then undo the import.`);
      await undoImport(w.tx, w.ctx, b.id);
      return ids.length;
    });
    await flash({ message: `Import undone. ${n} book${n === 1 ? "" : "s"} archived and their copies withdrawn.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { archived: n } };
  } catch (e) {
    return fail(e);
  }
}
