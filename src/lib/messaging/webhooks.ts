// Delivery and read receipts from providers (Providers -> Communication,
// 11-communication.md §4). Each school has its own webhook address with its
// id in it; every call is checked (signature or secret key) before anything
// is read, and status only ever moves forward.
import "server-only";

import { timingSafeEqual } from "node:crypto";
import { withSchool, type SchoolContext } from "../db";
import { channelSecrets } from "./channels";
import { applyStatus } from "./deliver";
import { optOutByPhone } from "./optout";
import { msg91Status } from "./providers/msg91";
import { parseMetaWebhook, verifyMetaSignature, whatsappReason } from "./providers/whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function webhookPath(channel: "whatsapp" | "sms", schoolId: string) {
  return `/api/v1/messaging/webhooks/${channel}/${schoolId}`;
}

export type WebhookOutcome = { status: number; body?: string };

/** WhatsApp's one-time check when the webhook is added in Meta. */
export async function verifyWhatsappSubscription(schoolId: string, params: URLSearchParams): Promise<WebhookOutcome> {
  if (!UUID.test(schoolId)) return { status: 404 };
  const ctx: SchoolContext = { schoolId, userId: null };
  const secrets = await withSchool(ctx, (tx) => channelSecrets(tx, ctx, "whatsapp")).catch(() => ({} as Record<string, string>));
  if (params.get("hub.mode") === "subscribe" && secrets.verifyToken && same(params.get("hub.verify_token") ?? "", secrets.verifyToken)) {
    return { status: 200, body: params.get("hub.challenge") ?? "" };
  }
  return { status: 403 };
}

export async function handleWhatsappWebhook(schoolId: string, rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  if (!UUID.test(schoolId)) return { status: 404 };
  const ctx: SchoolContext = { schoolId, userId: null };
  const secrets = await withSchool(ctx, (tx) => channelSecrets(tx, ctx, "whatsapp")).catch(() => ({} as Record<string, string>));
  if (!secrets.appSecret || !verifyMetaSignature(rawBody, signature, secrets.appSecret)) return { status: 401 };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400 };
  }
  const { statuses, incoming } = parseMetaWebhook(body);
  await withSchool(ctx, async (tx) => {
    for (const s of statuses) {
      const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
      const map: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
      const status = map[s.status];
      if (!status) continue;
      const reason = status === "FAILED" ? whatsappReason(s.errors?.[0]?.code, s.errors?.[0]?.message ?? s.errors?.[0]?.title).reason : null;
      await applyStatus(tx, ctx, s.id, status, at, reason);
    }
    for (const m of incoming) {
      const text = (m.text?.body ?? m.button?.text ?? "").trim().toUpperCase();
      const phone = m.from.replace(/^91(?=\d{10}$)/, "");
      if (text === "STOP" || text === "UNSUBSCRIBE") await optOutByPhone(tx, ctx, phone, true);
      else if (text === "START") await optOutByPhone(tx, ctx, phone, false);
    }
  }, { timeout: 30_000 });
  return { status: 200, body: "ok" };
}

/** MSG91 delivery reports. MSG91 does not sign them, so the address carries a secret key. */
export async function handleMsg91Webhook(schoolId: string, key: string | null, rawBody: string): Promise<WebhookOutcome> {
  if (!UUID.test(schoolId)) return { status: 404 };
  const ctx: SchoolContext = { schoolId, userId: null };
  const secrets = await withSchool(ctx, (tx) => channelSecrets(tx, ctx, "sms")).catch(() => ({} as Record<string, string>));
  if (!secrets.webhookKey || !same(key ?? "", secrets.webhookKey)) return { status: 401 };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // MSG91 can also post form data: data=<json>
    try {
      body = JSON.parse(new URLSearchParams(rawBody).get("data") ?? "");
    } catch {
      return { status: 400 };
    }
  }
  type Report = { requestId?: string; report?: { number?: string; status?: string; desc?: string; date?: string }[] };
  const reports = (Array.isArray(body) ? body : (body as { data?: Report[] })?.data ?? [body]) as Report[];
  await withSchool(ctx, async (tx) => {
    for (const r of reports) {
      if (!r?.requestId) continue;
      for (const line of r.report ?? []) {
        const { status, reason } = msg91Status(String(line.status ?? ""));
        await applyStatus(tx, ctx, r.requestId, status, line.date ? new Date(line.date) : new Date(), reason ?? line.desc ?? null);
      }
    }
  }, { timeout: 30_000 });
  return { status: 200, body: "ok" };
}
