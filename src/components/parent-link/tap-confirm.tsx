"use client";

// "Tap to confirm" (src/lib/parent-link/tap.ts): the parent opened their own Parent Link message from
// WhatsApp with a one-time secret in it. The page says what it confirms (this phone, or the consent they
// asked for); this button records it. Opening the page alone changes nothing.
import { useActionState } from "react";
import { Check, Link2Off, ShieldCheck } from "lucide-react";
import { confirmTapped, type GuardianState } from "@/app/p/[token]/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { PhoneCard } from "./phone-shell";
import { useT } from "@/lib/i18n/client";
import type { TapView } from "@/lib/parent-link/tap";

export function TapConfirm({ token, secret, view }: { token: string; secret: string; view: TapView | null }) {
  const t = useT();
  const [state, act] = useActionState<GuardianState, FormData>(confirmTapped.bind(null, token, secret), null);
  const open = <a href={`/p/${token}`} className="mt-4 inline-flex h-12 items-center justify-center rounded-2xl border border-line px-5 text-[15px] font-semibold text-brand">{t("Open your Parent Link")}</a>;

  if (!view) {
    return (
      <PhoneCard>
        <span className="w-12 h-12 rounded-2xl bg-sunken text-ink2 grid place-items-center"><Link2Off size={22} aria-hidden="true" /></span>
        <p role="status" className="text-[15px] text-ink2 mt-3">{t("This confirmation has run out or was already used. Please open your Parent Link and ask again.")}</p>
        {open}
      </PhoneCard>
    );
  }

  if (state?.ok && state.step === "done") {
    return (
      <PhoneCard>
        <div role="status" className="rounded-2xl p-3.5 flex items-start gap-3 bg-ok/10">
          <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-ok/15 text-ok"><Check size={18} strokeWidth={2.6} aria-hidden="true" /></span>
          <p className="min-w-0 text-[14px] font-semibold">{state.message}</p>
        </div>
        {open}
      </PhoneCard>
    );
  }

  const device = view.kind === "device";
  return (
    <PhoneCard>
      <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center"><ShieldCheck size={22} aria-hidden="true" /></span>
      <h2 className="font-display text-[22px] font-semibold leading-tight mt-3">{device ? t("Open your Parent Link on this phone") : t("Confirm your answer")}</h2>
      <p className="text-[14px] text-ink2 mt-1">{device
        ? t("You opened the message the school sent to your WhatsApp. Tap the button to confirm it’s you. This phone will then open your Parent Link straight away.")
        : view.kind === "consent" && view.action === "withdraw"
          ? t("You are removing your consent for “{title}”. Tap Confirm to record it.", { title: view.title })
          : t("You are saying yes for “{title}”. Tap Confirm to record it.", { title: view.title })}</p>
      <form action={act} className="mt-4 flex flex-col gap-3">
        {state && !state.ok && <p role="alert" className="rounded-2xl bg-bad/10 border border-bad/30 text-bad text-[14px] px-4 py-3">{state.message}</p>}
        <SubmitButton size="lg" className="w-full !h-14 !text-[16px]" pendingText={device ? t("Opening your Parent Link") : t("Checking")}>{device ? t("Open my Parent Link") : t("Confirm")}</SubmitButton>
      </form>
    </PhoneCard>
  );
}
