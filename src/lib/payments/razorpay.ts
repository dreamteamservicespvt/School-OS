// Razorpay, the first payment gateway (decision D1). Fee Management uses this
// to make orders and to check every confirmation before anything is posted
// (08-platform-security.md §7, 06-fee-management.md A8).
//
// Keys never live in the code: a school's keys come from its saved, encrypted
// Payment Gateway Account (gatewayCredentials in ./gateways.ts); DREAM TEAM's
// own keys come from the environment (platformRazorpay below).
//
// Signatures follow Razorpay's documented algorithm: HMAC SHA256, hex.
//   Checkout:      HMAC(order_id + "|" + razorpay_payment_id, key_secret)
//   Payment link:  HMAC(payment_link_id|payment_link_reference_id|payment_link_status|razorpay_payment_id, key_secret)
//   Webhook:       HMAC(raw request body, webhook_secret), sent as X-Razorpay-Signature
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const RAZORPAY_API = "https://api.razorpay.com";

export type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
  webhookSecret?: string | null;
  environment: "test" | "live";
};

/** DREAM TEAM's own Razorpay account (Super Admin billing), from the secret store. */
export function platformRazorpay(): RazorpayCredentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null, environment: keyId.startsWith("rzp_live_") ? "live" : "test" };
}

export function hmacHex(message: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/** Compares two hex signatures in constant time. Anything malformed is simply "not equal". */
export function sameSignature(expectedHex: string, givenHex: string | null | undefined): boolean {
  if (!givenHex || typeof givenHex !== "string") return false;
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(givenHex.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** After Checkout: is this payment really from Razorpay for this order? */
export function verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string | null | undefined }, keySecret: string): boolean {
  if (!input.orderId || !input.paymentId || !keySecret) return false;
  return sameSignature(hmacHex(`${input.orderId}|${input.paymentId}`, keySecret), input.signature);
}

/** After a Payment Link is paid (the parent is sent back with these query values). */
export function verifyPaymentLinkSignature(
  input: { paymentLinkId: string; referenceId: string; status: string; paymentId: string; signature: string | null | undefined },
  keySecret: string,
): boolean {
  if (!input.paymentLinkId || !input.paymentId || !keySecret) return false;
  const message = `${input.paymentLinkId}|${input.referenceId}|${input.status}|${input.paymentId}`;
  return sameSignature(hmacHex(message, keySecret), input.signature);
}

/** A webhook: the signature covers the raw body exactly as received, before any JSON parsing. */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string | null | undefined, webhookSecret: string | null | undefined): boolean {
  if (!webhookSecret) return false;
  return sameSignature(hmacHex(rawBody, webhookSecret), signature);
}

/** A problem talking to Razorpay, in plain words for the person, plus what kind it was. */
export class RazorpayProblem extends Error {
  constructor(message: string, readonly kind: "network" | "keys" | "refused" | "unknown", readonly status?: number) {
    super(message);
    this.name = "RazorpayProblem";
  }
}

type FetchLike = typeof fetch;

async function call<T>(creds: RazorpayCredentials, method: "GET" | "POST", path: string, body?: unknown, fetchImpl: FetchLike = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`${RAZORPAY_API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new RazorpayProblem("School OS could not reach Razorpay. The internet connection from the server may be down, or Razorpay may be busy. Try again in a few minutes.", "network");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok) return data as T;
  const description = (data as { error?: { description?: string } } | null)?.error?.description;
  if (res.status === 401) {
    throw new RazorpayProblem("Razorpay did not accept the Key ID and Key Secret. Copy both again from the Razorpay Dashboard (Account & Settings, API Keys), for the same mode (test or live).", "keys", 401);
  }
  if (res.status >= 500) throw new RazorpayProblem("Razorpay is not working right now. Try again in a few minutes.", "network", res.status);
  throw new RazorpayProblem(description ? `Razorpay said: ${description}` : "Razorpay refused the request.", "refused", res.status);
}

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string | null; status: string; notes?: Record<string, string> };

/** Makes an order for an amount in paise. The receipt is our own reference (at most 40 characters). */
export function createOrder(
  creds: RazorpayCredentials,
  input: { amountPaise: bigint | number; receipt: string; notes?: Record<string, string>; transfers?: { account: string; amountPaise: bigint | number; notes?: Record<string, string> }[] },
  fetchImpl?: FetchLike,
) {
  const amount = Number(input.amountPaise);
  if (!Number.isInteger(amount) || amount < 100) throw new RazorpayProblem("An online payment must be at least ₹1.", "refused");
  return call<RazorpayOrder>(creds, "POST", "/v1/orders", {
    amount,
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
    // Split to linked bank accounts (Razorpay Route) when fees go into different accounts.
    transfers: input.transfers?.map((t) => ({ account: t.account, amount: Number(t.amountPaise), currency: "INR", notes: t.notes })),
  }, fetchImpl);
}

export type RazorpayPayment = { id: string; order_id: string | null; amount: number; currency: string; status: "created" | "authorized" | "captured" | "refunded" | "failed"; method?: string; email?: string; contact?: string; created_at: number; error_description?: string | null };

/** Reads one payment from Razorpay, e.g. to match a payment confirmed while School OS was busy. */
export function fetchPayment(creds: RazorpayCredentials, paymentId: string, fetchImpl?: FetchLike) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new RazorpayProblem("That does not look like a Razorpay payment ID (it starts with pay_).", "refused");
  return call<RazorpayPayment>(creds, "GET", `/v1/payments/${paymentId}`, undefined, fetchImpl);
}

export type ConnectionResult = { ok: boolean; checks: { label: string; ok: boolean; note: string }[] };

/** "Test connection": checks the keys' format and mode, then asks Razorpay with them. Never throws. */
export async function testConnection(creds: RazorpayCredentials, fetchImpl?: FetchLike): Promise<ConnectionResult> {
  const checks: ConnectionResult["checks"] = [];
  const prefix = creds.environment === "live" ? "rzp_live_" : "rzp_test_";
  const formatOk = /^rzp_(test|live)_[A-Za-z0-9]{8,}$/.test(creds.keyId);
  checks.push({ label: "Key ID looks right", ok: formatOk, note: formatOk ? "It starts with rzp_ as Razorpay keys do." : "A Razorpay Key ID starts with rzp_test_ or rzp_live_." });
  const modeOk = creds.keyId.startsWith(prefix);
  checks.push({
    label: `Key is for ${creds.environment === "live" ? "live" : "test"} mode`,
    ok: modeOk,
    note: modeOk ? "The key matches the mode chosen here." : `This gateway is set to ${creds.environment} mode, so the Key ID should start with ${prefix}.`,
  });
  checks.push({
    label: "Webhook secret saved",
    ok: Boolean(creds.webhookSecret),
    note: creds.webhookSecret ? "Payments confirmed by Razorpay can be checked." : "Add the webhook secret, so payments Razorpay confirms later are not missed.",
  });
  if (!formatOk) return { ok: false, checks };
  try {
    await call<unknown>(creds, "GET", "/v1/orders?count=1", undefined, fetchImpl);
    checks.push({ label: "Razorpay accepted the keys", ok: true, note: "School OS signed in to Razorpay with these keys." });
  } catch (e) {
    checks.push({ label: "Razorpay accepted the keys", ok: false, note: e instanceof RazorpayProblem ? e.message : "Something went wrong while checking. Nothing was changed. Try again." });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
