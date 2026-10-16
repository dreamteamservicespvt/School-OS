// What every message provider adapter takes and returns. Adapters never
// touch the database; the delivery job records what they say.

export type Outgoing = {
  channel: "whatsapp" | "sms" | "email";
  /** 10-digit Indian mobile, or an email address. */
  to: string;
  text: string;
  subject?: string | null;
  /** SMS: the DLT template ID (rule 34) and the school's DLT details. */
  dltTemplateId?: string | null;
  dltEntityId?: string | null;
  senderHeader?: string | null;
  /** WhatsApp: an approved template's name, language and blanks in order. */
  whatsappTemplate?: { name: string; language: string; params: string[]; /** The blank in the template's first button: a code for "Copy code", or the end of a link button. */ buttonParam?: string } | null;
  /** Email attachments, already read from storage. */
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export type SendResult =
  | { ok: true; providerMessageId: string; status: "SENT" | "DELIVERED" }
  /** retryable: a network or provider hiccup, worth trying again later. */
  | { ok: false; reason: string; retryable: boolean };

export interface Provider {
  key: string;
  send(msg: Outgoing): Promise<SendResult>;
}

export type ProviderConfig = { config: Record<string, string>; secrets: Record<string, string> };

/** Calls an outside service with a time limit, so one slow provider never holds up the queue. */
export async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 4000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text };
}

/** Turns a thrown fetch error into plain words. */
export function networkFailure(e: unknown): SendResult {
  const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
  return { ok: false, retryable: true, reason: timedOut ? "The provider did not answer in time. It will be tried again." : "Could not reach the provider. It will be tried again." };
}
