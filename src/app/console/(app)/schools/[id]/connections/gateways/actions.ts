"use server";

// Console, a school's Connections, Payment gateways: DREAM TEAM adds, tests,
// switches on and off, and archives the school's payment gateways and their
// Razorpay Route bank accounts. The school's own Settings, Payment Gateways
// only shows what is connected (07-super-admin.md §3.8). Every change runs on
// the school's own rows with the console person's name in its Audit Log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flash } from "@/lib/flash";
import { formValues, type FormState } from "@/lib/forms";
import { ConsoleDenied, requireConsoleAction } from "@/lib/console/current";
import { withConnections } from "@/lib/console/connections";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const connections = (schoolId: string) => `/console/schools/${schoolId}/connections`;
const gatewayPath = (schoolId: string, id: string) => `${connections(schoolId)}/gateways/${id}`;

/** The console person, after checking the school id and that their role may connect. */
async function who(schoolId: string) {
  if (!UUID.test(String(schoolId ?? ""))) throw new GatewayProblem("This school was not found. Refresh the page and try again.");
  try {
    return await requireConsoleAction("connect");
  } catch (e) {
    if (e instanceof ConsoleDenied) throw new GatewayProblem(e.message);
    throw e;
  }
}

function gatewayId(id: unknown) {
  const v = String(id ?? "");
  if (!UUID.test(v)) throw new GatewayProblem("This gateway was not found. Refresh the page and try again.");
  return v;
}

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
  console.error(JSON.stringify({ level: "error", event: "console-gateway-save", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save. Nothing was changed. Please try again.", values: safeValues(fd) };
}

export async function saveGateway(schoolId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const editing = fd.get("mode") === "edit";
  const input = readInput(fd);
  const typed = String(fd.get("confirm") ?? "");
  let savedId: string;
  try {
    const c = await who(schoolId);
    if (!editing && input.environment === "live") {
      const name = input.displayName.trim();
      if (!name || typed.trim().toLowerCase() !== name.toLowerCase()) {
        throw new GatewayProblem(`Live mode takes real money. Type ${name || "the display name"} to confirm.`, "confirm");
      }
    }
    if (editing) {
      const gid = gatewayId(id);
      const { detailsChanged } = await withConnections(c, schoolId, (tx, ctx) => updateGateway(tx, ctx, gid, input, typed),
        () => `Payment gateway ${input.displayName.trim()} changed`, { timeout: 30_000 });
      savedId = gid;
      await flash({ message: detailsChanged ? `${input.displayName.trim()} saved. The new details were checked before saving where the gateway was on.` : `${input.displayName.trim()} saved.`, tone: "success" });
    } else {
      const g = await withConnections(c, schoolId, (tx, ctx) => addGateway(tx, ctx, input, id),
        (g) => `Payment gateway ${g.displayName} added (${g.environment === "live" ? "live" : "test"} mode, switched off)`);
      savedId = g.id;
      await flash({ message: `${g.displayName} added. Test the connection, then switch it on.`, tone: "success" });
    }
  } catch (e) {
    return problemState(e, fd);
  }
  revalidatePath(connections(schoolId));
  redirect(gatewayPath(schoolId, savedId));
}

export type TestState = (ConnectionResult & { message: string }) | { ok: false; message: string; checks?: undefined } | null;

/** "Test these details" in the form, before saving. Changes nothing. */
export async function testDetails(schoolId: string, _prev: TestState, fd: FormData): Promise<TestState> {
  try {
    const c = await who(schoolId);
    const editId = fd.get("mode") === "edit" ? gatewayId(fd.get("id")) : null;
    const result = await withConnections(c, schoolId, (tx) => testUnsaved(tx, readInput(fd), editId), null, { timeout: 30_000 });
    return { ...result, message: result.ok ? "Everything worked. You can save." : "Some checks did not pass. See below." };
  } catch (e) {
    return { ok: false, message: e instanceof GatewayProblem ? e.message : "The test could not run. Nothing was changed. Try again." };
  }
}

export async function testSaved(schoolId: string, _prev: TestState, fd: FormData): Promise<TestState> {
  try {
    const c = await who(schoolId);
    const id = gatewayId(fd.get("id"));
    const result = await withConnections(c, schoolId, (tx, ctx) => testGateway(tx, ctx, id),
      (r) => `Payment gateway test ${r.ok ? "passed" : "failed"}`, { timeout: 30_000 });
    revalidatePath(connections(schoolId));
    revalidatePath(gatewayPath(schoolId, id));
    return { ...result, message: result.ok ? "Everything worked. You can switch this gateway on." : "Some checks did not pass. See below." };
  } catch (e) {
    return { ok: false, message: e instanceof GatewayProblem ? e.message : "The test could not run. Nothing was changed. Try again." };
  }
}

export async function switchGateway(schoolId: string, id: string, on: boolean, typed: string): Promise<string | void> {
  try {
    const c = await who(schoolId);
    const gid = gatewayId(id);
    const g = await withConnections(c, schoolId, (tx, ctx) => setGatewayActive(tx, ctx, gid, Boolean(on), String(typed ?? "")),
      (g) => `Payment gateway ${g.displayName} switched ${on ? "on" : "off"}`);
    await flash({ message: on ? `${g.displayName} is switched on. The school's Fee Settings decides which classes use it.` : `${g.displayName} is switched off. Online payments through it stop; counter payments carry on.`, tone: "success" });
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  revalidatePath(connections(schoolId));
  revalidatePath(gatewayPath(schoolId, id));
}

export async function archive(schoolId: string, id: string, typed: string): Promise<string | void> {
  try {
    const c = await who(schoolId);
    const gid = gatewayId(id);
    await withConnections(c, schoolId, async (tx, ctx) => {
      await archiveGateway(tx, ctx, gid, String(typed ?? ""));
      return (await tx.paymentGatewayAccount.findUniqueOrThrow({ where: { id: gid }, select: { displayName: true } })).displayName;
    }, (name) => `Payment gateway ${name} archived`);
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  await flash({ message: "Gateway archived. Past payments keep their record.", tone: "success" });
  revalidatePath(connections(schoolId));
  redirect(`${connections(schoolId)}#gateways`);
}

export async function restore(schoolId: string, id: string): Promise<string | void> {
  let gid: string;
  try {
    const c = await who(schoolId);
    gid = gatewayId(id);
    await withConnections(c, schoolId, async (tx, ctx) => {
      await restoreGateway(tx, ctx, gid);
      return (await tx.paymentGatewayAccount.findUniqueOrThrow({ where: { id: gid }, select: { displayName: true } })).displayName;
    }, (name) => `Payment gateway ${name} restored (switched off)`);
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  await flash({ message: "Gateway restored. It stays off until you test it and switch it on.", tone: "success" });
  revalidatePath(connections(schoolId));
  redirect(gatewayPath(schoolId, gid));
}

export async function saveLinkedAccount(schoolId: string, _prev: FormState, fd: FormData): Promise<FormState> {
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
  let gid: string;
  try {
    const c = await who(schoolId);
    gid = gatewayId(fd.get("gatewayId"));
    await withConnections(c, schoolId, (tx, ctx) => addLinkedAccount(tx, ctx, gid, checked.value),
      (r) => `Bank account ${r.label} added for split payments`);
  } catch (e) {
    if (e instanceof GatewayProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined, values };
    return { ok: false, message: "That did not save. Nothing was changed. Please try again.", values };
  }
  revalidatePath(gatewayPath(schoolId, gid));
  return { ok: true, message: `${checked.value.label} added for split payments.` };
}

export async function removeLinkedAccount(schoolId: string, gatewayIdValue: string, id: string): Promise<string | void> {
  let gid: string;
  try {
    const c = await who(schoolId);
    gid = gatewayId(gatewayIdValue);
    const rowId = gatewayId(id);
    await withConnections(c, schoolId, async (tx, ctx) => {
      const row = await tx.gatewayLinkedAccount.findFirst({ where: { id: rowId, gatewayAccountId: gid }, select: { label: true } });
      if (!row) throw new GatewayProblem("This bank account was not found.");
      await archiveLinkedAccount(tx, ctx, rowId);
      return row.label;
    }, (label) => `Bank account ${label} archived from split payments`);
  } catch (e) {
    return e instanceof GatewayProblem ? e.message : "That did not work. Nothing was changed. Please try again.";
  }
  revalidatePath(gatewayPath(schoolId, gid));
}
