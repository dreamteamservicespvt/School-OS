"use server";

import { revalidatePath } from "next/cache";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import {
  AI_FEATURES, OPTIONAL_MODULES, applyTemplate, saveAssistant, savePreferences, setFeature, setModuleOn, templatePreview,
  type TemplateChange,
} from "@/lib/settings/switches";
import { asFormState, runSettings } from "../run";

const PAGE = "modules" as const;

const PATH = "/settings/modules";

export async function moduleAction(key: string, on: boolean): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => setModuleOn(tx, current.ctx, key, on));
  if (!r.ok) return r.message;
  const name = OPTIONAL_MODULES.find((m) => m.key === key)?.name ?? key;
  await flash({ message: on ? `${name} is on. It is in the menu for the roles that can use it.` : `${name} is off and hidden from the menu. Its records are kept.` });
  revalidatePath("/", "layout");
}

export type PreviewState = { ok: boolean; message?: string; modules?: string[]; later?: string[]; settings?: TemplateChange[]; name?: string } | null;

export async function previewTemplateAction(key: string, replaceExisting: boolean): Promise<PreviewState> {
  const r = await runSettings(PAGE, "view", (tx, current) => templatePreview(tx, current.ctx, key, replaceExisting));
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, name: r.data.template.name, modules: r.data.modules, later: r.data.later, settings: r.data.settings };
}

export async function applyTemplateAction(key: string, replaceExisting: boolean): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => applyTemplate(tx, current.ctx, key, replaceExisting));
  if (!r.ok) return r.message;
  const n = r.data.modules.length + r.data.settings.length;
  await flash({ message: n ? `${r.data.template.name} applied: ${n} change${n === 1 ? "" : "s"}.` : `${r.data.template.name} applied. Everything already matched.` });
  revalidatePath("/", "layout");
}

export async function preferencesAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await runSettings(PAGE, "edit", (tx, current) =>
    savePreferences(tx, current.ctx, { weekStart: String(fd.get("weekStart") ?? ""), rollNumberOrder: String(fd.get("rollNumberOrder") ?? "") }));
  if (r.ok) revalidatePath(PATH);
  return asFormState(r, formValues(fd), r.ok && r.data ? "Preferences saved." : "Nothing changed.");
}

export async function assistantAction(_: FormState, fd: FormData): Promise<FormState> {
  const on = fd.get("on") === "on";
  const roles = fd.getAll("aiRoles").map(String);
  // Empty: DREAM TEAM's daily limit. Not sent (the field hidden while off): kept as it was.
  const rawLimit = fd.get("aiDailyLimit");
  const dailyLimit = rawLimit === null ? undefined : String(rawLimit).trim() === "" ? null : Number(String(rawLimit).trim());
  const r = await runSettings(PAGE, "edit", (tx, current) => saveAssistant(tx, current.ctx, { on, roles, dailyLimit }));
  if (r.ok) revalidatePath("/", "layout");
  return asFormState(r, { ...formValues(fd), aiRoles: roles.join(",") }, on ? "AI assistant saved. Only the chosen roles see it." : "AI assistant is off. Every AI feature is off with it.");
}

export async function featureAction(key: string, on: boolean): Promise<string | void> {
  const r = await runSettings(PAGE, "edit", (tx, current) => setFeature(tx, current.ctx, key, on));
  if (!r.ok) return r.message;
  const f = AI_FEATURES.find((x) => x.key === key);
  await flash({ message: `${f?.label ?? "Feature"} is ${on ? "on" : "off"}.` });
  revalidatePath("/", "layout");
}
