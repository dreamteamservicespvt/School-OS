"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { CheckboxField, ErrorSummary, TextArea, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { clearRetentionAction, requestDeletionAction, saveRetentionAction } from "../actions";
import { KeepCheck } from "@/components/ui/keep-select";

type Rule = { recordType: string; label: string; keepMonths: number | null; legal?: string };

const CHOICES: { value: string; label: string }[] = [
  { value: "6", label: "6 months" },
  { value: "12", label: "1 year" },
  { value: "24", label: "2 years" },
  { value: "36", label: "3 years" },
  { value: "60", label: "5 years" },
  { value: "96", label: "8 years" },
  { value: "120", label: "10 years" },
  { value: "forever", label: "As long as the school uses School OS" },
];

export function RetentionForm({ rules, canEdit }: { rules: Rule[]; canEdit: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveRetentionAction, { ok: true });
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state?.message ? state : null} />
      <fieldset disabled={!canEdit} className="space-y-4">
        <legend className="sr-only">How long records are kept</legend>
        {rules.map((r) => {
          const value = state?.values?.[`keep_${r.recordType}`] ?? (r.keepMonths === null ? "forever" : String(r.keepMonths));
          const options = CHOICES.some((c) => c.value === value) ? CHOICES : [...CHOICES, { value, label: `${value} months` }];
          const err = state?.errors?.[r.recordType];
          return (
            <div key={r.recordType} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center sm:gap-4">
              <label htmlFor={`keep_${r.recordType}`}>
                <span className="font-medium">{r.label}</span>
                {r.legal && <span className="block text-sm text-ink-2">{r.legal}</span>}
              </label>
              <div>
                <select id={`keep_${r.recordType}`} name={`keep_${r.recordType}`} defaultValue={value} aria-invalid={Boolean(err)}
                  className={`min-h-11 w-full rounded-lg border bg-surface px-3 text-base text-ink ${err ? "border-danger" : "border-line-strong"}`}>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {err && <p className="mt-1 text-sm text-danger">{err}</p>}
              </div>
            </div>
          );
        })}
      </fieldset>
      <p className="text-sm text-ink-2">After this time, records are listed for the School Admin to review; nothing is removed by itself.</p>
      {canEdit && <SubmitButton pendingText="Saving…">Save periods</SubmitButton>}
    </form>
  );
}

export function DeletionForm({ personType, personId, personName, parts }: { personType: string; personId: string; personName: string; parts: readonly { key: string; label: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(requestDeletionAction, { ok: true });
  const [all, setAll] = useState((state?.values?.scopeAll ?? "all") === "all");
  return (
    <form action={action} className="space-y-4" noValidate>
      <ErrorSummary errors={state?.errors} />
      <FormMessage state={state?.message && !state?.errors ? state : null} />
      <input type="hidden" name="personType" value={personType} />
      <input type="hidden" name="personId" value={personId} />
      <p>Person: <span className="font-medium">{personName}</span></p>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">What to remove<span className="text-danger" aria-hidden="true"> *</span></legend>
        <label className="flex min-h-11 items-center gap-3">
          <KeepCheck type="radio" name="scopeAll" value="all" checked={all} onChange={() => setAll(true)} className="size-5 accent-brand" />
          All personal details
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <KeepCheck type="radio" name="scopeAll" value="some" checked={!all} onChange={() => setAll(false)} className="size-5 accent-brand" />
          Only some details
        </label>
        {!all && (
          <div className="ml-8 space-y-1">
            {parts.map((p) => <CheckboxField key={p.key} name={`part_${p.key}`} label={p.label} defaultChecked={state?.values?.[`part_${p.key}`] === "on"} />)}
          </div>
        )}
        {state?.errors?.scope && <p className="text-sm text-danger">{state?.errors.scope}</p>}
      </fieldset>
      <TextField label="Who asked" name="askedBy" required defaultValue={state?.values?.askedBy} error={state?.errors?.askedBy} help="For example: Father, by letter on 3 October." />
      <TextArea label="Reason" name="reason" required defaultValue={state?.values?.reason} error={state?.errors?.reason} help="The approver reads this." />
      <div>
        <label htmlFor="deletion-proof" className="mb-1 block text-sm font-medium">The written request (optional)</label>
        <input id="deletion-proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-describedby="deletion-proof-help"
          className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:text-ink" />
        {state?.errors?.proof ? <p className="mt-1 text-sm text-danger">{state?.errors.proof}</p> : <p id="deletion-proof-help" className="mt-1 text-sm text-ink-2">A photo or PDF of the letter, up to 10 MB.</p>}
      </div>
      <p className="text-sm text-ink-2">Nothing is removed until the request is approved in Approvals. Then the chosen details are blanked out; fee receipts, results and the audit log stay, without the removed details.</p>
      <SubmitButton pendingText="Sending…">Send for approval</SubmitButton>
    </form>
  );
}

/** The School Admin's approval of the retention list. */
export function ClearRetentionButton({ runId, total, lines }: { runId: string; total: number; lines: string[] }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={total === 1 ? "Clear this record" : `Clear these ${total} records`} triggerVariant="danger-outline" title={`Remove personal details from ${total} record${total === 1 ? "" : "s"}?`} confirmLabel="Remove personal details" confirmVariant="danger"
      onConfirm={async () => { const p = await clearRetentionAction(runId); if (!p) router.refresh(); return p; }}>
      <ul className="list-disc space-y-1 pl-5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <p className="mt-2">This cannot be undone. The records themselves stay (pass numbers, counts and costs), and this is written to the audit log.</p>
    </ConfirmButton>
  );
}
