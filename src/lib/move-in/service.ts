// Switching to School OS (02-workflows.md, workflow 15): the files a school
// brings, worked on one sheet at a time and handed to the shared importer
// (P10) once they are clean. Every read and write goes through the school's
// own transaction (withSchool), so one school never sees another's files.
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { OPEN_LINK } from "../students/guardian-access";
import { writeAudit } from "../audit";
import { importKind, importKinds, previewImport, type ImportKind } from "../importer";
import { startImport } from "../data-security/imports";
import { currentYear } from "../academic/years";
import { addClass, addSection } from "../academic/structure";
import { ensureHrDefaults } from "../staff/settings";
import { fileStore } from "../storage";
import type { ModuleKey } from "../modules";
import type { PermissionMap } from "../permissions";
import { can } from "../permissions";
import "../import-registry";
import { STUDENT_IMPORT, studentImport } from "../students/import";
import { MAX_ROWS, readWorkbook, ReadProblem, type Sheet } from "./read";
import { findHeaderRow, guessKind, matchColumns, type ColumnMatch } from "./match";
import { classKey, plain, splitClassSection } from "./tidy";
import { cleanCsv, prepareSheet, rowsForImport, type Choices, type Prepared } from "./prepare";
import type { Lookups } from "./lookups";

export class MoveInProblem extends Error {
  constructor(message: string, public field?: string) { super(message); }
}

// ── What can be brought in ─────────────────────────────────────────────────

export type MoveInKind = { key: string; label: string; module: ModuleKey; order: number; about: string };

/** Imports in the order a school brings them in (workflow 15, steps 3 to 8). Others follow when their modules add them. */
const KNOWN: Record<string, Omit<MoveInKind, "key" | "label">> = {
  departments: { module: "settings", order: 1, about: "Departments such as Science and Accounts, with their heads. Bring these first if your staff list has departments." },
  staff: { module: "staff-hr-management", order: 2, about: "Teachers and other staff, with phone, designation and joining date. Logins can be made for them." },
  students: { module: "student-management", order: 3, about: "Students with their class, section, roll number and admission number, and their parents. Old admission numbers are kept." },
};
const HIDDEN = new Set(["students-udise"]); // UDISE+ files are read by the Students import.

export function moveInKinds(): MoveInKind[] {
  return importKinds()
    .filter((k) => !HIDDEN.has(k.key))
    .map((k) => ({ key: k.key, label: k.label, ...(KNOWN[k.key] ?? { module: "settings" as ModuleKey, order: 50, about: `${k.label} from your old software or a spreadsheet.` }) }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function kindInfo(key: string) {
  return moveInKinds().find((k) => k.key === key) ?? null;
}

export const canBring = (permissions: PermissionMap, kindKey: string) => {
  const k = kindInfo(kindKey);
  return Boolean(k && can(permissions, k.module, "create"));
};
export const canUndo = (permissions: PermissionMap, kindKey: string) => {
  const k = kindInfo(kindKey);
  return Boolean(k && can(permissions, k.module, "archive"));
};

function kindOf(key: string): ImportKind<unknown> {
  const k = importKind(key);
  if (!k || HIDDEN.has(key)) throw new MoveInProblem("This kind of record cannot be brought in yet.", "kind");
  // A fresh Students import each time: the registered one remembers sections it looked up, so a class added since would still read as missing.
  if (key === STUDENT_IMPORT) return studentImport(STUDENT_IMPORT, { sectionId: null, applyFeePlan: true }) as ImportKind<unknown>;
  return k;
}

// ── Files ──────────────────────────────────────────────────────────────────

type SheetInfo = { name: string; rows: number };

async function readStored(tx: Tx, fileId: string): Promise<Sheet[]> {
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: "move-in", archivedAt: null } });
  if (!f) throw new MoveInProblem("The uploaded file was not found. Upload it again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new MoveInProblem("The uploaded file could not be read. Upload it again.");
  try {
    return await readWorkbook(body, f.fileName);
  } catch (e) {
    if (e instanceof ReadProblem) throw new MoveInProblem(e.message);
    throw e;
  }
}

/** The first choices for a sheet: its heading row, what it holds and how its columns match. */
export function firstChoices(sheet: Sheet, kindKey?: string | null) {
  const kinds = moveInKinds().map((k) => ({ key: k.key, columns: importKind(k.key)!.columns }));
  const header = findHeaderRow(sheet.rows, kinds);
  const headers = sheet.rows[header] ?? [];
  const guessed = kindKey ?? guessKind(headers, kinds)?.key ?? null;
  const kind = guessed ? importKind(guessed) : null;
  const match = kind ? matchColumns(kind.key, kind.columns, headers, sheet.rows.slice(header + 1, header + 61)) : {};
  return { headerRow: header + 1, kind: guessed, match };
}

/**
 * Saves an upload and makes one Move-in File for each sheet that holds
 * records: a workbook with a Students sheet and a Staff sheet becomes two.
 * The person may only bring in what their role can add.
 */
export async function addUpload(tx: Tx, ctx: SchoolContext, permissions: PermissionMap, upload: { fileId: string; fileName: string; kind?: string | null }) {
  const sheets = await readStored(tx, upload.fileId);
  const info: SheetInfo[] = sheets.map((s) => ({ name: s.name, rows: Math.max(0, s.rows.length - 1) }));
  const usable = sheets.map((s, i) => ({ s, i })).filter(({ s }) => s.rows.filter((r) => r.some((c) => c)).length >= 2);
  if (!usable.length) throw new MoveInProblem("This file has no rows to bring in. Put the headings in one row and the records below them.");
  const allowed = new Set(moveInKinds().filter((k) => canBring(permissions, k.key)).map((k) => k.key));
  if (!allowed.size) throw new MoveInProblem("Your role cannot add any of these records. Ask your School Admin.");
  if (upload.kind && !allowed.has(upload.kind)) throw new MoveInProblem("Your role cannot add these records.", "kind");

  const made: string[] = [];
  const picks = usable.map(({ s, i }) => ({ i, first: firstChoices(s, upload.kind || null) }));
  const recognised = picks.filter((p) => p.first.kind && allowed.has(p.first.kind));
  // Sheets that are not recognised are left out, unless none is: then the first is opened to choose by hand.
  const chosen = recognised.length ? (upload.kind ? recognised.slice(0, 1) : recognised) : picks.slice(0, 1);
  for (const p of chosen) {
    if (sheets[p.i].rows.length > MAX_ROWS + 1) throw new MoveInProblem(`The sheet "${sheets[p.i].name}" has ${sheets[p.i].rows.length - 1} rows. Bring in at most ${MAX_ROWS} at a time: split it into two files.`);
    const kind = p.first.kind && allowed.has(p.first.kind) ? p.first.kind : [...allowed][0];
    const match = p.first.kind === kind ? p.first.match : firstChoices(sheets[p.i], kind).match;
    const row = await tx.moveInFile.create({
      data: {
        schoolId: ctx.schoolId, fileId: upload.fileId, fileName: upload.fileName.slice(0, 200), sheets: info, sheetIndex: p.i,
        headerRow: p.first.headerRow, kind, columnMatch: match, createdById: ctx.userId,
      },
    });
    made.push(row.id);
  }
  await writeAudit(tx, ctx, { action: "uploaded", recordType: "Move-in File", recordId: made[0] ?? null, after: { fileName: upload.fileName, sheets: chosen.map((p) => sheets[p.i].name) } });
  return made;
}

export async function getFile(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return tx.moveInFile.findFirst({ where: { id, archivedAt: null } });
}

export async function schoolLookups(tx: Tx, ctx: SchoolContext): Promise<Lookups & { yearId: string | null; campusId: string | null }> {
  const year = await currentYear(tx, ctx);
  const sections = year ? await tx.section.findMany({
    where: { academicYearId: year.id, archivedAt: null, schoolClass: { archivedAt: null } },
    include: { schoolClass: { select: { name: true, sortOrder: true } } },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  }) : [];
  const [designations, departments] = await Promise.all([
    tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return {
    yearId: year?.id ?? null,
    campusId: year?.campusId ?? null,
    sections: sections.map((s) => ({ id: s.id, className: s.schoolClass.name, sectionName: s.name, key: classKey(s.schoolClass.name) })),
    designations: designations.map((d) => d.name),
    departments: departments.map((d) => d.name),
  };
}

export const choicesOf = (f: { headerRow: number; columnMatch: unknown; valueMatch: unknown; rowFixes: unknown; leftOut: unknown; tidy: boolean }): Choices => ({
  headerRow: f.headerRow,
  columnMatch: (f.columnMatch ?? {}) as ColumnMatch,
  valueMatch: (f.valueMatch ?? {}) as Choices["valueMatch"],
  rowFixes: (f.rowFixes ?? {}) as Choices["rowFixes"],
  leftOut: (f.leftOut ?? []) as number[],
  tidy: f.tidy,
});

export type Checked = {
  ready: Prepared["rows"];
  problems: { line: number; values: Record<string, string>; problems: string[] }[];
};

/** Everything a file's page shows: the sheet, the cleaned rows and, when asked, each row's check. */
export async function workOn(tx: Tx, ctx: SchoolContext, id: string, opts: { check: boolean }) {
  const file = await getFile(tx, id);
  if (!file) throw new MoveInProblem("This file was not found. It may have been removed.");
  const sheets = await readStored(tx, file.fileId);
  const sheet = sheets[file.sheetIndex] ?? sheets[0];
  const kind = kindOf(file.kind);
  if (kind.key === "staff") await ensureHrDefaults(tx, ctx);
  const lookups = await schoolLookups(tx, ctx);
  const choices = choicesOf(file);
  const prepared = prepareSheet(kind.key, kind.columns, sheet.rows, choices, lookups);
  let checked: Checked | null = null;
  if (opts.check) checked = await checkRows(tx, ctx, kind, prepared);
  return { file, sheets, sheet, kind, lookups, choices, prepared, checked };
}

/** Each row through the import's own checks, exactly as the import will run them. Saves nothing. */
export async function checkRows(tx: Tx, ctx: SchoolContext, kind: ImportKind<unknown>, prepared: Prepared): Promise<Checked> {
  const identity = Object.fromEntries(kind.columns.map((c, i) => [c.key, i]));
  const preview = await previewImport(tx, ctx, kind, rowsForImport(kind.columns, prepared.rows), identity);
  const lineOf = (previewLine: number) => prepared.rows[previewLine - 2];
  return {
    ready: preview.good.map((g) => lineOf(g.line)),
    problems: preview.bad.map((b) => ({ line: lineOf(b.line).line, values: lineOf(b.line).values, problems: b.problems })),
  };
}

// ── Changes made on screen ─────────────────────────────────────────────────

async function openFile(tx: Tx, id: string) {
  const f = await getFile(tx, id);
  if (!f) throw new MoveInProblem("This file was not found. It may have been removed.");
  if (f.status !== "open") throw new MoveInProblem(f.status === "imported" ? "This file is already imported. Undo the import to change it." : "This file is being imported. Wait for it to finish.");
  return f;
}

export async function chooseSheet(tx: Tx, ctx: SchoolContext, id: string, input: { sheetIndex: number; headerRow: number; kind: string }, permissions: PermissionMap) {
  const f = await openFile(tx, id);
  const sheets = await readStored(tx, f.fileId);
  if (!Number.isInteger(input.sheetIndex) || !sheets[input.sheetIndex]) throw new MoveInProblem("Choose a sheet of the file.", "sheetIndex");
  kindOf(input.kind);
  if (!canBring(permissions, input.kind)) throw new MoveInProblem("Your role cannot add these records.", "kind");
  const sheet = sheets[input.sheetIndex];
  const sheetChanged = input.sheetIndex !== f.sheetIndex;
  const kindChanged = input.kind !== f.kind;
  const first = firstChoices(sheet, input.kind);
  const headerRow = sheetChanged ? first.headerRow : input.headerRow;
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > Math.min(sheet.rows.length, 30)) throw new MoveInProblem("Choose the row that holds the headings.", "headerRow");
  const headerChanged = headerRow !== f.headerRow;
  const kind = importKind(input.kind)!;
  const match = sheetChanged || kindChanged || headerChanged
    ? matchColumns(kind.key, kind.columns, sheet.rows[headerRow - 1] ?? [], sheet.rows.slice(headerRow, headerRow + 60))
    : (f.columnMatch as ColumnMatch);
  await tx.moveInFile.update({
    where: { id },
    data: {
      sheetIndex: input.sheetIndex, headerRow, kind: input.kind, columnMatch: match,
      ...(sheetChanged || kindChanged || headerChanged ? { valueMatch: {}, rowFixes: {}, leftOut: [] } : {}),
    },
  });
}

/** The column match chosen on screen: column key → file column numbers. */
export async function setColumns(tx: Tx, id: string, match: ColumnMatch) {
  const f = await openFile(tx, id);
  const sheets = await readStored(tx, f.fileId);
  const width = (sheets[f.sheetIndex]?.rows[f.headerRow - 1] ?? []).length;
  const kind = kindOf(f.kind);
  const clean: ColumnMatch = {};
  for (const c of kind.columns) {
    const cols = (match[c.key] ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < width);
    if (cols.length) clean[c.key] = [...new Set(cols)].slice(0, 3);
  }
  await tx.moveInFile.update({ where: { id }, data: { columnMatch: clean } });
}

export async function setTidy(tx: Tx, id: string, on: boolean) {
  await openFile(tx, id);
  await tx.moveInFile.update({ where: { id }, data: { tidy: on } });
}

/** A word in the file matched to a School OS value; "" leaves it unmatched on purpose. */
export async function setValues(tx: Tx, id: string, column: string, pairs: Record<string, string>) {
  const f = await openFile(tx, id);
  if (!["class", "designation", "department"].includes(column)) throw new MoveInProblem("This column cannot be matched.");
  const all = (f.valueMatch ?? {}) as Record<string, Record<string, string>>;
  const now = { ...(all[column] ?? {}) };
  for (const [word, value] of Object.entries(pairs)) {
    if (word.length > 300 || value.length > 300) continue;
    if (value === "__keep") delete now[word];
    else now[word] = value;
  }
  await tx.moveInFile.update({ where: { id }, data: { valueMatch: { ...all, [column]: now } } });
}

/** A row fixed on screen. Values equal to the file's own are not kept. */
export async function fixRow(tx: Tx, id: string, line: number, values: Record<string, string>) {
  const f = await openFile(tx, id);
  const kind = kindOf(f.kind);
  if (!Number.isInteger(line) || line < 2) throw new MoveInProblem("This row was not found.");
  const fixes = { ...((f.rowFixes ?? {}) as Record<string, Record<string, string>>) };
  const row: Record<string, string> = {};
  for (const c of kind.columns) if (values[c.key] !== undefined) row[c.key] = values[c.key].slice(0, 500);
  fixes[String(line)] = row;
  await tx.moveInFile.update({ where: { id }, data: { rowFixes: fixes } });
}

export async function undoFix(tx: Tx, id: string, line: number) {
  const f = await openFile(tx, id);
  const fixes = { ...((f.rowFixes ?? {}) as Record<string, Record<string, string>>) };
  delete fixes[String(line)];
  await tx.moveInFile.update({ where: { id }, data: { rowFixes: fixes } });
}

export async function leaveOut(tx: Tx, id: string, lines: number[], out: boolean) {
  const f = await openFile(tx, id);
  const set = new Set((f.leftOut ?? []) as number[]);
  for (const l of lines) if (Number.isInteger(l) && l >= 2) { if (out) set.add(l); else set.delete(l); }
  await tx.moveInFile.update({ where: { id }, data: { leftOut: [...set].sort((a, b) => a - b) } });
}

/**
 * Adds the classes and sections a file names that this year does not have yet
 * ("5th C" → Class 5 C), through Academic Management's own rules. Class names
 * follow the school's style: "Class 7" when its classes are written that way.
 */
export async function addMissingClasses(tx: Tx, ctx: SchoolContext, id: string, words: string[]) {
  await openFile(tx, id);
  const year = await currentYear(tx, ctx);
  if (!year) throw new MoveInProblem("Set up this academic year first in Academic Management.");
  const lookups = await schoolLookups(tx, ctx);
  const style = lookups.sections.some((s) => /^class\s/i.test(s.className)) || lookups.sections.length === 0 ? "Class " : "";
  const pairs: Record<string, string> = {};
  let added = 0;
  for (const w of words.slice(0, 100)) {
    const [rawClass, rawSection = ""] = w.split("|");
    const split = !rawSection ? splitClassSection(rawClass) : null;
    const cls = split?.className ?? rawClass;
    const sec = (split?.sectionName ?? rawSection) || "A";
    const key = classKey(cls);
    if (!key) throw new MoveInProblem(`"${cls}" does not look like a class name. Match it to a class instead, or add it in Academic Management.`);
    const existing = await tx.schoolClass.findMany({ where: { campusId: year.campusId, archivedAt: null } });
    const same = existing.find((c) => classKey(c.name) === key || plain(c.name) === plain(cls));
    const name = same?.name ?? (/^\d+$/.test(key) ? `${style}${key}` : key === "lkg" || key === "ukg" ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
    let sectionId: string;
    if (same) {
      const has = await tx.section.findFirst({ where: { classId: same.id, academicYearId: year.id, archivedAt: null, name: { equals: sec, mode: "insensitive" } } });
      sectionId = has?.id ?? (await addSection(tx, ctx, same.id, year.id, { name: sec })).section.id;
      if (!has) added++;
    } else {
      const after = existing.filter((c) => classRank(c.name) > classRank(name)).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      const r = await addClass(tx, ctx, { campusId: year.campusId, yearId: year.id, name, sectionNames: [sec], seats: 40, sortOrder: after?.sortOrder ?? null });
      sectionId = (await tx.section.findFirstOrThrow({ where: { classId: r.cls.id, academicYearId: year.id, name: sec } })).id;
      added++;
    }
    pairs[w] = sectionId;
  }
  await setValues(tx, id, "class", pairs);
  return added;
}

const EARLY_RANK: Record<string, number> = { playgroup: -4, nursery: -3, lkg: -2, kg: -1.5, ukg: -1 };
/** Where a class sits in the teaching order: Nursery, LKG, UKG, then 1 to 12. */
function classRank(name: string) {
  const k = classKey(name);
  if (!k) return 99;
  return /^\d+$/.test(k) ? Number(k) : EARLY_RANK[k] ?? 99;
}

/** Adds designations or departments a file names to HR Settings, so staff rows can use them. */
export async function addMissingOptions(tx: Tx, ctx: SchoolContext, id: string, column: "designation" | "department", words: string[]) {
  await openFile(tx, id);
  await ensureHrDefaults(tx, ctx);
  const pairs: Record<string, string> = {};
  for (const raw of words.slice(0, 50)) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;
    if (column === "designation") {
      const has = await tx.designation.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      const d = has ?? await tx.designation.create({ data: { schoolId: ctx.schoolId, name, staffType: /teach|lectur|faculty|tutor|coach|instructor/i.test(name) ? "Teaching" : "Non-teaching", sortOrder: 100 } });
      if (has?.archivedAt) await tx.designation.update({ where: { id: has.id }, data: { archivedAt: null } });
      pairs[raw] = d.name;
      if (!has) await writeAudit(tx, ctx, { action: "created", recordType: "Designation", recordId: d.id, after: { name: d.name, staffType: d.staffType, from: "Switching to School OS" } });
    } else {
      const has = await tx.department.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      const d = has ?? await tx.department.create({ data: { schoolId: ctx.schoolId, name } });
      if (has?.archivedAt) await tx.department.update({ where: { id: has.id }, data: { archivedAt: null } });
      pairs[raw] = d.name;
      if (!has) await writeAudit(tx, ctx, { action: "created", recordType: "Department", recordId: d.id, after: { name: d.name, from: "Switching to School OS" } });
    }
  }
  await setValues(tx, id, column, pairs);
  return Object.keys(pairs).length;
}

export async function removeFile(tx: Tx, ctx: SchoolContext, id: string) {
  const f = await getFile(tx, id);
  if (!f) throw new MoveInProblem("This file was not found.");
  if (f.status === "importing") throw new MoveInProblem("This file is being imported. Wait for it to finish.");
  await tx.moveInFile.update({ where: { id }, data: { archivedAt: new Date(), status: f.status === "imported" ? "imported" : "cancelled" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Move-in File", recordId: id, after: { fileName: f.fileName } });
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Hands the clean rows to the shared importer as a background job. Only rows
 * that pass the checks now are sent; the import checks them again as it runs,
 * so a row that changed in between is listed with its problem, not imported.
 */
export async function importFile(tx: Tx, ctx: SchoolContext, id: string) {
  const f = await openFile(tx, id);
  const w = await workOn(tx, ctx, id, { check: true });
  const ready = w.checked!.ready;
  if (!ready.length) throw new MoveInProblem("No row is ready yet. Fix the rows with problems first.");
  const csv = Buffer.from(cleanCsv(w.kind.columns, ready), "utf8");
  const fileId = randomUUID();
  const key = `${ctx.schoolId}/import/${fileId}`;
  await fileStore().put(key, csv, "text/csv");
  const sheetName = (f.sheets as SheetInfo[])[f.sheetIndex]?.name;
  const shown = `${f.fileName.replace(/\.[^.]+$/, "")}${(f.sheets as SheetInfo[]).length > 1 && sheetName ? ` (${sheetName})` : ""}.csv`;
  await tx.storedFile.create({ data: { id: fileId, schoolId: ctx.schoolId, storageKey: key, fileName: shown.slice(0, 150), contentType: "text/csv", sizeBytes: csv.length, purpose: "import", uploadedById: ctx.userId } });
  const identity = Object.fromEntries(w.kind.columns.map((c, i) => [c.key, i]));
  await startImport(tx, ctx, { kind: w.kind.key, fileId, match: identity });
  await tx.moveInFile.update({ where: { id }, data: { status: "importing", importFileId: fileId } });
  await writeAudit(tx, ctx, { action: "import-started", recordType: "Move-in File", recordId: id, after: { kind: w.kind.key, rows: ready.length, leftWithProblems: w.checked!.problems.length } });
  return { rows: ready.length, problems: w.checked!.problems.length };
}

/** Moves files whose import job finished (or failed) on to their next state. */
export async function settleImports(tx: Tx) {
  const running = await tx.moveInFile.findMany({ where: { status: "importing", archivedAt: null } });
  for (const f of running) {
    if (!f.importFileId) continue;
    const batch = await tx.importBatch.findFirst({ where: { fileName: { endsWith: `#${f.importFileId}` } }, select: { id: true } });
    if (batch) { await tx.moveInFile.update({ where: { id: f.id }, data: { status: "imported", batchId: batch.id } }); continue; }
    const job = await tx.backgroundJob.findFirst({ where: { kind: "import-run", idempotencyKey: { startsWith: `import:${f.importFileId}:` } } });
    if (job?.status === "failed") await tx.moveInFile.update({ where: { id: f.id }, data: { status: "open" } });
  }
}

/** Why the last import of a file did not finish, when it failed. */
export async function lastFailure(tx: Tx, importFileId: string | null) {
  if (!importFileId) return null;
  const job = await tx.backgroundJob.findFirst({ where: { kind: "import-run", status: "failed", idempotencyKey: { startsWith: `import:${importFileId}:` } } });
  return job?.lastError ?? null;
}

// ── The move-in plan and the go-live check (steps 1 and 9) ────────────────

export async function getPlan(tx: Tx, ctx: SchoolContext) {
  return tx.moveInPlan.findUnique({ where: { schoolId: ctx.schoolId } });
}

export type Expected = { students?: number | null; staff?: number | null; guardians?: number | null };

export async function saveExpected(tx: Tx, ctx: SchoolContext, input: { oldSoftware: string | null; expected: Expected; goLiveDate: Date | null }) {
  const before = await getPlan(tx, ctx);
  const data = { oldSoftware: input.oldSoftware, expected: input.expected as Prisma.InputJsonValue, goLiveDate: input.goLiveDate };
  await tx.moveInPlan.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...data }, update: data });
  await writeAudit(tx, ctx, { action: before ? "changed" : "created", recordType: "Move-in Plan", recordId: ctx.schoolId, before: before ? { oldSoftware: before.oldSoftware, expected: before.expected, goLiveDate: before.goLiveDate } : undefined, after: { oldSoftware: input.oldSoftware, expected: input.expected, goLiveDate: input.goLiveDate } });
}

export type Summary = Awaited<ReturnType<typeof goLiveSummary>>;

/** The go-live summary (step 9): what School OS now holds, beside what the old software says, and what to look at. */
export async function goLiveSummary(tx: Tx, ctx: SchoolContext) {
  const year = await currentYear(tx, ctx);
  const plan = await getPlan(tx, ctx);
  const [classes, enrolments, staff, staffNoLogin, guardians, openFiles, problemBatches, departments] = await Promise.all([
    year ? tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null, schoolClass: { archivedAt: null } }, include: { schoolClass: { select: { id: true, name: true, sortOrder: true } } }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] }) : Promise.resolve([]),
    year ? tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, student: { archivedAt: null, status: "ACTIVE" } }, select: { sectionId: true, rollNo: true } }) : Promise.resolve([]),
    tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } }),
    tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, userLoginId: null } }),
    tx.guardian.findMany({ where: { archivedAt: null, students: { some: { archivedAt: null, student: { archivedAt: null, status: "ACTIVE" } } } }, select: { name: true, phone: true } }),
    tx.moveInFile.count({ where: { archivedAt: null, status: { in: ["open", "importing"] } } }),
    tx.importBatch.count({ where: { undoneAt: null, skipped: { gt: 0 } } }),
    tx.department.count({ where: { archivedAt: null } }),
  ]);
  const bySection = new Map<string, number>();
  let noRoll = 0;
  for (const e of enrolments) { bySection.set(e.sectionId, (bySection.get(e.sectionId) ?? 0) + 1); if (e.rollNo === null) noRoll++; }
  const classMap = new Map<string, { id: string; name: string; sections: { id: string; name: string; students: number; seats: number }[] }>();
  for (const s of classes) {
    const c = classMap.get(s.classId) ?? { id: s.classId, name: s.schoolClass.name, sections: [] };
    c.sections.push({ id: s.id, name: s.name, students: bySection.get(s.id) ?? 0, seats: s.seats });
    classMap.set(s.classId, c);
  }
  const phones = new Map<string, Set<string>>();
  for (const g of guardians) { const set = phones.get(g.phone) ?? new Set(); set.add(plain(g.name)); phones.set(g.phone, set); }
  const sharedPhones = [...phones.values()].filter((s) => s.size >= 3).length;
  const overFull = [...classMap.values()].flatMap((c) => c.sections.filter((s) => s.students > s.seats).map((s) => `${c.name} ${s.name}`));
  const expected = (plan?.expected ?? {}) as Expected;
  return {
    year: year ? { id: year.id, name: year.name } : null,
    classes: [...classMap.values()],
    students: enrolments.length,
    staff,
    guardians: guardians.length,
    families: phones.size,
    departments,
    checks: { noRoll, staffNoLogin, sharedPhones, overFull, openFiles, problemBatches },
    expected,
    plan,
  };
}

/** What still stops going live, in plain words. Empty means the school can go live. */
export function blockers(s: Summary): string[] {
  const out: string[] = [];
  if (!s.year) out.push("Set up this academic year with its classes and sections in Academic Management.");
  else if (!s.classes.length) out.push("Add this year's classes and sections in Academic Management.");
  if (s.students === 0) out.push("Bring in your students and parents.");
  if (s.checks.openFiles > 0) out.push(`${s.checks.openFiles} ${s.checks.openFiles === 1 ? "file is" : "files are"} not imported yet. Import or remove ${s.checks.openFiles === 1 ? "it" : "them"} first.`);
  return out;
}

/** Things worth a look before going live; none of them stops it. */
export function warnings(s: Summary): string[] {
  const out: string[] = [];
  const e = s.expected;
  if (e.students != null && e.students !== s.students) out.push(`Your old software says ${e.students} students; School OS has ${s.students} (${s.students > e.students ? "+" : ""}${s.students - e.students}).`);
  if (e.staff != null && e.staff !== s.staff) out.push(`Your old software says ${e.staff} staff; School OS has ${s.staff} (${s.staff > e.staff ? "+" : ""}${s.staff - e.staff}).`);
  if (e.guardians != null && e.guardians !== s.guardians) out.push(`Your old software says ${e.guardians} parents; School OS has ${s.guardians} (${s.guardians > e.guardians ? "+" : ""}${s.guardians - e.guardians}).`);
  if (s.staff === 0) out.push("No staff are added yet.");
  if (s.checks.problemBatches > 0) out.push(`${s.checks.problemBatches} ${s.checks.problemBatches === 1 ? "import left" : "imports left"} rows out because of problems. Download them from Import history, fix and bring them in.`);
  if (s.checks.overFull.length) out.push(`More students than seats in ${s.checks.overFull.slice(0, 5).join(", ")}${s.checks.overFull.length > 5 ? ` and ${s.checks.overFull.length - 5} more` : ""}.`);
  if (s.checks.noRoll > 0) out.push(`${s.checks.noRoll} ${s.checks.noRoll === 1 ? "student has" : "students have"} no roll number. Roll numbers can be given class by class in Student Management.`);
  if (s.checks.sharedPhones > 0) out.push(`${s.checks.sharedPhones} phone ${s.checks.sharedPhones === 1 ? "number is" : "numbers are"} shared by three or more different parents. It may be the school's own number typed in the old software.`);
  if (s.checks.staffNoLogin > 0) out.push(`${s.checks.staffNoLogin} staff ${s.checks.staffNoLogin === 1 ? "member has" : "members have"} no login yet.`);
  return out;
}

/** Step 10: the Principal confirms going live. The summary is kept as it was. */
export async function goLive(tx: Tx, ctx: SchoolContext) {
  const s = await goLiveSummary(tx, ctx);
  const stop = blockers(s);
  if (stop.length) throw new MoveInProblem(stop[0]);
  if (s.plan?.wentLiveAt) throw new MoveInProblem("Your school is already live on School OS.");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const kept = { students: s.students, staff: s.staff, guardians: s.guardians, families: s.families, classes: s.classes.map((c) => ({ name: c.name, sections: c.sections.map((x) => ({ name: x.name, students: x.students })) })), expected: s.expected };
  await tx.moveInPlan.upsert({
    where: { schoolId: ctx.schoolId },
    create: { schoolId: ctx.schoolId, goLiveDate: today, wentLiveAt: new Date(), wentLiveById: ctx.userId, liveSummary: kept },
    update: { goLiveDate: s.plan?.goLiveDate ?? today, wentLiveAt: new Date(), wentLiveById: ctx.userId, liveSummary: kept },
  });
  await writeAudit(tx, ctx, { action: "went-live", recordType: "Move-in Plan", recordId: ctx.schoolId, after: kept });
  return s;
}

/** Guardians of this year's students, for sending Parent Links on going live. */
export async function liveGuardianIds(tx: Tx) {
  // Not a guardian whose every child has a custody restriction against them.
  const rows = await tx.guardian.findMany({ where: { archivedAt: null, students: { some: { ...OPEN_LINK, student: { archivedAt: null, status: "ACTIVE" } } } }, select: { id: true } });
  return rows.map((r) => r.id);
}
