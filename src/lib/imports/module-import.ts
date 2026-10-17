// Imports a module offers on its own pages (workflow 15, steps 5 to 8): old
// dues and past receipts on Fee Management, past expenses on Finance
// Management, the holiday list on Events & Calendar. The person who does that
// work brings the file in from their own module, without Settings: the
// Accountant has Fee and Finance Full but no Settings (05-roles.md). Each
// kind is checked on the server against its own module, as a typed entry
// would be. The steps are the shared importer's (P10): upload, match columns,
// preview every row, import the good rows, undo the whole import.
import "server-only";

import type { Current } from "../current";
import type { SchoolContext, Tx } from "../db";
import type { ModuleKey } from "../modules";
import { can, PermissionDeniedError } from "../permissions";
import { requireAction, getCurrent } from "../current";
import { SHEET_TYPES, saveFile } from "../files";
import { fileStore } from "../storage";
import { errorCsv, importKind, previewImport, readSheet, runImport, undoImport, type ImportKind } from "../importer";
import { matchColumns } from "../move-in/match";
import { evCan, evViewer } from "../events/access";
import "../import-registry";

export class ModuleImportProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleImportProblem";
  }
}

/** The imports each module offers on its own pages, and who may use them there. */
export const MODULE_IMPORTS = {
  "fee-old-dues": { module: "fee-management", purpose: "fee-import", one: "old due", many: "old dues" },
  "fee-past-receipts": { module: "fee-management", purpose: "fee-import", one: "past receipt", many: "past receipts" },
  "finance-past-expenses": { module: "finance-management", purpose: "finance-import", one: "past expense", many: "past expenses" },
  "calendar-holidays": { module: "events-calendar", purpose: "events-import", one: "holiday", many: "holidays" },
} as const satisfies Record<string, { module: ModuleKey; purpose: string; one: string; many: string }>;

export type ModuleImportKey = keyof typeof MODULE_IMPORTS;
export const isModuleImport = (key: string): key is ModuleImportKey => key in MODULE_IMPORTS;

/**
 * Why this person may not bring in (or undo) this kind from its module, in
 * plain words, or null when they may. Full reach in the owning module, as for
 * typing the same records: old dues and receipts need full Fee Management
 * (not "own"), the holiday list needs the School Calendar's full Events level.
 */
export function moduleImportRefusal(current: Pick<Current, "permissions" | "roles"> & { user: { id: string } }, key: string, action: "create" | "archive"): string | null {
  if (!isModuleImport(key)) return "This import is not known.";
  const owner = MODULE_IMPORTS[key].module;
  if (!can(current.permissions, owner, action)) return "Your role cannot bring these records in. Ask your School Admin.";
  if (owner === "fee-management" && current.permissions["fee-management"].change !== "all") return "Your role can see fee status but cannot bring in old dues or receipts. Ask the accountant.";
  if (owner === "finance-management" && current.permissions["finance-management"].change !== "all") return "Your role can see Finance but cannot bring in expenses. Ask the accountant.";
  if (owner === "events-calendar" && !evCan(evViewer(current)).calendar) return "Your role cannot change the School Calendar. Ask the School Admin.";
  return null;
}

/** For server actions: the signed-in person, allowed this kind and action in its own module. Throws PermissionDeniedError or ModuleImportProblem. */
export async function guardModuleImport(key: string, action: "create" | "archive") {
  if (!isModuleImport(key)) throw new ModuleImportProblem("This import is not known.");
  const { current } = await requireAction(MODULE_IMPORTS[key].module, action);
  const why = moduleImportRefusal(current, key, action);
  if (why) throw new ModuleImportProblem(why);
  return { current, key, kind: importKind(key)! };
}

/** For download routes: the person, or a plain-words refusal. */
export async function routeModuleImport(key: string): Promise<{ current: Current; key: ModuleImportKey; kind: ImportKind<unknown> } | Response> {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!isModuleImport(key)) return new Response("This import is not known.", { status: 404 });
  const why = moduleImportRefusal(current, key, "create");
  if (why) return new Response(why, { status: 403 });
  return { current, key, kind: importKind(key)! };
}

export type Uploaded = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
export type CheckedFile = { good: number; bad: { line: number; name: string; problems: string[] }[]; sample: { line: number; text: string }[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 3000;

async function sheetOf(tx: Tx, key: ModuleImportKey, fileId: string) {
  if (!UUID.test(fileId)) throw new ModuleImportProblem("Upload the file again.");
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: MODULE_IMPORTS[key].purpose, archivedAt: null } });
  if (!f) throw new ModuleImportProblem("Upload the file again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new ModuleImportProblem("Upload the file again.");
  return { ...(await readSheet(body, f.fileName)), fileName: f.fileName };
}

/** Saves the file and matches its headings to the import's columns (also headings written another way). */
export async function uploadModuleFile(tx: Tx, ctx: SchoolContext, key: ModuleImportKey, file: File): Promise<Uploaded> {
  const head = Buffer.from(await file.slice(0, 4).arrayBuffer());
  if (head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) throw new ModuleImportProblem("This is an old Excel file (.xls). Open it in Excel and use Save As, Excel Workbook (.xlsx) or CSV, then upload that.");
  const saved = await saveFile(tx, ctx, { file, purpose: MODULE_IMPORTS[key].purpose, allowed: SHEET_TYPES });
  const sheet = await sheetOf(tx, key, saved.id);
  if (sheet.rows.length === 0) throw new ModuleImportProblem("The file has headings but no rows. Put the headings in the first row and the records below them.");
  if (sheet.rows.length > MAX_ROWS) throw new ModuleImportProblem(`The file has ${sheet.rows.length} rows. Import at most ${MAX_ROWS} at a time: split it into two files.`);
  const kind = importKind(key)!;
  const found = matchColumns(key, kind.columns, sheet.headers, sheet.rows.slice(0, 60));
  const match = Object.fromEntries(Object.entries(found).filter(([, cols]) => cols.length).map(([k, cols]) => [k, cols[0]]));
  return { fileId: saved.id, fileName: sheet.fileName, headers: sheet.headers, match, rows: sheet.rows.length };
}

/** The column match chosen on screen (col:<key> = the file's column number). */
export function matchOf(fd: FormData, kind: ImportKind<unknown>, width: number) {
  const match: Record<string, number> = {};
  for (const c of kind.columns) {
    const v = fd.get(`col:${c.key}`);
    if (typeof v === "string" && v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < width) match[c.key] = Number(v);
  }
  const missing = kind.columns.filter((c) => c.required && match[c.key] === undefined);
  if (missing.length) throw new ModuleImportProblem(`Choose the file's column for: ${missing.map((c) => c.label).join(", ")}.`);
  return match;
}

const rowText = (key: ModuleImportKey, row: Record<string, string>) =>
  key === "calendar-holidays" ? [row.name, row.from].filter(Boolean).join(", ")
    : key === "finance-past-expenses" ? [row.date, row.head, row.amount && `₹${row.amount}`].filter(Boolean).join(" · ")
      : [row.admissionNo, row.oldReceiptNo, row.feeHead, row.amount && `₹${row.amount}`].filter(Boolean).join(" · ");

/** Every row checked exactly as the import will check it. Saves nothing. */
export async function checkModuleFile(tx: Tx, ctx: SchoolContext, key: ModuleImportKey, fileId: string, fd: FormData): Promise<CheckedFile> {
  const kind = importKind(key)!;
  const sheet = await sheetOf(tx, key, fileId);
  const p = await previewImport(tx, ctx, kind, sheet.rows, matchOf(fd, kind, sheet.headers.length));
  return {
    good: p.good.length,
    bad: p.bad.slice(0, 200).map((b) => ({ line: b.line, name: rowText(key, b.row) || "(empty row)", problems: b.problems })),
    sample: p.good.slice(0, 10).map((g) => ({ line: g.line, text: rowText(key, g.row) })),
  };
}

/** Imports the good rows; rows with problems are kept with the import to download. */
export async function runModuleFile(tx: Tx, ctx: SchoolContext, key: ModuleImportKey, fileId: string, fd: FormData) {
  const kind = importKind(key)!;
  const sheet = await sheetOf(tx, key, fileId);
  const p = await previewImport(tx, ctx, kind, sheet.rows, matchOf(fd, kind, sheet.headers.length));
  if (p.good.length === 0) throw new ModuleImportProblem("No row is ready to import. Fix the problems and upload the file again.");
  return runImport(tx, ctx, kind, sheet.fileName, p);
}

/** Undoes one import of this kind as a whole. */
export async function undoModuleImport(tx: Tx, ctx: SchoolContext, key: ModuleImportKey, batchId: string) {
  if (!UUID.test(batchId)) throw new ModuleImportProblem("This import was not found.");
  const b = await tx.importBatch.findFirst({ where: { id: batchId, kind: key } });
  if (!b) throw new ModuleImportProblem("This import was not found.");
  if (b.undoneAt) throw new ModuleImportProblem("This import was already undone.");
  try {
    return await undoImport(tx, ctx, b.id);
  } catch (e) {
    if (e instanceof Error && !(e instanceof PermissionDeniedError) && e.constructor === Error) throw new ModuleImportProblem(e.message);
    throw e;
  }
}

/** The rows an import of this kind left out, with their problems, as a CSV to fix and import again. */
export async function moduleErrorsCsv(tx: Tx, key: ModuleImportKey, batchId: string) {
  if (!UUID.test(batchId)) return null;
  const b = await tx.importBatch.findFirst({ where: { id: batchId, kind: key } });
  if (!b) return null;
  return errorCsv(importKind(key)!, (b.errorReport ?? []) as { line: number; row: Record<string, string>; problems: string[] }[]);
}

/** The latest imports of these kinds, for the page's history. */
export async function moduleImportHistory(tx: Tx, keys: ModuleImportKey[]) {
  return tx.importBatch.findMany({ where: { kind: { in: keys } }, orderBy: { createdAt: "desc" }, take: 15 });
}
