"use server";

// Settings, SMS, WhatsApp & Email: the school's own choices for each channel
// (on or off, the low-credit alert). DREAM TEAM connects the providers, adds
// the DLT details and the credits from the console.
import { revalidatePath } from "next/cache";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { PermissionDeniedError } from "@/lib/permissions";
import { ChannelProblem, saveChannelChoices } from "@/lib/messaging/channel-admin";
import { PROVIDER_CHANNELS, type ProviderChannel } from "@/lib/messaging/channels";

const PATH = "/settings/messaging";
export type ChannelState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

export async function saveChoicesAction(channel: string, isOn: boolean, lowCreditAlert: number): Promise<ChannelState> {
  if (!(PROVIDER_CHANNELS as readonly string[]).includes(channel)) return { ok: false, message: "Unknown channel." };
  try {
    const { current } = await requireSettingsAction("messaging", "edit");
    const errors = await withSchool(current.ctx, (tx) => saveChannelChoices(tx, current.ctx, channel as ProviderChannel, { isOn: Boolean(isOn), lowCreditAlert: Number(lowCreditAlert) }));
    if (Object.keys(errors).length) return { ok: false, errors, message: Object.values(errors)[0] };
  } catch (e) {
    if (e instanceof ChannelProblem || e instanceof PermissionDeniedError) return { ok: false, message: e.message };
    throw e;
  }
  await flash({ message: "Saved.", tone: "success" });
  revalidatePath(PATH);
  return { ok: true };
}
