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
import { importKind, importKinds, leftCounts, previewImport, type Decisions, type ImportKind, type RowChoice } from "../importer";
import { startImport } from "../data-security/imports";
import { currentYear } from "../academic/years";
import { mainCampus } from "../campus";
import { addClass, addSection } from "../academic/structure";
import { ensureHrDefaults } from "../staff/settings";
import { fileStore } from "../storage";
import { findModule, type ModuleKey } from "../modules";
import type { PermissionMap } from "../permissions";
import { can } from "../permissions";
import "../import-registry";
import { STUDENT_IMPORT, decisionWords, studentImport } from "../students/import";
import { STUDENT_UPDATE_IMPORT } from "../students/update-import";
import { namesAlike } from "../students/name-match";
import { MAX_ROWS, readWorkbook, ReadProblem, type Sheet } from "./read";
import { findHeaderRow, guessKind, matchColumns, type ColumnMatch } from "./match";
import { classKey, plain, splitClassSection } from "./tidy";
import { cleanCsv, prepareSheet, rowsForImport, type Choices, type Prepared } from "./prepare";
import { teacherOption, type Lookups } from "./lookups";
import { markRecalled, mergeRemembered, recallMapping, rememberMapping, type Recalled } from "./memory";
import { aiConfirmedNote } from "../ai/audit";
import { alignGoLive } from "../finance/settings-save";
import { keptMoney, MONEY_KEYS, moneyTotals, type MoneyExpected } from "./money";
import { broughtInOf, fileBatchIds } from "./batches";


export class MoveInProblem extends Error {
  constructor(message: string, public field?: string) { super(message); }
}

// ── What can be brought in ─────────────────────────────────────────────────

export type MoveInKind = { key: string; label: string; module: ModuleKey; order: number; about: string };

/**
 * Imports in the order a school brings them in (workflow 15, steps 3 to 8),
 * with the module that owns each: a person may bring in, and undo, only what
 * their role may add in that module (05-roles.md). The Accountant brings in
 * old dues and past receipts (Fee Management) and past expenses (Finance
 * Management) without Settings.
 */
const KNOWN: Record<string, Omit<MoveInKind, "key" | "label">> = {
  departments: { module: "settings", order: 1, about: "Departments such as Science and Accounts, with their heads. Bring these first if your staff list has departments." },
  staff: { module: "staff-hr-management", order: 2, about: "Teachers and other staff, with phone, designation and joining date. Logins can be made for them." },
  "staff-pay-details": { module: "staff-hr-management", order: 2.1, about: "Each staff member's bank account, IFSC, PAN, UAN (PF) and ESI numbers, so salary and the PF and ESI statements are right from the first month. Restricted: HR, the Principal and the School Admin only." },
  "staff-leave-balances": { module: "staff-hr-management", order: 2.2, about: "Starting part way through the year? For each staff member and leave type, the days left at go-live (or the days taken so far). Leave left, the leave check and loss of pay in salary are right from the first day." },
  students: { module: "student-management", order: 3, about: "Students with their class, section, roll number and admission number, and their parents. Old admission numbers are kept." },
  "students-update": { module: "student-management", order: 4, about: "Changes to students already here, found by admission number." },
  "attendance-so-far": { module: "attendance-management", order: 4.5, about: "Starting part way through the year? For each student, the days the school met and the days present up to the day before go-live. Attendance % and early warnings count them from the first day." },
  "academic-allocations": { module: "academic-management", order: 4.6, about: "Which teacher teaches which subject in which class and section, and each section's class teacher. Attendance, marks entry and the Time Table use it from the first day. Full Academic Management only." },
  "fee-old-dues": { module: "fee-management", order: 6, about: "For each student, the amount still unpaid from before. Each becomes an opening balance row on the Student Fee Ledger, marked Brought in." },
  "fee-past-receipts": { module: "fee-management", order: 7, about: "Payments already made this year in the old software, with their receipt numbers. They reduce the dues, are kept read-only as Brought in, and never reach the Day Book." },
  "finance-past-expenses": { module: "finance-management", order: 9, about: "Expenses of this financial year, for reports. Kept as Brought in; they never reach the Day Book or the cash and bank books." },
  "admission-enquiries": { module: "admission-management", order: 10, about: "Families still deciding, with their follow-up dates." },
  "calendar-holidays": { module: "events-calendar", order: 11, about: "This year's holidays and vacations, so attendance and the School Calendar know the days off." },
  "library-catalogue": { module: "library-management", order: 12, about: "Books and their copies, with accession numbers." },
  "hostel-rooms": { module: "hostel-management", order: 13, about: "Hostel rooms and their beds." },
  "inventory-items": { module: "inventory-management", order: 14, about: "Items with their opening stock." },
  "inventory-assets": { module: "inventory-management", order: 15, about: "The asset register with tags." },
  "salary-to-date": { module: "salary-management", order: 9.5, about: "Starting part way through the financial year? Each staff member's gross pay, PF, ESI, Professional Tax and TDS already paid this year, for the year's totals and the TDS check. Never posted to the Day Book. Full Salary Management only." },
  // Brought in only on Salary Management's own page (restricted pay details), not listed for Switching.
  "salary-structures": { module: "salary-management", order: 16, about: "Each staff member's basic, allowances and monthly TDS, from the month they start." },
};
// UDISE+ files are read by the Students import; changes to students come in on Student Management, Import,
// and a row of the Students file that is a student already here can be chosen as "same student: update".
const HIDDEN = new Set(["students-udise", STUDENT_UPDATE_IMPORT, "salary-structures"]);

/** The module that owns an import kind ("settings" for kinds not listed). */
export function kindModule(key: string): ModuleKey {
  return KNOWN[key]?.module ?? "settings";
}

/** Optional modules the school has switched off hide their imports (P19). */
const switchedOn = (module: ModuleKey, modulesOn?: ReadonlySet<ModuleKey>) => !modulesOn || !findModule(module)?.optional || modulesOn.has(module);

export function moveInKinds(modulesOn?: ReadonlySet<ModuleKey>): MoveInKind[] {
  return importKinds()
    .filter((k) => !HIDDEN.has(k.key))
    .map((k) => ({ key: k.key, label: k.label, ...(KNOWN[k.key] ?? { module: "settings" as ModuleKey, order: 50, about: `${k.label} from your old software or a spreadsheet.` }) }))
    .filter((k) => switchedOn(k.module, modulesOn))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function kindInfo(key: string) {
  return moveInKinds().find((k) => k.key === key) ?? null;
}

/** May this person bring in this kind of record: their role may add in its module, and the module is on. */
export const canBring = (permissions: PermissionMap, kindKey: string, modulesOn?: ReadonlySet<ModuleKey>) => {
  const k = kindInfo(kindKey);
  return Boolean(k && switchedOn(k.module, modulesOn) && can(permissions, k.module, "create"));
};
export const canUndo = (permissions: PermissionMap, kindKey: string, modulesOn?: ReadonlySet<ModuleKey>) => {
  const k = kindInfo(kindKey);
  return Boolean(k && switchedOn(k.module, modulesOn) && can(permissions, k.module, "archive"));
};

/** Any import kind, also the ones Switching to School OS does not list, with its owning module (the shared importer in Settings). */
export const mayImport = (permissions: PermissionMap, kindKey: string, action: "create" | "archive", modulesOn?: ReadonlySet<ModuleKey>) => {
  const owner = kindModule(kindKey);
  return Boolean(importKind(kindKey) && switchedOn(owner, modulesOn) && can(permissions, owner, action));
};

/** Kinds not listed for Switching to School OS that a module's Import page brings in when the person chooses them. */
const BY_CHOICE = new Set([STUDENT_UPDATE_IMPORT, "salary-structures"]);

/** May this person bring in this kind when they choose it on a page (a listed kind, or one brought in by choice). */
export const mayChoose = (permissions: PermissionMap, kindKey: string, modulesOn?: ReadonlySet<ModuleKey>) =>
  canBring(permissions, kindKey, modulesOn) || (BY_CHOICE.has(kindKey) && mayImport(permissions, kindKey, "create", modulesOn));

function kindOf(key: string, options: unknown = {}): ImportKind<unknown> {
  const k = importKind(key);
  if (!k || (HIDDEN.has(key) && !BY_CHOICE.has(key))) throw new MoveInProblem("This kind of record cannot be brought in yet.", "kind");
  // A fresh Students import each time (withOptions): the registered one remembers sections it looked up, so a class added since would still read as missing.
  const o = options && typeof options === "object" && !Array.isArray(options) ? (options as Record<string, unknown>) : {};
  if (k.withOptions) return k.withOptions(o);
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
export async function addUpload(tx: Tx, ctx: SchoolContext, permissions: PermissionMap, upload: { fileId: string; fileName: string; kind?: string | null; options?: Record<string, unknown>; exclude?: readonly string[] }, modulesOn?: ReadonlySet<ModuleKey>) {
  const sheets = await readStored(tx, upload.fileId);
  const info: SheetInfo[] = sheets.map((s) => ({ name: s.name, rows: Math.max(0, s.rows.length - 1) }));
  const usable = sheets.map((s, i) => ({ s, i })).filter(({ s }) => s.rows.filter((r) => r.some((c) => c)).length >= 2);
  if (!usable.length) throw new MoveInProblem("This file has no rows to bring in. Put the headings in one row and the records below them.");
  // `exclude`: kinds the place's own rules refuse this person (a module page's narrower rule, src/lib/imports/places.ts OWN_RULES).
  const allowed = new Set(moveInKinds(modulesOn).filter((k) => canBring(permissions, k.key, modulesOn) && !upload.exclude?.includes(k.key)).map((k) => k.key));
  // A kind not listed for Switching, chosen on its module's page ("Changes to students already here").
  if (upload.kind && mayChoose(permissions, upload.kind, modulesOn)) allowed.add(upload.kind);
  if (!allowed.size) throw new MoveInProblem("Your role cannot add any of these records. Ask your School Admin.");
  if (upload.kind && !allowed.has(upload.kind)) throw new MoveInProblem("Your role cannot add these records.", "kind");

  const made: string[] = [];
  const picks = usable.map(({ s, i }) => ({ i, first: firstChoices(s, upload.kind || null) }));
  const recognised = picks.filter((p) => p.first.kind && allowed.has(p.first.kind));
  // Sheets that are not recognised are left out, unless none is: then the first is opened to choose by hand.
  const chosen = recognised.length ? (upload.kind ? recognised.slice(0, 1) : recognised) : picks.slice(0, 1);
  const recalledFrom: string[] = [];
  for (const p of chosen) {
    if (sheets[p.i].rows.length > MAX_ROWS + 1) throw new MoveInProblem(`The sheet "${sheets[p.i].name}" has ${sheets[p.i].rows.length - 1} rows. Bring in at most ${MAX_ROWS} at a time: split it into two files.`);
    const kind = p.first.kind && allowed.has(p.first.kind) ? p.first.kind : [...allowed][0];
    // The match this school confirmed for a file with these headings goes on top of the rules' match.
    const recalled = await recallMapping(tx, kind, sheets[p.i].rows[p.first.headerRow - 1] ?? []);
    const rules = p.first.kind === kind ? p.first.match : firstChoices(sheets[p.i], kind).match;
    const match = recalled ? mergeRemembered(rules, recalled.match) : rules;
    if (recalled) { await markRecalled(tx, recalled.id); recalledFrom.push(recalled.source ?? recalled.fileName); }
    const row = await tx.moveInFile.create({
      data: {
        schoolId: ctx.schoolId, fileId: upload.fileId, fileName: upload.fileName.slice(0, 200), sheets: info, sheetIndex: p.i,
        headerRow: p.first.headerRow, kind, columnMatch: match, createdById: ctx.userId,
        ...(upload.options ? { options: upload.options as Prisma.InputJsonValue } : {}),
      },
    });
    made.push(row.id);
  }
  await writeAudit(tx, ctx, { action: "uploaded", recordType: "Move-in File", recordId: made[0] ?? null, after: { fileName: upload.fileName, sheets: chosen.map((p) => sheets[p.i].name), ...(recalledFrom.length ? { matchedAsLastTime: recalledFrom } : {}) } });
  return made;
}

export async function getFile(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return tx.moveInFile.findFirst({ where: { id, archivedAt: null } });
}

/**
 * The year a move-in works in: the main campus's current year. A school whose
 * campuses start the year on different dates has one current year each; the
 * one whose year started last is not "the" year, so moving in always goes to
 * the main campus (its classes, its year).
 */
async function moveInYear(tx: Tx, ctx: SchoolContext) {
  return currentYear(tx, ctx, await mainCampus(tx, ctx));
}

export async function schoolLookups(tx: Tx, ctx: SchoolContext): Promise<Lookups & { yearId: string | null; campusId: string | null }> {
  const year = await moveInYear(tx, ctx);
  const sections = year ? await tx.section.findMany({
    where: { academicYearId: year.id, archivedAt: null, schoolClass: { archivedAt: null } },
    include: { schoolClass: { select: { name: true, sortOrder: true } } },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  }) : [];
  const [designations, departments, feeHeads, expenseHeads, leaveTypes, subjects, teachers] = await Promise.all([
    tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    tx.accountHead.findMany({ where: { kind: "EXPENSE", archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    tx.leaveType.findMany({ where: { forWhom: "staff", paid: true, archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    tx.subject.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { fullName: true, staffCode: true } }),
  ]);
  return {
    yearId: year?.id ?? null,
    campusId: year?.campusId ?? null,
    sections: sections.map((s) => ({ id: s.id, className: s.schoolClass.name, sectionName: s.name, key: classKey(s.schoolClass.name) })),
    designations: designations.map((d) => d.name),
    departments: departments.map((d) => d.name),
    feeHeads: feeHeads.map((h) => h.name),
    expenseHeads: expenseHeads.map((h) => h.name),
    leaveTypes: leaveTypes.map((t) => t.name),
    subjects: subjects.map((x) => x.name),
    teachers: teachers.map((t) => teacherOption(t)),
  };
}

export const choicesOf = (f: { headerRow: number; columnMatch: unknown; valueMatch: unknown; rowFixes: unknown; leftOut: unknown; tidy: boolean; rowChoices?: unknown; broughtIn?: unknown }): Choices => ({
  headerRow: f.headerRow,
  done: Object.keys(broughtInOf({ broughtIn: f.broughtIn })).map(Number).filter(Number.isInteger),
  columnMatch: (f.columnMatch ?? {}) as ColumnMatch,
  valueMatch: (f.valueMatch ?? {}) as Choices["valueMatch"],
  rowFixes: (f.rowFixes ?? {}) as Choices["rowFixes"],
  leftOut: (f.leftOut ?? []) as number[],
  tidy: f.tidy,
  rowChoices: (f.rowChoices ?? {}) as Record<string, string>,
});

export type Checked = {
  ready: Prepared["rows"];
  problems: { line: number; values: Record<string, string>; problems: string[]; choices: RowChoice[]; chosen: string | null; chosenWords: string | null }[];
  /** Ready rows that are ready because of a choice made on screen: what it does, to look at or change. */
  decided: { line: number; values: Record<string, string>; chosen: string; words: string }[];
  /** Rows the import leaves out on purpose, not problems, counted by reason (for example "No old dues"). */
  left: { reason: string; count: number }[];
};

/** The choices made on screen, by row of the file, for the rows still in it. */
function decisionsOf(choices: Choices, prepared: Prepared): Decisions {
  const out: Decisions = {};
  const lines = new Set(prepared.rows.map((r) => r.line));
  for (const [line, value] of Object.entries(choices.rowChoices ?? {})) if (lines.has(Number(line)) && typeof value === "string" && value) out[Number(line)] = value;
  return out;
}

/** Everything a file's page shows: the sheet, the cleaned rows and, when asked, each row's check. */
export async function workOn(tx: Tx, ctx: SchoolContext, id: string, opts: { check: boolean }) {
  const file = await getFile(tx, id);
  if (!file) throw new MoveInProblem("This file was not found. It may have been removed.");
  const sheets = await readStored(tx, file.fileId);
  const sheet = sheets[file.sheetIndex] ?? sheets[0];
  const kind = kindOf(file.kind, file.options);
  if (kind.key === "staff") await ensureHrDefaults(tx, ctx);
  const lookups = await schoolLookups(tx, ctx);
  const choices = choicesOf(file);
  const prepared = prepareSheet(kind.key, kind.columns, sheet.rows, choices, lookups);
  let checked: Checked | null = null;
  if (opts.check) checked = await checkRows(tx, ctx, kind, prepared, decisionsOf(choices, prepared));
  // A match confirmed before for files with these headings, when this file still uses it: shown as "matched as last time".
  const recalled = file.status === "open" ? await recallMapping(tx, kind.key, sheet.rows[file.headerRow - 1] ?? []) : null;
  const remembered: (Recalled & { keys: string[] }) | null = recalled
    ? { ...recalled, keys: Object.keys(recalled.match).filter((k) => JSON.stringify(recalled.match[k]) === JSON.stringify(choices.columnMatch[k] ?? [])) }
    : null;
  return { file, sheets, sheet, kind, lookups, choices, prepared, checked, remembered: remembered?.keys.length ? remembered : null };
}

/**
 * Each row through the import's own checks, exactly as the import will run
 * them, with the choices made on screen. Rows keep their own line in the
 * file. Saves nothing.
 */
export async function checkRows(tx: Tx, ctx: SchoolContext, kind: ImportKind<unknown>, prepared: Prepared, decisions: Decisions = {}): Promise<Checked> {
  const identity = Object.fromEntries(kind.columns.map((c, i) => [c.key, i]));
  const preview = await previewImport(tx, ctx, kind, rowsForImport(kind.columns, prepared.rows), identity, decisions, prepared.rows.map((r) => r.line));
  const byLine = new Map(prepared.rows.map((r) => [r.line, r]));
  const ready = preview.good.map((g) => byLine.get(g.line)!);
  return {
    ready,
    problems: preview.bad.map((b) => ({ line: b.line, values: byLine.get(b.line)!.values, problems: b.problems, choices: b.choices ?? [], chosen: decisions[b.line] ?? null, chosenWords: decisions[b.line] ? decisionWords(decisions[b.line]) || null : null })),
    decided: ready.filter((r) => decisions[r.line]).map((r) => ({ line: r.line, values: r.values, chosen: decisions[r.line], words: decisionWords(decisions[r.line]) })),
    left: leftCounts(preview.left),
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
  if (!mayChoose(permissions, input.kind)) throw new MoveInProblem("Your role cannot add these records.", "kind");
  const sheet = sheets[input.sheetIndex];
  const sheetChanged = input.sheetIndex !== f.sheetIndex;
  const kindChanged = input.kind !== f.kind;
  const first = firstChoices(sheet, input.kind);
  const headerRow = sheetChanged ? first.headerRow : input.headerRow;
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > Math.min(sheet.rows.length, 30)) throw new MoveInProblem("Choose the row that holds the headings.", "headerRow");
  const headerChanged = headerRow !== f.headerRow;
  // Rows already brought in are known by their row in this sheet, read as this kind.
  if ((sheetChanged || kindChanged || headerChanged) && (Object.keys(broughtInOf(f)).length || fileBatchIds(f).length)) {
    throw new MoveInProblem("Part of this file is already brought in. To choose another sheet, heading row or kind of record, undo its imports first, or upload the file again.");
  }
  const kind = importKind(input.kind)!;
  let match = f.columnMatch as ColumnMatch;
  if (sheetChanged || kindChanged || headerChanged) {
    match = matchColumns(kind.key, kind.columns, sheet.rows[headerRow - 1] ?? [], sheet.rows.slice(headerRow, headerRow + 60));
    const recalled = await recallMapping(tx, kind.key, sheet.rows[headerRow - 1] ?? []);
    if (recalled) { match = mergeRemembered(match, recalled.match); await markRecalled(tx, recalled.id); }
  }
  await tx.moveInFile.update({
    where: { id },
    data: {
      sheetIndex: input.sheetIndex, headerRow, kind: input.kind, columnMatch: match,
      ...(sheetChanged || kindChanged || headerChanged ? { valueMatch: {}, rowFixes: {}, leftOut: [], rowChoices: {} } : {}),
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

/** What Smart Import's question to the AI assistant needs from one file: the fields and columns still unmatched. The values only to describe their kind. */
export async function aiColumnInput(tx: Tx, id: string) {
  const f = await openFile(tx, id);
  const sheets = await readStored(tx, f.fileId);
  const sheet = sheets[f.sheetIndex] ?? sheets[0];
  const kind = kindOf(f.kind);
  const match = (f.columnMatch ?? {}) as ColumnMatch;
  return {
    importing: kindInfo(kind.key)?.label ?? kind.label,
    fields: kind.columns.map((c) => ({ key: c.key, label: c.label })),
    headers: sheet.rows[f.headerRow - 1] ?? [],
    rows: sheet.rows.slice(f.headerRow, f.headerRow + 200),
    matched: new Set(Object.keys(match).filter((k) => match[k]?.length)),
    used: new Set(Object.values(match).flat()),
  };
}

/**
 * The AI assistant's column suggestions the person ticked: added to the file's
 * column match (only fields and columns still free), and written in the Audit
 * Log as "prepared by AI, confirmed by <person>" (00-global.md §2.1 rule 6).
 */
export async function acceptAiColumns(tx: Tx, ctx: SchoolContext, id: string, picks: { key: string; index: number }[]) {
  const f = await openFile(tx, id);
  const sheets = await readStored(tx, f.fileId);
  const headers = sheets[f.sheetIndex]?.rows[f.headerRow - 1] ?? [];
  const kind = kindOf(f.kind);
  const match: ColumnMatch = { ...((f.columnMatch ?? {}) as ColumnMatch) };
  const used = new Set(Object.values(match).flat());
  const added: { column: string; heading: string }[] = [];
  for (const p of picks.slice(0, 60)) {
    const col = kind.columns.find((c) => c.key === p.key);
    if (!col || match[p.key]?.length || !Number.isInteger(p.index) || p.index < 0 || p.index >= headers.length || used.has(p.index)) continue;
    match[p.key] = [p.index];
    used.add(p.index);
    added.push({ column: col.label, heading: headers[p.index] ?? "" });
  }
  if (!added.length) throw new MoveInProblem("These columns are matched already. Check the list of columns.");
  await tx.moveInFile.update({ where: { id }, data: { columnMatch: match } });
  await writeAudit(tx, ctx, { action: "columns-matched", recordType: "Move-in File", recordId: id, after: { fileName: f.fileName, columns: added }, actorNote: await aiConfirmedNote(tx, ctx) });
  return added.length;
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

/**
 * The choice made for one row that may already be on record: "update:<student>",
 * "family:<parent>", "family-row:<row>" or "new"; "" takes the choice back.
 * The row's own check accepts only the choices it offered.
 */
export async function chooseRow(tx: Tx, ctx: SchoolContext, id: string, line: number, value: string) {
  const f = await openFile(tx, id);
  if (!Number.isInteger(line) || line < 2) throw new MoveInProblem("This row was not found.");
  const v = value.trim();
  if (v && !/^(new|sibling|other-family|update:[0-9a-f-]{36}|family:[0-9a-f-]{36}|staff:[0-9a-f-]{36}|handover:[0-9a-f-]{36}|family-row:\d{1,6})$/i.test(v)) throw new MoveInProblem("Choose one of the choices shown for this row.");
  const all = { ...((f.rowChoices ?? {}) as Record<string, string>) };
  const before = all[String(line)] ?? null;
  if (v) all[String(line)] = v;
  else delete all[String(line)];
  await tx.moveInFile.update({ where: { id }, data: { rowChoices: all } });
  await writeAudit(tx, ctx, { action: v ? "row-chosen" : "row-choice-cleared", recordType: "Move-in File", recordId: id, before: { line, choice: before }, after: { line, choice: v || null, words: v ? decisionWords(v) : null } });
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
  const year = await moveInYear(tx, ctx);
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
  await tx.moveInFile.update({ where: { id }, data: { archivedAt: new Date(), status: f.status === "imported" || fileBatchIds(f).length ? "imported" : "cancelled" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Move-in File", recordId: id, after: { fileName: f.fileName } });
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Hands the clean rows to the shared importer as a background job. Only rows
 * that pass the checks now are sent; the import checks them again as it runs,
 * so a row that changed in between is listed with its problem, not imported.
 * The rows not sent (rows with problems, rows left out by the person) stay
 * with the file, counted, to fix and bring in as a further import of it; rows
 * an earlier import of the file brought in are not sent again.
 */
export async function importFile(tx: Tx, ctx: SchoolContext, id: string, opts: { link?: string } = {}) {
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
  // The import job sees the rows with their own lines in the file, and the choices made for them.
  const lines = ready.map((r) => r.line);
  const decisions = Object.fromEntries(Object.entries(decisionsOf(w.choices, w.prepared)).filter(([line]) => lines.includes(Number(line))));
  const brought = broughtInOf(f);
  // Rows the kind leaves out on purpose ("No old dues") are counted with the file's first import only.
  const first = !Object.keys(brought).length && !fileBatchIds(f).length;
  await startImport(tx, ctx, { kind: w.kind.key, fileId, match: identity, lines, decisions, ...(opts.link ? { link: opts.link } : {}), ...(first && w.checked!.left.length ? { left: w.checked!.left } : {}),
    ...(f.options && Object.keys(f.options as object).length ? { options: f.options as Record<string, string | number | boolean | null> } : {}) });
  const problems = w.checked!.problems.length;
  const leftOut = w.prepared.passed.leftOut;
  // The rows being brought in are marked with the cleaned file until its import is done (settleImports).
  for (const l of lines) brought[String(l)] = fileId;
  await tx.moveInFile.update({ where: { id }, data: { status: "importing", importFileId: fileId, broughtIn: brought, waiting: problems + leftOut } });
  // Bringing the file in confirms its column match: the next file with these headings is matched the same way.
  await rememberMapping(tx, ctx, { kind: w.kind.key, headers: w.sheet.rows[f.headerRow - 1] ?? [], match: w.choices.columnMatch, fileName: f.fileName });
  await writeAudit(tx, ctx, { action: "import-started", recordType: "Move-in File", recordId: id, after: { kind: w.kind.key, rows: ready.length, leftWithProblems: problems, leftOutByPerson: leftOut, broughtInBefore: w.prepared.passed.broughtIn } });
  return { rows: ready.length, problems, leftOut };
}

/**
 * Moves files whose import job finished (or failed) on to their next state.
 * The rows it brought in are kept with the file under the new import; a row
 * the import could not save goes back to the file. A file with rows still
 * waiting opens again to fix them; a file with none is imported.
 */
export async function settleImports(tx: Tx) {
  const running = await tx.moveInFile.findMany({ where: { status: "importing", archivedAt: null } });
  for (const f of running) {
    if (!f.importFileId) continue;
    const sent = f.importFileId;
    const brought = broughtInOf(f);
    const batch = await tx.importBatch.findFirst({ where: { fileName: { endsWith: `#${sent}` } }, select: { id: true, errorReport: true, undoneAt: true } });
    if (batch) {
      const failed = new Set(((batch.errorReport ?? []) as { line?: number }[]).map((b) => String(b.line)));
      let back = 0;
      let kept = 0;
      for (const [line, b] of Object.entries(brought)) {
        if (b !== sent) continue;
        if (failed.has(line) || batch.undoneAt) { delete brought[line]; back++; } else { brought[line] = batch.id; kept++; }
      }
      // An import that saved none of its rows is not one of the file's imports (it stays in the history).
      // A file sent before rows were kept with it (no rows marked) counts its import as before.
      const legacy = kept + back === 0 && !batch.undoneAt;
      const batchIds = kept || legacy ? [...fileBatchIds(f).filter((b) => b !== batch.id), batch.id] : fileBatchIds(f);
      const waiting = f.waiting + back;
      await tx.moveInFile.update({ where: { id: f.id }, data: { status: waiting > 0 || !batchIds.length ? "open" : "imported", batchId: batchIds.at(-1) ?? null, batchIds, broughtIn: brought, waiting } });
      continue;
    }
    const job = await tx.backgroundJob.findFirst({ where: { kind: "import-run", idempotencyKey: { startsWith: `import:${sent}:` } } });
    if (job?.status === "failed") {
      // Nothing was saved: the rows sent are waiting again.
      const kept = Object.fromEntries(Object.entries(brought).filter(([, b]) => b !== sent));
      await tx.moveInFile.update({ where: { id: f.id }, data: { status: "open", broughtIn: kept } });
    }
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

/** What the old software says: counts, and money as whole paise in text. */
export type Expected = { students?: number | null; staff?: number | null; guardians?: number | null } & MoneyExpected;

export async function saveExpected(tx: Tx, ctx: SchoolContext, input: { oldSoftware: string | null; expected: Expected; goLiveDate: Date | null }) {
  const before = await getPlan(tx, ctx);
  // The go-live date is also the first day of finance records (one date, entered once).
  if (input.goLiveDate && !before?.wentLiveAt) {
    const why = await alignGoLive(tx, ctx, input.goLiveDate);
    if (why) throw new MoveInProblem(why, "goLiveDate");
  }
  // Money lines left out of the form (the person may not see fees or finance) keep what was saved.
  const prev = (before?.expected ?? {}) as Expected;
  const expected: Expected = { ...input.expected };
  for (const k of MONEY_KEYS) if (expected[k] === undefined && prev[k] !== undefined) expected[k] = prev[k];
  input = { ...input, expected };
  const data = { oldSoftware: input.oldSoftware, expected: input.expected as Prisma.InputJsonValue, goLiveDate: input.goLiveDate };
  await tx.moveInPlan.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...data }, update: data });
  await writeAudit(tx, ctx, { action: before ? "changed" : "created", recordType: "Move-in Plan", recordId: ctx.schoolId, before: before ? { oldSoftware: before.oldSoftware, expected: before.expected, goLiveDate: before.goLiveDate } : undefined, after: { oldSoftware: input.oldSoftware, expected: input.expected, goLiveDate: input.goLiveDate } });
}

export type Summary = Awaited<ReturnType<typeof goLiveSummary>>;

/** The go-live summary (step 9): what School OS now holds, beside what the old software says, and what to look at. */
export async function goLiveSummary(tx: Tx, ctx: SchoolContext) {
  const year = await moveInYear(tx, ctx);
  const plan = await getPlan(tx, ctx);
  const [classes, enrolments, staff, staffNoLogin, guardians, openFiles, partFiles, problemBatches, departments] = await Promise.all([
    year ? tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null, schoolClass: { archivedAt: null } }, include: { schoolClass: { select: { id: true, name: true, sortOrder: true } } }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] }) : Promise.resolve([]),
    year ? tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, student: { archivedAt: null, status: "ACTIVE" } }, select: { sectionId: true, rollNo: true } }) : Promise.resolve([]),
    tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } }),
    tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, userLoginId: null } }),
    tx.guardian.findMany({ where: { archivedAt: null, students: { some: { archivedAt: null, student: { archivedAt: null, status: "ACTIVE" } } } }, select: { name: true, phone: true, students: { where: { archivedAt: null }, select: { studentId: true } } } }),
    // Not imported yet: a file being brought in now, or one still being checked with nothing brought in.
    tx.moveInFile.count({ where: { archivedAt: null, OR: [{ status: "importing" }, { status: "open", batchIds: { isEmpty: true }, batchId: null }] } }),
    // Part brought in: its ready rows came in, and rows with problems or left out are still with it.
    tx.moveInFile.findMany({ where: { archivedAt: null, status: "open", OR: [{ batchIds: { isEmpty: false } }, { batchId: { not: null } }] }, select: { waiting: true } }),
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
  const sharedPhones = phonesOfDifferentFamilies(guardians);
  const overFull = [...classMap.values()].flatMap((c) => c.sections.filter((s) => s.students > s.seats).map((s) => `${c.name} ${s.name}`));
  const expected = (plan?.expected ?? {}) as Expected;
  // The money, as of the go-live date typed here (or the day the school went live).
  const goLiveDay = plan?.goLiveDate ?? (plan?.wentLiveAt ? new Date(`${plan.wentLiveAt.toISOString().slice(0, 10)}T00:00:00Z`) : null);
  const money = await moneyTotals(tx, ctx, goLiveDay);
  return {
    year: year ? { id: year.id, name: year.name } : null,
    classes: [...classMap.values()],
    students: enrolments.length,
    staff,
    guardians: guardians.length,
    families: phones.size,
    departments,
    checks: { noRoll, staffNoLogin, sharedPhones, overFull, openFiles, partFiles: partFiles.length, waitingRows: partFiles.reduce((n, f) => n + f.waiting, 0), problemBatches },
    expected,
    money,
    plan,
  };
}

/**
 * Phones held by parents of different families: two parent records with the
 * phone, with different names and no child in common. Usually the school's
 * own number or a van driver's typed in the old software. A father and mother
 * sharing one mobile are one family (they have the same children).
 */
export function phonesOfDifferentFamilies(guardians: { name: string; phone: string; students: { studentId: string }[] }[]) {
  const byPhone = new Map<string, typeof guardians>();
  for (const g of guardians) byPhone.set(g.phone, [...(byPhone.get(g.phone) ?? []), g]);
  let n = 0;
  for (const list of byPhone.values()) {
    if (list.length < 2) continue;
    const apart = list.some((a, i) => list.slice(i + 1).some((b) => !namesAlike(a.name, b.name) && !a.students.some((x) => b.students.some((y) => y.studentId === x.studentId))));
    if (apart) n++;
  }
  return n;
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
  if (s.checks.partFiles > 0) {
    const n = s.checks.partFiles;
    const rows = s.checks.waitingRows;
    const waitingWords = rows ? `${rows} ${rows === 1 ? "row with problems or left out is" : "rows with problems or left out are"} not brought in yet` : "some rows are not brought in yet";
    out.push(`${n} ${n === 1 ? "file is" : "files are"} part brought in: ${waitingWords}. Open ${n === 1 ? "it" : "each one"} to fix the rows and bring them in, or remove the file from the list if they are not needed; what it brought in stays.`);
  }
  if (s.checks.problemBatches > 0) out.push(`${s.checks.problemBatches} ${s.checks.problemBatches === 1 ? "import left" : "imports left"} rows out because of problems. Download them from Import history, fix and bring them in.`);
  if (s.checks.overFull.length) out.push(`More students than seats in ${s.checks.overFull.slice(0, 5).join(", ")}${s.checks.overFull.length > 5 ? ` and ${s.checks.overFull.length - 5} more` : ""}.`);
  if (s.checks.noRoll > 0) out.push(`${s.checks.noRoll} ${s.checks.noRoll === 1 ? "student has" : "students have"} no roll number. Roll numbers can be given class by class in Student Management.`);
  if (s.checks.sharedPhones > 0) out.push(`${s.checks.sharedPhones} phone ${s.checks.sharedPhones === 1 ? "number is" : "numbers are"} shared by parents of different families. It may be the school's own number or a van driver's typed in the old software; correct the parents' phones in Student Management.`);
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
  const day = s.plan?.goLiveDate ?? today;
  // Finance records start the same day, where Finance Settings allows it (else the check keeps saying so).
  await alignGoLive(tx, ctx, day);
  const money = s.money.goLive ? s.money : await moneyTotals(tx, ctx, day);
  const kept = { students: s.students, staff: s.staff, guardians: s.guardians, families: s.families, classes: s.classes.map((c) => ({ name: c.name, sections: c.sections.map((x) => ({ name: x.name, students: x.students })) })), expected: s.expected, money: keptMoney(money) };
  await tx.moveInPlan.upsert({
    where: { schoolId: ctx.schoolId },
    create: { schoolId: ctx.schoolId, goLiveDate: day, wentLiveAt: new Date(), wentLiveById: ctx.userId, liveSummary: kept },
    update: { goLiveDate: day, wentLiveAt: new Date(), wentLiveById: ctx.userId, liveSummary: kept },
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
