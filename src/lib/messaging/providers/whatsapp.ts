// WhatsApp through Meta's WhatsApp Cloud API. Approved templates go as
// template messages; a typed message goes as text, which WhatsApp accepts
// only within 24 hours of the parent's last message.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Outgoing, Provider, ProviderConfig, SendResult } from "./types";
import { networkFailure, postJson } from "./types";
import { whatsappParts } from "../blanks";
import { appUrl } from "../../parent-link/token";
import { cardSubmission, metaSample, samplePdf, type SubmittedCard, type WhatsappCard } from "../card";

/** Meta retires each Graph API version about two years after it comes out, so the version is a setting. */
export const GRAPH_VERSION = /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_API_VERSION ?? "") ? process.env.WHATSAPP_GRAPH_API_VERSION! : "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Meta's phone number IDs and WhatsApp Business account IDs are numbers only.
 * The school types them, and they go into the Graph address, so anything else
 * is refused: it could change which address School OS calls (08-platform-security.md §7).
 */
export const META_ID = /^\d{1,30}$/;

/** Only Graph API pages on Meta's own address are followed, never a link to anywhere else. */
export function isGraphPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.origin === new URL(GRAPH).origin && !u.username && !u.password;
  } catch {
    return false;
  }
}

type GraphError = { error?: { code?: number; message?: string; error_user_title?: string; error_user_msg?: string; error_data?: { details?: string } } };

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
    case 131042: return { reason: "The WhatsApp Business account has a payment problem. Add a payment method in Meta Business Settings.", retryable: false };
    case 131050: return { reason: "This person has turned off marketing messages from this business on WhatsApp.", retryable: false };
    default: return { reason: message ? `WhatsApp did not send it: ${message.replace(/\/(p|r|invite)\/[A-Za-z0-9_.-]{8,}/g, "/$1/…").slice(0, 160)}.` : "WhatsApp did not send it.", retryable: false };
  }
}

/**
 * What is posted to Meta's /messages for one message. A template goes with its
 * header's value (the receipt PDF's media id), its blanks in order, and each
 * link button's end of address at that button's own position (index) in the
 * template. A header and footer without blanks, a phone button and a fixed
 * link need nothing. An Authentication (code) template carries the code twice,
 * as Meta requires: as the body's only blank and as the "Copy code" button's
 * blank (sub_type "url", index 0); see deliver.ts.
 */
export function whatsappMessageBody(msg: Pick<Outgoing, "to" | "text" | "whatsappTemplate">) {
  const to = `91${msg.to}`;
  const t = msg.whatsappTemplate;
  if (!t) return { messaging_product: "whatsapp", to, type: "text", text: { body: msg.text, preview_url: true } };
  const buttons = t.buttons ?? (t.buttonParam ? [{ index: 0, value: t.buttonParam }] : []);
  const header = t.header?.type === "document" && t.header.id
    ? [{ type: "header", parameters: [{ type: "document", document: { id: t.header.id, filename: t.header.filename } }] }]
    : [];
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: t.name,
      language: { code: t.language },
      components: [
        ...header,
        ...(t.params.length ? [{ type: "body", parameters: t.params.map((text) => ({ type: "text", text })) }] : []),
        ...buttons.map((b) => ({ type: "button", sub_type: "url", index: String(b.index), parameters: [{ type: "text", text: b.value }] })),
      ],
    },
  };
}

/** Uploads a file to WhatsApp's media store for this number (POST /<phone number id>/media) and returns its media id. */
export async function uploadWhatsappMedia(p: ProviderConfig, file: { content: Buffer; filename: string; contentType: string }): Promise<{ ok: true; id: string } | { ok: false; reason: string; retryable: boolean }> {
  if (!p.config.phoneNumberId || !p.secrets.accessToken || !META_ID.test(p.config.phoneNumberId)) return { ok: false, retryable: false, reason: "WhatsApp is not fully connected. Check Settings, SMS, WhatsApp & Email." };
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", file.contentType);
    form.append("file", new Blob([new Uint8Array(file.content)], { type: file.contentType }), file.filename);
    const res = await fetch(`${GRAPH}/${encodeURIComponent(p.config.phoneNumberId)}/media`, { method: "POST", headers: { Authorization: `Bearer ${p.secrets.accessToken}` }, body: form, signal: AbortSignal.timeout(15_000) });
    const json = (await res.json().catch(() => null)) as ({ id?: string } & GraphError) | null;
    if (res.ok && json?.id) return { ok: true, id: json.id };
    if (res.status >= 500) return { ok: false, retryable: true, reason: "WhatsApp could not take the receipt PDF just now. It will be tried again." };
    return { ok: false, retryable: false, reason: json?.error?.message ? `WhatsApp did not take the receipt PDF: ${json.error.message.slice(0, 160)}.` : "WhatsApp did not take the receipt PDF." };
  } catch {
    return { ok: false, retryable: true, reason: "Could not send the receipt PDF to WhatsApp. It will be tried again." };
  }
}

export function whatsappProvider({ config, secrets }: ProviderConfig): Provider {
  // One upload per receipt PDF for this delivery run: the parents of one payment share it.
  const uploaded = new Map<string, string>();
  return {
    key: "meta-cloud",
    async send(msg: Outgoing): Promise<SendResult> {
      if (!config.phoneNumberId || !secrets.accessToken) return { ok: false, retryable: false, reason: "WhatsApp is not fully connected. Check Settings, SMS, WhatsApp & Email." };
      if (!META_ID.test(config.phoneNumberId)) return { ok: false, retryable: false, reason: "The WhatsApp phone number ID has only numbers. Check it in Settings, SMS, WhatsApp & Email." };
      // A document header (the receipt PDF) goes to WhatsApp's media store first; the message carries its media id.
      // Meta never fetches it from our receipt link, which is rate limited per address.
      const head = msg.whatsappTemplate?.header;
      if (head?.type === "document" && !head.id) {
        if (!head.file) return { ok: false, retryable: true, reason: "The receipt PDF could not be made. It will be tried again." };
        const key = `${head.filename}:${head.file.content.length}`;
        let id = uploaded.get(key);
        if (!id) {
          const up = await uploadWhatsappMedia({ config, secrets }, { content: head.file.content, filename: head.filename, contentType: "application/pdf" });
          if (!up.ok) return { ok: false, retryable: up.retryable, reason: up.reason };
          id = up.id;
          uploaded.set(key, id);
        }
        msg = { ...msg, whatsappTemplate: { ...msg.whatsappTemplate!, header: { ...head, id } } };
      }
      const body = whatsappMessageBody(msg);
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

/**
 * The components WhatsApp is asked to approve: the words, blanks becoming
 * {{1}}, {{2}}... in the order they appear, and a link button such as "Open
 * receipt" (https://…/r/{{1}}) when the text has a button blank.
 */
export function templateComponents(body: string) {
  const parts = whatsappParts(body);
  let text = parts.text;
  parts.variables.forEach((v, i) => { text = text.split(`{${v}}`).join(`{{${i + 1}}}`); });
  const components: Record<string, unknown>[] = [{ type: "BODY", text, ...(parts.variables.length ? { example: { body_text: [parts.variables.map(metaSample)] } } : {}) }];
  if (parts.button) {
    components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: parts.button.label, url: `${appUrl()}/r/{{1}}`, example: [`${appUrl()}/r/${"0".repeat(64)}SampleReceiptKey123456`] }] });
  }
  return components;
}

/** How long a one-time code works (Parent Link, admission consent and sign-in codes; one-time-code.ts CODE_SEND_WINDOW_MS). */
export const CODE_EXPIRY_MINUTES = 10;

/**
 * An Authentication template in Meta's fixed form (copy-code button). Meta
 * writes the words itself, in the template's language: "<code> is your
 * verification code.", the security line "For your security, do not share this
 * code." and the footer "This code expires in 10 minutes." No text of our own
 * is allowed; the button's label defaults to Meta's "Copy code" in that language.
 * developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
 */
export function authTemplateComponents() {
  return [
    { type: "BODY", add_security_recommendation: true },
    { type: "FOOTER", code_expiration_minutes: CODE_EXPIRY_MINUTES },
    { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
  ];
}

export type TemplateSubmission = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  body: string;
  /** A card's header, footer and buttons (../card.ts); without one, the plain words (and an old "Open receipt" line). */
  card?: WhatsappCard | null;
  school?: { name: string; phone: string | null };
  parentLinkOn?: boolean;
  /** WhatsApp's handle of the sample receipt PDF, for a document header. */
  documentHandle?: string | null;
};

/**
 * What is posted to Meta's /message_templates: a code template in Meta's fixed
 * form; a card with its header, footer and buttons; any other with its own words.
 */
export function templateSubmission(t: TemplateSubmission): { name: string; language: string; category: string; components: Record<string, unknown>[] } {
  return templateSubmissionParts(t).body as { name: string; language: string; category: string; components: Record<string, unknown>[] };
}

/** templateSubmission, and the card parts it gave WhatsApp (saved with the version for sending). */
export function templateSubmissionParts(t: TemplateSubmission): { body: Record<string, unknown>; submitted: SubmittedCard | null } {
  const base = { name: t.name, language: t.language, category: t.category };
  if (t.category === "AUTHENTICATION") return { body: { ...base, components: authTemplateComponents() }, submitted: null };
  if (t.card) {
    const r = cardSubmission(t.body, t.card, { appUrl: appUrl(), schoolName: t.school?.name ?? "", schoolPhone: t.school?.phone ?? null, parentLinkOn: Boolean(t.parentLinkOn), documentHandle: t.documentHandle ?? null });
    return { body: { ...base, components: r.components }, submitted: r.submitted };
  }
  return { body: { ...base, components: templateComponents(t.body) }, submitted: null };
}

/**
 * The sample PDF a document header needs at submission, given to WhatsApp with
 * the Resumable Upload API (an upload session on the Meta app, then the bytes);
 * returns WhatsApp's handle. The app is WHATSAPP_APP_ID on the server, or the
 * app the access token belongs to (asked as /app, then /debug_token, which
 * also answers for a system user's token). When it cannot be done it says which
 * step failed and WhatsApp's words: the card then goes with its text header and
 * the person is told why (live test 16 Nov: the receipt PDF went missing silently).
 */
export async function uploadTemplateSample(p: ProviderConfig): Promise<{ handle: string } | { problem: string }> {
  const token = p.secrets.accessToken;
  if (!token) return { problem: "no access token" };
  const metaSaid = async (res: Response) => {
    const e = ((await res.json().catch(() => null)) as GraphError | null)?.error;
    return [e?.error_user_msg, e?.message].find(Boolean)?.slice(0, 200) ?? `HTTP ${res.status}`;
  };
  try {
    let appId = (process.env.WHATSAPP_APP_ID ?? "").trim();
    if (!appId) {
      const res = await fetch(`${GRAPH}/app`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      appId = res.ok ? String(((await res.json()) as { id?: string }).id ?? "") : "";
    }
    if (!META_ID.test(appId)) {
      const res = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { problem: `the Meta app could not be found (${await metaSaid(res)}); set WHATSAPP_APP_ID on the server` };
      appId = String(((await res.json()) as { data?: { app_id?: string } }).data?.app_id ?? "");
    }
    if (!META_ID.test(appId)) return { problem: "the Meta app could not be found; set WHATSAPP_APP_ID on the server" };
    const pdf = samplePdf();
    const start = await fetch(`${GRAPH}/${appId}/uploads?file_name=sample-receipt.pdf&file_length=${pdf.length}&file_type=application/pdf`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!start.ok) return { problem: `WhatsApp did not open the upload (${await metaSaid(start)})` };
    const session = String(((await start.json()) as { id?: string }).id ?? "");
    if (!/^upload:[A-Za-z0-9_=:-]+$/.test(session)) return { problem: "WhatsApp did not open the upload" };
    const put = await fetch(`${GRAPH}/${session}`, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_offset: "0" }, body: new Uint8Array(pdf), signal: AbortSignal.timeout(15_000) });
    if (!put.ok) return { problem: `WhatsApp did not take the sample PDF (${await metaSaid(put)})` };
    const h = ((await put.json()) as { h?: string }).h;
    return typeof h === "string" && h ? { handle: h } : { problem: "WhatsApp did not take the sample PDF" };
  } catch {
    return { problem: "WhatsApp could not be reached for the sample PDF" };
  }
}

/**
 * Sends a template to WhatsApp for approval (see templateSubmission), and says
 * what was submitted, so each message is later sent with the same parts.
 */
export async function submitWhatsappTemplate(p: ProviderConfig, t: TemplateSubmission): Promise<{ ok: true; status: string; submitted: SubmittedCard | null; note?: string } | { ok: false; reason: string }> {
  if (!p.config.businessAccountId || !p.secrets.accessToken) return { ok: false as const, reason: "Add the WhatsApp Business account ID and access token in Settings, SMS, WhatsApp & Email first." };
  if (!META_ID.test(p.config.businessAccountId)) return { ok: false as const, reason: "The WhatsApp Business account ID has only numbers. Check it in Settings, SMS, WhatsApp & Email." };
  try {
    let documentHandle: string | null = null;
    let note: string | undefined;
    if (t.card?.header?.type === "document") {
      const sample = t.documentHandle ? { handle: t.documentHandle } : await uploadTemplateSample(p);
      if ("handle" in sample) documentHandle = sample.handle;
      else note = `Sent without the receipt PDF on top: ${sample.problem}.`;
    }
    const { body, submitted } = templateSubmissionParts({ ...t, documentHandle });
    const res = await postJson(
      `${GRAPH}/${encodeURIComponent(p.config.businessAccountId)}/message_templates`,
      body,
      { Authorization: `Bearer ${p.secrets.accessToken}` },
      8000,
    );
    const json = res.json as ({ id?: string; status?: string } & GraphError) | null;
    if (res.ok && json?.id) return { ok: true as const, status: (json.status ?? "PENDING").toUpperCase(), submitted, ...(note ? { note } : {}) };
    // Meta's own words for the person: the user title and message and the details say what is wrong
    // ("Invalid parameter" alone hid a header emoji, live test 16 Nov).
    const e = json?.error;
    const said = [e?.error_user_title, e?.error_user_msg, e?.error_data?.details, e?.message].filter((x, i, a): x is string => Boolean(x) && a.indexOf(x) === i).join(" · ");
    return { ok: false as const, reason: said ? `WhatsApp said: ${said.slice(0, 400)}` : "WhatsApp did not accept the template." };
  } catch {
    return { ok: false as const, reason: "Could not reach WhatsApp. Please try again." };
  }
}

type MetaTemplateRow = { name: string; language: string; status: string; rejected_reason?: string; category?: string };

/**
 * Meta's reason for a refused template. When it refuses with "NONE" (live test 16 Nov: three texts
 * refused at once, no reason), the category it filed the text under is the only clue, so it is named.
 */
function metaNote(t: MetaTemplateRow): string | null {
  if (t.rejected_reason && t.rejected_reason !== "NONE") return t.rejected_reason;
  if (t.status.toUpperCase() !== "REJECTED") return null;
  return t.category ? `NO_REASON_GIVEN (filed as ${t.category.toUpperCase()})` : null;
}

/** Asks WhatsApp for a submitted template's approval status. */
export async function whatsappTemplateStatus(p: ProviderConfig, name: string, language: string) {
  if (!p.config.businessAccountId || !p.secrets.accessToken || !META_ID.test(p.config.businessAccountId)) return null;
  try {
    const url = `${GRAPH}/${encodeURIComponent(p.config.businessAccountId)}/message_templates?name=${encodeURIComponent(name)}&fields=name,language,status,rejected_reason,category`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${p.secrets.accessToken}` }, signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { data?: MetaTemplateRow[] };
    const t = json.data?.find((x) => x.language === language) ?? json.data?.[0];
    return t ? { status: t.status.toUpperCase(), note: metaNote(t) } : null;
  } catch {
    return null;
  }
}

/**
 * Every template the WhatsApp Business account has, keyed "name|language", with
 * its status. Read-only. Null when the list could not be read in full, so a
 * caller never mistakes a failed call for "WhatsApp has no templates".
 */
export async function listWhatsappTemplates(p: ProviderConfig): Promise<Map<string, { status: string; note: string | null }> | null> {
  if (!p.config.businessAccountId || !p.secrets.accessToken || !META_ID.test(p.config.businessAccountId)) return null;
  const out = new Map<string, { status: string; note: string | null }>();
  let url: string | null = `${GRAPH}/${encodeURIComponent(p.config.businessAccountId)}/message_templates?fields=name,language,status,rejected_reason,category&limit=200`;
  try {
    for (let page = 0; url && page < 20; page++) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${p.secrets.accessToken}` }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: MetaTemplateRow[]; paging?: { next?: string } };
      for (const t of json.data ?? []) {
        out.set(`${t.name}|${t.language}`, { status: t.status.toUpperCase(), note: metaNote(t) });
      }
      url = json.paging?.next ?? null;
      // The next page must be on Meta's own address; anything else is not followed, and the list is not complete.
      if (url && !isGraphPage(url)) return null;
    }
    return url ? null : out;
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
/**
 * The statuses and messages in a Meta webhook. With `phoneNumberId`, only the
 * changes for that WhatsApp number count: schools on the same Meta app share
 * its app secret, so the signature alone does not say which school an event is for.
 */
export function parseMetaWebhook(body: unknown, phoneNumberId?: string): { statuses: MetaStatus[]; incoming: (MetaIncoming & { name?: string })[] } {
  const statuses: MetaStatus[] = [];
  const incoming: (MetaIncoming & { name?: string })[] = [];
  const entries = (body as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; statuses?: MetaStatus[]; messages?: MetaIncoming[]; contacts?: { wa_id: string; profile?: { name?: string } }[] } }[] }[] })?.entry ?? [];
  for (const e of entries) {
    for (const ch of e.changes ?? []) {
      if (phoneNumberId !== undefined && (!phoneNumberId || ch.value?.metadata?.phone_number_id !== phoneNumberId)) continue;
      for (const s of ch.value?.statuses ?? []) statuses.push(s);
      for (const m of ch.value?.messages ?? []) incoming.push({ ...m, name: ch.value?.contacts?.find((c) => c.wa_id === m.from)?.profile?.name });
    }
  }
  return { statuses, incoming };
}
