// Email through the school's own email server (SMTP), with nodemailer.
//
// The server name is typed by the school, so it is treated like any address a
// school types in (08-platform-security.md §7): it is looked up first, every
// address it gives must be on the public internet (never this server, a
// private network or the cloud's metadata address), and the connection goes
// to exactly the address that was checked, so the name cannot switch to a
// private address between the check and the call. Only the usual email ports.
import nodemailer from "nodemailer";
import { publicHostProblem } from "../../net/public-address";
import { AddressRefused, publicAddresses } from "../../net/public-fetch";
import type { Outgoing, Provider, ProviderConfig, SendResult } from "./types";

/** The ports email servers use: 587 and 465 almost always, 25 and 2525 sometimes. */
export const SMTP_PORTS = [25, 465, 587, 2525] as const;

export type SmtpOptions = {
  /** Looks up and checks the server name (tests give their own). */
  publicAddresses?: (host: string) => Promise<{ address: string; family: number }[]>;
  /** The ports allowed (tests let their own stand-in server through). */
  ports?: readonly number[];
};

export function smtpProvider({ config, secrets }: ProviderConfig, opts: SmtpOptions = {}): Provider {
  return {
    key: "smtp",
    async send(msg: Outgoing): Promise<SendResult> {
      if (!config.host || !config.fromAddress || !secrets.password) return { ok: false, retryable: false, reason: "Email is not fully connected. Check Settings, SMS, WhatsApp & Email." };
      const port = Number(config.port || 587);
      if (!(opts.ports ?? (SMTP_PORTS as readonly number[])).includes(port)) return { ok: false, retryable: false, reason: "The email server port must be 587, 465, 25 or 2525. Check Settings, SMS, WhatsApp & Email." };
      const host = config.host.trim().replace(/^\[|\]$/g, "");
      const problem = publicHostProblem(host);
      if (problem) return { ok: false, retryable: false, reason: `Email server: ${problem}` };
      let address: string;
      try {
        address = (await (opts.publicAddresses ?? publicAddresses)(host))[0].address;
      } catch (e) {
        return e instanceof AddressRefused
          ? { ok: false, retryable: false, reason: `Email server: ${e.message}` }
          : { ok: false, retryable: true, reason: "Could not find the email server. It will be tried again." };
      }
      const transport = nodemailer.createTransport({
        // The checked address; the typed name is still used for the certificate check.
        host: address,
        servername: address === host ? undefined : host,
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
