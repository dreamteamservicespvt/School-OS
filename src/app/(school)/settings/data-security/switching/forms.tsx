"use client";

// The go-live check's form (workflow 15, step 9). The forms for each file are
// shared by every import page: src/components/import/file-forms.tsx.

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { expectedAction } from "./actions";

export function ExpectedForm({ values }: { values: { oldSoftware: string; students: string; staff: string; guardians: string; goLiveDate: string } }) {
  const [state, action] = useActionState<FormState, FormData>(expectedAction, null);
  const v = (k: keyof typeof values) => (state && !state.ok ? state.values?.[k] : undefined) ?? values[k];
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <TextField label="Old software (or Excel, or paper registers)" name="oldSoftware" defaultValue={v("oldSoftware")} maxLength={100} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Students it shows" name="students" inputMode="numeric" defaultValue={v("students")} error={state?.errors?.students} />
        <TextField label="Staff it shows" name="staff" inputMode="numeric" defaultValue={v("staff")} error={state?.errors?.staff} />
        <TextField label="Parents it shows" name="guardians" inputMode="numeric" defaultValue={v("guardians")} error={state?.errors?.guardians} />
      </div>
      <TextField label="Go-live date" name="goLiveDate" type="date" defaultValue={v("goLiveDate")} error={state?.errors?.goLiveDate} help="The first day School OS is your record. Any day of the year works." />
      <SubmitButton variant="secondary" pendingText="Saving…">Save and compare</SubmitButton>
    </form>
  );
}
