// Message channels and how each one is connected (Settings, SMS, WhatsApp &
// Email). Provider keys are stored encrypted in Messaging Channel and are
// never shown again; only their last 4 characters are.
import "server-only";

import { decryptField, encryptField } from "../crypto";
import type { SchoolContext, Tx } from "../db";

export const CHANNELS = ["whatsapp", "sms", "email", "app"] as const;
export type Channel = (typeof CHANNELS)[number];
/** Channels that are connected to an outside provider (app notifications are built in). */
export const PROVIDER_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type ProviderChannel = (typeof PROVIDER_CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
  app: "App notification",
};

export function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}

/** The providers each channel can use. "sandbox" records messages without sending them. */
export const PROVIDERS: Record<ProviderChannel, { key: string; label: string }[]> = {
  whatsapp: [
    { key: "sandbox", label: "Test mode (nothing is sent)" },
    { key: "meta-cloud", label: "WhatsApp Business (Meta Cloud API)" },
  ],
  sms: [
    { key: "sandbox", label: "Test mode (nothing is sent)" },
    { key: "msg91", label: "MSG91" },
  ],
  email: [
    { key: "sandbox", label: "Test mode (nothing is sent)" },
    { key: "smtp", label: "Email server (SMTP)" },
  ],
};

/** The secret and plain fields each provider needs. Secrets are encrypted. */
export const PROVIDER_FIELDS: Record<string, { key: string; label: string; secret: boolean; help?: string; required: boolean }[]> = {
  sandbox: [],
  "meta-cloud": [
    { key: "phoneNumberId", label: "Phone number ID", secret: false, required: true, help: "From Meta Business Manager, WhatsApp, API setup." },
    { key: "businessAccountId", label: "WhatsApp Business account ID", secret: false, required: true, help: "Needed to send templates for WhatsApp approval." },
    { key: "displayNumber", label: "School WhatsApp number", secret: false, required: false, help: "Shown to parents on Parent Link, e.g. 9876543210." },
    { key: "accessToken", label: "Permanent access token", secret: true, required: true },
    // Optional: messages send without them. Delivery reports and replies are
    // refused until the app secret is set (webhooks.ts), so nothing unchecked gets in.
    { key: "appSecret", label: "App secret", secret: true, required: false, help: "Optional to start sending. Needed for delivered and read ticks and for replies: Meta for Developers, your app, App settings, Basic." },
    { key: "verifyToken", label: "Webhook verify token", secret: true, required: false, help: "Optional to start sending. Any long random word; enter the same word in Meta when you add the webhook address." },
  ],
  msg91: [
    { key: "senderId", label: "Sender ID", secret: false, required: true, help: "6 letters, the same as your DLT sender header." },
    { key: "authKey", label: "MSG91 auth key", secret: true, required: true },
    { key: "webhookKey", label: "Delivery report key", secret: true, required: true, help: "Any long random word. It is part of the delivery report address you give MSG91." },
  ],
  smtp: [
    { key: "host", label: "Server", secret: false, required: true, help: "For example smtp.gmail.com" },
    { key: "port", label: "Port", secret: false, required: true, help: "Usually 587 (or 465 for SSL)." },
    { key: "fromName", label: "From name", secret: false, required: true, help: "For example Sunrise Public School" },
    { key: "fromAddress", label: "From address", secret: false, required: true, help: "For example office@sunriseschool.in" },
    { key: "user", label: "Username", secret: false, required: true },
    { key: "password", label: "Password", secret: true, required: true },
  ],
};

export type ChannelSetup = {
  channel: ProviderChannel;
  provider: string;
  isOn: boolean;
  environment: "test" | "live";
  config: Record<string, string>;
  hasSecrets: boolean;
  secretsLast4: string | null;
  lowCreditAlert: number;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestNote: string | null;
};

function asConfig(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string")) as Record<string, string>;
}

/** Every channel's setup for a school. A channel never set up is "not connected" and off. */
export async function channelSetups(tx: Tx, ctx: SchoolContext): Promise<Record<ProviderChannel, ChannelSetup>> {
  const rows = await tx.messagingChannel.findMany({ where: { schoolId: ctx.schoolId } });
  const out = {} as Record<ProviderChannel, ChannelSetup>;
  for (const channel of PROVIDER_CHANNELS) {
    const r = rows.find((x) => x.channel === channel);
    out[channel] = {
      channel,
      provider: r?.provider ?? "sandbox",
      isOn: r?.isOn ?? false,
      environment: r?.environment === "live" ? "live" : "test",
      config: asConfig(r?.config),
      hasSecrets: Boolean(r?.secretsEnc),
      secretsLast4: r?.secretsLast4 ?? null,
      lowCreditAlert: r?.lowCreditAlert ?? 100,
      lastTestAt: r?.lastTestAt ?? null,
      lastTestOk: r?.lastTestOk ?? null,
      lastTestNote: r?.lastTestNote ?? null,
    };
  }
  return out;
}

/** The decrypted secrets of a channel, for the provider adapter only. Never sent to a browser. */
export async function channelSecrets(tx: Tx, ctx: SchoolContext, channel: ProviderChannel): Promise<Record<string, string>> {
  const r = await tx.messagingChannel.findUnique({ where: { schoolId_channel: { schoolId: ctx.schoolId, channel } }, select: { secretsEnc: true } });
  if (!r?.secretsEnc) return {};
  try {
    return asConfig(JSON.parse(decryptField(r.secretsEnc)));
  } catch {
    return {};
  }
}

export function encryptSecrets(secrets: Record<string, string>) {
  const joined = Object.values(secrets).filter(Boolean).join("");
  return { secretsEnc: encryptField(JSON.stringify(secrets)), secretsLast4: joined ? joined.slice(-4) : null };
}

/** Is a channel ready to send right now? App notifications always are. */
export async function onChannels(tx: Tx, ctx: SchoolContext): Promise<Set<Channel>> {
  const setups = await channelSetups(tx, ctx);
  const on = new Set<Channel>(["app"]);
  for (const c of PROVIDER_CHANNELS) if (setups[c].isOn) on.add(c);
  return on;
}

/** "WhatsApp if connected, else SMS" (11-communication.md, Send Message, Channel default). */
export async function preferredChannel(tx: Tx, ctx: SchoolContext): Promise<Channel> {
  const on = await onChannels(tx, ctx);
  return on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : on.has("email") ? "email" : "app";
}
