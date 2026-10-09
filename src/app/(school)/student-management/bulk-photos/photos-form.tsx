"use client";

// Bulk profile photos (03 §2): choose many photos named by admission number,
// see which student each one matches, then save.

import { startTransition, useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import type { PhotoMatch } from "@/lib/students/bulk";
import { bulkPhotosAction } from "../_actions/bulk";

type Result = { step: "match" | "done"; matches: PhotoMatch[]; skipped?: string[] };

export function PhotosForm() {
  const [state, action, pending] = useActionState<FormState<Result>, FormData>(bulkPhotosAction, null);
  const [picked, setPicked] = useState(0);
  const data = state?.ok ? state.data : undefined;
  const matches = data && picked === 0 ? data.matches : null;
  const done = data?.step === "done";

  return (
    // Submitted by hand so the chosen files stay chosen between Match and Save.
    <form onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      setPicked(0);
      startTransition(() => action(fd));
    }} className="space-y-4">
      <FormMessage state={state} />
      <div>
        <label htmlFor="bulk-photos" className="mb-1 block text-sm font-medium">Photos<span className="text-danger" aria-hidden="true"> *</span></label>
        <input id="bulk-photos" name="photos" type="file" multiple required accept="image/jpeg,image/png,image/webp" onChange={() => setPicked((n) => n + 1)}
          className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:text-brand-text" />
        <p className="mt-1 text-sm text-ink-2">Name each file by the admission number, for example SPS-2026-0145.jpg. Up to 200 photos at a time.</p>
        {state && !state.ok && state.errors?.photos && <p className="mt-1 text-sm text-danger">{state.errors.photos}</p>}
      </div>
      {matches && !done && (
        <>
          <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
            {matches.map((m) => (
              <li key={m.fileName} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0"><span className="font-medium">{m.fileName}</span> {m.fullName && <span className="text-ink-2">to {m.fullName}</span>}</span>
                {m.problem ? <span className="text-sm text-danger">{m.problem}</span> : (
                  <span className="flex items-center gap-2">
                    {m.hasPhoto && <Badge tone="warning">Has a photo</Badge>}
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="skip" value={m.fileName} className="size-5 accent-[var(--brand)]" /> Skip</label>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="replaceExisting" className="size-5 accent-[var(--brand)]" />
            <span>Replace photos students already have</span>
          </label>
          <Button type="submit" loading={pending} loadingText="Saving photos…" name="step" value="save">Save photos</Button>
        </>
      )}
      {done && data?.skipped && data.skipped.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Not saved</h3>
          <ul className="list-disc pl-5 text-[15px] text-ink-2">{data.skipped.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {(!matches || done) && <Button type="submit" loading={pending} loadingText="Matching…" name="step" value="match">Match photos</Button>}
    </form>
  );
}
