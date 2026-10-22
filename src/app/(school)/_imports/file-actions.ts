"use server";

// Every change made on a file being brought in (00-global.md P10, workflow
// 15), wherever the person started: Settings, Switching to School OS, or the
// Import page of the module that owns the records. One engine
// (src/lib/move-in): each action checks the person's role for that place
// and kind on the server, works inside the school's own transaction and
// explains a refusal in plain words.

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { can, PermissionDeniedError } from "@/lib/permissions";
import type { FormState } from "@/lib/forms";
import { FileProblem, SHEET_TYPES, saveFile } from "@/lib/files";
import { undoImport } from "@/lib/importer";
import { AcademicRuleError } from "@/lib/academic/common";
import { StudentProblem } from "@/lib/students/students";
import { MoneyProblem } from "@/lib/fees/problem";
import { EventsProblem } from "@/lib/events/problem";
import {
  MoveInProblem, acceptAiColumns, addMissingClasses, addMissingOptions, addUpload, aiColumnInput, chooseRow, chooseSheet, fixRow, getFile, importFile,
  kindInfo, leaveOut, removeFile, setColumns, setTidy, setValues, undoFix,
} from "@/lib/move-in/service";
import { aiReady } from "@/lib/ai";
import { addPhotoUpload } from "@/lib/move-in/photos";
import { aiAllowed } from "@/lib/settings/switch-rules";
import { suggestColumnsByAi, type AiColumnsResult } from "@/lib/ai/smart-import";
import { bringable, placeCurrent, placeOf, placeOptions, placeRefusal } from "@/lib/imports/place-access";
import { fileHref, OWN_RULES, placeHolds, wordsFor, type ImportPlace } from "@/lib/imports/places";
import { fileBatchIds, reopenAfterUndo } from "@/lib/move-in/batches";
import { count, stayWords, undoWords } from "@/lib/imports/words";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// Refusals in plain words, from the engine and from each kind's own rules (an Undo that must wait, for example).
const KNOWN = [MoveInProblem, AcademicRuleError, FileProblem, PermissionDeniedError, StudentProblem, MoneyProblem, EventsProblem];
function problem(e: unknown): string {
  unstable_rethrow(e);
  if (KNOWN.some((K) => e instanceof K)) return (e as Error).message;
  console.error(JSON.stringify({ level: "error", event: "import-file-failed", error: e instanceof Error ? e.message : String(e) }));
  return "That did not work, and nothing was changed. Try again.";
}

async function run(fn: () => Promise<unknown>): Promise<string | void> {
  try {
    await fn();
  } catch (e) {
    return problem(e);
  }
}

/** The person must reach this place, and be allowed to add (or undo) the records this file holds there. */
async function forFile(placeKey: unknown, id: string, need: "create" | "archive" = "create") {
  const place = placeOf(placeKey);
  const current = await placeCurrent(place, need);
  if (!isId(id)) throw new MoveInProblem("This file was not found.");
  const f = await withSchool(current.ctx, (tx) => getFile(tx, id));
  if (!f) throw new MoveInProblem("This file was not found. It may have been removed.");
  const why = await placeRefusal(current, place, f.kind, need);
  if (why) throw new MoveInProblem(why);
  return { current, file: f, place };
}

const refresh = (place: ImportPlace, id?: string) => { revalidatePath(place.base); if (id) revalidatePath(fileHref(place, id)); };

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const kind = String(fd.get("kind") ?? "");
  const file = fd.get("file");
  const values: Record<string, string> = { kind };
  for (const k of ["sectionId", "applyFeePlan"]) { const v = fd.get(k); if (typeof v === "string") values[k] = v; }
  let place: ImportPlace;
  let ids: string[] = [];
  try {
    place = placeOf(fd.get("place"));
    const current = await placeCurrent(place, "create");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the file to upload.", errors: { file: "Choose the file to upload." }, values };
    const head = Buffer.from(await file.slice(0, 8).arrayBuffer());
    if (head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) {
      const m = "This is an old Excel file (.xls). Open it in Excel and use Save As, Excel Workbook (.xlsx) or CSV, then upload that.";
      return { ok: false, message: m, errors: { file: m }, values };
    }
    // A module's page brings in only its own kinds: one is always chosen there.
    if ((kind && !kindInfo(kind) && !place.kinds?.includes(kind)) || (!kind && place.kinds !== null) || (kind && !placeHolds(place, kind))) {
      return { ok: false, message: "Choose what the file holds.", errors: { kind: "Choose what the file holds." }, values };
    }
    if (kind) {
      const why = await placeRefusal(current, place, kind, "create");
      if (why) return { ok: false, message: why, errors: { kind: why }, values };
    }
    const options = await placeOptions(place, current, fd);
    // Switching to School OS works out what each sheet holds: never a kind whose own rules refuse this person.
    const strict = place.key === "settings" ? Object.keys(OWN_RULES) : [];
    const ok = await bringable(current, place, strict);
    const exclude = strict.filter((k) => !ok.has(k));
    ids = await withSchool(current.ctx, async (tx) => {
      const saved = await saveFile(tx, current.ctx, { file, purpose: "move-in", allowed: SHEET_TYPES });
      return addUpload(tx, current.ctx, current.permissions, { fileId: saved.id, fileName: file.name, kind: kind || null, options, exclude }, current.modulesOn);
    }, { timeout: 120_000 });
  } catch (e) {
    const m = problem(e);
    const field = e instanceof MoveInProblem && e.field ? e.field : "file";
    return { ok: false, message: m, errors: { [field]: m }, values };
  }
  if (ids.length > 1) {
    await flash({ message: `School OS found ${ids.length} sheets with records in ${file.name}. Open each one to check it and bring it in.` });
    refresh(place);
    redirect(place.base);
  }
  redirect(fileHref(place, ids[0]));
}

/**
 * Photos or scans of paper register pages (gap list G43): read by the AI
 * assistant into rows that open in the same review as any sheet. Refused in
 * plain words, with the ready sheet as the way on, while the AI assistant is off.
 */
export async function uploadPhotosAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const kind = String(fd.get("kind") ?? "");
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const values: Record<string, string> = { kind };
  for (const k of ["sectionId", "applyFeePlan", "privateCovered"]) { const v = fd.get(k); if (typeof v === "string") values[k] = v; }
  let place: ImportPlace;
  let made: { ids: string[]; dropped: string[] };
  try {
    place = placeOf(fd.get("place"));
    const current = await placeCurrent(place, "create");
    if ((kind && !kindInfo(kind) && !place.kinds?.includes(kind)) || (!kind && place.kinds !== null) || (kind && !placeHolds(place, kind))) {
      return { ok: false, message: "Choose what the pages hold.", errors: { kind: "Choose what the pages hold." }, values };
    }
    if (kind) {
      const why = await placeRefusal(current, place, kind, "create");
      if (why) return { ok: false, message: why, errors: { kind: why }, values };
    }
    const options = await placeOptions(place, current, fd);
    const strict = place.key === "settings" ? Object.keys(OWN_RULES) : [];
    const ok = await bringable(current, place, strict);
    const exclude = strict.filter((k) => !ok.has(k));
    made = await addPhotoUpload(current.ctx, current, { files, kind: kind || null, privateCovered: fd.get("privateCovered") === "on", options, exclude });
  } catch (e) {
    const m = problem(e);
    const field = e instanceof MoveInProblem && e.field ? e.field : "photos";
    return { ok: false, message: m, errors: { [field]: m }, values };
  }
  if (made.dropped.length) await flash({ message: `Read from the photos. Columns of ${made.dropped.join(" and ")} were left out: they are never kept from the AI assistant. Add them by hand later if needed.` });
  if (made.ids.length > 1) {
    refresh(place);
    redirect(place.base);
  }
  redirect(fileHref(place, made.ids[0]));
}

// ── Working on one file ───────────────────────────────────────────────────

export async function sheetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const kind = String(fd.get("kind") ?? "");
  let place: ImportPlace | null = null;
  const r = await run(async () => {
    const x = await forFile(fd.get("place"), id);
    place = x.place;
    // Another kind only where this page brings it in, and only one the person may add here.
    const why = await placeRefusal(x.current, x.place, kind, "create");
    if (why) throw new MoveInProblem(why);
    await withSchool(x.current.ctx, (tx) => chooseSheet(tx, x.current.ctx, id, {
      sheetIndex: Number(fd.get("sheetIndex")), headerRow: Number(fd.get("headerRow")), kind,
    }, x.current.permissions), { timeout: 60_000 });
  });
  if (r || !place) return { ok: false, message: r || "This page was not found." };
  refresh(place, id);
  redirect(`${fileHref(place, id)}?step=columns`);
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
  let place: ImportPlace | null = null;
  const r = await run(async () => {
    const x = await forFile(fd.get("place"), id);
    place = x.place;
    await withSchool(x.current.ctx, (tx) => setColumns(tx, id, match), { timeout: 60_000 });
  });
  if (r || !place) return { ok: false, message: r || "This page was not found." };
  refresh(place, id);
  redirect(`${fileHref(place, id)}?step=${next}`);
}

/**
 * Smart Import's AI suggestions for the columns the rules left. Only the headings and what
 * kind of values each column holds are sent; nothing changes until the person ticks and saves.
 */
export async function aiColumnsAction(placeKey: string, id: string): Promise<AiColumnsResult> {
  try {
    const { current } = await forFile(placeKey, id);
    if (!aiReady(current, "ai-smart-import")) return { ok: false, suggestions: [], message: "The AI assistant is not available for Smart Import here." };
    // The file is read in a short transaction; the AI service is asked outside it.
    const input = await withSchool(current.ctx, (tx) => aiColumnInput(tx, id), { timeout: 60_000 });
    return await suggestColumnsByAi(current.ctx, input);
  } catch (e) {
    return { ok: false, suggestions: [], message: problem(e) };
  }
}

/** The AI suggestions the person ticked, added to the column match. */
export async function acceptAiColumnsAction(placeKey: string, id: string, picks: { key: string; index: number }[]): Promise<string | void> {
  let place: ImportPlace | null = null;
  const r = await run(async () => {
    const x = await forFile(placeKey, id);
    place = x.place;
    // Only while Smart Import is on for this person: nothing AI-prepared is saved with AI off (00-global.md §2.1 rule 8).
    if (!aiAllowed(x.current, "ai-smart-import")) throw new MoveInProblem("Smart Import is off for your role here. Match the columns by hand.");
    if (!Array.isArray(picks)) throw new MoveInProblem("Tick the matches to use.");
    await withSchool(x.current.ctx, (tx) => acceptAiColumns(tx, x.current.ctx, id, picks.map((p) => ({ key: String(p?.key ?? ""), index: Number(p?.index) }))), { timeout: 60_000 });
  });
  if (r) return r;
  if (place) refresh(place, id);
}

/** Runs one change on an open file and refreshes its page. */
async function onFile(placeKey: string, id: string, work: (x: Awaited<ReturnType<typeof forFile>>) => Promise<unknown>): Promise<string | void> {
  let place: ImportPlace | null = null;
  const r = await run(async () => {
    const x = await forFile(placeKey, id);
    place = x.place;
    await work(x);
  });
  if (r) return r;
  if (place) refresh(place, id);
}

export async function tidyAction(placeKey: string, id: string, on: boolean): Promise<string | void> {
  return onFile(placeKey, id, ({ current }) => withSchool(current.ctx, (tx) => setTidy(tx, id, on)));
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
  const r = await onFile(String(fd.get("place") ?? ""), id, ({ current }) => withSchool(current.ctx, (tx) => setValues(tx, id, column, pairs)));
  if (r) return { ok: false, message: r };
  return { ok: true, message: "Saved. The rows are checked again with your choices." };
}

export async function addClassesAction(placeKey: string, id: string, words: string[]): Promise<string | void> {
  let added = 0;
  const r = await onFile(placeKey, id, async ({ current }) => {
    if (!can(current.permissions, "academic-management", "create")) throw new MoveInProblem("Your role cannot add classes. Ask your School Admin, or match these to classes that exist.");
    added = await withSchool(current.ctx, (tx) => addMissingClasses(tx, current.ctx, id, words), { timeout: 60_000 });
  });
  if (r) return r;
  await flash({ message: added ? `${added} ${added === 1 ? "class or section was" : "classes and sections were"} added to this year in Academic Management.` : "Matched to the classes that already exist." });
}

export async function addOptionsAction(placeKey: string, id: string, column: "designation" | "department", words: string[]): Promise<string | void> {
  let added = 0;
  const r = await onFile(placeKey, id, async ({ current }) => {
    if (column !== "designation" && column !== "department") throw new MoveInProblem("This column cannot be added to.");
    if (!can(current.permissions, "staff-hr-management", "edit")) throw new MoveInProblem("Your role cannot change HR Settings. Ask your School Admin, or match these to ones that exist.");
    added = await withSchool(current.ctx, (tx) => addMissingOptions(tx, current.ctx, id, column, words));
  });
  if (r) return r;
  await flash({ message: `${added} ${column === "designation" ? (added === 1 ? "designation" : "designations") : added === 1 ? "department" : "departments"} added to HR Settings.` });
}

export async function fixRowAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const line = Number(fd.get("line"));
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    const m = /^f_([A-Za-z]+)$/.exec(k);
    if (m && typeof v === "string") values[m[1]] = v;
  }
  const r = await onFile(String(fd.get("place") ?? ""), id, ({ current }) => withSchool(current.ctx, (tx) => fixRow(tx, id, line, values)));
  if (r) return { ok: false, message: r };
  return { ok: true, message: `Row ${line} saved and checked again.` };
}

export async function undoFixAction(placeKey: string, id: string, line: number): Promise<string | void> {
  return onFile(placeKey, id, ({ current }) => withSchool(current.ctx, (tx) => undoFix(tx, id, line)));
}

/** A choice for a row that may already be on record (same student, same family, a new student); "" takes it back. */
export async function chooseRowAction(placeKey: string, id: string, line: number, value: string): Promise<string | void> {
  return onFile(placeKey, id, ({ current }) => withSchool(current.ctx, (tx) => chooseRow(tx, current.ctx, id, line, value)));
}

export async function leaveOutAction(placeKey: string, id: string, lines: number[], out: boolean): Promise<string | void> {
  return onFile(placeKey, id, ({ current }) => withSchool(current.ctx, (tx) => leaveOut(tx, id, lines, out)));
}

export async function importAction(placeKey: string, id: string): Promise<string | void> {
  let result = { rows: 0, problems: 0, leftOut: 0 };
  let words = { one: "record", many: "records" };
  const r = await onFile(placeKey, id, async ({ current, file, place }) => {
    words = wordsFor(file.kind, kindInfo(file.kind)?.label ?? "records");
    result = await withSchool(current.ctx, (tx) => importFile(tx, current.ctx, id, { link: fileHref(place, id) }), { timeout: 300_000 });
  });
  if (r) return r;
  const stay = stayWords(result.problems, result.leftOut);
  await flash({ message: `Bringing in ${count(result.rows, words.one, words.many)}. You will get a notification when it is done.${stay ? ` ${stay}` : ""}` });
}

export async function removeAction(placeKey: string, id: string): Promise<string | void> {
  const r = await onFile(placeKey, id, ({ current }) => withSchool(current.ctx, (tx) => removeFile(tx, current.ctx, id)));
  if (r) return r;
  await flash({ message: "The file is removed from this list. Nothing it imported was changed." });
}

/**
 * Undoes one import a file made (a file brought in a part at a time has one
 * for each part); the rows it brought in go back to the file, to fix and
 * bring in again (workflow 15, "fix the file, undo and import again").
 */
export async function undoFileImportAction(placeKey: string, id: string, batchId: string): Promise<string | void> {
  let archived = 0;
  let putBack = 0;
  let words = { one: "record", many: "records" };
  const r = await run(async () => {
    const { current, file, place } = await forFile(placeKey, id, "archive");
    if (file.status === "importing") throw new MoveInProblem("This file is being imported. Wait for it to finish.");
    if (!isId(batchId) || !fileBatchIds(file).includes(batchId)) throw new MoveInProblem("This file has no such import to undo.");
    words = wordsFor(file.kind, kindInfo(file.kind)?.label ?? "records");
    await withSchool(current.ctx, async (tx) => {
      const batch = await tx.importBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new MoveInProblem("This import was not found.");
      if (batch.undoneAt) {
        // Undone elsewhere before the file heard of it: its rows go back to the file.
        await reopenAfterUndo(tx, batch.id);
      } else {
        try {
          const u = await undoImport(tx, current.ctx, batch.id);
          archived = u.archived;
          putBack = u.putBack;
        } catch (e) {
          if (e instanceof Error && e.constructor === Error) throw new MoveInProblem(e.message);
          throw e;
        }
      }
    }, { timeout: 120_000 });
    refresh(place, id);
  });
  if (r) return r;
  const done = undoWords(archived, putBack, words.one, words.many);
  await flash({ message: `Import undone.${done ? ` ${done}` : ""} Its rows are back with the file, to fix and bring in again.` });
}

/**
 * Undoes one earlier import from a page's history, as a whole. A file it came
 * from opens again, so the corrected rows can be brought in.
 */
export async function undoBatchAction(placeKey: string, batchId: string): Promise<string | void> {
  let archived = 0;
  let putBack = 0;
  let words = { one: "record", many: "records" };
  const r = await run(async () => {
    const place = placeOf(placeKey);
    if (!isId(batchId)) throw new MoveInProblem("This import was not found.");
    const current = await placeCurrent(place, "archive");
    await withSchool(current.ctx, async (tx) => {
      const batch = await tx.importBatch.findUnique({ where: { id: batchId } });
      if (!batch || !placeHolds(place, batch.kind)) throw new MoveInProblem("This import was not found.");
      const why = await placeRefusal(current, place, batch.kind, "archive");
      if (why) throw new MoveInProblem(why);
      if (batch.undoneAt) throw new MoveInProblem("This import was already undone.");
      try {
        const u = await undoImport(tx, current.ctx, batch.id);
        archived = u.archived;
        putBack = u.putBack;
      } catch (e) {
        if (e instanceof Error && e.constructor === Error) throw new MoveInProblem(e.message);
        throw e;
      }
      words = wordsFor(batch.kind, kindInfo(batch.kind)?.label ?? "records");
    }, { timeout: 120_000 });
    refresh(place);
  });
  if (r) return r;
  await flash({ message: `Import undone: ${count(archived, words.one, words.many)} taken back${putBack ? `, ${count(putBack, "record")} put back as ${putBack === 1 ? "it was" : "they were"}` : ""}. The import stays in the history.` });
}
