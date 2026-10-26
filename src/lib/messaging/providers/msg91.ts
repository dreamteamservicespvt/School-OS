// SMS through MSG91. Every SMS carries the DLT template ID and the school's
// DLT entity ID and sender header, as Indian telecom rules require (rule 34).
import type { Outgoing, Provider, ProviderConfig, SendResult } from "./types";
import { networkFailure, postJson } from "./types";

const URL = "https://api.msg91.com/api/v2/sendsms";

export function msg91Provider({ config, secrets }: ProviderConfig): Provider {
  return {
    key: "msg91",
    async send(msg: Outgoing): Promise<SendResult> {
      if (!secrets.authKey) return { ok: false, retryable: false, reason: "SMS is not fully connected. Please tell DREAM TEAM support." };
      if (!msg.dltTemplateId) return { ok: false, retryable: false, reason: "This SMS template has no DLT template ID yet. DREAM TEAM adds it." };
      const sender = msg.senderHeader || config.senderId;
      if (!sender) return { ok: false, retryable: false, reason: "The SMS sender header is missing. Add it in Settings, SMS, WhatsApp & Email." };
      try {
        const res = await postJson(
          URL,
          {
            sender,
            route: "4",
            country: "91",
            unicode: /[^\x00-\x7F₹]/.test(msg.text) ? 1 : 0,
            DLT_TE_ID: msg.dltTemplateId,
            ...(msg.dltEntityId ? { PE_ID: msg.dltEntityId } : {}),
            sms: [{ message: msg.text, to: [msg.to] }],
          },
          { authkey: secrets.authKey },
        );
        const body = (res.json ?? {}) as { type?: string; message?: string };
        if (res.ok && body.type === "success" && body.message) return { ok: true, providerMessageId: String(body.message), status: "SENT" };
        if (res.status === 401 || /auth/i.test(body.message ?? "")) return { ok: false, retryable: false, reason: "MSG91 did not accept the auth key. Check it in Settings, SMS, WhatsApp & Email." };
        if (res.status >= 500) return { ok: false, retryable: true, reason: "MSG91 is having trouble. It will be tried again." };
        return { ok: false, retryable: false, reason: `MSG91 did not send it: ${(body.message ?? res.text).slice(0, 160) || "no reason given"}.` };
      } catch (e) {
        return networkFailure(e);
      }
    },
  };
}

/** MSG91 delivery report codes to our statuses (inferred from MSG91's report codes). */
export function msg91Status(code: string): { status: "DELIVERED" | "FAILED" | "SENT"; reason?: string } {
  const c = String(code).toLowerCase();
  if (c === "1" || c === "delivered") return { status: "DELIVERED" };
  if (c === "8" || c === "submitted" || c === "sent") return { status: "SENT" };
  if (c === "9" || c === "ndnc") return { status: "FAILED", reason: "The number is on the Do Not Disturb list." };
  if (c === "26" || c === "17" || c === "blocked") return { status: "FAILED", reason: "The number is blocked." };
  if (c === "16" || c === "25" || c === "rejected") return { status: "FAILED", reason: "Rejected by the telecom operator (check the DLT template)." };
  return { status: "FAILED", reason: "Not delivered (phone off or out of reach)." };
}
