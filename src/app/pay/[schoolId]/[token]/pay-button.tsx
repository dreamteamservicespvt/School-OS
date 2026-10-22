"use client";

// Opens Razorpay Checkout (checkout.razorpay.com) for the link, then asks the
// server to confirm the payment by its signature. Nothing is trusted from the
// browser: the server checks the signature with the school's key secret.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { confirmPay, startPay } from "./actions";
import { useT } from "@/lib/i18n/client";
import { screenMessage } from "@/lib/i18n/messages";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, fn: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function PayButton({ schoolId, token, amount }: { schoolId: string; token: string; amount: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success" | "info"; text: string } | null>(null);

  const pay = async () => {
    setBusy(true);
    setMessage(null);
    const started = await startPay(schoolId, token);
    if (!started.ok) { setBusy(false); setMessage({ tone: "danger", text: screenMessage(t, started.message) }); return; }
    const ready = await loadCheckout();
    if (!ready || !window.Razorpay) { setBusy(false); setMessage({ tone: "danger", text: t("The payment window could not open. Check your internet and try again.") }); return; }
    const c = started.checkout;
    const rz = new window.Razorpay({
      key: c.keyId,
      order_id: c.orderId,
      amount: c.amountPaise,
      currency: "INR",
      name: c.schoolName,
      description: c.description,
      prefill: c.prefill,
      theme: { color: getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() ? `rgb(${getComputedStyle(document.documentElement).getPropertyValue("--brand").trim().replace(/\s+/g, ",")})` : undefined },
      modal: { ondismiss: () => setBusy(false) },
      handler: async (r: RazorpayResponse) => {
        setMessage({ tone: "info", text: t("Confirming your payment…") });
        const done = await confirmPay(schoolId, token, { paymentId: r.razorpay_payment_id, orderId: r.razorpay_order_id, signature: r.razorpay_signature });
        setBusy(false);
        setMessage({ tone: done.ok ? "success" : "info", text: screenMessage(t, done.message) });
        router.refresh();
      },
    });
    rz.on("payment.failed", (r) => {
      setBusy(false);
      setMessage({ tone: "danger", text: `${t("The payment did not go through. No money was taken. You can try again.")}${r.error?.description ? ` (${r.error.description})` : ""}` });
    });
    rz.open();
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={Lock} loading={busy} loadingText={t("Opening payment…")} onClick={pay}>{t("Pay {amount}", { amount })}</Button>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
