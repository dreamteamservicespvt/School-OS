"use client";

// Student logins: make usernames and set-password links, then download the list once.

import { useActionState, useMemo } from "react";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { loginsAction } from "../_actions/bulk";

export function LoginsForm({ ids }: { ids: string[] }) {
  const [state, action] = useActionState<FormState<{ csv: string; count: number; fresh: number }>, FormData>(loginsAction, null);
  const href = useMemo(() => (state?.ok && state.data ? `data:text/csv;charset=utf-8,${encodeURIComponent(state.data.csv)}` : null), [state]);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      {href ? (
        <a href={href} download="student-logins.csv" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-medium text-brand-ink hover:bg-brand-hover">Download the logins (CSV)</a>
      ) : (
        <SubmitButton pendingText="Making logins…">{`Make logins for ${ids.length} ${ids.length === 1 ? "student" : "students"}`}</SubmitButton>
      )}
    </form>
  );
}
