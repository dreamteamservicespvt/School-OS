"use server";

// Switching to School OS (workflow 15): every change made on the move-in
// screens. Each checks the person's role on the server, works inside the
// school's own transaction and explains a refusal in plain words.

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { can } from "@/lib/permissions";
import type { FormState } from "@/lib/forms";
import { FileProblem, SHEET_TYPES, saveFile } from "@/lib/files";
import { undoImport } from "@/lib/importer";
import { AcademicRuleError } from "@/lib/academic/common";
import { ParentLinkProblem, sendToFamilies } from "@/lib/parent-link/links";
import { MessagingProblem } from "@/lib/messaging";
import {
  MoveInProblem, addMissingClasses, addMissingOptions, addUpload, canBring, canUndo, chooseSheet, fixRow, getFile, goLive, importFile,
  kindInfo, leaveOut, liveGuardianIds, removeFile, saveExpected, setColumns, setTidy, setValues, undoFix,
} from "@/lib/move-in/service";

const BASE = "/settings/data-security/switching";
const PAGE = "data-security" as const;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const KNOWN = [MoveInProblem, AcademicRuleError, FileProblem, ParentLinkProblem];
function problem(e: unknown): string {
  unstable_rethrow(e);
  if (KNOWN.some((K) => e instanceof K)) return (e as Error).message;
  console.error(JSON.stringify({ level: "error", event: "move-in-failed", error: e instanceof Error ? e.message : String(e) }));
  return "That did not work, and nothing was changed. Try again.";
}

async function run(fn: () => Promise<unknown>): Promise<string | void> {
  try {
    await fn();
  } catch (e) {
    return problem(e);
  }
}

/** The person must reach Settings, and be allowed to add the records this file holds. */
async function forFile(id: string, need: "create" | "archive" = "create") {
  const { current } = await requireSettingsAction(PAGE, "view");
  if (!isId(id)) throw new MoveInProblem("This file was not found.");
  const f = await withSchool(current.ctx, (tx) => getFile(tx, id));
  if (!f) throw new MoveInProblem("This file was not found. It may have been removed.");
  if (!(need === "create" ? canBring : canUndo)(current.permissions, f.kind)) throw new MoveInProblem(`Your role cannot ${need === "create" ? "add" : "undo"} ${kindInfo(f.kind)?.label.toLowerCase() ?? "these records"}. Ask your School Admin.`);
  return { current, file: f };
}

const refresh = (id?: string) => { revalidatePath(BASE); if (id) revalidatePath(`${BASE}/${id}`); };

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "view");
  const kind = String(fd.get("kind") ?? "");
  const file = fd.get("file");
  const values = { kind };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the file to upload.", errors: { file: "Choose the file to upload." }, values };
  const head = Buffer.from(await file.slice(0, 8).arrayBuffer());
  if (head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
    const m = "This is an old Excel file (.xls). Open it in Excel and use Save As, Excel Workbook (.xlsx) or CSV, then upload that.";
    return { ok: false, message: m, errors: { file: m }, values };
  }
  if (kind && !kindInfo(kind)) return { ok: false, message: "Choose what the file holds.", errors: { kind: "Choose what the file holds." }, values };
  let ids: string[] = [];
  try {
    ids = await withSchool(current.ctx, async (tx) => {
      const saved = await saveFile(tx, current.ctx, { file, purpose: "move-in", allowed: SHEET_TYPES });
      return addUpload(tx, current.ctx, current.permissions, { fileId: saved.id, fileName: file.name, kind: kind || null });
    }, { timeout: 120_000 });
  } catch (e) {
    const m = problem(e);
    return { ok: false, message: m, errors: { file: m }, values };
  }
  if (ids.length > 1) {
    await flash({ message: `School OS found ${ids.length} sheets with records in ${file.name}. Open each one to check it and bring it in.` });
    refresh();
    redirect(BASE);
  }
  redirect(`${BASE}/${ids[0]}`);
}

// ── Working on one file ───────────────────────────────────────────────────

export async function sheetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => chooseSheet(tx, current.ctx, id, {
      sheetIndex: Number(fd.get("sheetIndex")), headerRow: Number(fd.get("headerRow")), kind: String(fd.get("kind") ?? ""),
    }, current.permissions), { timeout: 60_000 });
  });
  if (r) return { ok: false, message: r };
  refresh(id);
  redirect(`${BASE}/${id}?step=columns`);
}

export async function columnsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const next = fd.get("next") === "check" ? "check" : "values";
  const match: Record<string, number[]> = {};
  for (const [k, v] of fd.entries()) {
    const m = /^col_([A-Za-z]+)(?:_(\d))?$/.exec(k);
    if (!m || typeof v !== "string" || v === "") continue;
    const n = Number(v);
    if (!Number.isInteger(n)) continue;
    (match[m[1]] ??= []).push(n);
  }
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => setColumns(tx, id, match), { timeout: 60_000 });
  });
  if (r) return { ok: false, message: r };
  refresh(id);
  redirect(`${BASE}/${id}?step=${next}`);
}

export async function tidyAction(id: string, on: boolean): Promise<string | void> {
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => setTidy(tx, id, on));
  });
  if (r) return r;
  refresh(id);
}

export async function valuesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const column = String(fd.get("column") ?? "");
  const pairs: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    const m = /^w_(\d+)$/.exec(k);
    if (!m || typeof v !== "string") continue;
    const chosen = fd.get(`v_${m[1]}`);
    if (typeof chosen === "string") pairs[v] = chosen;
  }
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => setValues(tx, id, column, pairs));
  });
  if (r) return { ok: false, message: r };
  refresh(id);
  return { ok: true, message: "Saved. The rows are checked again with your choices." };
}

export async function addClassesAction(id: string, words: string[]): Promise<string | void> {
  let added = 0;
  const r = await run(async () => {
    const { current } = await forFile(id);
    if (!can(current.permissions, "academic-management", "create")) throw new MoveInProblem("Your role cannot add classes. Ask your School Admin, or match these to classes that exist.");
    added = await withSchool(current.ctx, (tx) => addMissingClasses(tx, current.ctx, id, words), { timeout: 60_000 });
  });
  if (r) return r;
  await flash({ message: added ? `${added} ${added === 1 ? "class or section was" : "classes and sections were"} added to this year in Academic Management.` : "Matched to the classes that already exist." });
  refresh(id);
}

export async function addOptionsAction(id: string, column: "designation" | "department", words: string[]): Promise<string | void> {
  let added = 0;
  const r = await run(async () => {
    const { current } = await forFile(id);
    if (column !== "designation" && column !== "department") throw new MoveInProblem("This column cannot be added to.");
    if (!can(current.permissions, "staff-hr-management", "edit")) throw new MoveInProblem("Your role cannot change HR Settings. Ask your School Admin, or match these to ones that exist.");
    added = await withSchool(current.ctx, (tx) => addMissingOptions(tx, current.ctx, id, column, words));
  });
  if (r) return r;
  await flash({ message: `${added} ${column === "designation" ? (added === 1 ? "designation" : "designations") : added === 1 ? "department" : "departments"} added to HR Settings.` });
  refresh(id);
}

export async function fixRowAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const line = Number(fd.get("line"));
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    const m = /^f_([A-Za-z]+)$/.exec(k);
    if (m && typeof v === "string") values[m[1]] = v;
  }
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => fixRow(tx, id, line, values));
  });
  if (r) return { ok: false, message: r };
  refresh(id);
  return { ok: true, message: `Row ${line} saved and checked again.` };
}

export async function undoFixAction(id: string, line: number): Promise<string | void> {
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => undoFix(tx, id, line));
  });
  if (r) return r;
  refresh(id);
}

export async function leaveOutAction(id: string, lines: number[], out: boolean): Promise<string | void> {
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => leaveOut(tx, id, lines, out));
  });
  if (r) return r;
  refresh(id);
}

export async function importAction(id: string): Promise<string | void> {
  let result = { rows: 0, problems: 0 };
  let label = "";
  const r = await run(async () => {
    const { current, file } = await forFile(id);
    label = kindInfo(file.kind)?.label.toLowerCase() ?? "records";
    result = await withSchool(current.ctx, (tx) => importFile(tx, current.ctx, id), { timeout: 300_000 });
  });
  if (r) return r;
  await flash({ message: `Bringing in ${result.rows} ${label}. You will get a notification when it is done${result.problems ? `; ${result.problems} ${result.problems === 1 ? "row" : "rows"} with problems stay here to fix` : ""}.` });
  refresh(id);
}

export async function removeAction(id: string): Promise<string | void> {
  const r = await run(async () => {
    const { current } = await forFile(id);
    await withSchool(current.ctx, (tx) => removeFile(tx, current.ctx, id));
  });
  if (r) return r;
  await flash({ message: "The file is removed from this list. Nothing it imported was changed." });
  refresh();
}

/** Undoes the import a file made, and opens the file again to fix and bring in again (workflow 15, "fix the file, undo and import again"). */
export async function undoFileImportAction(id: string): Promise<string | void> {
  let archived = 0;
  const r = await run(async () => {
    const { current, file } = await forFile(id, "archive");
    if (file.status !== "imported" || !file.batchId) throw new MoveInProblem("This file has no import to undo.");
    await withSchool(current.ctx, async (tx) => {
      const batch = await tx.importBatch.findUnique({ where: { id: file.batchId! } });
      if (!batch) throw new MoveInProblem("This import was not found.");
      if (!batch.undoneAt) {
        try {
          await undoImport(tx, current.ctx, batch.id);
        } catch (e) {
          if (e instanceof Error && /already undone|cannot be undone/.test(e.message)) throw new MoveInProblem(e.message);
          throw e;
        }
      }
      archived = batch.added;
      await tx.moveInFile.update({ where: { id }, data: { status: "open", batchId: null, importFileId: null } });
    }, { timeout: 120_000 });
  });
  if (r) return r;
  await flash({ message: `Import undone: the ${archived} records it added are archived. The file is open again to fix and bring in.` });
  refresh(id);
}

// ── The go-live check ─────────────────────────────────────────────────────

const count = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").replace(/[,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : NaN;
};

export async function expectedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const errors: Record<string, string> = {};
  const expected = { students: count(fd.get("students")), staff: count(fd.get("staff")), guardians: count(fd.get("guardians")) };
  for (const [k, v] of Object.entries(expected)) if (Number.isNaN(v)) errors[k] = "Write a whole number, like 318.";
  const oldSoftware = String(fd.get("oldSoftware") ?? "").trim().slice(0, 100) || null;
  const rawDate = String(fd.get("goLiveDate") ?? "");
  const goLiveDate = rawDate ? new Date(`${rawDate}T00:00:00Z`) : null;
  if (rawDate && (!goLiveDate || Number.isNaN(goLiveDate.getTime()))) errors.goLiveDate = "Choose a real date.";
  if (Object.keys(errors).length) return { ok: false, message: "Check the numbers marked below.", errors, values };
  await withSchool(current.ctx, (tx) => saveExpected(tx, current.ctx, { oldSoftware, expected, goLiveDate }));
  refresh();
  revalidatePath(`${BASE}/check`);
  return { ok: true, message: "Saved. The numbers are compared below." };
}

export async function goLiveAction(sendLinks: boolean): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  let linkNote = "";
  const r = await run(() => withSchool(current.ctx, (tx) => goLive(tx, current.ctx), { timeout: 60_000 }));
  if (r) return r;
  if (sendLinks) {
    try {
      const sent = await withSchool(current.ctx, async (tx) => sendToFamilies(tx, current.ctx, await liveGuardianIds(tx), { audienceLabel: "All parents, on going live" }), { timeout: 300_000 });
      linkNote = ` Parent Links are going to ${sent.made} ${sent.made === 1 ? "parent" : "parents"}.`;
    } catch (e) {
      unstable_rethrow(e);
      linkNote = e instanceof ParentLinkProblem || e instanceof MessagingProblem ? ` Parent Links were not sent: ${e.message} You can send them later from Communication, Parent Link.` : " Parent Links were not sent. You can send them from Communication, Parent Link.";
    }
  }
  await flash({ message: `Your school is live on School OS.${linkNote}` });
  refresh();
  revalidatePath(`${BASE}/check`);
}
