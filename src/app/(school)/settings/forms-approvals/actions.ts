"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { requestLabel } from "@/lib/approvals";
import { createField, createForm, editField, editFormDetails, moveField, moveFormField, publishForm, removeFormField, saveFormField, setFieldArchived, setFormArchived } from "@/lib/settings/forms";
import { saveRule, useDefaultRule } from "@/lib/settings/approval-rules";
import type { StepDraft } from "@/lib/settings/approval-rule-words";
import type { FieldDraft } from "@/lib/custom-field-rules";
import { asFormState, runSettings } from "../run";

const PAGE = "forms-approvals" as const;

const PATH = "/settings/forms-approvals";

function draftFrom(fd: FormData): FieldDraft {
  const showField = String(fd.get("showWhenField") ?? "");
  return {
    label: String(fd.get("label") ?? ""),
    fieldType: String(fd.get("fieldType") ?? ""),
    required: fd.get("required") === "on",
    choices: String(fd.get("choices") ?? "").split("\n").map((c) => c.trim()).filter(Boolean),
    showWhen: showField ? { fieldKey: showField, equals: String(fd.get("showWhenValue") ?? "") } : null,
    help: String(fd.get("help") ?? "") || null,
  };
}

// ------------------------------------------------------------ Custom fields

export async function fieldAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const recordType = String(fd.get("recordType") ?? "");
  const input = { ...draftFrom(fd), visibility: String(fd.get("visibility") ?? "everyone") };
  const r = await runSettings(PAGE, id ? "edit" : "create", (tx, current) => (id ? editField(tx, current.ctx, id, input) : createField(tx, current.ctx, recordType, input).then(() => true)));
  if (r.ok) revalidatePath(PATH);
  return asFormState(r, formValues(fd), id ? (r.ok && r.data ? `${input.label.trim()} saved.` : "Nothing changed.") : `${input.label.trim()} added. It shows on the form straight away.`);
}

export async function moveFieldAction(id: string, direction: "up" | "down"): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => moveField(tx, current.ctx, id, direction));
  if (!r.ok) return r.message;
  revalidatePath(PATH);
}

export async function archiveFieldAction(id: string, archived: boolean): Promise<string | void> {
  const r = await runSettings(PAGE, archived ? "archive" : "edit", (tx, current) => setFieldArchived(tx, current.ctx, id, archived));
  if (!r.ok) return r.message;
  await flash({ message: archived ? `${r.data.label} archived. Answers already given are kept and still shown on records.` : `${r.data.label} restored.` });
  revalidatePath(PATH);
}

// ------------------------------------------------------------ Custom forms

function formInput(fd: FormData) {
  return { name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? "").trim() || null, aboutType: String(fd.get("aboutType") ?? "") };
}

export async function createFormAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await runSettings(PAGE, "create", (tx, current) => createForm(tx, current.ctx, formInput(fd)));
  if (!r.ok) return asFormState(r, formValues(fd), "");
  await flash({ message: `${r.data.name} created. Add its fields, preview it, then publish.` });
  revalidatePath(PATH);
  redirect(`${PATH}/forms/${r.data.id}`);
}

export async function formDetailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("formId") ?? "");
  const r = await runSettings(PAGE, "edit", (tx, current) => editFormDetails(tx, current.ctx, id, formInput(fd)));
  if (r.ok) revalidatePath(`${PATH}/forms/${id}`);
  return asFormState(r, formValues(fd), r.ok && r.data ? "Form details saved." : "Nothing changed.");
}

export async function formFieldAction(_: FormState, fd: FormData): Promise<FormState> {
  const formId = String(fd.get("formId") ?? "");
  const key = String(fd.get("fieldKey") ?? "") || null;
  const input = draftFrom(fd);
  const r = await runSettings(PAGE, "edit", (tx, current) => saveFormField(tx, current.ctx, formId, key, input));
  if (r.ok) revalidatePath(`${PATH}/forms/${formId}`);
  return asFormState(r, formValues(fd), key ? `${input.label.trim()} saved. Publish the form to use the change.` : `${input.label.trim()} added. Publish the form to use it.`);
}

export async function removeFormFieldAction(formId: string, key: string): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => removeFormField(tx, current.ctx, formId, key));
  if (!r.ok) return r.message;
  revalidatePath(`${PATH}/forms/${formId}`);
}

export async function moveFormFieldAction(formId: string, key: string, direction: "up" | "down"): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => moveFormField(tx, current.ctx, formId, key, direction));
  if (!r.ok) return r.message;
  revalidatePath(`${PATH}/forms/${formId}`);
}

export async function publishFormAction(formId: string): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => publishForm(tx, current.ctx, formId));
  if (!r.ok) return r.message;
  await flash({ message: `${r.data.name} is published (version ${r.data.version}).` });
  revalidatePath(PATH, "layout");
}

export async function archiveFormAction(formId: string, archived: boolean): Promise<string | void> {
  const r = await runSettings(PAGE, archived ? "archive" : "edit", (tx, current) => setFormArchived(tx, current.ctx, formId, archived));
  if (!r.ok) return r.message;
  await flash({ message: archived ? `${r.data.name} archived. Answers already given are kept.` : `${r.data.name} restored.` });
  revalidatePath(PATH, "layout");
}

// ------------------------------------------------------------ Approval rules

/** "5,000" or "5000.50" rupees to whole paise, or null for no limit; "bad" when it is not a number. */
function rupeesToPaise(input: string): string | null | "bad" {
  const v = input.replace(/[₹,\s]/g, "");
  if (!v) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return "bad";
  const [r, p = ""] = v.split(".");
  return (BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2))).toString();
}

export async function saveRuleAction(_: FormState, fd: FormData): Promise<FormState> {
  const type = String(fd.get("type") ?? "");
  const count = Math.min(Number(fd.get("stepCount") ?? 0) || 0, 10);
  const steps: StepDraft[] = [];
  const values = formValues(fd);
  for (let i = 0; i < count; i++) {
    const who = String(fd.get(`approver${i}`) ?? "");
    const up = rupeesToPaise(String(fd.get(`upTo${i}`) ?? ""));
    if (up === "bad") return { ok: false, message: `Step ${i + 1}: type the amount in rupees, like 5000.`, errors: { [`step${i}`]: "Type the amount in rupees, like 5000." }, values };
    steps.push(who.startsWith("user:") ? { approverUserId: who.slice(5), upToPaise: up } : { approverRole: who.startsWith("role:") ? who.slice(5) : null, upToPaise: up });
  }
  const days = Number(fd.get("escalateAfterDays") ?? "");
  const r = await runSettings(PAGE, "edit", (tx, current) => saveRule(tx, current.ctx, type, { steps, escalateAfterDays: days }));
  if (!r.ok) return asFormState(r, values, "");
  await flash({ message: `Saved. ${r.data.summary}` });
  revalidatePath(PATH, "layout");
  redirect(PATH);
}

export async function defaultRuleAction(type: string): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => useDefaultRule(tx, current.ctx, type));
  if (!r.ok) return r.message;
  await flash({ message: `${requestLabel(type)} uses the default rule again. Your old rule is kept in the audit log.` });
  revalidatePath(PATH, "layout");
  redirect(PATH);
}
