// Messages DREAM TEAM sends from the console: School Admin invites and login
// resets, one-time codes, invoices and status notices (07-super-admin.md §4, §5).
//
// They go on DREAM TEAM's own WhatsApp (src/lib/console/whatsapp.ts: connected by
// the Owner in the console's WhatsApp settings, or the CONSOLE_WHATSAPP_*
// environment settings) and, when the person has one, by email (the SMTP_*
// settings the rest of School OS uses). The console does not send SMS.
// With nothing connected (a developer's computer), a message is recorded as
// "test" and, outside production, written to the server log so it can be used.
//
// Messages are sent after the change is saved, never inside the transaction,
// and the console keeps the text with links and codes taken out.
import "server-only";

import { withConsole } from "../db";
import { isTestCopy } from "../test-copy-env";
import { mailIsSetUp, sendMail } from "../auth/mail";
import { whatsappProvider } from "../messaging/providers/whatsapp";
import type { SendResult } from "../messaging/providers/types";
import { whatsappSetup, type ConsolePurposeKey, type WhatsappSetup } from "./whatsapp";

export type ConsoleChannel = "whatsapp" | "email";
export const CHANNEL_LABEL: Record<ConsoleChannel, string> = { whatsapp: "WhatsApp", email: "email" };

/** What a message is for; picks the WhatsApp template. */
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
  /** Blanks for an approved WhatsApp template, in order. */
  templateParams?: string[];
  schoolId?: string | null;
};

export type Delivered = { channel: ConsoleChannel; to: string; status: "SENT" | "TEST" | "FAILED"; reason?: string };

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export async function channelIsSetUp(channel: ConsoleChannel): Promise<boolean> {
  if (channel === "email") return mailIsSetUp();
  return (await whatsappSetup()) !== null;
}

/** Where the console's links point: the address people open School OS at. */
export function appUrl() {
  return (env("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** DREAM TEAM's support number for messages, when set (CONSOLE_SUPPORT_PHONE). */
export function supportPhone(): string | null {
  return env("CONSOLE_SUPPORT_PHONE");
}

/** WhatsApp refuses a blank that is empty or has a line break or tab in it. */
const blank = (v: string) => v.replace(/\s*[\r\n\t]+\s*/g, " · ").replace(/ {4,}/g, "   ").trim() || "-";

async function sendOne(m: ConsoleOutgoing, wa: WhatsappSetup | null): Promise<SendResult | "test"> {
  if (m.channel === "email") {
    if (!mailIsSetUp()) return "test";
    try {
      await sendMail(m.to, m.subject ?? "School OS", m.text);
      return { ok: true, providerMessageId: "smtp", status: "SENT" };
    } catch (e) {
      return { ok: false, retryable: true, reason: e instanceof Error ? e.message.slice(0, 160) : "The mail server refused it." };
    }
  }
  if (!wa) return "test";
  const template = wa.template(m.purpose as ConsolePurposeKey);
  const params = (m.templateParams ?? []).map(blank);
  return whatsappProvider({ config: { phoneNumberId: wa.phoneNumberId }, secrets: { accessToken: wa.accessToken } }).send({
    channel: "whatsapp",
    to: m.to,
    text: m.text,
    whatsappTemplate: template ? { name: template, language: wa.language, params, codeButton: m.purpose === "code" ? params[0] : undefined } : null,
  });
}

/** Sends each message and records it. Never throws: a failed send is recorded and returned. */
export async function deliver(messages: ConsoleOutgoing[]): Promise<Delivered[]> {
  const out: Delivered[] = [];
  const wa = messages.some((m) => m.channel === "whatsapp") ? await whatsappSetup().catch(() => null) : null;
  for (const m of messages) {
    let result: SendResult | "test";
    try {
      result = await sendOne(m, wa);
    } catch (e) {
      result = { ok: false, retryable: true, reason: e instanceof Error ? e.message.slice(0, 160) : "Could not send." };
    }
    // The Vercel test copy may have no WhatsApp or email, so its codes go to the server
    // log there too, as the owner chose (deploy/vercel/README.md).
    if (result === "test" && (process.env.NODE_ENV !== "production" || isTestCopy())) {
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

/** "on WhatsApp and email", or what went wrong, for the toast after an action. */
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
