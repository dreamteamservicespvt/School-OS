// Meta calls this with delivery reports for the WhatsApp messages the console
// sends from DREAM TEAM's own number (src/lib/console/whatsapp-webhook.ts).
//   GET:  the one-time check when the address is added in the Meta app.
//   POST: statuses, signed with CONSOLE_WHATSAPP_APP_SECRET.
// The Meta app is the gym's: each POST is passed on to the gym's site first and
// its answer goes back to Meta; nothing School OS does can hold it up.
import { hitLimit } from "@/lib/rate-limit";
import { handleConsoleWhatsappWebhook, passOn, verifyConsoleWhatsappSubscription, type ConsoleWebhookOutcome } from "@/lib/console/whatsapp-webhook";

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

async function ownPart(raw: string, signature: string | null): Promise<ConsoleWebhookOutcome> {
  if (raw.length > MAX_BODY) return { status: 413 };
  try {
    if (await limited()) return { status: 429 };
    return await handleConsoleWhatsappWebhook(raw, signature);
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", event: "console-whatsapp-webhook-failed", reason: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
    return { status: 500 };
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const passed = await passOn(raw, req.headers);
  const own = await ownPart(raw, req.headers.get("x-hub-signature-256"));
  return reply(passed ?? own);
}
