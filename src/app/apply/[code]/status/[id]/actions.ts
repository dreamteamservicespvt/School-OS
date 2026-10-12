"use server";

// Paying the application fee from the parent's own status link (no login).
// The link's token is checked again on the server; the receipt is made only
// when Razorpay's signature (or its webhook) confirms the payment.
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { problemState, UUID_RE } from "@/lib/admission/act";
import { checkStatusToken, schoolByCode, systemCtx } from "@/lib/admission/public";
import { confirmCheckout, createOnlineOrder } from "@/lib/admission/fee";

type Order = { ok: true; orderId: string; keyId: string; amountPaise: string; applicationNo: string; name: string; phone: string; email: string | null; schoolName: string } | { ok: false; message: string };
const GONE = "This link is not valid. Please ask the school for a new one.";

async function find(code: string, id: string, token: string) {
  if (!UUID_RE.test(id)) return null;
  const school = await schoolByCode(code);
  if (!school || !checkStatusToken(school.id, id, token)) return null;
  return school;
}

export async function startPayAction(code: string, id: string, token: string): Promise<Order> {
  const school = await find(code, id, token);
  if (!school) return { ok: false, message: GONE };
  const ip = (await deviceInfo()).ipAddress ?? "unknown";
  for (const [key, max] of [[`apply-pay:ip:${ip}`, 10], [`apply-pay:app:${id}`, 6]] as const) {
    const r = await hitLimit(key, max, 3600);
    if (!r.ok) return { ok: false, message: limitMessage(r) };
  }
  try {
    const o = await withSchool(systemCtx(school.id), (tx) => createOnlineOrder(tx, systemCtx(school.id), id));
    return { ok: true, orderId: o.orderId, keyId: o.keyId, amountPaise: o.amountPaise.toString(), applicationNo: o.applicationNo, name: o.name, phone: o.phone, email: o.email, schoolName: school.name };
  } catch (e) {
    return { ok: false, message: problemState(e).message ?? "The payment could not be started." };
  }
}

export async function confirmPayAction(code: string, id: string, token: string, input: { orderId: string; paymentId: string; signature: string }): Promise<{ ok: boolean; message: string }> {
  const school = await find(code, id, token);
  if (!school) return { ok: false, message: GONE };
  const clean = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_]{1,80}$/.test(v) ? v : "");
  const body = { orderId: clean(input.orderId), paymentId: clean(input.paymentId), signature: typeof input.signature === "string" && /^[a-f0-9]{64}$/i.test(input.signature) ? input.signature : "" };
  try {
    const r = await withSchool(systemCtx(school.id), (tx) => confirmCheckout(tx, systemCtx(school.id), body));
    if (!r) return { ok: false, message: "Waiting for payment confirmation. The receipt is made as soon as Razorpay confirms it." };
    return { ok: true, message: r.payment.receiptNo ? `Paid. Receipt ${r.payment.receiptNo}.` : "Paid." };
  } catch (e) {
    return { ok: false, message: problemState(e).message ?? "Waiting for payment confirmation." };
  }
}
