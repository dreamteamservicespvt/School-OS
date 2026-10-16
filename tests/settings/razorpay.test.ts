// Razorpay signature checks (08-platform-security.md §7): a payment is posted
// only after the gateway's signature is right. Expected values were made
// separately with `openssl dgst -sha256 -hmac`, following Razorpay's
// documented algorithm (HMAC SHA256, hex).
import { describe, expect, it, vi } from "vitest";
import {
  createOrder,
  fetchPayment,
  RazorpayProblem,
  testConnection,
  verifyPaymentLinkSignature,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "@/lib/payments/razorpay";

const KEY_SECRET = "EnLs21M47BllR3X8PSFtjtbd";

describe("Checkout payment signature", () => {
  const good = "f34e4bbd157319d57c43bf7f5fcc0f9c4753dd7341845e660d4cb13d3f27a7ef";
  const input = { orderId: "order_IluGWxBm9U8zJ8", paymentId: "pay_IluHKrO0OQYSVT" };

  it("accepts HMAC(order_id|payment_id) with the key secret", () => {
    expect(verifyPaymentSignature({ ...input, signature: good }, KEY_SECRET)).toBe(true);
    expect(verifyPaymentSignature({ ...input, signature: good.toUpperCase() }, KEY_SECRET)).toBe(true);
  });

  it("refuses a changed payment, order, secret or signature", () => {
    expect(verifyPaymentSignature({ ...input, paymentId: "pay_IluHKrO0OQYSVU", signature: good }, KEY_SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...input, orderId: "order_other", signature: good }, KEY_SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: good }, "another-secret")).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: good.slice(0, -1) + "0" }, KEY_SECRET)).toBe(false);
  });

  it("refuses missing or malformed signatures without throwing", () => {
    expect(verifyPaymentSignature({ ...input, signature: "" }, KEY_SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: null }, KEY_SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: "zz" }, KEY_SECRET)).toBe(false);
    expect(verifyPaymentSignature({ ...input, signature: good }, "")).toBe(false);
  });
});

describe("Payment link signature", () => {
  it("accepts HMAC(link_id|reference_id|status|payment_id)", () => {
    const input = { paymentLinkId: "plink_Kz1", referenceId: "SPS-2026-00123", status: "paid", paymentId: "pay_Kz2" };
    const good = "90669fe9ca488c13aef3dbc69abce904ba5286c8c6fbc0a8009295890a0343fb";
    expect(verifyPaymentLinkSignature({ ...input, signature: good }, KEY_SECRET)).toBe(true);
    expect(verifyPaymentLinkSignature({ ...input, status: "cancelled", signature: good }, KEY_SECRET)).toBe(false);
  });
});

describe("Webhook signature", () => {
  const body = '{"entity":"event","event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_29QQoUBi66xm2f","amount":50000}}}}';
  const good = "6347920dcb3397d09c3ea11259e6b666c70740a4eba04e5ac38e79f1b1de12f6";

  it("is checked on the raw body exactly as received", () => {
    expect(verifyWebhookSignature(body, good, "whsec-school-123")).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body), good, "whsec-school-123")).toBe(true);
  });

  it("fails if one character of the body changes, even the spacing", () => {
    expect(verifyWebhookSignature(body.replace("50000", "500000"), good, "whsec-school-123")).toBe(false);
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 1), good, "whsec-school-123")).toBe(false);
  });

  it("fails without a saved webhook secret", () => {
    expect(verifyWebhookSignature(body, good, null)).toBe(false);
    expect(verifyWebhookSignature(body, good, "")).toBe(false);
  });
});

const creds = { keyId: "rzp_test_1DP5mmOlF5G5ag", keySecret: KEY_SECRET, webhookSecret: "whsec", environment: "test" as const };

describe("calls to Razorpay", () => {
  it("makes an order with basic auth and the amount in paise", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "order_1", amount: 150000, currency: "INR", receipt: "R1", status: "created" }), { status: 200 }));
    const order = await createOrder(creds, { amountPaise: 150000n, receipt: "R1" }, fetchImpl as unknown as typeof fetch);
    expect(order.id).toBe("order_1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${creds.keyId}:${KEY_SECRET}`).toString("base64")}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 150000, currency: "INR", receipt: "R1" });
  });

  it("refuses an amount below ₹1 before calling", async () => {
    await expect(createOrder(creds, { amountPaise: 50, receipt: "R" }, vi.fn() as unknown as typeof fetch)).rejects.toThrow(/at least ₹1/);
  });

  it("checks a payment id before fetching", async () => {
    await expect(fetchPayment(creds, "../orders", vi.fn() as unknown as typeof fetch)).rejects.toThrow(/pay_/);
  });

  it("explains wrong keys and a blocked network in plain words, never crashing", async () => {
    const wrong = vi.fn(async () => new Response(JSON.stringify({ error: { description: "Authentication failed" } }), { status: 401 }));
    const result = await testConnection(creds, wrong as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.checks.at(-1)?.note).toMatch(/did not accept the Key ID and Key Secret/);

    const offline = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const r2 = await testConnection(creds, offline as unknown as typeof fetch);
    expect(r2.ok).toBe(false);
    expect(r2.checks.at(-1)?.note).toMatch(/could not reach Razorpay/);
    await expect(fetchPayment(creds, "pay_1", offline as unknown as typeof fetch)).rejects.toBeInstanceOf(RazorpayProblem);
  });

  it("passes when keys, mode and webhook secret are right and Razorpay accepts them", async () => {
    const okFetch = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    expect((await testConnection(creds, okFetch as unknown as typeof fetch)).ok).toBe(true);
    const live = await testConnection({ ...creds, environment: "live" }, okFetch as unknown as typeof fetch);
    expect(live.ok).toBe(false);
    expect(live.checks.find((c) => !c.ok)?.note).toMatch(/rzp_live_/);
  });
});
