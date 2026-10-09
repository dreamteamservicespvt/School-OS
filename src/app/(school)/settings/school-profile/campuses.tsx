"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/ui/confirm";
import { ErrorSummary, TextArea, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { campusAction, saveCampusAction } from "./actions";

export type CampusRow = { id: string; name: string; address: string | null; phone: string | null; headName: string | null; isMain: boolean; archived: boolean };

function CampusForm({ campus, onDone }: { campus: CampusRow | null; onDone: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof saveCampusAction>[0], fd: FormData) => {
    const r = await saveCampusAction(prev, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  const v = (k: keyof CampusRow) => state?.values?.[k] ?? (campus?.[k] as string | null) ?? "";
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state?.ok ? null : state} />
      <ErrorSummary errors={state?.errors} />
      {campus && <input type="hidden" name="id" value={campus.id} />}
      <TextField label="Campus name" name="name" required defaultValue={v("name")} error={state?.errors?.name} placeholder="North Campus" autoFocus />
      <TextArea label="Address" name="address" defaultValue={v("address")} error={state?.errors?.address} rows={2} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Campus head" name="headName" defaultValue={v("headName")} error={state?.errors?.headName} />
        <TextField label="Contact phone" name="phone" type="tel" inputMode="tel" defaultValue={v("phone")} error={state?.errors?.phone} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <SubmitButton pendingText="Saving…">{campus ? "Save campus" : "Add campus"}</SubmitButton>
      </div>
    </form>
  );
}

export function Campuses({ campuses, canEdit }: { campuses: CampusRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<CampusRow | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const live = campuses.filter((c) => !c.archived);
  const archived = campuses.filter((c) => c.archived);
  const list = showArchived ? campuses : live;
  return (
    <div>
      <ul className="divide-y divide-line">
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {c.name}
                {c.isMain && <Badge tone="brand">Main campus</Badge>}
                {c.archived && <Badge>Archived</Badge>}
              </p>
              <p className="text-sm text-ink-2">{[c.address, c.headName && `Head: ${c.headName}`, c.phone].filter(Boolean).join(" · ") || "No address or contact yet"}</p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {c.archived ? (
                  <ConfirmButton trigger="Restore" triggerVariant="secondary" title={`Restore ${c.name}?`} confirmLabel={`Restore ${c.name}`} onConfirm={() => campusAction(c.id, "restore")}>
                    {c.name} will appear again in campus choices across School OS.
                  </ConfirmButton>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                    {!c.isMain && (
                      <ConfirmButton trigger="Make main" triggerVariant="ghost" title={`Make ${c.name} the main campus?`} confirmLabel="Make main campus" onConfirm={() => campusAction(c.id, "main")}>
                        The main campus is the default for new records and documents.
                      </ConfirmButton>
                    )}
                    {!c.isMain && (
                      <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive ${c.name}?`} confirmLabel={`Archive ${c.name}`} confirmVariant="danger" onConfirm={() => campusAction(c.id, "archive")}>
                        It drops out of campus choices. A campus that still has students, staff, academic years or logins cannot be archived. You can restore it later.
                      </ConfirmButton>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canEdit && <Button onClick={() => setEditing("new")}>Add a campus</Button>}
        {archived.length > 0 && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-5 accent-[var(--brand)]" />
            Show {archived.length} archived
          </label>
        )}
      </div>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a campus" : `Edit ${editing?.name ?? "campus"}`}>
        {editing !== null && <CampusForm key={editing === "new" ? "new" : editing.id} campus={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
