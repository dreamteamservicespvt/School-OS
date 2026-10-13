// DREAM TEAM's own Razorpay account calls this when a school pays a platform
// invoice by its payment link. Nothing is trusted until the signature over
// the raw body matches RAZORPAY_WEBHOOK_SECRET (from the secret store).
import { platformRazorpay, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { paidByRazorpay } from "@/lib/console/billing";
import { hitLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type LinkEvent = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; amount_paid?: number; amount?: number } };
    payment?: { entity?: { id?: string; amount?: number } };
  };
};

export async function POST(request: Request) {
  const limit = await hitLimit("webhook:console-razorpay", 600, 60);
  if (!limit.ok) return Response.json({ problem: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const creds = platformRazorpay();
  if (!creds?.webhookSecret) return Response.json({ problem: "Not set up." }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return Response.json({ problem: "Too large." }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"), creds.webhookSecret)) {
    console.warn(JSON.stringify({ level: "warn", event: "console-webhook-refused", reason: "signature" }));
    return Response.json({ problem: "The signature did not match." }, { status: 400 });
  }
  let body: LinkEvent;
  try {
    body = JSON.parse(raw) as LinkEvent;
  } catch {
    return Response.json({ problem: "Not JSON." }, { status: 400 });
  }
  if (body.event !== "payment_link.paid") return Response.json({ ok: true, ignored: body.event ?? "unknown" });
  const link = body.payload?.payment_link?.entity;
  const payment = body.payload?.payment?.entity;
  if (!link?.id) return Response.json({ problem: "No payment link in the event." }, { status: 400 });
  const r = await paidByRazorpay(link.id, payment?.id ?? null, Number(link.amount_paid ?? payment?.amount ?? 0));
  if (!r.ok) console.warn(JSON.stringify({ level: "warn", event: "console-webhook-not-applied", reason: r.reason }));
  // Razorpay retries anything that is not 2xx; a link we do not know is not worth retrying.
  return Response.json({ ok: r.ok });
}
