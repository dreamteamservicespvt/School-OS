"use client";

// Give or withdraw one consent on Parent Link (apps.jsx ConsentCard), confirmed by a one-time code
// to the guardian's registered mobile (two steps).
import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { askConsent, confirmConsentCode, type GuardianState } from "@/app/p/[token]/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export type ConsentChild = { id: string; name: string; given: boolean };

const codeCls = "h-14 w-full rounded-2xl bg-surface border border-line px-4 text-center text-[24px] font-semibold tnum tracking-[0.45em] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

export function ConsentForm({ token, consentTextId, title, kids: children, maskedPhone, preview }: { token: string; consentTextId: string; title: string; kids: ConsentChild[]; maskedPhone: string; preview: boolean }) {
  const [action, setAction] = useState<"give" | "withdraw" | null>(null);
  const [asked, ask] = useActionState<GuardianState, FormData>(askConsent.bind(null, token), null);
  const [confirmed, confirm] = useActionState<GuardianState, FormData>(confirmConsentCode.bind(null, token), null);
  const notGiven = children.filter((c) => !c.given);
  const given = children.filter((c) => c.given);

  if (confirmed?.ok && confirmed.step === "done") {
    return (
      <div role="status" className="mt-4 rounded-2xl p-3.5 flex items-start gap-3 bg-ok/10">
        <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-ok/15 text-ok"><Check size={18} strokeWidth={2.6} aria-hidden="true" /></span>
        <div className="min-w-0 text-[14px]">
          <p className="font-semibold">{confirmed.message}</p>
          <a href={`/p/${token}`} className="mt-1 inline-flex h-8 items-center text-[13px] font-semibold text-brand hover:underline">Show the page again</a>
        </div>
      </div>
    );
  }

  if (asked?.ok && asked.step === "code" && action) {
    return (
      <form action={confirm} className="mt-4 flex flex-col gap-3">
        <p className="text-[14px] text-ink2">You are saying <b className="font-semibold text-ink">{action === "give" ? "yes" : "withdraw"}</b> for &ldquo;{title}&rdquo;. To confirm, enter the 6-digit code sent to <b className="font-semibold text-ink tnum whitespace-nowrap">{maskedPhone}</b>.</p>
        {asked.notSent && <p role="status" className="text-[13px] text-warn">{asked.message}</p>}
        <label htmlFor={`cc-${consentTextId}`} className="sr-only">6-digit code</label>
        <input id={`cc-${consentTextId}`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className={codeCls} aria-describedby={`ce-${consentTextId}`} />
        {confirmed && !confirmed.ok && <p id={`ce-${consentTextId}`} role="alert" className="text-[13px] text-bad">{confirmed.message}</p>}
        <div className="grid grid-cols-2 gap-2.5 mt-1">
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setAction(null)}>Back</Button>
          <SubmitButton size="lg" className="w-full" pendingText="Checking">Confirm</SubmitButton>
        </div>
      </form>
    );
  }

  const choose = (a: "give" | "withdraw") => (preview ? undefined : () => setAction(a));
  if (action) {
    const list = action === "give" ? notGiven : given;
    return (
      <form action={ask} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="consentTextId" value={consentTextId} />
        <input type="hidden" name="action" value={action} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink2 mb-1">{action === "give" ? "Say yes for" : "Withdraw for"}</legend>
          {list.map((c) => (
            <label key={c.id} className="flex items-center gap-3 rounded-xl bg-sunken/60 px-3.5 h-12 cursor-pointer select-none">
              <input type="checkbox" name="studentId" value={c.id} defaultChecked className="size-5 accent-[var(--color-brand)]" />
              <span className="text-[14px]">{c.name}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-[12.5px] text-ink3">A one-time code goes to {maskedPhone} to confirm it is you.</p>
        {asked && !asked.ok && <p role="alert" className="text-[13px] text-bad">{asked.message}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setAction(null)}>Back</Button>
          <SubmitButton size="lg" className="w-full" pendingText="Sending code">Send code</SubmitButton>
        </div>
      </form>
    );
  }
  return (
    <div className={`grid gap-2.5 mt-4 ${notGiven.length && given.length ? "grid-cols-2" : "grid-cols-1"}`}>
      {notGiven.length > 0 && <Button size="lg" className="w-full" icon={Check} onClick={choose("give")} disabled={preview} title={preview ? "Preview only" : undefined}>Give consent</Button>}
      {given.length > 0 && <Button variant="secondary" size="lg" className="w-full" onClick={choose("withdraw")} disabled={preview} title={preview ? "Preview only" : undefined}>Withdraw</Button>}
    </div>
  );
}
