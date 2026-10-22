"use server";

import type { FormState } from "@/lib/forms";
import { plural } from "@/lib/academic/common";
import { ExamRuleError } from "@/lib/exams/common";
import { loadPaper, readMarkRows as cleanRows, remindTeachers, reopenPaper, requestModeration, saveMarks, submitPaper, lockPapers, type MarkValue } from "@/lib/exams/marks";
import { assertInScope, assertYearInScope, teachesPaper } from "@/lib/exams/scope";
import { readTable } from "@/lib/move-in/read";
import { writeAudit } from "@/lib/audit";
import { assertYearOpen } from "@/lib/academic/years";
import { act, actSimple, str, BASE } from "../_lib/server";

export type MarkRow = { studentId: string } & MarkValue;
export type SaveResult = { ok: true; saved: number; done: number; of: number } | { ok: false; message: string; offline?: false };

const UUID = /^[0-9a-f-]{36}$/i;

/** Autosave: saves the rows that changed. Called as marks are typed. */
export async function saveMarksAction(entryId: string, sectionId: string, rows: unknown): Promise<SaveResult> {
  if (!UUID.test(entryId) || !UUID.test(sectionId)) return { ok: false, message: "This paper was not found. Reload the page." };
  let out: { saved: number; done: number; of: number } | null = null;
  const state = await act("edit", async ({ tx, current, scope }) => {
    out = await saveMarks(tx, current.ctx, scope, { entryId, sectionId, rows: cleanRows(rows) });
  }, { needs: "any", revalidate: [] });
  if (!state?.ok || !out) return { ok: false, message: state?.message ?? "The marks were not saved. Please try again." };
  return { ok: true, ...(out as { saved: number; done: number; of: number }) };
}

export async function submitPaperAction(entryId: string, sectionId: string) {
  return actSimple("edit", async ({ tx, current, scope }) => {
    const p = await submitPaper(tx, current.ctx, scope, entryId, sectionId);
    return { flash: { message: `${p.subject.name} marks for ${p.section.label} submitted: ${plural(p.students.length, "student")}. A change now needs a moderation request.` } };
  }, { needs: "any", revalidate: [`${BASE}/marks`] });
}

export async function reopenPaperAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return act("edit", async ({ tx, current, scope }) => {
    const p = await reopenPaper(tx, current.ctx, scope, str(fd, "entryId"), str(fd, "sectionId"), str(fd, "reason"));
    return { flash: { message: `${p.subject.name} marks for ${p.section.label} were sent back to the teacher.` } };
  }, { formData: fd, needs: "manage", revalidate: [`${BASE}/marks`] });
}

export async function lockPaperAction(entryId: string, sectionId: string) {
  return actSimple("edit", async ({ tx, current, scope }) => {
    await assertInScope(tx, scope, "paper", entryId);
    const entry = await tx.datesheetEntry.findFirst({ where: { id: entryId }, include: { exam: true } });
    if (!entry) throw new ExamRuleError("This paper was not found.");
    await assertYearOpen(tx, entry.exam.academicYearId);
    const paper = await tx.marksPaper.findFirst({ where: { entryId, sectionId } });
    if (paper?.status !== "SUBMITTED") throw new ExamRuleError("Only submitted marks can be locked.");
    await tx.marksPaper.update({ where: { id: paper.id }, data: { status: "LOCKED", lockedAt: new Date(), lockedById: current.ctx.userId } });
    await writeAudit(tx, current.ctx, { action: "marks-locked", recordType: "Marks Paper", recordId: paper.id, before: { status: "SUBMITTED" }, after: { status: "LOCKED" } });
    return { flash: { message: "Marks locked. A change now needs a moderation request with approval." } };
  }, { needs: "manage", revalidate: [`${BASE}/marks`] });
}

export async function lockExamAction(examId: string) {
  return actSimple("edit", async ({ tx, current, scope }) => {
    const r = await lockPapers(tx, current.ctx, scope, examId, null);
    return { flash: { message: `${plural(r.locked, "paper")} locked.${r.open ? ` ${plural(r.open, "paper")} ${r.open === 1 ? "is" : "are"} not submitted yet.` : ""}` } };
  }, { needs: "manage" });
}

export async function requestChangeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return act("edit", async ({ tx, current, scope }) => {
    const parts: Record<string, number | null> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("part:") && typeof v === "string") parts[k.slice(5)] = v.trim() === "" ? null : Number(v);
    const medical = fd.get("medical") === "on";
    const value: MarkValue = { parts, absent: medical || fd.get("absent") === "on", medical, grade: str(fd, "grade") || null, remark: null };
    const r = await requestModeration(tx, current.ctx, scope, { entryId: str(fd, "entryId"), sectionId: str(fd, "sectionId"), studentId: str(fd, "studentId"), value, reason: str(fd, "reason") });
    void r;
    return { flash: { message: "Change requested. The marks change when it is approved; you will be told." } };
  }, { formData: fd, needs: "any", revalidate: [`${BASE}/marks`] });
}

export type ImportedRow = { studentId: string; name: string; parts: Record<string, number | null>; absent: boolean; grade: string | null };
export type ImportResult = { ok: true; rows: ImportedRow[]; skipped: string[] } | { ok: false; message: string };

/**
 * Reads marks from an Excel or CSV sheet (P10) for the grid to fill in. Nothing
 * is saved here: the teacher checks the marks in the grid, and they autosave.
 */
export async function readMarksSheet(fd: FormData): Promise<ImportResult> {
  const file = fd.get("file");
  const entryId = str(fd, "entryId");
  const sectionId = str(fd, "sectionId");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the Excel or CSV file to read." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: "This file is too big. A marks sheet should be under 2 MB." };
  let result: ImportResult = { ok: false, message: "The file could not be read." };
  const state = await act("edit", async ({ tx, current, scope }) => {
    const paper = await loadPaper(tx, current.ctx, entryId, sectionId, scope);
    if (!paper) throw new ExamRuleError("This paper was not found.");
    if (!teachesPaper(scope, sectionId, paper.subject.id)) throw new ExamRuleError(`You do not teach ${paper.subject.name} in ${paper.section.label}.`);
    let sheet: { headers: string[]; rows: string[][] };
    try { sheet = await readTable(Buffer.from(await file.arrayBuffer()), file.name); } catch { throw new ExamRuleError("This file could not be read. Save it as .xlsx or .csv and try again."); }
    const h = sheet.headers.map((x) => x.trim().toLowerCase());
    const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
    const iAdm = col("admission no", "admission number", "admission no.");
    const iRoll = col("roll no", "roll", "roll no.", "roll number");
    const iAbs = col("absent");
    const iGrade = col("grade");
    if (iAdm < 0 && iRoll < 0) throw new ExamRuleError("The sheet needs an Admission no or a Roll no column. Download the template to see the layout.");
    const rows: ImportedRow[] = [];
    const skipped: string[] = [];
    sheet.rows.forEach((r, n) => {
      const adm = iAdm >= 0 ? (r[iAdm] ?? "").trim() : "";
      const roll = iRoll >= 0 ? Number.parseInt(r[iRoll] ?? "", 10) : NaN;
      const st = paper.students.find((s) => (adm && s.admissionNo.toLowerCase() === adm.toLowerCase()) || (!adm && Number.isFinite(roll) && s.rollNo === roll));
      if (!st) { skipped.push(`Row ${n + 2}: no student ${adm || (Number.isFinite(roll) ? `with roll ${roll}` : "")} in ${paper.section.label}.`); return; }
      const absent = iAbs >= 0 && /^(y|yes|ab|absent|1|true)$/i.test((r[iAbs] ?? "").trim());
      const parts: Record<string, number | null> = {};
      for (const c of paper.categories) {
        const i = col(c.name.toLowerCase(), `${c.name.toLowerCase()} (${c.max})`, `${c.name.toLowerCase()} / ${c.max}`);
        const raw = i >= 0 ? (r[i] ?? "").trim() : "";
        parts[c.name] = raw === "" || /^ab$/i.test(raw) ? null : Number(raw);
        if (/^ab$/i.test(raw)) parts[c.name] = null;
      }
      rows.push({ studentId: st.studentId, name: st.name, parts, absent, grade: iGrade >= 0 ? (r[iGrade] ?? "").trim().toUpperCase() || null : null });
    });
    if (rows.length === 0) throw new ExamRuleError(skipped[0] ?? "No students were found in the sheet.");
    result = { ok: true, rows, skipped: skipped.slice(0, 20) };
  }, { needs: "any", revalidate: [] });
  if (!state?.ok) return { ok: false, message: state?.message ?? "The file could not be read." };
  return result;
}

/** Reminds the teachers of the chosen papers ("entryId|sectionId") that are not submitted. */
export async function remindTeachersAction(keys: string[]) {
  return actSimple("edit", async ({ tx, current, scope, yearId }) => {
    if (!yearId) throw new ExamRuleError("There is no academic year.");
    const list = (Array.isArray(keys) ? keys : []).map(String).filter((k) => /^[0-9a-f-]{36}\|[0-9a-f-]{36}$/i.test(k)).slice(0, 1000);
    if (!list.length) throw new ExamRuleError("Choose the papers first.");
    // The papers' own year (each campus has its own), never another campus's for a person limited to one.
    const entry = await tx.datesheetEntry.findFirst({ where: { id: list[0].split("|")[0] }, select: { exam: { select: { academicYearId: true } } } });
    assertYearInScope(scope, entry?.exam.academicYearId, "paper");
    const r = await remindTeachers(tx, current.ctx, scope, entry?.exam.academicYearId ?? yearId, list);
    return { flash: { message: `Reminder sent to ${plural(r.teachers, "teacher")} about ${plural(r.papers, "paper")}.${r.noLogin ? ` ${plural(r.noLogin, "paper")} ${r.noLogin === 1 ? "has" : "have"} no teacher who can sign in; tell them in person.` : ""}` } };
  }, { needs: "manage", revalidate: [`${BASE}/marks`] });
}
