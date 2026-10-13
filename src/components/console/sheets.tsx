"use client";

// Console sheets opened by the page's address (?fix=…, ?act=…): a confirm with
// what will happen, an optional reason, and for closing a school, its name typed.

import { useState } from "react";
import { Check, Copy, PhoneCall } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SText } from "@/components/ui/sheet-fields";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function ActSheet({ title, sub, closeHref, doneHref, action, submitLabel, danger, hidden, reason, typeName, children, wide }: {
  title: string;
  sub?: React.ReactNode;
  closeHref: string;
  doneHref?: string;
  action: Action;
  submitLabel: string;
  danger?: boolean;
  hidden?: Record<string, string>;
  reason?: { label?: string; help?: string; placeholder?: string; name?: string };
  typeName?: string;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  const [typed, setTyped] = useState("");
  return (
    <SheetForm title={title} sub={sub} wide={wide} closeHref={closeHref} doneHref={doneHref} action={action} submitLabel={submitLabel} pendingText="Working…" submitVariant={danger ? "danger" : "primary"} hidden={hidden} submitDisabled={typeName ? typed.trim() !== typeName : false}>
      {children && <div className="text-[14px] text-ink2 leading-relaxed flex flex-col gap-2">{children}</div>}
      {reason && <SArea name={reason.name ?? "reason"} label={reason.label ?? "Reason"} required rows={2} help={reason.help} placeholder={reason.placeholder} />}
      {typeName && <SText name="typedName" label={`Type ${typeName} to confirm`} required autoComplete="off" onChange={(e) => setTyped(e.target.value)} />}
    </SheetForm>
  );
}

/** Call the admin about a stuck setup, then write what was agreed. */
export function CallSheet({ closeHref, schoolId, adminName, schoolName, phone, lines, action }: {
  closeHref: string;
  schoolId: string;
  adminName: string;
  schoolName: string;
  phone: string | null;
  lines: React.ReactNode[];
  action: Action;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <SheetForm title={`Call ${adminName}`} sub={`School Admin, ${schoolName}`} closeHref={closeHref} action={action} submitLabel="Save note" pendingText="Saving…" hidden={{ schoolId }}>
      <div className="rounded-2xl bg-sunken p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><PhoneCall size={20} aria-hidden="true" /></span>
        <div className="flex-1 min-w-0">
          {phone
            ? <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-display text-[22px] font-semibold tnum select-all leading-tight block">{phone}</a>
            : <p className="font-semibold">No mobile number on record</p>}
          <p className="text-[12.5px] text-ink3 truncate">{adminName}</p>
        </div>
        {phone && (
          <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={() => { void navigator.clipboard?.writeText(phone).then(() => setCopied(true), () => setCopied(false)); }}>
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      {lines.length > 0 && <ul className="flex flex-col gap-2.5 text-[14px]">{lines.map((l, i) => <li key={i} className="flex gap-3">{l}</li>)}</ul>}
      <SArea name="text" label="Note after the call" required rows={2} help="Visible only inside DREAM TEAM." placeholder="Spoke to the admin. They will add subjects by Monday." />
    </SheetForm>
  );
}
