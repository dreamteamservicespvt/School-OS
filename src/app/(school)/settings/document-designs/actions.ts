"use server";

import { revalidatePath } from "next/cache";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { FileProblem, IMAGE_TYPES, saveFile } from "@/lib/files";
import { renderDocument } from "@/lib/documents";
import { DesignProblem, optionsSchema, saveDesign, restoreVersion, BASES, type BaseKey } from "@/lib/documents/designs";
import { recordData, type RecordRef } from "@/lib/documents/records";
import { findDocType } from "@/lib/documents/types";
import { addSignatory, archiveSignatory, SignatoryProblem } from "@/lib/documents/signatories";

const PATH = "/settings/document-designs";
const PAGE = "document-designs" as const;

export type { RecordRef } from "@/lib/documents/records";

export type PreviewResult = { ok: true; html: string } | { ok: false; message: string };

/** Live preview in the editor: the unsaved design with sample data or a real record. */
export async function previewDesign(docType: string, base: string, optionsJson: string, record: RecordRef): Promise<PreviewResult> {
  const { current } = await requireSettingsAction(PAGE, "view");
  const t = findDocType(docType);
  if (!t) return { ok: false, message: "This document type is not known." };
  let raw: unknown;
  try {
    raw = JSON.parse(optionsJson);
  } catch {
    return { ok: false, message: "The design could not be read. Reload the page." };
  }
  const parsed = optionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Some choices are not right." };
  if (!BASES.some((b) => b.key === base)) return { ok: false, message: "Choose a ready design." };
  // A real record is used only when the person may see every record of that kind.
  if (record && current.permissions[record.kind === "student" ? "student-management" : "staff-hr-management"].see !== "all") record = null;
  try {
    const html = await withSchool(current.ctx, async (tx) => {
      const data = await recordData(tx, current.ctx, t.key, record, current.school.timeZone);
      return (await renderDocument(tx, current.ctx, t.key, t.family === "card" ? [data, data] : data, { design: { base: base as BaseKey, options: parsed.data } })).html;
    });
    return { ok: true, html };
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "design-preview", error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, message: "The preview could not be made. Your changes are still here. Try again." };
  }
}

export type RecordHit = { kind: "student" | "staff"; id: string; label: string };

/** Finds students or staff to preview with. Needs permission to see them. */
export async function findRecords(kind: "student" | "staff", q: string): Promise<RecordHit[]> {
  const { current } = await requireSettingsAction(PAGE, "view");
  const area = kind === "student" ? "student-management" : "staff-hr-management";
  if (current.permissions[area].see !== "all") return [];
  const text = q.trim().slice(0, 60);
  return withSchool(current.ctx, async (tx) => {
    if (kind === "student") {
      const rows = await tx.student.findMany({
        where: { archivedAt: null, ...(text ? { OR: [{ fullName: { contains: text, mode: "insensitive" } }, { admissionNo: { contains: text, mode: "insensitive" } }] } : {}) },
        orderBy: { fullName: "asc" }, take: 8, select: { id: true, fullName: true, admissionNo: true },
      });
      return rows.map((r) => ({ kind, id: r.id, label: `${r.fullName} (${r.admissionNo})` }));
    }
    const rows = await tx.staff.findMany({
      where: { archivedAt: null, ...(text ? { OR: [{ fullName: { contains: text, mode: "insensitive" } }, { staffCode: { contains: text, mode: "insensitive" } }] } : {}) },
      orderBy: { fullName: "asc" }, take: 8, select: { id: true, fullName: true, staffCode: true, designation: true },
    });
    return rows.map((r) => ({ kind, id: r.id, label: `${r.fullName}, ${r.designation} (${r.staffCode})` }));
  });
}

export async function saveDesignAction(docType: string, base: string, optionsJson: string): Promise<{ ok: boolean; message: string }> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  let raw: unknown;
  try {
    raw = JSON.parse(optionsJson);
  } catch {
    return { ok: false, message: "The design could not be read. Reload the page and try again." };
  }
  try {
    const row = await withSchool(current.ctx, (tx) => saveDesign(tx, current.ctx, docType, base, raw));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${docType}`);
    return { ok: true, message: `Saved as version ${row.version}. Every ${findDocType(docType)?.label.toLowerCase()} printed from now on uses it.` };
  } catch (e) {
    if (e instanceof DesignProblem) return { ok: false, message: e.message };
    console.error(JSON.stringify({ level: "error", event: "design-save", error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, message: "That did not save. Your changes are still here. Try again." };
  }
}

export async function restoreVersionAction(docType: string, version: number): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  try {
    const row = await withSchool(current.ctx, (tx) => restoreVersion(tx, current.ctx, docType, version));
    await flash({ message: `Version ${version} is in use again, saved as version ${row.version}.` });
  } catch (e) {
    return e instanceof DesignProblem ? e.message : "That did not work. Nothing was changed. Try again.";
  }
  revalidatePath(`${PATH}/${docType}`);
}

export async function uploadCardBackground(fd: FormData): Promise<{ ok: true; fileId: string } | { ok: false; message: string }> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a picture to upload." };
  try {
    const saved = await withSchool(current.ctx, (tx) => saveFile(tx, current.ctx, { file, purpose: "card-background", allowed: IMAGE_TYPES, maxImageWidth: 1200 }));
    return { ok: true, fileId: saved.id };
  } catch (e) {
    return { ok: false, message: e instanceof FileProblem ? e.message : "The picture did not upload. Try again." };
  }
}

export async function addSignatoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "create");
  const values = formValues(fd);
  const image = fd.get("image");
  try {
    const row = await withSchool(current.ctx, (tx) => addSignatory(tx, current.ctx, { name: values.name ?? "", title: values.title ?? "", image: image instanceof File ? image : null }));
    revalidatePath(PATH);
    return { ok: true, message: `${row.name} added. Choose ${row.name} as a signatory in each design that needs this signature.` };
  } catch (e) {
    if (e instanceof SignatoryProblem || e instanceof FileProblem) {
      const field = e instanceof SignatoryProblem ? e.field : "image";
      return { ok: false, message: e.message, errors: field ? { [field]: e.message } : undefined, values };
    }
    return { ok: false, message: "That did not save. Try again.", values };
  }
}

export async function archiveSignatoryAction(id: string): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "archive");
  try {
    const { using } = await withSchool(current.ctx, (tx) => archiveSignatory(tx, current.ctx, id));
    await flash({ message: using.length ? `Signatory archived. It no longer prints on ${using.length} design${using.length === 1 ? "" : "s"} that used it.` : "Signatory archived." });
  } catch (e) {
    return e instanceof SignatoryProblem ? e.message : "That did not work. Try again.";
  }
  revalidatePath(PATH);
}
