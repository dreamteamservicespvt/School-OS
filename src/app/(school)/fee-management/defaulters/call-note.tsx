"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import { callNoteAction } from "./actions";

/**
 * "Add a call note" in a defaulter's history: what the parent said and the
 * date they promised. With Promise to Pay on (`promise`), the date can carry
 * an amount, must be within the next 60 days, and the note is optional.
 */
export function CallNoteForm({ studentId, promise }: { studentId: string; promise?: { min: string; max: string } | null }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(callNoteAction as never, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  const failed = state && !state.ok ? state : null;
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <TextArea name="note" label={promise ? "Add a call note (optional with a promise)" : "Add a call note"} rows={2} placeholder="Example: Called parent, promised by 15-10-2026" error={failed?.errors?.note} defaultValue={failed?.values?.note} />
      <div className="flex flex-wrap gap-2">
        <TextField type="date" name="promisedOn" label="Promised to pay by" help={promise ? "Within 60 days. Reminders pause until then." : "Leave empty if no date was given"} error={failed?.errors?.promisedOn}
          min={promise?.min} max={promise?.max} defaultValue={failed?.values?.promisedOn} className="max-w-[220px]" />
        {promise && <TextField name="amount" label="Amount promised (₹)" inputMode="decimal" placeholder="All overdue" help="Leave empty for everything overdue" error={failed?.errors?.amount}
          defaultValue={failed?.values?.amount} className="max-w-[200px] tnum" />}
      </div>
      {failed?.message && !failed.errors?.note && !failed.errors?.promisedOn && !failed.errors?.amount && <p className="text-[12.5px] text-bad" role="alert">{failed.message}</p>}
      <Button type="submit" variant="secondary" className="self-start" loading={pending}>{promise ? "Save" : "Save note"}</Button>
    </form>
  );
}
