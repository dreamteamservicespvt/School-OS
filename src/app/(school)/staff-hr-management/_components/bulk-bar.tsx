"use client";

// Bulk actions on the Staff List (P11): select rows, see the count, and act.
// Row checkboxes belong to the form "staff-bulk" wherever they are drawn.

import { useCallback, useEffect, useState } from "react";
import { FormDialog, type Action } from "./forms";
import { CheckboxField, SelectField, TextArea } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

const FORM = "staff-bulk";

function selected(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${FORM}][name=ids]:checked`)].map((i) => i.value);
}

export function RowCheck({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" form={FORM} name="ids" value={id} aria-label={`Select ${label}`} className="size-5 accent-[var(--brand)]" />;
}

export function SelectAll() {
  return (
    <input type="checkbox" aria-label="Select all on this page" className="size-5 accent-[var(--brand)]"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${FORM}][name=ids]`).forEach((i) => { i.checked = e.target.checked; });
        document.dispatchEvent(new Event("staff-bulk-change"));
      }} />
  );
}

/** A new key each time the message dialog opens, so a double press never sends twice. */
function SendKey() {
  const [key] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="key" value={key} />;
}

export function BulkBar({ departments, changeDepartment, message, copyChannels = [] }: { departments: { value: string; label: string }[]; changeDepartment: Action; message: Action; copyChannels?: { value: string; label: string }[] }) {
  const [ids, setIds] = useState<string[]>([]);
  const refresh = useCallback(() => setIds(selected()), []);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.getAttribute?.("form") === FORM || e.type === "staff-bulk-change") refresh();
    };
    document.addEventListener("change", onChange);
    document.addEventListener("staff-bulk-change", onChange);
    return () => { document.removeEventListener("change", onChange); document.removeEventListener("staff-bulk-change", onChange); };
  }, [refresh]);

  if (ids.length === 0) return null;
  const asIds = (fd: FormData) => { for (const id of ids) fd.append("ids", id); };
  const wrap = (a: Action): Action => async (prev, fd) => { asIds(fd); return a(prev, fd); };
  return (
    <div role="region" aria-label="Bulk actions" className="sticky bottom-20 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand bg-surface p-3 shadow-pop sm:bottom-4">
      <p className="mr-auto font-medium">{ids.length} selected</p>
      <a className={buttonClass("secondary", "sm")} href={`/staff-hr-management/id-cards?ids=${ids.join(",")}`} target="_blank" rel="noopener">Print {ids.length} ID card{ids.length === 1 ? "" : "s"}</a>
      <FormDialog trigger="Change department" triggerSize="sm" title={`Change department of ${ids.length} staff`} action={wrap(changeDepartment)} submitLabel={`Move ${ids.length} staff`} onSaved={() => clear()}>
        {(f) => (
          <>
            <p className="text-ink-2">Each selected staff member moves to the department you choose. This is written to each record&apos;s history.</p>
            <SelectField label="New department" name="departmentId" options={[{ value: "none", label: "No department" }, ...departments]} placeholder="Choose" required error={f.err("departmentId")} />
          </>
        )}
      </FormDialog>
      <FormDialog trigger="Send message" triggerSize="sm" title={`Message ${ids.length} staff`} action={wrap(message)} submitLabel={`Send to ${ids.length} staff`} onSaved={() => clear()}>
        {(f) => (
          <>
            <SendKey />
            <TextArea label="Message" name="text" required maxLength={500} rows={4} error={f.err("text")} defaultValue={f.val("text")}
              help="Staff with a login get it in School OS straight away. It cannot be unsent." />
            {copyChannels.length > 0 && (
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Also send to their phones</legend>
                {copyChannels.map((c) => (
                  <CheckboxField key={c.value} label={`By ${c.label}`} name="channels" value={c.value} defaultChecked={f.state?.values?.channels === c.value} />
                ))}
                <p className={`text-sm ${f.err("channels") ? "text-danger" : "text-ink-2"}`}>{f.err("channels") ?? "Uses message credits. Staff with no mobile number are left out; you see how many after sending."}</p>
              </fieldset>
            )}
          </>
        )}
      </FormDialog>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => clear()}>Clear</button>
    </div>
  );

  function clear() {
    document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${FORM}]`).forEach((i) => { i.checked = false; });
    setIds([]);
  }
}

export function BulkForm() {
  return <form id={FORM} className="hidden" onSubmit={(e) => e.preventDefault()} />;
}
