// Delivery and read receipts from message providers (no login: each call is
// checked by its signature or secret key in src/lib/messaging/webhooks.ts).
//   WhatsApp (Meta): GET for the one-time subscription check, POST for statuses
//                    and replies ("STOP" opts a parent out).
//   SMS (MSG91):     POST or GET with ?key=<delivery report key>.
import { hitLimit } from "@/lib/rate-limit";
import { handleMsg91Webhook, handleWhatsappWebhook, verifyWhatsappSubscription, type WebhookOutcome } from "@/lib/messaging/webhooks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ channel: string; schoolId: string }> };

const MAX_BODY = 512 * 1024;

function reply(o: WebhookOutcome) {
  return new Response(o.body ?? "", { status: o.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function limited(schoolId: string) {
  // Generous: a large school can get thousands of receipts a minute.
  if (!/^[0-9a-f-]{36}$/.test(schoolId)) return false;
  return !(await hitLimit(`webhook:${schoolId}`, 6000, 60)).ok;
}

export async function GET(req: Request, { params }: Params) {
  const { channel, schoolId } = await params;
  const url = new URL(req.url);
  if (await limited(schoolId)) return reply({ status: 429 });
  if (channel === "whatsapp") return reply(await verifyWhatsappSubscription(schoolId, url.searchParams));
  if (channel === "sms") {
    const data = url.searchParams.get("data");
    if (!data) return reply({ status: 200, body: "ok" });
    return reply(await handleMsg91Webhook(schoolId, url.searchParams.get("key"), data));
  }
  return reply({ status: 404 });
}

export async function POST(req: Request, { params }: Params) {
  const { channel, schoolId } = await params;
  if (await limited(schoolId)) return reply({ status: 429 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return reply({ status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ status: 413 });
  if (channel === "whatsapp") return reply(await handleWhatsappWebhook(schoolId, raw, req.headers.get("x-hub-signature-256")));
  if (channel === "sms") return reply(await handleMsg91Webhook(schoolId, new URL(req.url).searchParams.get("key"), raw));
  return reply({ status: 404 });
}
