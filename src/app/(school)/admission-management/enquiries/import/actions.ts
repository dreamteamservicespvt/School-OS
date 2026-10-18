"use server";

// Import enquiries (02 §2, workflow 15) through the one shared importer:
// upload, match columns, preview every row's problems, import the good rows,
// and undo the whole import later.

import { revalidatePath } from "next/cache";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { requireAction } from "@/lib/current";
import { SHEET_TYPES, saveFile } from "@/lib/files";
import { fileStore } from "@/lib/storage";
import { autoMatch, importKind, previewImport, readSheet, runImport, undoImport, type Decisions } from "@/lib/importer";
import { flash } from "@/lib/flash";
import { AdmissionProblem, file, problemState, str, UUID_RE } from "@/lib/admission/act";
import { FullOnlyError, viewerFor } from "@/lib/admission/access";
import "@/lib/admission/import";

const KIND = "admission-enquiries";
const PURPOSE = "admission-import";

export type Upload = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
export type Checked = { good: number; bad: { line: number; name: string; problems: string[]; choices?: { value: string; label: string }[] }[]; sample: { line: number; name: string; detail: string }[] };
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const kind = () => importKind(KIND)!;

async function team() {
  const { current } = await requireAction("admission-management", "create");
  const v = await withSchool(current.ctx, (tx) => viewerFor(tx, current.ctx, current));
  if (v.change !== "all") throw new FullOnlyError("importing enquiries");
  return current;
}

async function rowsOf(tx: Tx, _ctx: SchoolContext, fileId: string) {
  if (!UUID_RE.test(fileId)) throw new AdmissionProblem("Upload the file again.");
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: PURPOSE } });
  if (!f) throw new AdmissionProblem("Upload the file again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new AdmissionProblem("Upload the file again.");
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
  if (missing.length) throw new AdmissionProblem(`Choose the file's column for: ${missing.map((c) => c.label).join(", ")}.`);
  return match;
}

/** Choices made on screen for rows that asked (decision:<line> = "sibling" or "other-family"). */
function decisionsOf(fd: FormData): Decisions {
  const out: Decisions = {};
  for (const [k, v] of fd.entries()) {
    const m = /^decision:(\d{1,5})$/.exec(k);
    if (m && typeof v === "string" && (v === "sibling" || v === "other-family")) out[Number(m[1])] = v;
  }
  return out;
}

function fail(e: unknown): { ok: false; message: string } {
  return { ok: false, message: problemState(e).message ?? "That did not work." };
}

export async function uploadEnquiryFile(fd: FormData): Promise<Result<Upload>> {
  try {
    const current = await team();
    const f = file(fd, "file");
    if (!f) throw new AdmissionProblem("Choose the CSV or Excel file.");
    return { ok: true, data: await withSchool(current.ctx, async (tx) => {
      const saved = await saveFile(tx, current.ctx, { file: f, purpose: PURPOSE, allowed: SHEET_TYPES });
      const sheet = await rowsOf(tx, current.ctx, saved.id);
      if (sheet.rows.length === 0) throw new AdmissionProblem("The file has headings but no rows.");
      if (sheet.rows.length > 2000) throw new AdmissionProblem(`The file has ${sheet.rows.length} rows. Import at most 2000 at a time.`);
      return { fileId: saved.id, fileName: sheet.fileName, headers: sheet.headers, match: autoMatch(kind().columns, sheet.headers), rows: sheet.rows.length };
    }, { timeout: 60_000 }) };
  } catch (e) {
    return fail(e);
  }
}

export async function checkEnquiryFile(fd: FormData): Promise<Result<Checked>> {
  try {
    const current = await team();
    return { ok: true, data: await withSchool(current.ctx, async (tx) => {
      const sheet = await rowsOf(tx, current.ctx, str(fd, "fileId"));
      const p = await previewImport(tx, current.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers), decisionsOf(fd));
      return {
        good: p.good.length,
        bad: p.bad.slice(0, 200).map((b) => ({ line: b.line, name: b.row.childName || "(no name)", problems: b.problems, ...(b.choices?.length ? { choices: b.choices } : {}) })),
        sample: p.good.slice(0, 10).map((g) => ({ line: g.line, name: g.row.childName, detail: [g.row.parentName, g.row.className].filter(Boolean).join(", ") })),
      };
    }, { timeout: 120_000 }) };
  } catch (e) {
    return fail(e);
  }
}

export async function importEnquiryFile(fd: FormData): Promise<Result<{ batchId: string; added: number; skipped: number }>> {
  try {
    const current = await team();
    const batch = await withSchool(current.ctx, async (tx) => {
      const sheet = await rowsOf(tx, current.ctx, str(fd, "fileId"));
      const p = await previewImport(tx, current.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers), decisionsOf(fd));
      if (p.good.length === 0) throw new AdmissionProblem("No row is ready to import. Fix the problems and upload again.");
      return runImport(tx, current.ctx, kind(), sheet.fileName, p);
    }, { timeout: 300_000 });
    await flash({ message: `${batch.added} enquiries imported${batch.skipped ? `, ${batch.skipped} rows skipped` : ""}.`, link: { href: "/admission-management/enquiries", label: "Enquiries" } });
    revalidatePath("/", "layout");
    return { ok: true, data: { batchId: batch.id, added: batch.added, skipped: batch.skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoEnquiryImport(fd: FormData): Promise<Result<{ archived: number }>> {
  try {
    const current = await team();
    const batchId = str(fd, "batchId");
    if (!UUID_RE.test(batchId)) throw new AdmissionProblem("This import was not found.");
    const n = await withSchool(current.ctx, async (tx) => {
      const b = await tx.importBatch.findFirst({ where: { id: batchId, kind: KIND } });
      if (!b) throw new AdmissionProblem("This import was not found.");
      if (b.undoneAt) throw new AdmissionProblem("This import was already undone.");
      await undoImport(tx, current.ctx, b.id);
      return (b.createdIds as string[]).length;
    }, { timeout: 120_000 });
    await flash({ message: `Import undone. ${n} enquiries archived.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { archived: n } };
  } catch (e) {
    return fail(e);
  }
}
