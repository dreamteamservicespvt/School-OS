"use client";

// First open on a new phone: a one-time code to the guardian's registered
// mobile must be typed before anything is shown.
import { useActionState } from "react";
import { sendDeviceCode, verifyDevice, type GuardianState } from "@/app/p/[token]/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function VerifyPhone({ token, maskedPhone, codeSent }: { token: string; maskedPhone: string; codeSent: boolean }) {
  const [sent, send] = useActionState<GuardianState, FormData>(sendDeviceCode.bind(null, token), codeSent ? { ok: true, step: "code" } : null);
  const [checked, check] = useActionState<GuardianState, FormData>(verifyDevice.bind(null, token), null);
  const haveCode = Boolean(sent?.ok);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Confirm it is you</h1>
        <p className="mt-1 text-ink-2">
          This is the first time this link is opened on this phone. We will send a one-time code to the registered mobile {maskedPhone}.
        </p>
      </div>

      {!haveCode ? (
        <form action={send} className="space-y-3">
          {sent && !sent.ok && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{sent.message}</p>}
          <SubmitButton size="lg" className="w-full" pendingText="Sending code">Send code</SubmitButton>
        </form>
      ) : (
        <>
          <form action={check} className="space-y-3">
            <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success">
              {sent?.message ?? "Code sent."} We have sent a code to {maskedPhone}.
            </p>
            <label className="block">
              <span className="font-medium">6-digit code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
                aria-invalid={checked && !checked.ok ? true : undefined} aria-describedby="code-error"
                className="mt-1 block min-h-14 w-full rounded-xl border border-line-strong bg-surface px-4 text-center text-2xl tracking-[0.4em]" />
            </label>
            {checked && !checked.ok && <p id="code-error" role="alert" className="text-sm font-medium text-danger">{checked.message}</p>}
            <SubmitButton size="lg" className="w-full" pendingText="Checking">Open my page</SubmitButton>
          </form>
          <form action={send}>
            <SubmitButton variant="ghost" className="w-full" pendingText="Sending">Send a new code</SubmitButton>
          </form>
        </>
      )}
      <p className="text-sm text-ink-2">This phone will be remembered, so you will not need a code next time. If this is not your number, please call the school.</p>
    </div>
  );
}
