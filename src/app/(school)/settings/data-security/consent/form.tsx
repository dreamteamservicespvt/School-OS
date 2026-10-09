"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, ErrorSummary, TextArea, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { saveConsentAction } from "../actions";

type Start = { title: string; text: Record<string, string>; askedOnAdmission: boolean };

export function ConsentForm({ types, languages, starts, initialType }: {
  types: { value: string; label: string }[];
  languages: { code: string; name: string }[];
  /** What each type's form starts from: its current text, or the ready text. */
  starts: Record<string, Start>;
  initialType: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveConsentAction, { ok: true });
  const [type, setType] = useState(state?.values?.consentType ?? initialType);
  const start = starts[type] ?? { title: "", text: {}, askedOnAdmission: true };
  const v = state?.values;
  return (
    <form action={action} className="space-y-4" noValidate>
      <ErrorSummary errors={state?.errors} />
      <FormMessage state={state?.message ? state : null} />
      <div>
        <label htmlFor="consent-type" className="mb-1 block text-sm font-medium">Consent type<span className="text-danger" aria-hidden="true"> *</span></label>
        <select id="consent-type" name="consentType" value={type} onChange={(e) => setType(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink">
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="new">A new consent type…</option>
        </select>
      </div>
      {type === "new" && <TextField label="Name of the new consent type" name="newType" required defaultValue={v?.newType} error={state?.errors?.newType} help="For example: Field trips, or Use of student work in the newsletter." />}
      <div key={type} className="space-y-4">
      <TextField label="Title" name="title" required defaultValue={v?.title ?? start.title} error={state?.errors?.title} help="What guardians see as the heading." />
      {languages.map((l, i) => (
        <TextArea key={l.code} label={`Text in ${l.name}`} name={`text_${l.code}`} rows={6} required={i === 0}
          defaultValue={v?.[`text_${l.code}`] ?? start.text[l.code] ?? ""} error={state?.errors?.[`text_${l.code}`]}
          help={i === 0 ? "{school} is replaced with the school's name." : "Optional. Guardians who read this language see it; otherwise they see the first one."} />
      ))}
      <CheckboxField name="askedOnAdmission" label="Asked on the admission form" defaultChecked={v ? v.askedOnAdmission === "on" : start.askedOnAdmission} />
      </div>
      <p className="text-sm text-ink-2">Saving makes a new version. Guardians who agreed earlier keep the version they agreed to; you can ask them to agree again through Parent Link.</p>
      <SubmitButton pendingText="Saving…">Save new version</SubmitButton>
    </form>
  );
}
