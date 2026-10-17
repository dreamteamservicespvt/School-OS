"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/ui/confirm";
import { ErrorSummary, SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/empty-state";
import { ActionButton } from "../action-button";
import { DOCUMENT_TYPES_VAULT } from "@/lib/settings/profile-rules";
import { documentAction, saveDocumentAction, shareDocumentAction, uploadVersionAction } from "./actions";

export type DocRow = {
  id: string;
  docType: string;
  title: string;
  issuedOn: string | null;
  issuedOnIso: string;
  expiresOn: string | null;
  expiresOnIso: string;
  state: "expired" | "soon" | "ok" | "none";
  verified: boolean;
  visibleTo: string[];
  archived: boolean;
  versions: { n: number; fileName: string; uploadedAt: string; href: string }[];
};
type RoleChoice = { key: string; name: string };

const STATE: Record<DocRow["state"], { label: string; tone: "danger" | "warning" | "success" | "neutral" } | null> = {
  expired: { label: "Expired", tone: "danger" },
  soon: { label: "Expires soon", tone: "warning" },
  ok: { label: "Valid", tone: "success" },
  none: null,
};

function FileInput({ error }: { error?: string }) {
  const [local, setLocal] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">File <span className="text-danger" aria-hidden="true">*</span></label>
      <input id="doc-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png" capture={undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          setLocal(f && f.size > 10 * 1024 * 1024 ? `This file is ${(f.size / 1024 / 1024).toFixed(1)} MB. Files can be at most 10 MB.` : null);
        }}
        className="block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5" />
      <p className={`mt-1 text-sm ${local || error ? "text-danger" : "text-ink-2"}`}>{local ?? error ?? "A PDF or a photo (JPG or PNG) of the paper, at most 10 MB."}</p>
    </div>
  );
}

function DocForm({ doc, roles, onDone }: { doc: DocRow | null; roles: RoleChoice[]; onDone: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof saveDocumentAction>[0], fd: FormData) => {
    const r = await saveDocumentAction(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  const v = (k: string, d: string) => state?.values?.[k] ?? d;
  const chosen = state?.values ? (state.values.visibleTo ?? "").split(",") : doc?.visibleTo ?? ["school-admin", "principal"];
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state?.ok ? null : state} />
      <ErrorSummary errors={state?.errors} />
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Document type" name="docType" required defaultValue={v("docType", doc?.docType ?? "")} options={DOCUMENT_TYPES_VAULT.map((t) => ({ value: t, label: t }))} placeholder="Choose" error={state?.errors?.docType} />
        <TextField label="Title" name="title" required defaultValue={v("title", doc?.title ?? "")} placeholder="CBSE affiliation letter" error={state?.errors?.title} />
        <TextField label="Issue date" name="issuedOn" type="date" defaultValue={v("issuedOn", doc?.issuedOnIso ?? "")} error={state?.errors?.issuedOn} />
        <TextField label="Expiry date" name="expiresOn" type="date" defaultValue={v("expiresOn", doc?.expiresOnIso ?? "")} error={state?.errors?.expiresOn} help="Needed for renewal reminders, 30 days before." />
      </div>
      {!doc && <FileInput error={state?.errors?.file} />}
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Who can see it <span className="text-danger" aria-hidden="true">*</span></legend>
        <p className="mb-2 text-sm text-ink-2">School Admins always can.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <label key={r.key} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
              <input type="checkbox" name="visibleTo" value={r.key} defaultChecked={chosen.includes(r.key)} className="size-5 accent-brand" />
              {r.name}
            </label>
          ))}
        </div>
        {state?.errors?.visibleTo && <p className="mt-1 text-sm text-danger">{state.errors.visibleTo}</p>}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <SubmitButton pendingText={doc ? "Saving…" : "Uploading…"}>{doc ? "Save document" : "Upload document"}</SubmitButton>
      </div>
    </form>
  );
}

function VersionForm({ doc, onDone }: { doc: DocRow; onDone: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof uploadVersionAction>[0], fd: FormData) => {
    const r = await uploadVersionAction(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <p className="text-ink-2">The {doc.versions.length} older version{doc.versions.length === 1 ? " is" : "s are"} kept. The new version needs to be verified again.</p>
      <FormMessage state={state?.ok ? null : state} />
      <input type="hidden" name="id" value={doc.id} />
      <FileInput error={state?.errors?.file} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="New issue date" name="issuedOn" type="date" defaultValue={state?.values?.issuedOn ?? ""} error={state?.errors?.issuedOn} />
        <TextField label="New expiry date" name="expiresOn" type="date" defaultValue={state?.values?.expiresOn ?? ""} error={state?.errors?.expiresOn} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <SubmitButton pendingText="Uploading…">Upload new version</SubmitButton>
      </div>
    </form>
  );
}

function ShareForm({ doc }: { doc: DocRow }) {
  const [state, action] = useActionState(shareDocumentAction, null);
  const [copied, setCopied] = useState(false);
  const full = state?.link ? `${typeof window === "undefined" ? "" : window.location.origin}${state.link}` : "";
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={doc.id} />
        <SelectField label="The link works for" name="days" defaultValue="7" options={[{ value: "1", label: "1 day" }, { value: "3", label: "3 days" }, { value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} />
        <SubmitButton pendingText="Making link…">Make sharing link</SubmitButton>
      </form>
      {state && !state.ok && <FormMessage state={state} />}
      {state?.ok && (
        <div className="space-y-2">
          <label htmlFor="share-link" className="block text-sm font-medium">Sharing link</label>
          <div className="flex gap-2">
            <input id="share-link" readOnly value={full} onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 font-mono text-sm" />
            <Button onClick={async () => { await navigator.clipboard.writeText(full); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="text-sm text-ink-2">{state.message}</p>
        </div>
      )}
    </div>
  );
}

export function Documents({ docs, roles, canEdit, total }: { docs: DocRow[]; roles: RoleChoice[]; canEdit: boolean; total: number }) {
  const [dialog, setDialog] = useState<{ kind: "new" } | { kind: "edit" | "version" | "share"; doc: DocRow } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setDialog(null);
  const title = !dialog ? "" : dialog.kind === "new" ? "Upload a school document" : dialog.kind === "edit" ? `Edit ${dialog.doc.title}` : dialog.kind === "version" ? `New version of ${dialog.doc.title}` : `Share ${dialog.doc.title}`;

  return (
    <div>
      {canEdit && total > 0 && <div className="mb-3"><Button onClick={() => setDialog({ kind: "new" })}>Upload a document</Button></div>}
      {docs.length === 0 ? (
        total === 0 ? (
          <EmptyState title="No school documents yet">
            Keep registration, affiliation, NOCs and safety certificates here, with expiry dates, so renewals are never missed.
            {canEdit && <div className="mt-4"><Button onClick={() => setDialog({ kind: "new" })}>Upload the first document</Button></div>}
          </EmptyState>
        ) : <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-2">No documents match these filters. Change the search or press Reset.</p>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => {
            const st = STATE[d.state];
            const latest = d.versions.at(-1);
            return (
              <li key={d.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {d.title}
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      <Badge tone={d.verified ? "success" : "neutral"}>{d.verified ? "Verified" : "Not verified"}</Badge>
                      {d.archived && <Badge>Removed</Badge>}
                    </p>
                    <p className="text-sm text-ink-2">
                      {d.docType}
                      {d.issuedOn && ` · Issued ${d.issuedOn}`}
                      {d.expiresOn ? ` · Expires ${d.expiresOn}` : " · No expiry date"}
                      {` · ${d.versions.length} version${d.versions.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {latest && <a href={latest.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium hover:bg-surface-2">Preview</a>}
                    {!d.archived && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "share", doc: d })}>Share</Button>}
                    {canEdit && !d.archived && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "version", doc: d })}>New version</Button>}
                    {canEdit && (d.archived ? (
                      <ConfirmButton trigger="Restore" triggerVariant="secondary" title={`Restore ${d.title}?`} confirmLabel="Restore document" onConfirm={() => documentAction(d.id, "restore")}>It will appear in the list again, with its reminders.</ConfirmButton>
                    ) : (
                      <ConfirmButton trigger="Remove" triggerVariant="danger-soft" title={`Remove ${d.title}?`} confirmLabel="Remove document" confirmVariant="danger" onConfirm={() => documentAction(d.id, "archive")}>
                        It is taken off the list and stops sending reminders. Added by mistake? This is the way to take it off. You can bring it back from “Show removed” if you need it.
                      </ConfirmButton>
                    ))}
                    <Button size="sm" variant="ghost" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Less" : "More"}</Button>
                  </div>
                </div>
                {open === d.id && (
                  <div className="mt-3 space-y-3 border-t border-line pt-3">
                    <div>
                      <p className="text-sm font-medium">Versions</p>
                      <ol className="mt-1 space-y-1 text-sm">
                        {[...d.versions].reverse().map((v) => (
                          <li key={v.n}><a className="text-brand-text underline" href={v.href} target="_blank" rel="noreferrer">Version {v.n}: {v.fileName}</a> <span className="text-ink-2">uploaded {v.uploadedAt}</span></li>
                        ))}
                      </ol>
                    </div>
                    <p className="text-sm"><span className="text-ink-2">Who can see it: </span>{d.visibleTo.map((k) => roles.find((r) => r.key === k)?.name ?? k).join(", ")}</p>
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        {!d.archived && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "edit", doc: d })}>Edit details</Button>}
                        {!d.archived && (d.verified ? (
                          <ConfirmButton trigger="Mark not verified" triggerVariant="ghost" title="Mark as not verified?" confirmLabel="Mark not verified" onConfirm={() => documentAction(d.id, "unverify")}>The document stays; it will show as not verified until someone checks it again.</ConfirmButton>
                        ) : (
                          <ActionButton label="Mark verified" pendingLabel="Saving…" run={() => documentAction(d.id, "verify")} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={dialog !== null} onClose={close} title={title} wide={dialog?.kind === "new" || dialog?.kind === "edit"}>
        {dialog?.kind === "new" && <DocForm doc={null} roles={roles} onDone={close} />}
        {dialog?.kind === "edit" && <DocForm key={dialog.doc.id} doc={dialog.doc} roles={roles} onDone={close} />}
        {dialog?.kind === "version" && <VersionForm key={dialog.doc.id} doc={dialog.doc} onDone={close} />}
        {dialog?.kind === "share" && <ShareForm key={dialog.doc.id} doc={dialog.doc} />}
      </Dialog>
    </div>
  );
}
