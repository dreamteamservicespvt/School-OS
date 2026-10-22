// Running the shared importer (00-global.md P10) in the background: the
// person uploads, matches columns and sees the preview on screen; the import
// itself runs as a job, imports only the good rows, keeps the history for
// Undo, and tells the person when it is done.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineJob, enqueue } from "../jobs";
import { importKind, previewImport, readSheet, runImport } from "../importer";
import { fileStore } from "../storage";
import { notify } from "../notifications";
import "../import-registry";

export type ImportJob = {
  kind: string; fileId: string; match: Record<string, number>;
  /** Each row's line in the person's own file (Switching to School OS cleans the rows first), so problems name the rows they see. */
  lines?: number[];
  /** The choices made for rows that may already be on record, by line. */
  decisions?: Record<number, string>;
  /** The page the person brought the file in from, for the notification when it is done. */
  link?: string;
  /** Rows the check left out on purpose before handing the rows over ("No old dues"), counted with the import. */
  left?: { reason: string; count: number }[];
};

export async function readUploaded(tx: Tx, fileId: string) {
  const file = await tx.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.purpose !== "import") return null;
  const body = await fileStore().get(file.storageKey);
  if (!body) return null;
  return { file, sheet: await readSheet(body, file.fileName) };
}

/** Queues the import. The same file and matching queue it only once. */
export async function startImport(tx: Tx, ctx: SchoolContext, job: ImportJob) {
  const kind = importKind(job.kind);
  if (!kind) throw new Error("This import is not known.");
  const key = `import:${job.fileId}:${JSON.stringify(job.match)}`;
  return enqueue(tx, ctx, "import-run", key.slice(0, 300), job);
}

export async function runImportJob(tx: Tx, ctx: SchoolContext, payload: ImportJob) {
  const kind = importKind(payload.kind);
  if (!kind) throw new Error(`Import kind ${payload.kind} is not registered`);
  // Safe to run twice: an import of this file already saved is not run again.
  const done = await tx.importBatch.findFirst({ where: { kind: kind.key, fileName: { endsWith: `#${payload.fileId}` } } });
  if (done) return { batchId: done.id, repeated: true };
  const uploaded = await readUploaded(tx, payload.fileId);
  if (!uploaded) throw new Error("The uploaded file is missing");
  const preview = await previewImport(tx, ctx, kind, uploaded.sheet.rows, payload.match, payload.decisions ?? {}, payload.lines);
  const left = (payload.left ?? []).filter((l) => typeof l?.reason === "string" && Number.isInteger(l?.count) && l.count > 0).slice(0, 20);
  const batch = await runImport(tx, ctx, kind, `${uploaded.file.fileName.slice(0, 150)}#${payload.fileId}`, preview, { left });
  if (ctx.userId) {
    await notify(tx, { schoolId: ctx.schoolId, userId: null }, {
      to: ctx.userId,
      type: "import",
      text: `${kind.label} import finished: ${batch.added} added, ${batch.updated} updated, ${batch.skipped} with problems${batch.skipped ? " (download them from Import history)" : ""}.`,
      link: payload.link && /^\/[a-z0-9/_-]*$/i.test(payload.link) ? payload.link : "/settings/data-security/imports",
    });
  }
  return { batchId: batch.id, added: batch.added, updated: batch.updated, skipped: batch.skipped };
}

defineJob("import-run", "An import", (tx, ctx, payload) => runImportJob(tx, ctx, payload as unknown as ImportJob), { ownTransaction: true });

/** The file name as the person uploaded it (the stored name carries the upload's id for repeats). */
export function shownFileName(stored: string) {
  return stored.replace(/#[0-9a-f-]{36}$/i, "");
}

/** The matching chosen on screen, read from the page address (col_<key>=<column number>). */
export function matchFromParams(sp: Record<string, string | string[] | undefined>, keys: string[], width: number) {
  const match: Record<string, number> = {};
  for (const k of keys) {
    const raw = sp[`col_${k}`];
    const v = (Array.isArray(raw) ? raw[0] : raw) ?? "";
    const n = Number.parseInt(v, 10);
    if (v !== "" && Number.isInteger(n) && n >= 0 && n < width) match[k] = n;
  }
  return match;
}
