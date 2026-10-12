"use client";

// First open on a new phone (apps.jsx ParentFirst, "Confirm it's you"): a one-time code to the
// guardian's registered mobile must be typed before anything is shown.
import { useActionState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { sendDeviceCode, verifyDevice, type GuardianState } from "@/app/p/[token]/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cx } from "@/components/ui/cx";
import { PhoneCard } from "./phone-shell";

export function VerifyPhone({ token, maskedPhone, codeSent }: { token: string; maskedPhone: string; codeSent: boolean }) {
  const [sent, send] = useActionState<GuardianState, FormData>(sendDeviceCode.bind(null, token), codeSent ? { ok: true, step: "code" } : null);
  const [checked, check] = useActionState<GuardianState, FormData>(verifyDevice.bind(null, token), null);
  const haveCode = Boolean(sent?.ok);
  const bad = Boolean(checked && !checked.ok);

  return (
    <>
      <PhoneCard>
        <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center"><ShieldCheck size={22} aria-hidden="true" /></span>
        <h2 className="font-display text-[22px] font-semibold leading-tight mt-3">Confirm it&rsquo;s you</h2>
        {!haveCode ? (
          <>
            <p className="text-[14px] text-ink2 mt-1">This link is being opened on a new phone. We will send a 6-digit code by SMS to <b className="font-semibold text-ink tnum whitespace-nowrap">{maskedPhone}</b>.</p>
            <form action={send} className="mt-4 flex flex-col gap-3">
              {sent && !sent.ok && <p role="alert" className="rounded-2xl bg-bad/10 border border-bad/30 text-bad text-[14px] px-4 py-3">{sent.message}</p>}
              <SubmitButton size="lg" className="w-full !h-14 !text-[16px]" pendingText="Sending code">Send code</SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p role="status" className="text-[14px] text-ink2 mt-1">We sent a 6-digit code by SMS to <b className="font-semibold text-ink tnum whitespace-nowrap">{maskedPhone}</b>. {sent?.message?.replace(/^Code sent\. ?/, "") ?? ""}</p>
            <form action={check} className="mt-4 flex flex-col gap-3">
              <label htmlFor="pl-code" className="text-[13px] font-semibold text-ink2">6-digit code</label>
              <input id="pl-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
                aria-invalid={bad || undefined} aria-describedby="code-error"
                className={cx("h-14 w-full rounded-2xl bg-surface border px-4 text-center text-[26px] font-semibold tnum tracking-[0.45em] outline-none transition",
                  bad ? "border-bad ring-4 ring-bad/10" : "border-line focus:border-brand focus:ring-4 focus:ring-brand/15")} />
              {bad && <p id="code-error" role="alert" className="text-[13px] text-bad">{checked?.message}</p>}
              <SubmitButton size="lg" className="w-full !h-14 !text-[16px] mt-1" pendingText="Checking">Confirm</SubmitButton>
            </form>
            <form action={send} className="mt-2">
              <SubmitButton variant="ghost" className="w-full" pendingText="Sending">Send a new code</SubmitButton>
            </form>
          </>
        )}
      </PhoneCard>
      <PhoneCard className="flex gap-4">
        <span className="w-12 h-12 rounded-2xl bg-sunken text-ink2 grid place-items-center shrink-0"><Lock size={21} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="font-semibold text-[15px]">Why this step?</p><p className="text-[13px] text-ink3 mt-0.5">Your link shows your children&rsquo;s records. The code makes sure only you can open it on a new phone. This phone is remembered after today. If this is not your number, please call the school.</p></div>
      </PhoneCard>
    </>
  );
}
