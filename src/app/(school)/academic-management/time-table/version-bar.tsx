"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { SelectField, TextField } from "@/components/ui/field";
import { FormDialog, err, v } from "../_components/form-dialog";
import { autoFillAction, copyAction, discardDraftAction, publishAction, startDraftAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export type VersionRow = { id: string; name: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; effectiveFrom: string | null; periods: number; inForce: boolean };

const fmt = (iso: string) => iso.split("-").reverse().join("-");

export function VersionBar({ versions, shown, yearId, canArrange, writable, classes, years, today, hardClashes }: {
  versions: VersionRow[];
  shown: VersionRow | null;
  yearId: string;
  canArrange: boolean;
  writable: boolean;
  classes: { id: string; name: string }[];
  years: { id: string; name: string }[];
  today: string;
  hardClashes: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const draft = versions.find((x) => x.status === "DRAFT") ?? null;
  const href = (id: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (id) next.set("version", id); else next.delete("version");
    return `${pathname}?${next}`;
  };
  const startDraft = () => start(async () => {
    setError(null);
    const p = await startDraftAction(yearId);
    if (p) setError(p);
    else router.push(href("draft"));
  });

  return (
    <section aria-label="Time Table versions" className="no-print mb-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {shown ? (
            <>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {shown.name}
                <Badge tone={shown.status === "DRAFT" ? "warning" : "success"}>{shown.status === "DRAFT" ? "Draft" : "Published"}</Badge>
                {shown.inForce && <Badge tone="brand"><Words k="In force" /></Badge>}
              </p>
              <p className="text-sm text-ink-2">
                {shown.status === "DRAFT" ? "Only you and others who keep the Time Table see this draft. Teachers see the published one." : shown.effectiveFrom ? `Effective from ${fmt(shown.effectiveFrom)}.` : ""}
              </p>
            </>
          ) : <p className="font-semibold"><Words k="No Time Table published yet for this year." /></p>}
        </div>
        {canArrange && writable && (
          <div className="flex flex-wrap gap-2">
            {draft && shown?.id !== draft.id && <Link href={href(draft.id)} className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-medium text-brand-ink hover:bg-brand-hover"><Words k="Open the draft" /></Link>}
            {!draft && <Button onClick={startDraft} loading={pending} loadingText="Starting…">{shown ? "Start a draft to edit" : "Start the Time Table"}</Button>}
            {draft && shown?.id === draft.id && (
              <>
                <FormDialog trigger="Make automatically" title="Make automatically" action={autoFillAction} submitLabel="Make the draft" pendingText="Making… this can take a minute" hidden={{ versionId: draft.id }}>
                  {(state) => (
                    <>
                      <p className="text-ink-2"><Words k="Places every subject from Teacher Allocation into free periods, with teacher preferences and subject conditions. Fixed periods and breaks stay. The result stays a draft; the published Time Table does not change." /></p>
                      <SelectField label="For" name="classId" required defaultValue={v(state, "classId", "all")} error={err(state, "classId")}
                        options={[{ value: "all", label: "The whole school" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
                        help="The chosen classes' teaching periods in this draft are made again." />
                    </>
                  )}
                </FormDialog>
                <PublishDialog draftId={draft.id} today={today} hardClashes={hardClashes} />
                <ConfirmButton trigger="Discard draft" triggerVariant="ghost" triggerClassName="text-danger" title="Discard this draft?" confirmLabel="Discard draft" confirmVariant="danger"
                  onConfirm={async () => { const p = await discardDraftAction(draft.id); if (!p) router.push(href(null)); return p; }}>
                  <Words k="All changes in the draft are dropped. The published Time Table stays as it is." />
                </ConfirmButton>
              </>
            )}
            {shown && shown.status === "PUBLISHED" && (
              <FormDialog trigger="Copy" title={`Copy ${shown.name}`} action={copyAction} submitLabel="Copy into a draft" hidden={{ versionId: shown.id }}>
                {(state) => (
                  <>
                    <p className="text-ink-2"><Words k="Makes a draft from this Time Table. Clashes and missing sections are listed after copying, before you publish." /></p>
                    <SelectField label="Copy to" name="toYearId" required defaultValue={v(state, "toYearId", yearId)} error={err(state, "toYearId")}
                      options={years.map((y) => ({ value: y.id, label: y.id === yearId ? `Another week of ${y.name} (new effective date)` : `The year ${y.name}` }))} />
                  </>
                )}
              </FormDialog>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      {versions.length > 1 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-brand-text"><Words k="All versions (" />{versions.length})</summary>
          <ul className="divide-y divide-line text-sm">
            {versions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {x.name} <span className="text-ink-2">· {x.status === "DRAFT" ? "Draft" : "Published"}{x.effectiveFrom ? `, from ${fmt(x.effectiveFrom)}` : ""} · {x.periods} <Words k="periods" /></span>
                  {x.inForce && <Badge tone="brand" className="ml-2"><Words k="In force" /></Badge>}
                </span>
                {shown?.id === x.id ? <span className="text-ink-2"><Words k="Showing" /></span> : <Link href={href(x.id)} className="min-h-11 py-2 font-medium text-brand-text hover:underline"><Words k="Show" /></Link>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PublishDialog({ draftId, today, hardClashes }: { draftId: string; today: string; hardClashes: number }) {
  const [date, setDate] = useState(today);
  return (
    <FormDialog trigger="Publish" triggerVariant="primary" title="Publish this Time Table" action={publishAction} submitLabel={date ? `Publish from ${fmt(date)}` : "Publish"} hidden={{ versionId: draftId }}>
      {(state) => (
        <>
          {hardClashes > 0 && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{hardClashes} <Words k="clashes must be fixed before publishing. They are listed under the version bar." /></p>}
          <TextField label="Effective from" name="effectiveFrom" type="date" required min={today} value={v(state, "effectiveFrom", date) && date} onChange={(e) => setDate(e.target.value)} error={err(state, "effectiveFrom")}
            help="Teachers and students see this Time Table from this date. Before it, the current one stays." />
          <p className="text-sm text-ink-2"><Words k="Every teacher in it gets a message with a link to their Time Table." /></p>
        </>
      )}
    </FormDialog>
  );
}
