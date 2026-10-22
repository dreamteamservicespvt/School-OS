"use client";

import { useActionState } from "react";
import { SelectField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Option } from "@/components/ui/field";
import { saveSessionRulesAction } from "../actions";

/** Time without use on computers and phones, and the longest sign-in. */
export function SessionRulesForm({ readOnly, saved, values, computerOptions, phoneOptions, maxOptions }: {
  readOnly: boolean; saved: boolean; values: Record<"idleComputer" | "idlePhone" | "maxSession", string>;
  computerOptions: Option[]; phoneOptions: Option[]; maxOptions: Option[];
}) {
  const [state, action] = useActionState(saveSessionRulesAction, null);
  const v = (k: keyof typeof values) => state?.values?.[k] ?? values[k];
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {!saved && <p className="text-sm text-ink-2">Your school has not set its own session rules yet, so every device stays signed in for 7 days without use, as before.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Sign out a computer after it is not used for" name="idleComputer" options={computerOptions} defaultValue={v("idleComputer")} disabled={readOnly} error={state?.errors?.idleComputer} required />
        <SelectField label="Sign out a phone after it is not used for" name="idlePhone" options={phoneOptions} defaultValue={v("idlePhone")} disabled={readOnly} error={state?.errors?.idlePhone} required
          help="Phones include the installed School OS app." />
        <SelectField label="Longest one sign-in lasts" name="maxSession" options={maxOptions} defaultValue={v("maxSession")} disabled={readOnly} error={state?.errors?.maxSession} required
          help="Used or not, the person signs in again after this." />
      </div>
      <p className="text-sm text-ink-2">
        A person signed out this way sees &quot;You were signed out because you were away&quot; and signs in again. A remembered device stays remembered: on it, the password alone is enough and no one-time code is asked.
        Anyone can still sign out everywhere from My profile.
      </p>
      {!readOnly && <SubmitButton pendingText="Saving…">Save session rules</SubmitButton>}
    </form>
  );
}
