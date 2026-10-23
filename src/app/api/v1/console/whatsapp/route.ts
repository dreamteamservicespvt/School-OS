// Meta calls this with delivery reports for the WhatsApp messages the console
// sends from DREAM TEAM's own number (src/lib/console/whatsapp-webhook.ts).
//   GET:  the one-time check when the address is added in the Meta app.
//   POST: statuses, signed with CONSOLE_WHATSAPP_APP_SECRET.
import { hitLimit } from "@/lib/rate-limit";
import { handleConsoleWhatsappWebhook, verifyConsoleWhatsappSubscription, type ConsoleWebhookOutcome } from "@/lib/console/whatsapp-webhook";

export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024;

function reply(o: ConsoleWebhookOutcome) {
  return new Response(o.body ?? "", { status: o.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

async function limited() {
  return !(await hitLimit("webhook:console-whatsapp", 3000, 60)).ok;
}

export async function GET(req: Request) {
  if (await limited()) return reply({ status: 429 });
  return reply(verifyConsoleWhatsappSubscription(new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  if (await limited()) return reply({ status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply({ status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ status: 413 });
  return reply(await handleConsoleWhatsappWebhook(raw, req.headers.get("x-hub-signature-256")));
}
