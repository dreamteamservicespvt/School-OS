// WhatsApp through Meta's WhatsApp Cloud API. Approved templates go as
// template messages; a typed message goes as text, which WhatsApp accepts
// only within 24 hours of the parent's last message.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Outgoing, Provider, ProviderConfig, SendResult } from "./types";
import { networkFailure, postJson } from "./types";

/** Meta retires each Graph API version about two years after it comes out, so the version is a setting. */
export const GRAPH_VERSION = /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_API_VERSION ?? "") ? process.env.WHATSAPP_GRAPH_API_VERSION! : "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { error?: { code?: number; message?: string; error_data?: { details?: string } } };

/** Plain words for WhatsApp's error codes (the common ones). */
export function whatsappReason(code: number | undefined, message?: string): { reason: string; retryable: boolean } {
  switch (code) {
    case 131026: return { reason: "Number not on WhatsApp.", retryable: false };
    case 131047: return { reason: "WhatsApp allows a typed message only within 24 hours of the parent's last message. Use an approved template.", retryable: false };
    case 132000: case 132001: return { reason: "The WhatsApp template is not approved or its blanks do not match.", retryable: false };
    case 131051: return { reason: "WhatsApp does not support this kind of message.", retryable: false };
    case 130429: case 131048: case 131056: return { reason: "WhatsApp asked us to slow down. It will be tried again.", retryable: true };
    case 190: return { reason: "The WhatsApp access token has expired. Replace it in Settings, SMS, WhatsApp & Email.", retryable: false };
    case 131049: return { reason: "WhatsApp held this message back to protect the parent from too many messages.", retryable: false };
    default: return { reason: message ? `WhatsApp did not send it: ${message.slice(0, 160)}.` : "WhatsApp did not send it.", retryable: false };
  }
}

export function whatsappProvider({ config, secrets }: ProviderConfig): Provider {
  return {
    key: "meta-cloud",
    async send(msg: Outgoing): Promise<SendResult> {
      if (!config.phoneNumberId || !secrets.accessToken) return { ok: false, retryable: false, reason: "WhatsApp is not fully connected. Check Settings, SMS, WhatsApp & Email." };
      const to = `91${msg.to}`;
      const body = msg.whatsappTemplate
        ? {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: msg.whatsappTemplate.name,
              language: { code: msg.whatsappTemplate.language },
              components: msg.whatsappTemplate.params.length
                ? [{ type: "body", parameters: msg.whatsappTemplate.params.map((text) => ({ type: "text", text })) }]
                : [],
            },
          }
        : { messaging_product: "whatsapp", to, type: "text", text: { body: msg.text, preview_url: true } };
      try {
        const res = await postJson(`${GRAPH}/${encodeURIComponent(config.phoneNumberId)}/messages`, body, { Authorization: `Bearer ${secrets.accessToken}` });
        const json = res.json as ({ messages?: { id: string }[] } & GraphError) | null;
        const id = json?.messages?.[0]?.id;
        if (res.ok && id) return { ok: true, providerMessageId: id, status: "SENT" };
        if (res.status >= 500) return { ok: false, retryable: true, reason: "WhatsApp is having trouble. It will be tried again." };
        const r = whatsappReason(json?.error?.code, json?.error?.error_data?.details ?? json?.error?.message);
        return { ok: false, ...r };
      } catch (e) {
        return networkFailure(e);
      }
    },
  };
}

/** Sends a template to WhatsApp for approval. Blanks become {{1}}, {{2}}... in the order they appear. */
export async function submitWhatsappTemplate(p: ProviderConfig, t: { name: string; language: string; category: "UTILITY" | "MARKETING" | "AUTHENTICATION"; body: string; variables: string[] }) {
  if (!p.config.businessAccountId || !p.secrets.accessToken) return { ok: false as const, reason: "Add the WhatsApp Business account ID and access token in Settings, SMS, WhatsApp & Email first." };
  let text = t.body;
  t.variables.forEach((v, i) => { text = text.split(`{${v}}`).join(`{{${i + 1}}}`); });
  try {
    const res = await postJson(
      `${GRAPH}/${encodeURIComponent(p.config.businessAccountId)}/message_templates`,
      {
        name: t.name,
        language: t.language,
        category: t.category,
        components: [{ type: "BODY", text, ...(t.variables.length ? { example: { body_text: [t.variables.map((v) => `sample ${v.replace(/_/g, " ")}`)] } } : {}) }],
      },
      { Authorization: `Bearer ${p.secrets.accessToken}` },
      8000,
    );
    const json = res.json as ({ id?: string; status?: string } & GraphError) | null;
    if (res.ok && json?.id) return { ok: true as const, status: (json.status ?? "PENDING").toUpperCase() };
    return { ok: false as const, reason: json?.error?.message ? `WhatsApp said: ${json.error.message.slice(0, 200)}` : "WhatsApp did not accept the template." };
  } catch {
    return { ok: false as const, reason: "Could not reach WhatsApp. Please try again." };
  }
}

/** Asks WhatsApp for a submitted template's approval status. */
export async function whatsappTemplateStatus(p: ProviderConfig, name: string, language: string) {
  if (!p.config.businessAccountId || !p.secrets.accessToken) return null;
  try {
    const url = `${GRAPH}/${encodeURIComponent(p.config.businessAccountId)}/message_templates?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${p.secrets.accessToken}` }, signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { data?: { name: string; language: string; status: string; rejected_reason?: string }[] };
    const t = json.data?.find((x) => x.language === language) ?? json.data?.[0];
    return t ? { status: t.status.toUpperCase(), note: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null } : null;
  } catch {
    return null;
  }
}

/** Checks that a webhook call really came from Meta (X-Hub-Signature-256). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type MetaStatus = { id: string; status: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string }[] };
export type MetaIncoming = { from: string; id: string; timestamp?: string; type: string; text?: { body: string }; button?: { text: string } };

/** Pulls status updates and incoming messages out of a webhook body. */
export function parseMetaWebhook(body: unknown): { statuses: MetaStatus[]; incoming: (MetaIncoming & { name?: string })[] } {
  const statuses: MetaStatus[] = [];
  const incoming: (MetaIncoming & { name?: string })[] = [];
  const entries = (body as { entry?: { changes?: { value?: { statuses?: MetaStatus[]; messages?: MetaIncoming[]; contacts?: { wa_id: string; profile?: { name?: string } }[] } }[] }[] })?.entry ?? [];
  for (const e of entries) {
    for (const ch of e.changes ?? []) {
      for (const s of ch.value?.statuses ?? []) statuses.push(s);
      for (const m of ch.value?.messages ?? []) incoming.push({ ...m, name: ch.value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name });
    }
  }
  return { statuses, incoming };
}
