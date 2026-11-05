// Add School, "WhatsApp for this school" (console): the school sends from
// DREAM TEAM's shared number (the default; IDs and token from the server's
// environment, dream-team.ts) or from its own WhatsApp Business number. The
// own number's access token is stored encrypted like every other provider key
// (channels.ts, encryptSecrets) and is never shown again. Changing it later is
// the console school's Connections page (ChannelCard), which uses the same
// saveChannel() and writes the same Audit Log line.
import "server-only";

import { withConsoleSchool } from "../db";
import { ChannelProblem, saveChannel, type ChannelInput } from "../messaging/channel-admin";
import { DREAM_TEAM_PROVIDER, dreamTeamWhatsappReady } from "../messaging/dream-team";
import { META_ID } from "../messaging/providers/whatsapp";
import { logActivity, type ConsoleActor } from "./activity";

export type SchoolWhatsappChoice = {
  mode: "dream-team" | "own";
  phoneNumberId: string;
  businessAccountId: string;
  displayNumber: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
};

/** Reads the Add School form's WhatsApp part. Anything unknown is the shared number. */
export function readWhatsappChoice(get: (k: string) => string): SchoolWhatsappChoice {
  const t = (k: string) => get(k).trim().slice(0, 500);
  return {
    mode: get("whatsapp") === "own" ? "own" : "dream-team",
    phoneNumberId: t("waPhoneNumberId"),
    businessAccountId: t("waBusinessAccountId"),
    displayNumber: t("waDisplayNumber").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""),
    accessToken: t("waSecret_accessToken"),
    appSecret: t("waSecret_appSecret"),
    verifyToken: t("waSecret_verifyToken"),
  };
}

/** The first problem with the choice, by Add School field name; null when it can be saved. */
export function whatsappChoiceProblem(c: SchoolWhatsappChoice): { field: string; message: string } | null {
  if (c.mode !== "own") return null;
  if (!c.phoneNumberId) return { field: "waPhoneNumberId", message: "Enter the phone number ID from Meta Business Manager, WhatsApp, API setup." };
  if (!META_ID.test(c.phoneNumberId)) return { field: "waPhoneNumberId", message: "The phone number ID has only numbers, as shown in Meta Business Manager, WhatsApp, API setup." };
  if (!c.businessAccountId) return { field: "waBusinessAccountId", message: "Enter the WhatsApp Business account ID." };
  if (!META_ID.test(c.businessAccountId)) return { field: "waBusinessAccountId", message: "The WhatsApp Business account ID has only numbers, as shown in Meta Business Manager." };
  if (c.displayNumber && !/^[6-9]\d{9}$/.test(c.displayNumber)) return { field: "waDisplayNumber", message: "Enter a 10-digit mobile number." };
  if (!c.accessToken) return { field: "waSecret_accessToken", message: "Enter the permanent access token." };
  return null;
}

/** What saveChannel() is given for the choice: switched on; for real when the number can send. */
export function whatsappChannelInput(c: SchoolWhatsappChoice): ChannelInput {
  if (c.mode === "own") {
    return {
      provider: "meta-cloud", live: true, isOn: true, lowCreditAlert: 100,
      config: { phoneNumberId: c.phoneNumberId, businessAccountId: c.businessAccountId, displayNumber: c.displayNumber },
      secrets: { accessToken: c.accessToken, appSecret: c.appSecret, verifyToken: c.verifyToken },
    };
  }
  // Until DREAM TEAM's number is set on this server, the shared number is chosen but WhatsApp stays off.
  const ready = dreamTeamWhatsappReady();
  return { provider: DREAM_TEAM_PROVIDER, live: ready, isOn: ready, lowCreditAlert: 100, config: {}, secrets: {} };
}

/**
 * Connects the new school's WhatsApp, after the school is made. Never stops
 * the school from being made: a problem is returned in plain words, and the
 * Connections page can put it right.
 */
export async function connectSchoolWhatsapp(actor: ConsoleActor, school: { id: string; name: string }, c: SchoolWhatsappChoice): Promise<string | null> {
  const input = whatsappChannelInput(c);
  try {
    await withConsoleSchool(school.id, async (tx) => {
      await saveChannel(tx, { schoolId: school.id, userId: null, console: { name: actor.name } }, "whatsapp", input);
      const words = c.mode === "own"
        ? `connected WhatsApp for ${school.name} to the school's own number${c.displayNumber ? ` (${c.displayNumber.slice(0, 2)}xxx xx${c.displayNumber.slice(7)})` : ""}`
        : `chose DREAM TEAM's shared WhatsApp number for ${school.name}${input.live ? "" : " (off until the number is set up on the server)"}`;
      await logActivity(tx, actor, { type: "connect", text: `${words}.`, school });
    }, { timeout: 30_000 });
    return null;
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", event: "add-school-whatsapp-failed", school: school.id, reason: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
    return e instanceof ChannelProblem ? `${e.message} Set it on the school's Connections page.` : "WhatsApp could not be connected. Set it on the school's Connections page.";
  }
}
