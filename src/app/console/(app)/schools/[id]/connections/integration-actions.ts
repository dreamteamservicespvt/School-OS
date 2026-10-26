"use server";

// Console, a school's other connections: DREAM TEAM connects, changes, tests and
// disconnects the school's integrations (Google, Microsoft, Tally, printers, CCTV,
// an outside LMS, IoT, webhooks, GPS, attendance devices). The school's own
// Settings, Modules On/Off only shows what is connected (07-super-admin.md §3.8).
import { revalidatePath } from "next/cache";
import { flash } from "@/lib/flash";
import { ConsoleDenied, requireConsoleAction } from "@/lib/console/current";
import { withConnections } from "@/lib/console/connections";
import { SettingsProblem } from "@/lib/settings/common";
import { INTEGRATIONS, connectIntegration, disconnectIntegration, retestIntegration } from "@/lib/settings/switches";

export type IntegrationState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const path = (schoolId: string) => `/console/schools/${schoolId}/connections`;

async function who(schoolId: string) {
  if (!UUID.test(schoolId)) throw new SettingsProblem("This school was not found. Refresh the page and try again.");
  try {
    return await requireConsoleAction("connect");
  } catch (e) {
    if (e instanceof ConsoleDenied) throw new SettingsProblem(e.message);
    throw e;
  }
}

const defOf = (key: string) => {
  const def = INTEGRATIONS.find((i) => i.key === key);
  if (!def) throw new SettingsProblem("This connection was not found. Refresh the page and try again.");
  return def;
};

/** Connects, or changes the details of, one integration. Saving tests the details straight away. */
export async function connectIntegrationAction(schoolId: string, key: string, raw: Record<string, unknown>): Promise<IntegrationState> {
  try {
    const def = defOf(String(key ?? ""));
    const values: Record<string, string> = {};
    for (const f of def.fields) values[f.key] = typeof raw?.[f.key] === "string" ? (raw[f.key] as string).slice(0, 4001) : "";
    const c = await who(schoolId);
    const check = await withConnections(c, schoolId, (tx, ctx) => connectIntegration(tx, ctx, def.key, values),
      (r) => `${def.name} details saved (test ${r.ok ? "passed" : "failed"})`);
    revalidatePath(path(schoolId));
    if (!check.ok) return { ok: false, message: `Saved, but the test failed: ${check.note}` };
    await flash({ message: `${def.name} is connected. ${check.note}`, tone: "success" });
    return { ok: true };
  } catch (e) {
    if (e instanceof SettingsProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined };
    throw e;
  }
}

/** Tests the saved details again. */
export async function retestIntegrationAction(schoolId: string, key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const def = defOf(String(key ?? ""));
    const c = await who(schoolId);
    const check = await withConnections(c, schoolId, (tx, ctx) => retestIntegration(tx, ctx, def.key), (r) => `${def.name} test ${r.ok ? "passed" : "failed"}`);
    revalidatePath(path(schoolId));
    return { ok: check.ok, message: check.ok ? `Test passed. ${check.note}` : `Test failed. ${check.note}` };
  } catch (e) {
    if (e instanceof SettingsProblem) return { ok: false, message: e.message };
    throw e;
  }
}

/** Disconnects one integration: its saved details and keys are removed. */
export async function disconnectIntegrationAction(schoolId: string, key: string): Promise<string | void> {
  try {
    const def = defOf(String(key ?? ""));
    const c = await who(schoolId);
    const done = await withConnections(c, schoolId, (tx, ctx) => disconnectIntegration(tx, ctx, def.key), (r) => (r ? `${def.name} disconnected` : null));
    await flash({ message: done ? `${def.name} is disconnected. Its saved details and keys were removed.` : `${def.name} was not connected.`, tone: "success" });
  } catch (e) {
    if (e instanceof SettingsProblem) return e.message;
    throw e;
  }
  revalidatePath(path(schoolId));
}
