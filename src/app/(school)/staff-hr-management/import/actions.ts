"use server";

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/current";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { SHEET_TYPES, saveFile } from "@/lib/files";
import { fileStore } from "@/lib/storage";
import { autoMatch, importKind, previewImport, readSheet, runImport, undoImport } from "@/lib/importer";
import { flash } from "@/lib/flash";
import { HrOnlyError } from "@/lib/staff/access";
import { problemState, FieldProblem, file, str, UUID_RE } from "@/lib/staff/act";
import "@/lib/staff/import";

export type Upload = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
export type Checked = { good: number; bad: { line: number; name: string; problems: string[] }[]; sample: { line: number; name: string; designation: string; login: boolean }[] };
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const kind = () => importKind("staff")!;

async function hr() {
  const { current, reach } = await requireAction("staff-hr-management", "create");
  if (reach !== "all") throw new HrOnlyError("importing staff");
  return current;
}

async function rowsOf(tx: Tx, ctx: SchoolContext, fileId: string) {
  if (!UUID_RE.test(fileId)) throw new FieldProblem("Upload the file again.");
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: "staff-import" } });
  if (!f) throw new FieldProblem("Upload the file again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new FieldProblem("Upload the file again.");
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
  if (missing.length) throw new FieldProblem(`Choose the file's column for: ${missing.map((c) => c.label).join(", ")}.`);
  return match;
}

function fail(e: unknown): { ok: false; message: string } {
  const s = problemState(e);
  return { ok: false, message: s.message ?? "That did not work." };
}

/** Step 1 and 2: upload, read the headings and guess the matching columns. */
export async function uploadStaffFile(fd: FormData): Promise<Result<Upload>> {
  try {
    const current = await hr();
    const f = file(fd, "file");
    if (!f) throw new FieldProblem("Choose the CSV or Excel file.");
    return { ok: true, data: await withSchool(current.ctx, async (tx) => {
      const saved = await saveFile(tx, current.ctx, { file: f, purpose: "staff-import", allowed: SHEET_TYPES });
      const sheet = await rowsOf(tx, current.ctx, saved.id);
      if (sheet.rows.length === 0) throw new FieldProblem("The file has headings but no rows.");
      if (sheet.rows.length > 2000) throw new FieldProblem(`The file has ${sheet.rows.length} rows. Import at most 2000 at a time.`);
      return { fileId: saved.id, fileName: sheet.fileName, headers: sheet.headers, match: autoMatch(kind().columns, sheet.headers), rows: sheet.rows.length };
    }, { timeout: 60_000 }) };
  } catch (e) {
    return fail(e);
  }
}

/** Step 3 and 4: check every row with the chosen columns. Nothing is saved. */
export async function checkStaffFile(fd: FormData): Promise<Result<Checked>> {
  try {
    const current = await hr();
    return { ok: true, data: await withSchool(current.ctx, async (tx) => {
      const sheet = await rowsOf(tx, current.ctx, str(fd, "fileId"));
      const p = await previewImport(tx, current.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers));
      return {
        good: p.good.length,
        bad: p.bad.slice(0, 200).map((b) => ({ line: b.line, name: b.row.fullName || "(no name)", problems: b.problems })),
        sample: p.good.slice(0, 10).map((g) => ({ line: g.line, name: g.row.fullName, designation: g.row.designation, login: /^(y|yes|true|1)$/i.test(g.row.createLogin ?? "") })),
      };
    }, { timeout: 120_000 }) };
  } catch (e) {
    return fail(e);
  }
}

/** Step 5: import the good rows. Rows with problems are skipped and can be downloaded. */
export async function importStaffFile(fd: FormData): Promise<Result<{ batchId: string; added: number; skipped: number }>> {
  try {
    const current = await hr();
    const batch = await withSchool(current.ctx, async (tx) => {
      const sheet = await rowsOf(tx, current.ctx, str(fd, "fileId"));
      const p = await previewImport(tx, current.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers));
      if (p.good.length === 0) throw new FieldProblem("No row is ready to import. Fix the problems and upload again.");
      return runImport(tx, current.ctx, kind(), sheet.fileName, p);
    }, { timeout: 300_000 });
    await flash({ message: `${batch.added} staff imported${batch.skipped ? `, ${batch.skipped} rows skipped` : ""}.`, link: { href: "/staff-hr-management", label: "Staff List" } });
    revalidatePath("/", "layout");
    return { ok: true, data: { batchId: batch.id, added: batch.added, skipped: batch.skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoStaffImport(fd: FormData): Promise<Result<{ archived: number }>> {
  try {
    const current = await hr();
    const batchId = str(fd, "batchId");
    if (!UUID_RE.test(batchId)) throw new FieldProblem("This import was not found.");
    const n = await withSchool(current.ctx, async (tx) => {
      const b = await tx.importBatch.findFirst({ where: { id: batchId, kind: "staff" } });
      if (!b) throw new FieldProblem("This import was not found.");
      if (b.undoneAt) throw new FieldProblem("This import was already undone.");
      await undoImport(tx, current.ctx, b.id);
      return (b.createdIds as string[]).length;
    }, { timeout: 120_000 });
    await flash({ message: `Import undone. ${n} staff archived.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { archived: n } };
  } catch (e) {
    return fail(e);
  }
}
