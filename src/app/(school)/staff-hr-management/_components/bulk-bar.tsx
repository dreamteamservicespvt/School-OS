"use client";

// Bulk actions on the Staff List (P11), in the design's inline bar under the list
// toolbar: tick rows, see the count, and act. The list's tick boxes carry
// form="staff-bulk" and data-bulk-row (components/ui/data-list.tsx); the heading
// box (data-bulk-all) ticks every row shown. Every action is checked again on the server.

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, IdCard, Send } from "lucide-react";
import { FormDialog, type Action } from "./forms";
import { CheckboxField, SelectField, TextArea } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

export const STAFF_BULK_FORM = "staff-bulk";
const ROWS = `input[data-bulk-row][form="${STAFF_BULK_FORM}"]`;

const rows = () => [...document.querySelectorAll<HTMLInputElement>(ROWS)];
const visible = () => rows().filter((i) => i.offsetParent !== null);
const selected = () => [...new Set(rows().filter((i) => i.checked).map((i) => i.value))];

/** A new key each time the message dialog opens, so a double press never sends twice. */
function SendKey() {
  const [key] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="key" value={key} />;
}

export function BulkBar({ departments, changeDepartment, message, copyChannels = [] }: { departments: { value: string; label: string }[]; changeDepartment: Action; message: Action; copyChannels?: { value: string; label: string }[] }) {
  const [ids, setIds] = useState<string[]>([]);
  const refresh = useCallback(() => {
    setIds(selected());
    const v = visible();
    document.querySelectorAll<HTMLInputElement>("input[data-bulk-all]").forEach((all) => {
      all.checked = v.length > 0 && v.every((i) => i.checked);
      all.indeterminate = !all.checked && v.some((i) => i.checked);
    });
  }, []);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches?.("input[data-bulk-all]")) visible().forEach((i) => { i.checked = t.checked; rows().filter((x) => x.value === i.value).forEach((x) => { x.checked = t.checked; }); });
      else if (t.matches?.(ROWS)) rows().filter((i) => i.value === t.value).forEach((i) => { i.checked = t.checked; });
      else return;
      refresh();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [refresh]);

  function clear() {
    document.querySelectorAll<HTMLInputElement>(`${ROWS}, input[data-bulk-all]`).forEach((i) => { i.checked = false; i.indeterminate = false; });
    setIds([]);
  }

  if (ids.length === 0) return null;
  const wrap = (a: Action): Action => async (prev, fd) => { for (const id of ids) fd.append("ids", id); return a(prev, fd); };
  const n = ids.length;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand/8 px-4 py-2.5 animate-fade">
      <p className="mr-2 text-[13.5px] font-semibold text-brand" aria-live="polite">{n} selected</p>
      <FormDialog trigger={<><Send size={15} aria-hidden="true" />Send message</>} triggerSize="sm" title={`Send a message to ${n} staff`} action={wrap(message)} submitLabel={`Send to ${n} staff`} onSaved={clear}>
        {(f) => (
          <>
            <SendKey />
            <TextArea label="Message" name="text" required maxLength={500} rows={4} error={f.err("text")} defaultValue={f.val("text")}
              help="Staff with a login get it in School OS straight away. Messages cannot be unsent." />
            {copyChannels.length > 0 && (
              <fieldset className="flex flex-col gap-1">
                <legend className="text-[13px] font-semibold text-ink2">Also send to their phones</legend>
                {copyChannels.map((c) => (
                  <CheckboxField key={c.value} label={`By ${c.label}`} name="channels" value={c.value} defaultChecked={f.state?.values?.channels === c.value} />
                ))}
                <p className={`text-[12.5px] ${f.err("channels") ? "text-bad" : "text-ink3"}`}>{f.err("channels") ?? "Uses message credits. Staff with no mobile number are left out; you see how many after sending."}</p>
              </fieldset>
            )}
          </>
        )}
      </FormDialog>
      <a className={buttonClass("secondary", "sm")} href={`/staff-hr-management/id-cards?ids=${ids.join(",")}`} target="_blank" rel="noopener"><IdCard size={15} aria-hidden="true" />Print ID cards</a>
      <FormDialog trigger={<><ArrowRightLeft size={15} aria-hidden="true" />Change department</>} triggerSize="sm" title={`Change department for ${n} staff`} action={wrap(changeDepartment)} submitLabel="Change department" onSaved={clear}>
        {(f) => (
          <>
            <p className="text-ink2">Leave approvals follow the new department head from today. Written to each record&apos;s history.</p>
            <SelectField label="New department" name="departmentId" options={[{ value: "none", label: "No department" }, ...departments]} placeholder="Choose" required error={f.err("departmentId")} />
          </>
        )}
      </FormDialog>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={clear}>Clear</button>
    </div>
  );
}
