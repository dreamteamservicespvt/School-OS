"use client";

// Opens Razorpay Checkout for the application fee. The key and order come from
// the server (the school's own gateway, test or live as set in Settings); the
// receipt is made only once the server checks Razorpay's signature.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { confirmPayAction, startPayAction } from "./actions";
import { useT } from "@/lib/i18n/client";
import { screenMessage } from "@/lib/i18n/messages";

const CHECKOUT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void; on: (e: string, f: (r: { error?: { description?: string } }) => void) => void };

function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Checkout did not load")));
    s.onerror = () => reject(new Error("Checkout did not load"));
    document.body.appendChild(s);
  });
}

export function PayButton({ code, id, token, amount }: { code: string; id: string; token: string; amount: string }) {
  const t = useT();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const pay = () => start(async () => {
    setMsg(null);
    const o = await startPayAction(code, id, token);
    if (!o.ok) { setMsg({ ok: false, text: screenMessage(t, o.message) }); return; }
    let Razorpay: RazorpayCtor;
    try { Razorpay = await loadCheckout(); } catch { setMsg({ ok: false, text: t("The payment page could not open. Check your internet and try again.") }); return; }
    const rz = new Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amountPaise, currency: "INR", name: o.schoolName, description: `Application fee · ${o.applicationNo}`,
      prefill: { name: o.name, contact: `+91${o.phone}`, ...(o.email ? { email: o.email } : {}) },
      handler: async (r: RazorpayResponse) => {
        setMsg({ ok: true, text: t("Checking the payment…") });
        const c = await confirmPayAction(code, id, token, { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
        setMsg({ ok: c.ok, text: screenMessage(t, c.message) });
        router.refresh();
      },
      modal: { ondismiss: () => setMsg({ ok: false, text: t("Payment not finished. Nothing was taken. You can try again.") }) },
    });
    rz.on("payment.failed", (r) => setMsg({ ok: false, text: r.error?.description ?? t("The payment did not go through. Nothing was taken.") }));
    rz.open();
  });
  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="lg" icon={IndianRupee} loading={busy} loadingText={t("Opening…")} onClick={pay} className="w-full sm:w-auto">{t("Pay {amount} online", { amount })}</Button>
      {msg && <p className={cx("text-[13.5px]", msg.ok ? "text-ink2" : "text-bad")} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </div>
  );
}
