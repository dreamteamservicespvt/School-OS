// Messages DREAM TEAM sends from the console: School Admin invites and login
// resets, one-time codes, invoices and status notices (07-super-admin.md §4, §5).
//
// They go through DREAM TEAM's own WhatsApp, SMS and email accounts, set in the
// environment (never in the code, 08-platform-security.md §3):
//   WhatsApp: CONSOLE_WHATSAPP_PHONE_NUMBER_ID, CONSOLE_WHATSAPP_ACCESS_TOKEN,
//             and approved template names CONSOLE_WHATSAPP_TEMPLATE_<PURPOSE>.
//   SMS:      CONSOLE_MSG91_AUTH_KEY, CONSOLE_SMS_SENDER, CONSOLE_SMS_DLT_ENTITY_ID,
//             and DLT template IDs CONSOLE_SMS_TEMPLATE_<PURPOSE>.
//   Email:    the SMTP_* settings the rest of School OS uses.
// With none of these set (a developer's computer), a message is recorded as
// "test" and, outside production, written to the server log so it can be used.
//
// Messages are sent after the change is saved, never inside the transaction,
// and the console keeps the text with links and codes taken out.
import "server-only";

import { withConsole } from "../db";
import { isTestCopy } from "../test-copy-env";
import { mayLogCode } from "../dev-codes";
import { mailIsSetUp, sendMail } from "../auth/mail";
import { msg91Provider } from "../messaging/providers/msg91";
import { whatsappProvider } from "../messaging/providers/whatsapp";
import type { SendResult } from "../messaging/providers/types";

export type ConsoleChannel = "whatsapp" | "sms" | "email";
export const CHANNEL_LABEL: Record<ConsoleChannel, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "email" };

/** What a message is for; picks the WhatsApp and SMS template. */
export type ConsolePurpose = "invite" | "reset" | "code" | "invoice" | "notice" | "team-invite";

export type ConsoleOutgoing = {
  channel: ConsoleChannel;
  /** 10-digit mobile, or an email address. */
  to: string;
  purpose: ConsolePurpose;
  subject?: string;
  text: string;
  /** The same text with links and codes replaced, for the record. */
  safeText: string;
  /** WhatsApp: the blank in the template's first button (a one-time code, or the end of a link). */
  buttonParam?: string;
  /** Blanks for an approved WhatsApp template, in order. */
  templateParams?: string[];
  schoolId?: string | null;
};

export type Delivered = { channel: ConsoleChannel; to: string; status: "SENT" | "TEST" | "FAILED"; reason?: string };

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export function channelIsSetUp(channel: ConsoleChannel): boolean {
  if (channel === "email") return mailIsSetUp();
  if (channel === "sms") return Boolean(env("CONSOLE_MSG91_AUTH_KEY") && env("CONSOLE_SMS_SENDER"));
  return Boolean(env("CONSOLE_WHATSAPP_PHONE_NUMBER_ID") && env("CONSOLE_WHATSAPP_ACCESS_TOKEN"));
}

/** One-time codes can go by WhatsApp: the account and an approved authentication template are set. */
export function codesByWhatsapp(): boolean {
  return channelIsSetUp("whatsapp") && Boolean(env("CONSOLE_WHATSAPP_TEMPLATE_CODE"));
}

/** Some real channel can carry one-time codes, so they must never be shown on a page. */
export function codesCanBeSent(): boolean {
  return codesByWhatsapp() || (channelIsSetUp("sms") && Boolean(env("CONSOLE_SMS_TEMPLATE_CODE"))) || mailIsSetUp();
}

/** Where the console's links point: the address people open School OS at. */
export function appUrl() {
  return (env("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** DREAM TEAM's support number for messages, when set (CONSOLE_SUPPORT_PHONE). */
export function supportPhone(): string | null {
  return env("CONSOLE_SUPPORT_PHONE");
}

async function sendOne(m: ConsoleOutgoing): Promise<SendResult | "test"> {
  if (!channelIsSetUp(m.channel)) return "test";
  const key = m.purpose.toUpperCase().replace(/-/g, "_");
  if (m.channel === "email") {
    try {
      await sendMail(m.to, m.subject ?? "School OS", m.text);
      return { ok: true, providerMessageId: "smtp", status: "SENT" };
    } catch (e) {
      return { ok: false, retryable: true, reason: e instanceof Error ? e.message.slice(0, 160) : "The mail server refused it." };
    }
  }
  if (m.channel === "sms") {
    return msg91Provider({ config: { senderId: env("CONSOLE_SMS_SENDER") ?? "" }, secrets: { authKey: env("CONSOLE_MSG91_AUTH_KEY") ?? "" } }).send({
      channel: "sms",
      to: m.to,
      text: m.text,
      dltTemplateId: env(`CONSOLE_SMS_TEMPLATE_${key}`),
      dltEntityId: env("CONSOLE_SMS_DLT_ENTITY_ID"),
      senderHeader: env("CONSOLE_SMS_SENDER"),
    });
  }
  const template = env(`CONSOLE_WHATSAPP_TEMPLATE_${key}`);
  return whatsappProvider({ config: { phoneNumberId: env("CONSOLE_WHATSAPP_PHONE_NUMBER_ID") ?? "" }, secrets: { accessToken: env("CONSOLE_WHATSAPP_ACCESS_TOKEN") ?? "" } }).send({
    channel: "whatsapp",
    to: m.to,
    text: m.text,
    whatsappTemplate: template ? { name: template, language: env("CONSOLE_WHATSAPP_LANGUAGE") ?? "en", params: m.templateParams ?? [], buttonParam: m.buttonParam } : null,
  });
}

/** Sends each message and records it. Never throws: a failed send is recorded and returned. */
export async function deliver(messages: ConsoleOutgoing[]): Promise<Delivered[]> {
  const out: Delivered[] = [];
  for (const m of messages) {
    let result: SendResult | "test";
    try {
      result = await sendOne(m);
    } catch (e) {
      result = { ok: false, retryable: true, reason: e instanceof Error ? e.message.slice(0, 160) : "Could not send." };
    }
    // The Vercel test copy has no SMS or email, so its codes go to the server
    // log there too, as the owner chose (deploy/vercel/README.md); so do a
    // tester's computer's (dev-codes.ts).
    if (result === "test" && (mayLogCode("none") || isTestCopy())) {
      console.info(JSON.stringify({ level: "info", event: "console-message", note: "No provider set up; development only", channel: m.channel, to: m.to, text: m.text }));
    }
    const status = result === "test" ? "TEST" : result.ok ? "SENT" : "FAILED";
    const reason = result !== "test" && !result.ok ? result.reason : undefined;
    out.push({ channel: m.channel, to: m.to, status, reason });
    await withConsole((tx) =>
      tx.consoleMessage.create({
        data: {
          forSchoolId: m.schoolId ?? null,
          channel: m.channel,
          to: m.channel === "email" ? m.to : m.to.replace(/\D/g, "").slice(-10),
          purpose: m.purpose,
          text: m.safeText.slice(0, 2000),
          status,
          providerMessageId: result !== "test" && result.ok ? result.providerMessageId : null,
          failReason: reason ?? null,
        },
      }),
    );
  }
  return out;
}

/** "on WhatsApp and SMS", or what went wrong, for the toast after an action. */
export function deliveredWords(list: Delivered[]): string {
  if (list.length === 0) return "";
  const sent = list.filter((d) => d.status !== "FAILED");
  const names = [...new Set(sent.map((d) => CHANNEL_LABEL[d.channel]))];
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const failed = list.filter((d) => d.status === "FAILED");
  let words = names.length ? `on ${join(names)}` : "";
  if (list.every((d) => d.status === "TEST")) words += " (test mode: no message provider is set up, so it went to the server log)";
  if (failed.length) words += `${words ? ". " : ""}${join([...new Set(failed.map((d) => CHANNEL_LABEL[d.channel]))])} did not go: ${failed[0].reason ?? "the provider refused it"}`;
  return words.trim();
}
