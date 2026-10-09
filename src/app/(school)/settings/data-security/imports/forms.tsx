"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { startImportAction, uploadImportFile } from "../actions";

export function UploadForm({ kinds, kind }: { kinds: { value: string; label: string }[]; kind?: string }) {
  const [state, action] = useActionState<FormState, FormData>(uploadImportFile, { ok: true });
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state?.message ? state : null} />
      <SelectField label="What are you importing?" name="kind" required options={kinds} placeholder="Choose" defaultValue={state?.values?.kind ?? kind ?? ""} error={state?.errors?.kind} />
      <div>
        <label htmlFor="import-file" className="mb-1 block text-sm font-medium">File<span className="text-danger" aria-hidden="true"> *</span></label>
        <input id="import-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby="import-file-help" aria-invalid={Boolean(state?.errors?.file)}
          className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:text-ink" />
        {state?.errors?.file ? <p className="mt-1 text-sm text-danger">{state?.errors.file}</p> : <p id="import-file-help" className="mt-1 text-sm text-ink-2">A CSV or Excel (.xlsx) file, up to 10 MB. The first row must be the column headings.</p>}
      </div>
      <SubmitButton pendingText="Uploading…">Upload and match columns</SubmitButton>
    </form>
  );
}

export function StartImport({ kind, fileId, match, good }: { kind: string; fileId: string; match: Record<string, number>; good: number }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {problem && <p role="alert" className="text-danger">{problem}</p>}
      <Button variant="primary" loading={busy} loadingText="Starting…" disabled={good === 0}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          const p = await startImportAction(kind, fileId, match);
          if (p) { setProblem(p); setBusy(false); }
        }}>
        {good === 0 ? "No good rows to import" : `Import ${good} good row${good === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
