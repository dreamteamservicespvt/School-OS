// Email through the school's own email server (SMTP), with nodemailer.
import nodemailer from "nodemailer";
import type { Outgoing, Provider, ProviderConfig, SendResult } from "./types";

export function smtpProvider({ config, secrets }: ProviderConfig): Provider {
  return {
    key: "smtp",
    async send(msg: Outgoing): Promise<SendResult> {
      if (!config.host || !config.fromAddress || !secrets.password) return { ok: false, retryable: false, reason: "Email is not fully connected. Check Settings, SMS, WhatsApp & Email." };
      const port = Number(config.port || 587);
      const transport = nodemailer.createTransport({
        host: config.host,
        port,
        secure: port === 465,
        auth: { user: config.user, pass: secrets.password },
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 6000,
      });
      try {
        const info = await transport.sendMail({
          from: { name: config.fromName || config.fromAddress, address: config.fromAddress },
          to: msg.to,
          subject: msg.subject || "Message from school",
          text: msg.text,
          attachments: msg.attachments,
        });
        return { ok: true, providerMessageId: info.messageId || `smtp-${Date.now()}`, status: "SENT" };
      } catch (e) {
        const code = (e as { responseCode?: number; code?: string }).responseCode;
        if (code && code >= 500 && code < 600) return { ok: false, retryable: false, reason: code === 550 ? "This email address does not exist." : "The email server refused this message." };
        if ((e as { code?: string }).code === "EAUTH") return { ok: false, retryable: false, reason: "The email server did not accept the username or password." };
        return { ok: false, retryable: true, reason: "Could not reach the email server. It will be tried again." };
      } finally {
        transport.close();
      }
    },
  };
}
