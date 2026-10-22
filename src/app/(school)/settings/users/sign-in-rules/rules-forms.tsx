"use client";

import { useActionState } from "react";
import { SelectField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Option } from "@/components/ui/field";
import { savePasswordRulesAction, saveSessionRulesAction } from "../actions";
import { Words } from "@/lib/i18n/client";

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
      {!saved && <p className="text-sm text-ink-2"><Words k="Your school has not set its own session rules yet, so every device stays signed in for 7 days without use, as before." /></p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Sign out a computer after it is not used for" name="idleComputer" options={computerOptions} defaultValue={v("idleComputer")} disabled={readOnly} error={state?.errors?.idleComputer} required />
        <SelectField label="Sign out a phone after it is not used for" name="idlePhone" options={phoneOptions} defaultValue={v("idlePhone")} disabled={readOnly} error={state?.errors?.idlePhone} required
          help="Phones include the installed School OS app." />
        <SelectField label="Longest one sign-in lasts" name="maxSession" options={maxOptions} defaultValue={v("maxSession")} disabled={readOnly} error={state?.errors?.maxSession} required
          help="Used or not, the person signs in again after this." />
      </div>
      <p className="text-sm text-ink-2">
        <Words k={"A person signed out this way sees \"You were signed out because you were away\" and signs in again. A remembered device stays remembered: on it, the password alone is enough and no one-time code is asked. Anyone can still sign out everywhere from My profile."} />
      </p>
      {!readOnly && <SubmitButton pendingText="Saving…"><Words k="Save session rules" /></SubmitButton>}
    </form>
  );
}

/** The shortest password, earlier passwords that may not be used again, and an optional expiry. */
export function PasswordRulesForm({ readOnly, values, lengthOptions, historyOptions, expiryOptions, expiryNote }: {
  readOnly: boolean; values: Record<"minLength" | "history" | "expiryDays", string>;
  lengthOptions: Option[]; historyOptions: Option[]; expiryOptions: Option[]; expiryNote: string | null;
}) {
  const [state, action] = useActionState(savePasswordRulesAction, null);
  const v = (k: keyof typeof values) => state?.values?.[k] ?? values[k];
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Shortest password" name="minLength" options={lengthOptions} defaultValue={v("minLength")} disabled={readOnly} error={state?.errors?.minLength} required />
        <SelectField label="Earlier passwords" name="history" options={historyOptions} defaultValue={v("history")} disabled={readOnly} error={state?.errors?.history} required
          help="A new password may not repeat these." />
        <SelectField label="Change passwords" name="expiryDays" options={expiryOptions} defaultValue={v("expiryDays")} disabled={readOnly} error={state?.errors?.expiryDays} required
          help={expiryNote ?? "When it is due, the person chooses a new one at sign-in."} />
      </div>
      <p className="text-sm text-ink-2">
        <Words k="Every new password also needs a letter and a number, and may not be a common password such as Password@123, Welcome1 or Qwerty123. A person who works in more than one school follows the strictest rules of their schools." />
      </p>
      {!readOnly && <SubmitButton pendingText="Saving…"><Words k="Save password rules" /></SubmitButton>}
    </form>
  );
}
