"use server";

// Console, a school's Connections: DREAM TEAM saves and tests the school's SMS,
// WhatsApp and email providers, its DLT IDs and message credits. The school's
// own Settings only shows what is connected (07-super-admin.md §3.8).
import { revalidatePath } from "next/cache";
import { flash } from "@/lib/flash";
import { ConsoleDenied, requireConsoleAction } from "@/lib/console/current";
import { withConnections } from "@/lib/console/connections";
import { addCredits, ChannelProblem, checkChannel, saveChannel, saveDlt, testChannel, type ChannelInput } from "@/lib/messaging/channel-admin";
import { setSmsDltId, TemplateProblem } from "@/lib/communication/templates-admin";
import { CHANNEL_LABEL, PROVIDER_CHANNELS, type ProviderChannel } from "@/lib/messaging/channels";

export type ChannelState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const path = (schoolId: string) => `/console/schools/${schoolId}/connections`;

async function who(schoolId: string) {
  if (!UUID.test(schoolId)) throw new ChannelProblem("This school was not found. Refresh the page and try again.");
  try {
    return await requireConsoleAction("connect");
  } catch (e) {
    if (e instanceof ConsoleDenied) throw new ChannelProblem(e.message);
    throw e;
  }
}

const strMap = (v: unknown) => Object.fromEntries(Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).filter(([k, x]) => /^[a-zA-Z]{1,40}$/.test(k) && typeof x === "string").map(([k, x]) => [k, (x as string).slice(0, 600)]));

export async function saveChannelAction(schoolId: string, channel: string, raw: ChannelInput): Promise<ChannelState> {
  if (!(PROVIDER_CHANNELS as readonly string[]).includes(channel)) return { ok: false, message: "Unknown channel." };
  const input: ChannelInput = { provider: String(raw?.provider ?? ""), live: Boolean(raw?.live), isOn: Boolean(raw?.isOn), config: strMap(raw?.config), secrets: strMap(raw?.secrets), lowCreditAlert: Number(raw?.lowCreditAlert) };
  try {
    const c = await who(schoolId);
    const errors = await withConnections(c, schoolId, async (tx, ctx) => {
      const e = await checkChannel(tx, ctx, channel as ProviderChannel, input);
      if (!Object.keys(e).length) await saveChannel(tx, ctx, channel as ProviderChannel, input);
      return e;
    }, (e) => (Object.keys(e).length ? null : `${CHANNEL_LABEL[channel as ProviderChannel]} settings saved (${input.live ? "sending for real" : "test mode"}, ${input.isOn ? "on" : "off"})`));
    if (Object.keys(errors).length) return { ok: false, errors, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.` };
  } catch (e) {
    if (e instanceof ChannelProblem) return { ok: false, message: e.message };
    throw e;
  }
  await flash({ message: "Saved. Keys are stored encrypted and are not shown again.", tone: "success" });
  revalidatePath(path(schoolId));
  return { ok: true };
}

export async function testChannelAction(schoolId: string, channel: string, to: string): Promise<{ ok: boolean; message: string }> {
  if (!(PROVIDER_CHANNELS as readonly string[]).includes(channel)) return { ok: false, message: "Unknown channel." };
  try {
    const c = await who(schoolId);
    const target = String(to ?? "").replace(channel === "email" ? /\s/g : /\D/g, "").slice(-(channel === "email" ? 200 : 10));
    const r = await withConnections(c, schoolId, (tx, ctx) => testChannel(tx, ctx, channel as ProviderChannel, target), (r) => `${CHANNEL_LABEL[channel as ProviderChannel]} test ${r.ok ? "passed" : "failed"}`);
    revalidatePath(path(schoolId));
    return { ok: r.ok, message: r.note };
  } catch (e) {
    if (e instanceof ChannelProblem) return { ok: false, message: e.message };
    throw e;
  }
}

export async function saveDltAction(schoolId: string, entityId: string, header: string): Promise<string | void> {
  try {
    const c = await who(schoolId);
    await withConnections(c, schoolId, (tx, ctx) => saveDlt(tx, ctx, String(entityId ?? ""), String(header ?? "")), () => "SMS DLT entity ID and sender header saved");
  } catch (e) {
    if (e instanceof ChannelProblem) return e.message;
    throw e;
  }
  await flash({ message: "DLT details saved.", tone: "success" });
  revalidatePath(path(schoolId));
}

export async function addCreditsAction(schoolId: string, channel: string, amount: number, note: string): Promise<string | void> {
  if (channel !== "whatsapp" && channel !== "sms") return "Choose WhatsApp or SMS.";
  const n = Number(amount);
  try {
    const c = await who(schoolId);
    await withConnections(c, schoolId, (tx, ctx) => addCredits(tx, ctx, channel, n, String(note ?? "")), () => `${n < 0 ? "Corrected" : "Added"} ${Math.abs(n).toLocaleString("en-IN")} ${CHANNEL_LABEL[channel]} credits`);
  } catch (e) {
    if (e instanceof ChannelProblem) return e.message;
    throw e;
  }
  await flash({ message: n < 0 ? "Correction recorded." : `${n.toLocaleString("en-IN")} credits added.`, tone: "success" });
  revalidatePath(path(schoolId));
}

/** The DLT template ID of one SMS template version, as registered on the DLT portal for that exact text. */
export async function saveSmsDltIdAction(schoolId: string, versionId: string, dltTemplateId: string): Promise<string | void> {
  try {
    const c = await who(schoolId);
    if (!UUID.test(versionId)) throw new ChannelProblem("This template was not found. Refresh the page and try again.");
    const name = await withConnections(c, schoolId, (tx, ctx) => setSmsDltId(tx, ctx, versionId, String(dltTemplateId ?? "")), (r) => `DLT template ID ${r.dltTemplateId ? "saved" : "removed"} on the SMS template "${r.name}"`);
    await flash({ message: name.dltTemplateId ? `DLT template ID saved on ${name.name}.` : `DLT template ID removed from ${name.name}.`, tone: "success" });
  } catch (e) {
    if (e instanceof ChannelProblem || e instanceof TemplateProblem) return e.message;
    throw e;
  }
  revalidatePath(path(schoolId));
}
