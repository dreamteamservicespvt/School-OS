// Meta's delivery reports for the WhatsApp messages the console sends from
// DREAM TEAM's own number (outbox.ts). Meta can accept a message and still not
// deliver it; without these reports an invite that never arrived stays SENT.
//
// Address: /api/v1/console/whatsapp, added once in the Meta app (steps in
// deploy/vercel/README.md). Set in the environment, never in the code
// (08-platform-security.md §3):
//   CONSOLE_WHATSAPP_APP_SECRET    the Meta app's secret; it signs every report.
//   CONSOLE_WHATSAPP_VERIFY_TOKEN  any long random text, typed again in Meta once.
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
  if (reports.length === 0) return { status: 200, body: "ok" };
  await withConsole(async (tx) => {
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
