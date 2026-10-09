// Forms & Approvals (Settings): custom fields on records, and custom forms
// built from fields. Archiving a field keeps every answer already given.
import "server-only";

import { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import {
  CUSTOM_FIELD_RECORDS,
  checkFieldDefinition,
  keyFromLabel,
  makesLoop,
  toFieldDef,
  type CustomFieldDef,
  type FieldDraft,
  type FieldType,
} from "../custom-field-rules";
import { SettingsProblem } from "./common";

export class FieldProblem extends SettingsProblem {
  constructor(readonly errors: Record<string, string>) {
    const list = Object.values(errors);
    super(list.length === 1 ? list[0] : `Please fix ${list.length} things before saving.`);
  }
}

export type FieldInput = FieldDraft & { visibility: string };

function cleanDraft(d: FieldInput) {
  return {
    label: d.label.trim().replace(/\s+/g, " "),
    fieldType: d.fieldType as FieldType,
    required: d.required,
    choices: d.fieldType === "choice" ? d.choices.map((c) => c.trim()).filter(Boolean) : [],
    showWhen: d.showWhen && d.showWhen.fieldKey ? d.showWhen : null,
    visibility: d.visibility === "restricted" ? "restricted" : "everyone",
  };
}

async function siblings(tx: Tx, recordType: string) {
  return (await tx.customField.findMany({ where: { recordType }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(toFieldDef);
}

export async function createField(tx: Tx, ctx: SchoolContext, recordType: string, input: FieldInput) {
  if (!CUSTOM_FIELD_RECORDS.some((r) => r.value === recordType)) throw new FieldProblem({ recordType: "Choose the record." });
  const others = await siblings(tx, recordType);
  const d = cleanDraft(input);
  const errors = checkFieldDefinition(d, others);
  if (Object.keys(errors).length) throw new FieldProblem(errors);
  const key = keyFromLabel(d.label, others.map((o) => o.key));
  const sortOrder = others.length ? Math.max(...(await tx.customField.findMany({ where: { recordType }, select: { sortOrder: true } })).map((o) => o.sortOrder)) + 1 : 0;
  const row = await tx.customField.create({
    data: { schoolId: ctx.schoolId, recordType, key, label: d.label, fieldType: d.fieldType, required: d.required, choices: d.choices, visibility: d.visibility, showWhen: d.showWhen ?? undefined, sortOrder },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Custom Field", recordId: row.id, after: { record: recordType, ...d } as Prisma.InputJsonValue });
  return row;
}

export async function editField(tx: Tx, ctx: SchoolContext, id: string, input: FieldInput) {
  const row = await tx.customField.findUnique({ where: { id } });
  if (!row || row.archivedAt) throw new SettingsProblem("This field was not found. It may have been archived.");
  const others = (await siblings(tx, row.recordType)).filter((f) => f.id !== id);
  const d = cleanDraft(input);
  const errors = checkFieldDefinition(d, others);
  if (d.showWhen && makesLoop(row.key, d.showWhen.fieldKey, [...others, toFieldDef(row)])) errors.showWhenField = "That would make the two fields depend on each other. Pick another field.";
  // The type cannot change once set: answers already given would no longer fit.
  if (d.fieldType !== row.fieldType) errors.fieldType = "The type of a field cannot change once it is saved. Archive it and add a new field instead.";
  if (Object.keys(errors).length) throw new FieldProblem(errors);
  const before = { label: row.label, required: row.required, choices: row.choices, visibility: row.visibility, showWhen: row.showWhen };
  const after = { label: d.label, required: d.required, choices: d.choices, visibility: d.visibility, showWhen: d.showWhen };
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  await tx.customField.update({ where: { id }, data: { label: d.label, required: d.required, choices: d.choices, visibility: d.visibility, showWhen: d.showWhen ?? Prisma.DbNull } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Custom Field", recordId: id, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue });
  return true;
}

/** Moves a field up or down in its record's form. */
export async function moveField(tx: Tx, ctx: SchoolContext, id: string, direction: "up" | "down") {
  const row = await tx.customField.findUnique({ where: { id } });
  if (!row) throw new SettingsProblem("This field was not found.");
  const list = await tx.customField.findMany({ where: { recordType: row.recordType, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const i = list.findIndex((f) => f.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  for (const [n, f] of list.entries()) if (f.sortOrder !== n) await tx.customField.update({ where: { id: f.id }, data: { sortOrder: n } });
  await writeAudit(tx, ctx, { action: "reordered", recordType: "Custom Field", recordId: id, after: { label: row.label, direction } });
  return true;
}

/** Archives a field; answers already given are kept. Fields that depend on it would lose their rule, so they are named. */
export async function setFieldArchived(tx: Tx, ctx: SchoolContext, id: string, archived: boolean) {
  const row = await tx.customField.findUnique({ where: { id } });
  if (!row) throw new SettingsProblem("This field was not found.");
  if (Boolean(row.archivedAt) === archived) return row;
  if (archived) {
    const dependants = (await siblings(tx, row.recordType)).filter((f) => !f.archived && f.showWhen?.fieldKey === row.key);
    if (dependants.length) throw new SettingsProblem(`${dependants.map((d) => d.label).join(", ")} ${dependants.length === 1 ? "is" : "are"} shown only when ${row.label} has an answer. Change or archive ${dependants.length === 1 ? "that field" : "those fields"} first.`);
  } else {
    const clash = (await siblings(tx, row.recordType)).find((f) => !f.archived && f.id !== id && f.label.toLowerCase() === row.label.toLowerCase());
    if (clash) throw new SettingsProblem(`There is already a field called "${row.label}". Rename it before restoring this one.`);
  }
  await tx.customField.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await writeAudit(tx, ctx, { action: archived ? "archived" : "restored", recordType: "Custom Field", recordId: id, after: { label: row.label } });
  return row;
}

// ------------------------------------------------------------ Custom forms

export const FORM_ABOUT = [
  { value: "general", label: "Anyone (general form)" },
  { value: "student", label: "A student" },
  { value: "guardian", label: "A parent or guardian" },
  { value: "staff", label: "A staff member" },
  { value: "enquiry", label: "An enquiry" },
] as const;

export function formFields(raw: unknown): CustomFieldDef[] {
  return Array.isArray(raw) ? (raw as CustomFieldDef[]) : [];
}

export async function createForm(tx: Tx, ctx: SchoolContext, input: { name: string; description: string | null; aboutType: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new SettingsProblem("Form name is needed.", "name");
  if (name.length > 80) throw new SettingsProblem("Form name can be at most 80 characters.", "name");
  if (!FORM_ABOUT.some((a) => a.value === input.aboutType)) throw new SettingsProblem("Choose who the form is about.", "aboutType");
  const clash = await tx.customForm.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (clash) throw new SettingsProblem(clash.archivedAt ? `An archived form is called "${clash.name}". Restore it or use another name.` : `There is already a form called "${clash.name}".`, "name");
  const form = await tx.customForm.create({ data: { schoolId: ctx.schoolId, name, description: input.description, aboutType: input.aboutType, createdById: ctx.userId, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Custom Form", recordId: form.id, after: { name, aboutType: input.aboutType } });
  return form;
}

async function draftForm(tx: Tx, id: string) {
  const form = await tx.customForm.findUnique({ where: { id } });
  if (!form || form.archivedAt) throw new SettingsProblem("This form was not found. It may have been archived.");
  return form;
}

/** Adds or changes one field of a form. A published form becomes a draft again until it is published. */
export async function saveFormField(tx: Tx, ctx: SchoolContext, formId: string, fieldKey: string | null, input: FieldDraft) {
  const form = await draftForm(tx, formId);
  const fields = formFields(form.fields);
  const others = fields.filter((f) => f.key !== fieldKey);
  const d = cleanDraft({ ...input, visibility: "everyone" });
  const errors = checkFieldDefinition(d, others);
  const existing = fieldKey ? fields.find((f) => f.key === fieldKey) : null;
  if (fieldKey && !existing) throw new SettingsProblem("This field was not found.");
  if (existing && d.showWhen && makesLoop(existing.key, d.showWhen.fieldKey, fields)) errors.showWhenField = "That would make the two fields depend on each other. Pick another field.";
  if (Object.keys(errors).length) throw new FieldProblem(errors);
  const def: CustomFieldDef = { key: existing?.key ?? keyFromLabel(d.label, fields.map((f) => f.key)), label: d.label, fieldType: d.fieldType, required: d.required, choices: d.choices, showWhen: d.showWhen, help: input.help?.trim() || null };
  const next = existing ? fields.map((f) => (f.key === existing.key ? def : f)) : [...fields, def];
  if (next.length > 60) throw new SettingsProblem("A form can have at most 60 fields.");
  await tx.customForm.update({ where: { id: formId }, data: { fields: next as unknown as Prisma.InputJsonValue, status: "draft", updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: existing ? "changed-field" : "added-field", recordType: "Custom Form", recordId: formId, before: existing ? (existing as unknown as Prisma.InputJsonValue) : null, after: def as unknown as Prisma.InputJsonValue });
  return def;
}

export async function removeFormField(tx: Tx, ctx: SchoolContext, formId: string, fieldKey: string) {
  const form = await draftForm(tx, formId);
  const fields = formFields(form.fields);
  const field = fields.find((f) => f.key === fieldKey);
  if (!field) return false;
  const dependants = fields.filter((f) => f.showWhen?.fieldKey === fieldKey);
  if (dependants.length) throw new SettingsProblem(`${dependants.map((d) => d.label).join(", ")} ${dependants.length === 1 ? "depends" : "depend"} on ${field.label}. Change ${dependants.length === 1 ? "it" : "them"} first.`);
  await tx.customForm.update({ where: { id: formId }, data: { fields: fields.filter((f) => f.key !== fieldKey) as unknown as Prisma.InputJsonValue, status: "draft", updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "removed-field", recordType: "Custom Form", recordId: formId, before: field as unknown as Prisma.InputJsonValue });
  return true;
}

export async function moveFormField(tx: Tx, ctx: SchoolContext, formId: string, fieldKey: string, direction: "up" | "down") {
  const form = await draftForm(tx, formId);
  const fields = formFields(form.fields);
  const i = fields.findIndex((f) => f.key === fieldKey);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= fields.length) return false;
  [fields[i], fields[j]] = [fields[j], fields[i]];
  await tx.customForm.update({ where: { id: formId }, data: { fields: fields as unknown as Prisma.InputJsonValue, status: "draft", updatedById: ctx.userId } });
  return true;
}

export async function publishForm(tx: Tx, ctx: SchoolContext, formId: string) {
  const form = await draftForm(tx, formId);
  const fields = formFields(form.fields);
  if (fields.length === 0) throw new SettingsProblem("Add at least one field before publishing.");
  if (form.status === "published") return form;
  const updated = await tx.customForm.update({ where: { id: formId }, data: { status: "published", version: form.version + 1, publishedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "published", recordType: "Custom Form", recordId: formId, after: { name: form.name, version: updated.version, fields: fields.length } });
  return updated;
}

export async function setFormArchived(tx: Tx, ctx: SchoolContext, formId: string, archived: boolean) {
  const form = await tx.customForm.findUnique({ where: { id: formId } });
  if (!form) throw new SettingsProblem("This form was not found.");
  if (Boolean(form.archivedAt) === archived) return form;
  await tx.customForm.update({ where: { id: formId }, data: { archivedAt: archived ? new Date() : null, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: archived ? "archived" : "restored", recordType: "Custom Form", recordId: formId, after: { name: form.name } });
  return form;
}

export async function editFormDetails(tx: Tx, ctx: SchoolContext, formId: string, input: { name: string; description: string | null; aboutType: string }) {
  const form = await draftForm(tx, formId);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new SettingsProblem("Form name is needed.", "name");
  if (name.length > 80) throw new SettingsProblem("Form name can be at most 80 characters.", "name");
  if (!FORM_ABOUT.some((a) => a.value === input.aboutType)) throw new SettingsProblem("Choose who the form is about.", "aboutType");
  const clash = await tx.customForm.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: formId } } });
  if (clash) throw new SettingsProblem(`There is already a form called "${clash.name}".`, "name");
  const before = { name: form.name, description: form.description, aboutType: form.aboutType };
  const after = { name, description: input.description, aboutType: input.aboutType };
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  await tx.customForm.update({ where: { id: formId }, data: { ...after, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Custom Form", recordId: formId, before, after });
  return true;
}
