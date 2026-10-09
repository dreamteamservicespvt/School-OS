"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { ConfirmButton } from "@/components/ui/confirm";
import { ErrorSummary, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { addSignatoryAction, archiveSignatoryAction } from "./actions";

export function SignatoryForm() {
  const [state, action] = useActionState<FormState, FormData>(addSignatoryAction, null);
  const v = state?.ok ? {} : state?.values ?? {};
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate key={state?.ok ? state.message : "form"}>
      <FormMessage state={state} />
      <ErrorSummary errors={e} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required maxLength={80} defaultValue={v.name} error={e.name} placeholder="Lakshmi Rao" />
        <TextField label="Designation" name="title" required maxLength={80} defaultValue={v.title} error={e.title} placeholder="Principal" />
      </div>
      <div>
        <label htmlFor="sig-image" className="mb-1 block text-sm font-medium">Signature picture</label>
        <input id="sig-image" name="image" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="sig-help"
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-4 file:font-medium" />
        {e.image ? <p id="sig-help" className="mt-1 text-sm text-danger">{e.image}</p> : <p id="sig-help" className="mt-1 text-sm text-ink-2">Optional. Sign on white paper, take a clear photo, or use a PNG with a see-through background. At most 2 MB.</p>}
      </div>
      <div className="flex justify-end"><SubmitButton pendingText="Adding…">Add signatory</SubmitButton></div>
    </form>
  );
}

export function ArchiveSignatory({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive ${name}?`} confirmLabel={`Archive ${name}`} confirmVariant="danger"
      onConfirm={async () => { const p = await archiveSignatoryAction(id); if (!p) router.refresh(); return p; }}>
      {name}&apos;s signature stops printing on every design that uses it. Documents already printed are not changed.
    </ConfirmButton>
  );
}
