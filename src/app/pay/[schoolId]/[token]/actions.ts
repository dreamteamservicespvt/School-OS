"use server";

// The public pay page (no login): starts Razorpay Checkout for a payment link
// and confirms it afterwards. Rate-limited; the link is found again from its
// secret token every time. A payment posts only when the signature checks out
// (or when Razorpay's webhook confirms it).
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { confirmCheckout, startCheckout, type CheckoutStart } from "@/lib/fees/online";
import { MoneyProblem } from "@/lib/fees/problem";
import { RazorpayProblem } from "@/lib/payments/razorpay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StartResult = { ok: true; checkout: CheckoutStart } | { ok: false; message: string };

async function limited(schoolId: string, token: string) {
  const device = await deviceInfo();
  const a = await hitLimit(`pay:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!a.ok) return limitMessage(a);
  const b = await hitLimit(`pay:link:${schoolId}:${token.slice(0, 12)}`, 20, 600);
  if (!b.ok) return limitMessage(b);
  return null;
}

export async function startPay(schoolId: string, token: string): Promise<StartResult> {
  if (!UUID.test(schoolId)) return { ok: false, message: "This payment link is not valid. Ask the school for a new one." };
  const stop = await limited(schoolId, token);
  if (stop) return { ok: false, message: stop };
  try {
    const checkout = await withSchool({ schoolId, userId: null }, (tx) => startCheckout(tx, { schoolId, userId: null }, token));
    return { ok: true, checkout };
  } catch (e) {
    if (e instanceof MoneyProblem) return { ok: false, message: e.message };
    if (e instanceof RazorpayProblem) return { ok: false, message: "Razorpay could not start the payment right now. Please try again in a few minutes." };
    throw e;
  }
}

export async function confirmPay(schoolId: string, token: string, input: { paymentId: string; orderId: string; signature: string }): Promise<{ ok: boolean; message: string }> {
  if (!UUID.test(schoolId)) return { ok: false, message: "This payment link is not valid." };
  const stop = await limited(schoolId, token);
  if (stop) return { ok: false, message: stop };
  const clean = { paymentId: String(input.paymentId ?? "").slice(0, 64), orderId: String(input.orderId ?? "").slice(0, 64), signature: String(input.signature ?? "").slice(0, 200) };
  try {
    await withSchool({ schoolId, userId: null }, (tx) => confirmCheckout(tx, { schoolId, userId: null }, token, clean));
    return { ok: true, message: "Payment received. Thank you." };
  } catch (e) {
    if (e instanceof MoneyProblem) return { ok: false, message: e.message };
    throw e;
  }
}
