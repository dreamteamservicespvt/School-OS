// Meta's delivery reports for the WhatsApp messages the console sends from
// DREAM TEAM's own number (outbox.ts). Meta can accept a message and still not
// deliver it; without these reports an invite that never arrived stays SENT.
//
// Address: /api/v1/console/whatsapp, added once in the Meta app (steps in
// deploy/vercel/README.md). Set in the environment, never in the code
// (08-platform-security.md §3):
//   CONSOLE_WHATSAPP_APP_SECRET    the Meta app's secret; it signs every report.
//   CONSOLE_WHATSAPP_VERIFY_TOKEN  any long random text, typed again in Meta once.
//   CONSOLE_WHATSAPP_FORWARD_URL   optional: another site's webhook on the same
//                                  Meta app, which gets every report as well.
// Nothing is read before the signature matches, and status only moves forward.
import "server-only";

import { timingSafeEqual } from "node:crypto";
import { withConsole } from "../db";
import { parseMetaWebhook, verifyMetaSignature, whatsappReason } from "../messaging/providers/whatsapp";

export type ConsoleWebhookOutcome = { status: number; body?: string };

type Status = "SENT" | "DELIVERED" | "READ" | "FAILED";
const META: Record<string, Status> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
const RANK: Record<string, number> = { TEST: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** The new status for a message that has `current`, or null when the report is old news. */
export function nextStatus(current: string, reported: Status): Status | null {
  // A failure never undoes a message the phone already has; a late "delivered" after a failure wins.
  if (reported === "FAILED") return current === "DELIVERED" || current === "READ" || current === "FAILED" ? null : "FAILED";
  return RANK[reported] > (RANK[current] ?? 0) ? reported : null;
}

/** Meta's one-time check when the webhook address is added. */
export function verifyConsoleWhatsappSubscription(params: URLSearchParams): ConsoleWebhookOutcome {
  const token = env("CONSOLE_WHATSAPP_VERIFY_TOKEN");
  if (!token) return { status: 404 };
  if (params.get("hub.mode") === "subscribe" && same(params.get("hub.verify_token") ?? "", token)) {
    return { status: 200, body: params.get("hub.challenge") ?? "" };
  }
  return { status: 403 };
}

/** Marks each console WhatsApp message Delivered, Read or Failed (with Meta's reason). */
export async function handleConsoleWhatsappWebhook(rawBody: string, signature: string | null): Promise<ConsoleWebhookOutcome> {
  const secret = env("CONSOLE_WHATSAPP_APP_SECRET");
  if (!secret) return { status: 404 };
  if (!verifyMetaSignature(rawBody, signature, secret)) return { status: 401 };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400 };
  }
  const reports = parseMetaWebhook(body).statuses.filter((s) => s.id && META[s.status]);
  if (reports.length > 0) await withConsole(async (tx) => {
    for (const s of reports) {
      const reported = META[s.status];
      const row = await tx.consoleMessage.findFirst({ where: { channel: "whatsapp", providerMessageId: s.id }, select: { id: true, status: true } });
      if (!row) continue;
      const status = nextStatus(row.status, reported);
      if (!status) continue;
      const failReason = status === "FAILED" ? whatsappReason(s.errors?.[0]?.code, s.errors?.[0]?.message ?? s.errors?.[0]?.title).reason : null;
      await tx.consoleMessage.update({ where: { id: row.id }, data: { status, failReason } });
    }
  }, { timeout: 30_000 });
  return { status: 200, body: "ok" };
}

const PASSED_HEADERS = ["content-type", "x-hub-signature-256", "x-hub-signature", "user-agent"];

/**
 * A Meta app has one callback address, and DREAM TEAM's app belongs to the
 * gym's site (CONSOLE_WHATSAPP_FORWARD_URL). Every call goes to it first,
 * exactly as Meta sent it, whatever School OS makes of it, and the gym's
 * answer is the answer Meta gets: the gym works as if Meta called it directly.
 * Null when there is nowhere to pass it on to.
 */
export async function passOn(rawBody: string, headers: Headers): Promise<ConsoleWebhookOutcome | null> {
  const to = env("CONSOLE_WHATSAPP_FORWARD_URL");
  if (!to?.startsWith("https://")) return null;
  const sent: Record<string, string> = {};
  for (const h of PASSED_HEADERS) {
    const v = headers.get(h);
    if (v) sent[h] = v;
  }
  try {
    const res = await fetch(to, { method: "POST", body: rawBody, headers: sent, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) console.warn(JSON.stringify({ level: "warn", event: "console-whatsapp-pass-on-refused", status: res.status }));
    return { status: res.status, body: (await res.text().catch(() => "")).slice(0, 1000) };
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", event: "console-whatsapp-pass-on-failed", reason: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
    // Meta tries again later, as it would if the gym's site were down.
    return { status: 502 };
  }
}
