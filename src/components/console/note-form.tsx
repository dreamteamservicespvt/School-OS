"use client";

// The Team notes box on a school's page: write, save, and the list refreshes.

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function NoteForm({ schoolId, action }: { schoolId: string; action: Action }) {
  const [state, run] = useActionState<FormState, FormData>(action, null);
  const [text, setText] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) { setText(""); router.refresh(); }
  }, [state, router]);
  return (
    <form action={run} className="flex flex-col gap-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <label htmlFor="sa-note" className="sr-only">New team note</label>
      <textarea id="sa-note" name="text" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Principal prefers calls after 4 PM."
        aria-invalid={state && !state.ok ? true : undefined}
        className="w-full rounded-xl bg-surface border border-line px-3.5 py-2.5 text-[15px] outline-none transition hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15" />
      {state && !state.ok && state.message && <p className="text-[12.5px] text-bad">{state.message}</p>}
      <div className="self-end">
        {text.trim()
          ? <SubmitButton size="sm" variant="secondary" pendingText="Saving…"><Plus size={15} aria-hidden="true" />Add note</SubmitButton>
          : <Button size="sm" variant="secondary" icon={Plus} disabled>Add note</Button>}
      </div>
    </form>
  );
}
