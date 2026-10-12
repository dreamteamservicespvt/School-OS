"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import { callNoteAction } from "./actions";

/** "Add a call note" in a defaulter's history: what the parent said and the date they promised. */
export function CallNoteForm({ studentId }: { studentId: string }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(callNoteAction as never, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <TextArea name="note" label="Add a call note" rows={2} placeholder="Example: Called parent, promised by 15-10-2026" error={state?.errors?.note} defaultValue={state && !state.ok ? state.values?.note : undefined} />
      <TextField type="date" name="promisedOn" label="Promised to pay by" help="Leave empty if no date was given" error={state?.errors?.promisedOn} className="max-w-[220px]" />
      {state && !state.ok && state.message && !state.errors?.note && <p className="text-[12.5px] text-bad" role="alert">{state.message}</p>}
      <Button type="submit" variant="secondary" className="self-start" loading={pending}>Save note</Button>
    </form>
  );
}
