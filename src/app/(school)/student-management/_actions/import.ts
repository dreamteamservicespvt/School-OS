"use server";

// Importing students through the shared importer (P10): upload, match
// columns, preview, import the good rows, and undo the whole import later.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { SHEET_TYPES, saveFile } from "@/lib/files";
import { previewImport, runImport, undoImport } from "@/lib/importer";
import { STUDENT_IMPORT_KINDS, STUDENT_UPDATE_IMPORT, studentImportFor } from "@/lib/students/import-kinds";
import { StudentProblem } from "@/lib/students/students";
import { acceptedFixes, applyFixes, suggestMatch } from "@/lib/students/smart-import";
import { aiAllowed } from "@/lib/settings/switch-rules";
import { aiReady } from "@/lib/ai";
import { aiConfirmedNote } from "@/lib/ai/audit";
import { writeAudit } from "@/lib/audit";
import { suggestColumnsByAi, type AiColumnsResult } from "@/lib/ai/smart-import";
import { BASE, attempt, attemptForm, studentAction } from "../_lib/page";
import { aiPicksFrom, decisionsFromJson, loadSheet } from "../import/load";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const KINDS = STUDENT_IMPORT_KINDS;

export async function uploadImportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("create", { manage: true });
  const values = formValues(fd);
  const kind = String(fd.get("kind") ?? "");
  const sectionId = String(fd.get("sectionId") ?? "");
  const fee = fd.get("applyFeePlan") === "on";
  const file = fd.get("file");
  if (!KINDS.includes(kind)) return { ok: false, message: "Choose what you are importing.", errors: { kind: "Choose what you are importing." }, values };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the file to upload.", errors: { file: "Choose the file to upload." }, values };
  let fileId = "";
  const r = await attemptForm(values, async () => {
    await withSchool(current.ctx, async (tx) => {
      if (isId(sectionId) && !(await tx.section.findFirst({ where: { id: sectionId, archivedAt: null, ...(current.campusId ? { schoolClass: { campusId: current.campusId } } : {}) } }))) throw new StudentProblem("Choose the class and section again.", "sectionId");
      fileId = (await saveFile(tx, current.ctx, { file, purpose: "student-import", allowed: SHEET_TYPES })).id;
      await loadSheet(tx, fileId);
    }, { timeout: 60_000 });
  });
  if (!r?.ok) return r;
  redirect(`${BASE}/import/match?file=${fileId}&kind=${kind}${isId(sectionId) ? `&section=${sectionId}` : ""}${fee ? "&fee=1" : ""}`);
}

export async function runImportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("create", { manage: true });
  const fileId = String(fd.get("file") ?? "");
  const kindKey = String(fd.get("kind") ?? "");
  const sectionId = String(fd.get("section") ?? "");
  const fee = fd.get("fee") === "1";
  let match: Record<string, number> = {};
  try {
    const raw = JSON.parse(String(fd.get("match") ?? "{}")) as Record<string, unknown>;
    match = Object.fromEntries(Object.entries(raw).filter(([, v]) => Number.isInteger(v) && (v as number) >= 0)) as Record<string, number>;
  } catch {
    return { ok: false, message: "The column match could not be read. Reload the page and try again." };
  }
  if (!isId(fileId) || !KINDS.includes(kindKey)) return { ok: false, message: "Upload the file again." };
  let batchId = "";
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const r = await attemptForm({}, async () => {
    await withSchool(current.ctx, async (tx) => {
      const sheet = await loadSheet(tx, fileId);
      // One campus: students go only into that campus's sections.
      if (isId(sectionId) && current.campusId && !(await tx.section.count({ where: { id: sectionId, schoolClass: { campusId: current.campusId } } }))) throw new StudentProblem("Choose the class and section again.", "sectionId");
      const kind = studentImportFor(kindKey, { sectionId: isId(sectionId) ? sectionId : null, applyFeePlan: fee });
      // Smart Import: only the fixes the person ticked, and only when Smart Import is on for them (Settings, Modules On/Off).
      const smart = aiAllowed(current, "ai-smart-import");
      const rows = smart ? applyFixes(sheet.rows, match, acceptedFixes(String(fd.get("fix") ?? ""))) : sheet.rows;
      const decisions = kindKey === STUDENT_UPDATE_IMPORT ? {} : decisionsFromJson(String(fd.get("decisions") ?? ""));
      const preview = await previewImport(tx, current.ctx, kind, rows, match, decisions);
      if (preview.good.length === 0) throw new StudentProblem("No row is ready to import. Fix the problems shown, then upload the file again.");
      const batch = await runImport(tx, current.ctx, kind, sheet.file.fileName, preview);
      batchId = batch.id; added = batch.added; updated = batch.updated; skipped = batch.skipped;
      // Columns matched from the AI assistant's suggestion, ticked by this person (00-global.md §2.1 rule 6).
      const fromAi = smart ? aiPicksFrom(String(fd.get("ai") ?? ""), match).filter((k) => kind.columns.some((c) => c.key === k)) : [];
      if (fromAi.length) {
        await writeAudit(tx, current.ctx, {
          action: "columns-matched", recordType: "Import Batch", recordId: batch.id,
          after: { file: sheet.file.fileName, columns: fromAi.map((k) => ({ column: kind.columns.find((c) => c.key === k)!.label, heading: sheet.headers[match[k]] ?? "" })) },
          actorNote: await aiConfirmedNote(tx, current.ctx),
        });
      }
    }, { timeout: 300_000 });
  });
  if (!r?.ok) return r;
  const done = kindKey === STUDENT_UPDATE_IMPORT ? `${updated} ${updated === 1 ? "student" : "students"} updated.` : `${added} students imported${updated ? `, ${updated} already here updated` : ""}.`;
  await flash({ message: `${done}${skipped ? ` ${skipped} rows were skipped; download them, fix and import again.` : ""}` });
  revalidatePath(BASE);
  redirect(`${BASE}/import/${batchId}`);
}

/**
 * Smart Import's AI suggestions for the columns the rules left: only the headings and
 * what kind of values each column holds are sent. Nothing changes here; the person
 * ticks what to use on the page.
 */
export async function aiColumnsAction(fileId: string, kindKey: string, matchJson: string): Promise<AiColumnsResult> {
  const { current } = await studentAction("create", { manage: true });
  if (!aiReady(current, "ai-smart-import")) return { ok: false, suggestions: [], message: "The AI assistant is not available for Smart Import here." };
  if (!isId(fileId) || !KINDS.includes(kindKey)) return { ok: false, suggestions: [], message: "Upload the file again." };
  let match: Record<string, number> = {};
  try {
    const raw = JSON.parse(matchJson || "{}") as Record<string, unknown>;
    match = Object.fromEntries(Object.entries(raw).filter(([, v]) => Number.isInteger(v) && (v as number) >= 0)) as Record<string, number>;
  } catch {
    return { ok: false, suggestions: [], message: "Reload the page and try again." };
  }
  // The file is read in a short transaction; the AI service is asked outside it.
  const read = await withSchool(current.ctx, (tx) => loadSheet(tx, fileId)).catch((e) => (e instanceof StudentProblem ? e.message : null));
  if (read === null || typeof read === "string") return { ok: false, suggestions: [], message: read ?? "The file could not be read. Upload it again." };
  const kind = studentImportFor(kindKey, { sectionId: null, applyFeePlan: false });
  // The rules go first: their suggestions are not asked again.
  const rules = suggestMatch(kind.columns, read.headers, read.rows, match);
  const matched = new Set([...Object.keys(match), ...rules.map((r) => r.key)]);
  const used = new Set([...Object.values(match), ...rules.map((r) => r.index)]);
  return suggestColumnsByAi(current.ctx, { importing: "Students", fields: kind.columns.map((c) => ({ key: c.key, label: c.label })), headers: read.headers, rows: read.rows, matched, used });
}

export async function undoImportAction(fd: FormData) {
  const { current } = await studentAction("archive", { manage: true });
  const id = String(fd.get("id") ?? "");
  if (!isId(id)) return "This import was not found.";
  let putBack = 0;
  let changes = false;
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id } });
    if (!batch || !KINDS.includes(batch.kind)) throw new StudentProblem("This import was not found.");
    if (batch.undoneAt) throw new StudentProblem("This import was already undone.");
    const u = await undoImport(tx, current.ctx, id);
    putBack = u.putBack;
    changes = batch.kind === STUDENT_UPDATE_IMPORT;
  }, { timeout: 120_000 }));
  if (r) return r;
  await flash({ message: changes ? `Import undone. ${putBack} ${putBack === 1 ? "student is" : "students are"} back to the values before it; any value changed since was kept.` : "Import undone. The students it added are archived, and the import stays in the history." });
  revalidatePath(BASE);
}
