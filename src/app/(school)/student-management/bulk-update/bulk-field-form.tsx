"use client";

// Bulk field update (03 §2): type the new value per student (or one value for
// all), see the before and after with any problems, then save. Undo follows.

import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import type { BulkRow } from "@/lib/students/bulk";
import { bulkFieldAction } from "../_actions/bulk";

type Student = { id: string; name: string; admissionNo: string; cls: string; current: string | null };

export function BulkFieldForm({ field, label, help, students }: { field: string; label: string; help: string; students: Student[] }) {
  const [state, action, pending] = useActionState<FormState<{ step: "preview" | "done"; rows: BulkRow[] }>, FormData>(bulkFieldAction, null);
  const [useSame, setUseSame] = useState(false);
  const [edited, setEdited] = useState(0);
  const data = state?.ok ? state.data : undefined;
  const preview = data?.step === "preview" && edited === 0 ? data.rows : null;
  const done = data?.step === "done" ? data.rows : null;

  return (
    // Submitted by hand so the typed values stay in the boxes between Check and Save.
    <form onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      setEdited(0);
      startTransition(() => action(fd));
    }} onChange={() => setEdited((n) => n + 1)} className="space-y-4">
      <FormMessage state={state && (!state.ok || done || preview) ? state : null} />
      <input type="hidden" name="field" value={field} />
      {students.map((s) => <input key={s.id} type="hidden" name="ids" value={s.id} />)}
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="useSame" checked={useSame} onChange={(e) => setUseSame(e.target.checked)} className="size-5 accent-brand" />
        <span>Give everyone the same {label.toLowerCase()}</span>
      </label>
      {useSame && (
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-ink2">{label} for all {students.length}</span>
          <input name="same" required className="h-11 w-full max-w-sm rounded-xl border border-line bg-surface px-3 text-base" />
        </label>
      )}
      <p className="text-[13.5px] text-ink2">{help}</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {students.map((s) => {
          const p = (preview ?? done)?.find((r) => r.studentId === s.id);
          return (
            <li key={s.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_14rem_14rem] sm:items-center">
              <span><span className="font-medium">{s.name}</span> <span className="text-[13.5px] text-ink2">{s.admissionNo}{s.cls ? ` · ${s.cls}` : ""}</span></span>
              <span className="text-[13.5px] text-ink2">Now: {s.current ?? "empty"}</span>
              {useSame ? <span className="text-[13.5px]">{p ? `New: ${p.after ?? "empty"}` : ""}</span> : (
                <label><span className="sr-only">New {label.toLowerCase()} for {s.name}</span>
                  <input name={`v_${s.id}`} defaultValue={s.current ?? ""} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base" />
                </label>
              )}
              {p && (p.problem ? <span className="text-[13.5px] text-bad sm:col-span-3">{p.problem}</span>
                : p.before === p.after ? <span className="sm:col-span-3"><Badge>No change</Badge></span>
                : <span className="text-[13.5px] sm:col-span-3"><Badge tone={done ? "success" : "brand"}>{done ? "Saved" : "Will change"}</Badge> {p.before ?? "empty"} to {p.after ?? "empty"}</span>)}
            </li>
          );
        })}
      </ul>
      {!done && (
        <div className="flex flex-wrap gap-2">
          {preview
            ? <><Button type="submit" loading={pending} loadingText="Saving…" name="step" value="apply">Save {preview.filter((r) => !r.problem && r.before !== r.after).length} changes</Button>
                <Button type="submit" variant="secondary" disabled={pending} name="step" value="preview">Check again</Button></>
            : <Button type="submit" loading={pending} loadingText="Checking…" name="step" value="preview">Check the changes</Button>}
        </div>
      )}
    </form>
  );
}
