"use client";

// Give or withdraw one consent on Parent Link, confirmed by a one-time code
// to the guardian's registered mobile (two steps).
import { useActionState, useState } from "react";
import { askConsent, confirmConsentCode, type GuardianState } from "@/app/p/[token]/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export type ConsentChild = { id: string; name: string; given: boolean };

export function ConsentForm({ token, consentTextId, title, children, maskedPhone, preview }: { token: string; consentTextId: string; title: string; children: ConsentChild[]; maskedPhone: string; preview: boolean }) {
  const [action, setAction] = useState<"give" | "withdraw" | null>(null);
  const [asked, ask] = useActionState<GuardianState, FormData>(askConsent.bind(null, token), null);
  const [confirmed, confirm] = useActionState<GuardianState, FormData>(confirmConsentCode.bind(null, token), null);
  const notGiven = children.filter((c) => !c.given);
  const given = children.filter((c) => c.given);

  if (confirmed?.ok && confirmed.step === "done") {
    return (
      <div role="status" className="rounded-xl bg-success-soft p-3 text-success">
        <p className="font-medium">{confirmed.message}</p>
        <a href={`/p/${token}`} className="mt-1 inline-flex min-h-11 items-center font-medium underline">Show the page again</a>
      </div>
    );
  }

  if (asked?.ok && asked.step === "code" && action) {
    return (
      <form action={confirm} className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
        <p>We have sent a code to {maskedPhone}. Type it here to {action === "give" ? "agree to" : "withdraw"} &ldquo;{title}&rdquo;.</p>
        <label className="block">
          <span className="text-sm font-medium">6-digit code</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required
            className="mt-1 block min-h-12 w-40 rounded-lg border border-line-strong bg-surface px-3 text-xl tracking-[0.3em]" aria-describedby={`ce-${consentTextId}`} />
        </label>
        {confirmed && !confirmed.ok && <p id={`ce-${consentTextId}`} role="alert" className="text-sm font-medium text-danger">{confirmed.message}</p>}
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingText="Checking">Confirm</SubmitButton>
          <Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
        </div>
      </form>
    );
  }

  const choose = (a: "give" | "withdraw") => (preview ? undefined : () => setAction(a));
  return (
    <div className="space-y-3">
      {action ? (
        <form action={ask} className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
          <input type="hidden" name="consentTextId" value={consentTextId} />
          <input type="hidden" name="action" value={action} />
          <fieldset>
            <legend className="text-sm font-medium">{action === "give" ? "Agree for" : "Withdraw for"}</legend>
            {(action === "give" ? notGiven : given).map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="studentId" value={c.id} defaultChecked className="size-5 accent-[var(--brand)]" />
                {c.name}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-ink-2">A one-time code will be sent to {maskedPhone} to confirm it is you.</p>
          {asked && !asked.ok && <p role="alert" className="text-sm font-medium text-danger">{asked.message}</p>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Sending code">Send code</SubmitButton>
            <Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {notGiven.length > 0 && <Button onClick={choose("give")} disabled={preview} title={preview ? "Preview only" : undefined}>I agree</Button>}
          {given.length > 0 && <Button variant="secondary" onClick={choose("withdraw")} disabled={preview} title={preview ? "Preview only" : undefined}>Withdraw consent</Button>}
        </div>
      )}
    </div>
  );
}
