// The rules of custom fields and custom form fields, with no database, so the
// same checks run in the browser (as the person types) and on the server.

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "choice", label: "Choice (pick one)" },
  { value: "yesno", label: "Yes or no" },
  { value: "file", label: "File (photo or PDF)" },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]["value"];

export const CUSTOM_FIELD_RECORDS = [
  { value: "student", label: "Student" },
  { value: "guardian", label: "Parent / Guardian" },
  { value: "staff", label: "Staff" },
  { value: "enquiry", label: "Enquiry" },
  { value: "application", label: "Application" },
] as const;
export const recordLabel = (v: string) => CUSTOM_FIELD_RECORDS.find((r) => r.value === v)?.label ?? v;

export type ShowWhen = { fieldKey: string; equals: string };

export type CustomFieldDef = {
  id?: string;
  key: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  choices: string[];
  /** "everyone" (everyone who can see the record) or "restricted" (School Admin and Principal). */
  visibility?: string;
  help?: string | null;
  showWhen?: ShowWhen | null;
  archived?: boolean;
};

export type FileValue = { fileId: string; name: string };
export type CustomValue = string | number | boolean | FileValue;
export type CustomValues = Record<string, CustomValue>;

/** Turns a stored Custom Field row into a field definition. */
export function toFieldDef(row: { id: string; key: string; label: string; fieldType: string; required: boolean; choices: string[]; visibility: string; showWhen: unknown; archivedAt?: Date | null }): CustomFieldDef {
  const sw = row.showWhen as ShowWhen | null;
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    fieldType: (FIELD_TYPES.some((t) => t.value === row.fieldType) ? row.fieldType : "text") as FieldType,
    required: row.required,
    choices: row.choices,
    visibility: row.visibility,
    showWhen: sw && typeof sw.fieldKey === "string" ? { fieldKey: sw.fieldKey, equals: String(sw.equals ?? "") } : null,
    archived: Boolean(row.archivedAt),
  };
}

/** A value as the words used in a "show only when" rule and in the inputs: yes/no for booleans. */
export function valueAsText(v: CustomValue | undefined | null): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return v.name;
  return String(v);
}

/**
 * Is this field shown, given the other answers? A field whose controlling
 * field is itself hidden is hidden too.
 */
export function isFieldShown(field: CustomFieldDef, values: Record<string, unknown>, all?: CustomFieldDef[], depth = 0): boolean {
  if (!field.showWhen) return true;
  if (depth > 10) return false;
  if (all) {
    const parent = all.find((f) => f.key === field.showWhen!.fieldKey);
    if (!parent) return false;
    if (!isFieldShown(parent, values, all, depth + 1)) return false;
  }
  const v = values[field.showWhen.fieldKey];
  return valueAsText(v as CustomValue).trim().toLowerCase() === field.showWhen.equals.trim().toLowerCase();
}

/** Describes the rule in plain words: "Shown when Hostel boarder is Yes". */
export function showWhenWords(field: CustomFieldDef, all: CustomFieldDef[]) {
  if (!field.showWhen) return null;
  const parent = all.find((f) => f.key === field.showWhen!.fieldKey);
  const eq = field.showWhen.equals;
  const shownValue = eq === "yes" ? "Yes" : eq === "no" ? "No" : eq;
  return `Shown when ${parent?.label ?? "another field"} is ${shownValue}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_TEXT = 500;

/** Checks one typed value. Returns the stored value, or an error in plain words. */
export function checkOne(field: CustomFieldDef, input: string): { value: CustomValue | null } | { error: string } {
  const v = input.trim();
  if (v === "") return { value: null };
  switch (field.fieldType) {
    case "text":
      return v.length > MAX_TEXT ? { error: `${field.label} can be at most ${MAX_TEXT} characters.` } : { value: v };
    case "number": {
      const clean = v.replace(/,/g, "");
      if (!/^-?\d+(\.\d+)?$/.test(clean)) return { error: `${field.label} must be a number, like 25 or 2.5.` };
      return { value: Number(clean) };
    }
    case "date": {
      const d = new Date(`${v}T00:00:00Z`);
      if (!DATE.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { error: `${field.label} is not a real date.` };
      return { value: v };
    }
    case "choice":
      return field.choices.includes(v) ? { value: v } : { error: `Pick one of the choices for ${field.label}.` };
    case "yesno":
      if (v === "yes") return { value: true };
      if (v === "no") return { value: false };
      return { error: `Answer yes or no for ${field.label}.` };
    case "file":
      return { value: null };
  }
}

export type CheckResult = { ok: true; values: CustomValues } | { ok: false; errors: Record<string, string> };

/**
 * Checks every field. Errors are keyed "cf_<key>", like the inputs.
 * Hidden fields (by their rule) are not required and lose their value.
 */
export function checkCustomValues(fields: CustomFieldDef[], input: Record<string, string>, opts: { filesGiven?: Set<string>; existing?: CustomValues } = {}): CheckResult {
  const parsed: CustomValues = {};
  const errors: Record<string, string> = {};
  const live = fields.filter((f) => !f.archived);
  for (const f of live) {
    if (f.fieldType === "file") {
      const old = opts.existing?.[f.key];
      if (old && typeof old === "object") parsed[f.key] = old;
      continue;
    }
    const r = checkOne(f, input[f.key] ?? "");
    if ("error" in r) errors[`cf_${f.key}`] = r.error;
    else if (r.value !== null) parsed[f.key] = r.value;
  }
  const values: CustomValues = {};
  for (const f of live) {
    if (!isFieldShown(f, parsed, live)) {
      delete errors[`cf_${f.key}`];
      continue;
    }
    const has = f.fieldType === "file" ? Boolean(opts.filesGiven?.has(f.key) || parsed[f.key]) : parsed[f.key] !== undefined;
    if (f.required && !has && !errors[`cf_${f.key}`]) {
      errors[`cf_${f.key}`] = f.fieldType === "file" ? `Upload ${f.label}.` : f.fieldType === "choice" || f.fieldType === "yesno" ? `Choose ${f.label}.` : `${f.label} is needed.`;
    }
    if (parsed[f.key] !== undefined) values[f.key] = parsed[f.key];
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** A short key made from a label, unique among the others: "Hostel boarder" -> "hostel_boarder". */
export function keyFromLabel(label: string, taken: Iterable<string>) {
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
  const used = new Set(taken);
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}_${i}`;
  return key;
}

export type FieldDraft = { label: string; fieldType: string; required: boolean; choices: string[]; showWhen: ShowWhen | null; help?: string | null };

/**
 * Checks a field definition before it is saved. "others" are the other
 * fields of the same record or form (the rule may only point at one of them).
 */
export function checkFieldDefinition(d: FieldDraft, others: CustomFieldDef[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const label = d.label.trim();
  if (!label) errors.label = "Label is needed.";
  else if (label.length > 80) errors.label = "Label can be at most 80 characters.";
  else if (others.some((o) => !o.archived && o.label.trim().toLowerCase() === label.toLowerCase())) errors.label = `There is already a field called "${label}". Use a different label.`;
  if (!FIELD_TYPES.some((t) => t.value === d.fieldType)) errors.fieldType = "Choose the type of field.";
  if (d.fieldType === "choice") {
    const clean = d.choices.map((c) => c.trim()).filter(Boolean);
    if (clean.length < 2) errors.choices = "Give at least 2 choices, one per line.";
    else if (new Set(clean.map((c) => c.toLowerCase())).size !== clean.length) errors.choices = "Each choice must be different.";
    else if (clean.some((c) => c.length > 80)) errors.choices = "Each choice can be at most 80 characters.";
    else if (clean.length > 50) errors.choices = "Use at most 50 choices.";
  }
  if (d.help && d.help.length > 200) errors.help = "Help text can be at most 200 characters.";
  if (d.showWhen) {
    const parent = others.find((o) => o.key === d.showWhen!.fieldKey && !o.archived);
    if (!parent) errors.showWhenField = "Pick the field this one depends on.";
    else if (!["choice", "yesno"].includes(parent.fieldType)) errors.showWhenField = `${parent.label} is not a choice or yes-or-no field, so it cannot control another field.`;
    else if (!d.showWhen.equals) errors.showWhenValue = `Pick the answer of ${parent.label} that shows this field.`;
    else if (parent.fieldType === "choice" && !parent.choices.includes(d.showWhen.equals)) errors.showWhenValue = `${d.showWhen.equals} is not one of the choices of ${parent.label}.`;
    else if (parent.fieldType === "yesno" && !["yes", "no"].includes(d.showWhen.equals)) errors.showWhenValue = "Pick Yes or No.";
  }
  return errors;
}

/** Would pointing "field" at "parentKey" make a loop (A shows when B, B shows when A)? */
export function makesLoop(fieldKey: string, parentKey: string, all: CustomFieldDef[]) {
  let cur: string | undefined = parentKey;
  for (let i = 0; cur && i < 50; i++) {
    if (cur === fieldKey) return true;
    cur = all.find((f) => f.key === cur)?.showWhen?.fieldKey;
  }
  return false;
}
