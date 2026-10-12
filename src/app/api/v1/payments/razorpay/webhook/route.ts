// Razorpay sends payment confirmations here (the webhook address shown in
// Settings, Payment Gateways). Nothing is trusted until the signature over
// the raw body matches the school's saved webhook secret.
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { gatewayCredentials } from "@/lib/payments/gateways";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { readRazorpayEvent, runGatewayEvent } from "@/lib/payments/events";
import { hitLimit } from "@/lib/rate-limit";
// Modules register their gateway handlers (onGatewayEvent) next to their approval handlers.
import "@/lib/approval-handlers";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("s") ?? "";
  const gatewayId = url.searchParams.get("g") ?? "";
  if (!UUID.test(schoolId) || !UUID.test(gatewayId)) return Response.json({ problem: "Unknown webhook address." }, { status: 404 });

  const limit = await hitLimit(`webhook:razorpay:${gatewayId}`, 600, 60);
  if (!limit.ok) return Response.json({ problem: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const raw = await request.text();
  if (raw.length > 1_000_000) return Response.json({ problem: "Too large." }, { status: 413 });
  const signature = request.headers.get("x-razorpay-signature");
  const ctx = { schoolId, userId: null };

  const outcome = await withSchool(ctx, async (tx) => {
    const creds = await gatewayCredentials(tx, gatewayId);
    if (!creds || creds.gateway.provider !== "razorpay") return 404 as const;
    if (!verifyWebhookSignature(raw, signature, creds.webhookSecret)) {
      await writeAudit(tx, ctx, { action: "webhook-refused", recordType: "Payment Gateway Account", recordId: gatewayId, after: { reason: "Signature did not match" } });
      return 400 as const;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return 400 as const;
    }
    const event = readRazorpayEvent(body, gatewayId);
    await writeAudit(tx, ctx, {
      action: "webhook-received",
      recordType: "Payment Gateway Account",
      recordId: gatewayId,
      after: { event: event.event, paymentId: event.paymentId, orderId: event.orderId, amountPaise: event.amountPaise },
    });
    await runGatewayEvent(tx, ctx, event);
    return 200 as const;
  });

  if (outcome === 404) return Response.json({ problem: "Unknown webhook address." }, { status: 404 });
  if (outcome === 400) return Response.json({ problem: "The signature did not match." }, { status: 400 });
  return Response.json({ ok: true });
}
