"use server";

// Settings, SMS, WhatsApp & Email: save a channel, test it, DLT details and credits.
import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { PermissionDeniedError } from "@/lib/permissions";
import { addCredits, ChannelProblem, checkChannel, saveChannel, saveDlt, testChannel, type ChannelInput } from "@/lib/messaging/channel-admin";
import { PROVIDER_CHANNELS, type ProviderChannel } from "@/lib/messaging/channels";

const PATH = "/settings/messaging";
export type ChannelState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

async function who() {
  try {
    return (await requireAction("settings", "edit")).current;
  } catch (e) {
    if (e instanceof PermissionDeniedError) throw new ChannelProblem("Only the Principal and School Admin can change these settings.");
    throw e;
  }
}

const strMap = (v: unknown) => Object.fromEntries(Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).filter(([k, x]) => /^[a-zA-Z]{1,40}$/.test(k) && typeof x === "string").map(([k, x]) => [k, (x as string).slice(0, 600)]));

export async function saveChannelAction(channel: string, raw: ChannelInput): Promise<ChannelState> {
  if (!(PROVIDER_CHANNELS as readonly string[]).includes(channel)) return { ok: false, message: "Unknown channel." };
  const input: ChannelInput = { provider: String(raw?.provider ?? ""), live: Boolean(raw?.live), isOn: Boolean(raw?.isOn), config: strMap(raw?.config), secrets: strMap(raw?.secrets), lowCreditAlert: Number(raw?.lowCreditAlert) };
  try {
    const current = await who();
    const errors = await withSchool(current.ctx, async (tx) => {
      const e = await checkChannel(tx, current.ctx, channel as ProviderChannel, input);
      if (!Object.keys(e).length) await saveChannel(tx, current.ctx, channel as ProviderChannel, input);
      return e;
    });
    if (Object.keys(errors).length) return { ok: false, errors, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.` };
  } catch (e) {
    if (e instanceof ChannelProblem) return { ok: false, message: e.message };
    throw e;
  }
  await flash({ message: "Saved. Keys are stored encrypted and are not shown again.", tone: "success" });
  revalidatePath(PATH);
  return { ok: true };
}

export async function testChannelAction(channel: string, to: string): Promise<{ ok: boolean; message: string }> {
  if (!(PROVIDER_CHANNELS as readonly string[]).includes(channel)) return { ok: false, message: "Unknown channel." };
  try {
    const current = await who();
    const r = await withSchool(current.ctx, (tx) => testChannel(tx, current.ctx, channel as ProviderChannel, String(to ?? "").replace(channel === "email" ? /\s/g : /\D/g, "").slice(-(channel === "email" ? 200 : 10))));
    revalidatePath(PATH);
    return { ok: r.ok, message: r.note };
  } catch (e) {
    if (e instanceof ChannelProblem) return { ok: false, message: e.message };
    throw e;
  }
}

export async function saveDltAction(entityId: string, header: string): Promise<string | void> {
  try {
    const current = await who();
    await withSchool(current.ctx, (tx) => saveDlt(tx, current.ctx, String(entityId ?? ""), String(header ?? "")));
  } catch (e) {
    if (e instanceof ChannelProblem) return e.message;
    throw e;
  }
  await flash({ message: "DLT details saved.", tone: "success" });
  revalidatePath(PATH);
}

export async function addCreditsAction(channel: string, amount: number, note: string): Promise<string | void> {
  if (channel !== "whatsapp" && channel !== "sms") return "Choose WhatsApp or SMS.";
  try {
    const current = await who();
    await withSchool(current.ctx, (tx) => addCredits(tx, current.ctx, channel, Number(amount), String(note ?? "")));
  } catch (e) {
    if (e instanceof ChannelProblem) return e.message;
    throw e;
  }
  await flash({ message: Number(amount) < 0 ? "Correction recorded." : `${Number(amount).toLocaleString("en-IN")} credits added.`, tone: "success" });
  revalidatePath(PATH);
}
