"use client";

// Campaigns (02 §2, optional): select enquiries and "Run campaign". The
// preview shows the count and the message as one family will read it.
// Row checkboxes belong to the form "enquiry-bulk" wherever they are drawn.

import { useCallback, useEffect, useState } from "react";
import { FormDialog, type Action } from "../_components/forms";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

const FORM = "enquiry-bulk";
const EVENT = "enquiry-bulk-change";

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
        document.dispatchEvent(new Event(EVENT));
      }} />
  );
}

export function BulkForm() {
  return <form id={FORM} className="hidden" onSubmit={(e) => e.preventDefault()} />;
}

export function CampaignBar({ run, schoolName }: { run: Action; schoolName: string }) {
  const [ids, setIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const refresh = useCallback(() => setIds(selected()), []);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.getAttribute?.("form") === FORM || e.type === EVENT) refresh();
    };
    document.addEventListener("change", onChange);
    document.addEventListener(EVENT, onChange);
    return () => { document.removeEventListener("change", onChange); document.removeEventListener(EVENT, onChange); };
  }, [refresh]);

  if (ids.length === 0) return null;
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form=${FORM}]`).forEach((i) => { i.checked = false; });
    setIds([]);
  };
  const action: Action = async (prev, fd) => { for (const id of ids) fd.append("ids", id); return run(prev, fd); };
  const preview = text.replace(/\{parent\}/g, "Sunita Rao").replace(/\{child\}/g, "Arjun");
  return (
    <div role="region" aria-label="Bulk actions" className="sticky bottom-20 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand bg-surface p-3 shadow-pop sm:bottom-4">
      <p className="mr-auto font-medium">{ids.length} selected</p>
      <FormDialog trigger="Run campaign" triggerSize="sm" triggerVariant="primary" title={`Campaign to ${ids.length} ${ids.length === 1 ? "family" : "families"}`} action={action} submitLabel={`Send to ${ids.length}`} wide onSaved={clear}>
        {(f) => (
          <>
            <TextField label="Campaign name" name="name" required maxLength={80} placeholder="Class 1 open day" defaultValue={f.val("name")} error={f.err("name")} help="Shown on each enquiry it reaches." />
            <SelectField label="Send by" name="channel" required options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} defaultValue={f.val("channel", "whatsapp")} error={f.err("channel")} />
            <TextArea label="Message" name="message" required rows={4} maxLength={1000} defaultValue={f.val("message")} error={f.err("message")}
              onChange={(e) => setText(e.target.value)}
              help={`Use {parent} and {child} for names. Sent through Communication from ${schoolName}; it cannot be unsent.`} />
            {preview && (
              <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                <p className="font-medium">Preview</p>
                <p className="mt-1 whitespace-pre-wrap">{preview}</p>
                <p className="mt-2 text-ink-2">{ids.length} {ids.length === 1 ? "message" : "messages"}. Closed enquiries are skipped.</p>
              </div>
            )}
          </>
        )}
      </FormDialog>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={clear}>Clear</button>
    </div>
  );
}
