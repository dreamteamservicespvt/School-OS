"use client";

// The go-live check's form (workflow 15, step 9). The forms for each file are
// shared by every import page: src/components/import/file-forms.tsx.

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { expectedAction } from "./actions";

type ExpectedValues = { oldSoftware: string; students: string; staff: string; guardians: string; goLiveDate: string; oldDues?: string; pastReceipts?: string; advances?: string; cash?: string; bank?: string };

/** Money lines to type, in rupees as the old software shows them; which appear follows what the person may see. */
const MONEY_FIELDS: { key: "oldDues" | "pastReceipts" | "advances" | "cash" | "bank"; label: string; finance?: boolean }[] = [
  { key: "oldDues", label: "Old dues it shows (₹)" },
  { key: "pastReceipts", label: "Fees collected this year (₹)" },
  { key: "advances", label: "Advance paid ahead (₹)" },
  { key: "cash", label: "Cash in hand on go-live (₹)", finance: true },
  { key: "bank", label: "Bank balances on go-live (₹)", finance: true },
];

export function ExpectedForm({ values, money }: { values: ExpectedValues; money?: { fees: boolean; finance: boolean } }) {
  const [state, action] = useActionState<FormState, FormData>(expectedAction, null);
  const v = (k: keyof ExpectedValues) => (state && !state.ok ? state.values?.[k] : undefined) ?? values[k] ?? "";
  const lines = MONEY_FIELDS.filter((f) => (f.finance ? money?.finance : money?.fees));
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <TextField label="Old software (or Excel, or paper registers)" name="oldSoftware" defaultValue={v("oldSoftware")} maxLength={100} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Students it shows" name="students" inputMode="numeric" defaultValue={v("students")} error={state?.errors?.students} />
        <TextField label="Staff it shows" name="staff" inputMode="numeric" defaultValue={v("staff")} error={state?.errors?.staff} />
        <TextField label="Parents it shows" name="guardians" inputMode="numeric" defaultValue={v("guardians")} error={state?.errors?.guardians} />
      </div>
      {lines.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {lines.map((f) => <TextField key={f.key} label={f.label} name={f.key} inputMode="decimal" defaultValue={v(f.key)} error={state?.errors?.[f.key]} />)}
        </div>
      )}
      <TextField label="Go-live date" name="goLiveDate" type="date" defaultValue={v("goLiveDate")} error={state?.errors?.goLiveDate} help="The first day School OS is your record. Any day of the year works. Fees due before it belong to the old software, and finance records start on it." />
      <SubmitButton variant="secondary" pendingText="Saving…">Save and compare</SubmitButton>
    </form>
  );
}
