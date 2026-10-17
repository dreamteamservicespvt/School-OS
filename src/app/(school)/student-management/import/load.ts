// Reading an uploaded import file again on each step of the importer.
import "server-only";

import type { Tx } from "@/lib/db";
import { readSheet } from "@/lib/importer";
import { fileStore } from "@/lib/storage";
import { STUDENT_IMPORT, STUDENT_UPDATE_IMPORT, UDISE_IMPORT } from "@/lib/students/import-kinds";
import { StudentProblem } from "@/lib/students/students";

export const MAX_IMPORT_ROWS = 2000;
export const IMPORT_KINDS = [
  { key: STUDENT_IMPORT, label: "Students (CSV or Excel)", help: "Our template, or your own sheet with similar columns." },
  { key: UDISE_IMPORT, label: "UDISE+ student data", help: "The file downloaded from the UDISE+ portal." },
  { key: STUDENT_UPDATE_IMPORT, label: "Changes to students already here", help: "A sheet with the admission number and the columns to correct, such as phones or addresses. Empty cells are left as they are." },
] as const;

/** The uploaded file's headings and rows. Only files uploaded for an import are read. */
export async function loadSheet(tx: Tx, fileId: string) {
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: "student-import", archivedAt: null } });
  if (!f) throw new StudentProblem("The uploaded file was not found. Upload it again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new StudentProblem("The uploaded file could not be read. Upload it again.");
  const sheet = await readSheet(body, f.fileName);
  if (sheet.headers.length === 0) throw new StudentProblem("The file is empty. Use the template, with the headings in the first row.");
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new StudentProblem(`The file has ${sheet.rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time; split the file.`);
  return { file: f, ...sheet };
}

/** The column match from the page address (m_<column>=<index>), or the automatic one. */
export function matchFrom(params: Record<string, string | undefined>, auto: Record<string, number>, columnKeys: string[], headerCount: number) {
  const touched = columnKeys.some((k) => params[`m_${k}`] !== undefined);
  if (!touched) return auto;
  const out: Record<string, number> = {};
  for (const k of columnKeys) {
    const v = params[`m_${k}`];
    const n = v === undefined || v === "" ? NaN : Number(v);
    if (Number.isInteger(n) && n >= 0 && n < headerCount) out[k] = n;
  }
  return out;
}
