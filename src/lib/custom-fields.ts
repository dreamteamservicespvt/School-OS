// Custom fields on records and fields of custom forms (Settings, Forms &
// Approvals). Any module that shows a record's form uses these helpers with
// <CustomFieldInputs> from src/components/custom-fields.tsx:
//
//   const fields = visibleFields(await loadCustomFields(tx, "student"), current.roles);
//   const raw = readCustomFieldForm(formData, fields);
//   const checked = validateCustomValues(fields, raw);
//   if (!checked.ok) return { ok: false, errors: checked.errors, ... };
//   const stored = await storeCustomValues(tx, ctx, fields, checked.values, student.customFields);
//
// Values are kept on the record in its customFields JSON, by field key.
// Pure rules (no database) live in custom-field-rules.ts so the browser can
// use the same checks.
import "server-only";

import type { SchoolContext, Tx } from "./db";
import { DOCUMENT_TYPES, saveFile } from "./files";
import { seesRestricted, type SensitiveRole } from "./sensitive";
import {
  type CustomFieldDef,
  type CustomValue,
  type CustomValues,
  checkCustomValues,
  isFieldShown,
  toFieldDef,
} from "./custom-field-rules";

export * from "./custom-field-rules";

/** The live (not archived) custom fields of one record type, in order. */
export async function loadCustomFields(tx: Tx, recordType: string, opts: { includeArchived?: boolean } = {}): Promise<CustomFieldDef[]> {
  const rows = await tx.customField.findMany({
    where: { recordType, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toFieldDef);
}

/** Restricted fields are only for the School Admin and the Principal, unless the school set a role's sensitive fields (src/lib/sensitive.ts). */
export function visibleFields<F extends { visibility?: string }>(fields: F[], roles: readonly SensitiveRole[]): F[] {
  const allowed = seesRestricted(roles, ["school-admin", "principal"]);
  return fields.filter((f) => f.visibility !== "restricted" || allowed);
}

export type RawCustomValues = Record<string, string | File | null>;

/** Reads the custom field inputs (named "cf_<key>") from a submitted form. */
export function readCustomFieldForm(formData: FormData, fields: CustomFieldDef[]): RawCustomValues {
  const out: RawCustomValues = {};
  for (const f of fields) {
    const v = formData.get(`cf_${f.key}`);
    if (f.fieldType === "file") out[f.key] = v instanceof File && v.size > 0 ? v : null;
    else if (f.fieldType === "yesno") out[f.key] = v === "yes" || v === "no" ? v : "";
    else out[f.key] = typeof v === "string" ? v : "";
  }
  return out;
}

export type CheckedValues = { ok: true; values: Record<string, CustomValue | File> } | { ok: false; errors: Record<string, string> };

/**
 * Checks typed values against the fields. Fields hidden by their "show only
 * when" rule are skipped and their old value is dropped. File fields keep the
 * File for storeCustomValues.
 */
export function validateCustomValues(fields: CustomFieldDef[], raw: RawCustomValues, existing: CustomValues = {}): CheckedValues {
  const plain: Record<string, string> = {};
  const files: Record<string, File> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (v instanceof File) files[f.key] = v;
    else plain[f.key] = v ?? "";
  }
  const result = checkCustomValues(fields, plain, { filesGiven: new Set(Object.keys(files)), existing });
  if (!result.ok) return result;
  const values: Record<string, CustomValue | File> = { ...result.values };
  for (const [k, file] of Object.entries(files)) {
    const f = fields.find((x) => x.key === k);
    if (f && isFieldShown(f, result.values)) values[k] = file;
  }
  return { ok: true, values };
}

/** Saves uploaded files and returns the JSON to keep on the record, keeping values of archived fields. */
export async function storeCustomValues(tx: Tx, ctx: SchoolContext, fields: CustomFieldDef[], values: Record<string, CustomValue | File>, existing: unknown): Promise<CustomValues> {
  const before = (existing && typeof existing === "object" ? existing : {}) as CustomValues;
  const out: CustomValues = { ...before };
  for (const f of fields) {
    const v = values[f.key];
    if (v instanceof File) {
      const saved = await saveFile(tx, ctx, { file: v, purpose: "custom-field", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 });
      out[f.key] = { fileId: saved.id, name: saved.fileName };
    } else if (v === undefined || v === null || v === "") {
      if (f.fieldType !== "file" || !isFieldShown(f, values as CustomValues)) delete out[f.key];
    } else {
      out[f.key] = v;
    }
  }
  return out;
}
