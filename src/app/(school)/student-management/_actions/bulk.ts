"use server";

// Bulk actions from the Student List (03 §2): field update with a before and
// after preview and Undo, section change, profile photos matched by admission
// number, and student logins.

import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import type { FormState } from "@/lib/forms";
import { applyBulkUpdate, bulkChangeSection, matchPhotos, previewBulkUpdate, saveBulkPhotos, type BulkRow, type PhotoMatch } from "@/lib/students/bulk";
import { generateLogins, loginsCsv } from "@/lib/students/logins";
import { loadVisibleStudent } from "@/lib/students/access";
import { campusAllows, sectionCampusId } from "@/lib/campus";
import { StudentProblem } from "@/lib/students/students";
import { BULK_FIELDS } from "@/lib/students/labels";
import { MAX_FILE_BYTES } from "@/lib/files";
import { BASE, attemptForm, origin, studentAction } from "../_lib/page";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const RESTRICTED = new Set(["apaarId", "pen"]);

export async function bulkFieldAction(_prev: FormState, fd: FormData): Promise<FormState<{ step: "preview" | "done"; rows: BulkRow[] }>> {
  const { current, can } = await studentAction("edit", { manage: true });
  const field = String(fd.get("field") ?? "");
  const step = fd.get("step") === "apply" ? "apply" : "preview";
  if (!BULK_FIELDS.some((f) => f.key === field)) return { ok: false, message: "Choose a field to update.", errors: { field: "Choose a field to update." } };
  if (RESTRICTED.has(field) && !can.seeRestricted) return { ok: false, message: "Only people who may see restricted details can change this field." };
  const ids = [...new Set(fd.getAll("ids").map(String).filter(isId))].slice(0, 500);
  const same = String(fd.get("same") ?? "");
  const values = ids.map((studentId) => ({ studentId, value: fd.get("useSame") === "on" ? same : String(fd.get(`v_${studentId}`) ?? "") }));
  if (values.length === 0) return { ok: false, message: "Choose the students first." };
  let rows: BulkRow[] = [];
  let undoId = "";
  let updated = 0;
  const r = await attemptForm({}, async () => {
    await withSchool(current.ctx, async (tx) => {
      for (const v of values) await loadVisibleStudent(tx, current, v.studentId);
      if (step === "preview") rows = await previewBulkUpdate(tx, current.ctx, field, values);
      else {
        const out = await applyBulkUpdate(tx, current.ctx, field, values);
        rows = out.rows; undoId = out.batch.id; updated = out.updated;
      }
    }, { timeout: 120_000 });
  });
  if (!r?.ok) return r as FormState<never>;
  if (step === "preview") {
    const changing = rows.filter((x) => !x.problem && x.before !== x.after).length;
    return { ok: true, message: `${changing} will change. Check the list, then save.`, data: { step: "preview", rows } };
  }
  const label = BULK_FIELDS.find((f) => f.key === field)!.label.toLowerCase();
  await flash({ message: `${label.charAt(0).toUpperCase()}${label.slice(1)} updated for ${updated} ${updated === 1 ? "student" : "students"}.`, undo: { kind: "student-bulk-update", id: undoId } });
  revalidatePath(BASE);
  return { ok: true, message: `Saved for ${updated} ${updated === 1 ? "student" : "students"}. You can undo it from the message.`, data: { step: "done", rows } };
}

export async function bulkSectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const ids = [...new Set(fd.getAll("ids").map(String).filter(isId))].slice(0, 500);
  const to = String(fd.get("toSectionId") ?? "");
  if (!isId(to)) return { ok: false, message: "Choose the section to move them to.", errors: { toSectionId: "Choose the section to move them to." } };
  if (ids.length === 0) return { ok: false, message: "Choose the students first." };
  let out = { moved: 0, skipped: [] as string[] };
  const r = await attemptForm({ toSectionId: to }, async () => {
    out = await withSchool(current.ctx, async (tx) => {
      for (const id of ids) await loadVisibleStudent(tx, current, id);
      // One campus: only that campus's sections.
      if (!campusAllows(current, await sectionCampusId(tx, to))) throw new StudentProblem("Choose a section of your campus.", "toSectionId");
      return bulkChangeSection(tx, current.ctx, ids, to);
    }, { timeout: 120_000 });
  });
  if (!r?.ok) return r;
  revalidatePath(BASE);
  return { ok: out.moved > 0, message: `${out.moved} moved.${out.skipped.length ? ` Not moved: ${out.skipped.join(" ")}` : ""} Each student's class history keeps the earlier section.` };
}

export async function bulkPhotosAction(_prev: FormState, fd: FormData): Promise<FormState<{ step: "match" | "done"; matches: PhotoMatch[]; skipped?: string[] }>> {
  const { current } = await studentAction("edit", { manage: true });
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 200);
  if (files.length === 0) return { ok: false, message: "Choose the photos.", errors: { photos: "Choose the photos." } };
  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) return { ok: false, message: `${tooBig.name} is larger than 10 MB.`, errors: { photos: `${tooBig.name} is larger than 10 MB.` } };
  const step = fd.get("step") === "save" ? "save" : "match";
  const replaceExisting = fd.get("replaceExisting") === "on";
  const skip = new Set(fd.getAll("skip").map(String));
  let matches: PhotoMatch[] = [];
  let result = { saved: 0, skipped: [] as string[] };
  const r = await attemptForm({}, async () => {
    await withSchool(current.ctx, async (tx) => {
      matches = await matchPhotos(tx, files.map((f) => f.name), current.campusId);
      if (step === "save") result = await saveBulkPhotos(tx, current.ctx, files, { replaceExisting, skip, campusId: current.campusId });
    }, { timeout: 300_000 });
  });
  if (!r?.ok) return r as FormState<never>;
  if (step === "match") {
    const ok = matches.filter((m) => m.studentId && !m.problem).length;
    return { ok: true, message: `${ok} of ${files.length} photos match a student. Check the list, then save.`, data: { step: "match", matches } };
  }
  revalidatePath(BASE);
  return { ok: true, message: `${result.saved} photos saved.`, data: { step: "done", matches, skipped: result.skipped } };
}

export async function loginsAction(_prev: FormState, fd: FormData): Promise<FormState<{ csv: string; count: number; fresh: number }>> {
  const { current, settings } = await studentAction("edit", { manage: true });
  if (!settings.studentLoginsOn) return { ok: false, message: "Student logins are switched off in Student Settings." };
  const ids = [...new Set(fd.getAll("ids").map(String).filter(isId))].slice(0, 500);
  if (ids.length === 0) return { ok: false, message: "Choose the students first." };
  const site = await origin();
  let csv = "";
  let count = 0;
  let fresh = 0;
  const r = await attemptForm({}, async () => {
    await withSchool(current.ctx, async (tx) => {
      for (const id of ids) await loadVisibleStudent(tx, current, id);
      const lines = await generateLogins(tx, current.ctx, ids, site);
      csv = loginsCsv(lines); count = lines.length; fresh = lines.filter((l) => l.isNew).length;
    }, { timeout: 120_000 });
  });
  if (!r?.ok) return r as FormState<never>;
  return { ok: true, message: `${count} logins ready (${fresh} new). Download the list now: the set-password links are shown only once and work for 7 days.`, data: { csv, count, fresh } };
}
