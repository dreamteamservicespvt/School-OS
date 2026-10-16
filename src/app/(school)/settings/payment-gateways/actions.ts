"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { findProvider } from "@/lib/payments/providers";
import {
  addGateway,
  addLinkedAccount,
  archiveGateway,
  archiveLinkedAccount,
  checkLinkedAccount,
  GatewayProblem,
  restoreGateway,
  setGatewayActive,
  testGateway,
  testUnsaved,
  updateGateway,
  type GatewayInput,
} from "@/lib/payments/gateways";
import type { ConnectionResult } from "@/lib/payments/razorpay";

const PATH = "/settings/payment-gateways";
const PAGE = "payment-gateways" as const;

function readInput(fd: FormData): GatewayInput {
  const provider = String(fd.get("provider") ?? "");
  const p = findProvider(provider);
  const values: Record<string, string> = {};
  for (const f of p?.fields ?? []) values[f.key] = String(fd.get(`f_${f.key}`) ?? "");
  return {
    displayName: String(fd.get("displayName") ?? ""),
    provider,
    environment: fd.get("environment") === "live" ? "live" : "test",
    values,
    webhookSecret: String(fd.get("webhookSecret") ?? ""),
  };
}

/** Never send secrets back to the browser, even the ones just typed. */
function safeValues(fd: FormData): Record<string, string> {
  const values = formValues(fd);
  const p = findProvider(values.provider ?? "");
  for (const f of p?.fields ?? []) if (f.secret) delete values[`f_${f.key}`];
  delete values.webhookSecret;
  delete values.confirm;
  return values;
}

function problemState(e: unknown, fd: FormData): FormState {
  if (e instanceof GatewayProblem) {
    const key = e.field ? (e.field === "displayName" || e.field === "provider" || e.field === "confirm" ? e.field : `f_${e.field}`) : "form";
    return { ok: false, message: e.message, errors: { [key]: e.message }, values: safeValues(fd) };
  }
  console.error(JSON.stringify({ level: "error", event: "gateway-save", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save. Nothing was changed. Please try again.", values: safeValues(fd) };
}

export async function saveGateway(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const editing = fd.get("mode") === "edit";
  const { current } = await requireSettingsAction(PAGE, editing ? "edit" : "create");
  const input = readInput(fd);
  const typed = String(fd.get("confirm") ?? "");
  let savedId: string;
  try {
    if (!editing && input.environment === "live") {
      const name = input.displayName.trim();
      if (!name || typed.trim().toLowerCase() !== name.toLowerCase()) {
        throw new GatewayProblem(`Live mode takes real money. Type ${name || "the display name"} to confirm.`, "confirm");
      }
    }
    if (editing) {
      const { detailsChanged } = await withSchool(current.ctx, (tx) => updateGateway(tx, current.ctx, id, input, typed), { timeout: 30_000 });
      savedId = id;
      await flash({ message: detailsChanged ? `${input.displayName.trim()} saved. The new details were checked before saving where the gateway was on.` : `${input.displayName.trim()} saved.` });
    } else {
      const g = await withSchool(current.ctx, (tx) => addGateway(tx, current.ctx, input, id));
      savedId = g.id;
      await flash({ message: `${g.displayName} added. Test the connection, then switch it on.` });
    }
  } catch (e) {
    return problemState(e, fd);
  }
  revalidatePath(PATH);
  redirect(`${PATH}/${savedId}`);
}

export type TestState = (ConnectionResult & { message: string }) | { ok: false; message: string; checks?: undefined } | null;

/** "Test these details" in the form, before saving. */
export async function testDetails(_prev: TestState, fd: FormData): Promise<TestState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const id = String(fd.get("id") ?? "");
  try {
    const result = await withSchool(current.ctx, (tx) => testUnsaved(tx, readInput(fd), fd.get("mode") === "edit" ? id : null), { timeout: 30_000 });
    return { ...result, message: result.ok ? "Everything worked. You can save." : "Some checks did not pass. See below." };
  } catch (e) {
    return { ok: false, message: e instanceof GatewayProblem ? e.message : "The test could not run. Nothing was changed. Try again." };
  }
}

export async function testSaved(_prev: TestState, fd: FormData): Promise<TestState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const id = String(fd.get("id") ?? "");
  try {
    const result = await withSchool(current.ctx, (tx) => testGateway(tx, current.ctx, id), { timeout: 30_000 });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return { ...result, message: result.ok ? "Everything worked. You can switch this gateway on." : "Some checks did not pass. See below." };
  } catch (e) {
    return { ok: false, message: e instanceof GatewayProblem ? e.message : "The test could not run. Nothing was changed. Try again." };
  }
}

export async function switchGateway(id: string, on: boolean, typed: string): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  try {
    const g = await withSchool(current.ctx, (tx) => setGatewayActive(tx, current.ctx, id, on, typed));
    await flash({ message: on ? `${g.displayName} is switched on. Fee Settings decides which classes use it.` : `${g.displayName} is switched off. Online payments through it stop; counter payments carry on.` });
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
}

export async function archive(id: string, typed: string): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "archive");
  try {
    await withSchool(current.ctx, (tx) => archiveGateway(tx, current.ctx, id, typed));
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  await flash({ message: "Gateway archived. Past payments keep their record.", link: { href: `${PATH}?archived=1`, label: "See archived" } });
  revalidatePath(PATH);
  redirect(PATH);
}

export async function restore(id: string): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "archive");
  try {
    await withSchool(current.ctx, (tx) => restoreGateway(tx, current.ctx, id));
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  await flash({ message: "Gateway restored. It stays off until you test it and switch it on." });
  revalidatePath(PATH);
  redirect(`${PATH}/${id}`);
}

export async function saveLinkedAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const gatewayId = String(fd.get("gatewayId") ?? "");
  const values = formValues(fd);
  const checked = checkLinkedAccount({
    label: values.label ?? "",
    bankName: values.bankName ?? "",
    accountLast4: values.accountLast4 ?? "",
    ifsc: values.ifsc ?? "",
    linkedAccountId: values.linkedAccountId ?? "",
  });
  if (!checked.ok) {
    const n = Object.keys(checked.errors).length;
    return { ok: false, message: n === 1 ? Object.values(checked.errors)[0] : `Please fix ${n} things before saving.`, errors: checked.errors, values };
  }
  try {
    await withSchool(current.ctx, (tx) => addLinkedAccount(tx, current.ctx, gatewayId, checked.value));
  } catch (e) {
    if (e instanceof GatewayProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined, values };
    return { ok: false, message: "That did not save. Nothing was changed. Please try again.", values };
  }
  revalidatePath(`${PATH}/${gatewayId}`);
  return { ok: true, message: `${checked.value.label} added for split payments.` };
}

export async function removeLinkedAccount(gatewayId: string, id: string): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "archive");
  try {
    await withSchool(current.ctx, (tx) => archiveLinkedAccount(tx, current.ctx, id));
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  revalidatePath(`${PATH}/${gatewayId}`);
}
