"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import type { FormState } from "@/lib/forms";
import { ActionButton, FormDialog, type Action } from "../_components/forms";
import { CalendarPlus } from "lucide-react";
import { Words } from "@/lib/i18n/client";
import { tx } from "@/lib/i18n/tx";

type Option = { value: string; label: string };
type LeaveTypeOption = Option & { halfDay: boolean; note: string };

/**
 * Days, balance and periods, checked by itself as soon as a leave type and dates are chosen (layman loop 2:
 * a separate "Check" tap was missed), without submitting (a submitted form is reset, losing what was typed).
 */
function Preview({ action }: { action: (s: FormState<{ text: string }>, fd: FormData) => Promise<FormState<{ text: string }>> }) {
  const [state, setState] = useState<FormState<{ text: string }>>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const run = (e?: Event) => {
      const name = (e?.target as HTMLInputElement | null)?.name;
      if (name && !["leaveTypeId", "from", "to", "halfDay", "staffId", "document"].includes(name)) return;
      const fd = new FormData(form);
      if (!fd.get("leaveTypeId") || !fd.get("from")) return;
      start(async () => setState(await action(null, fd)));
    };
    form.addEventListener("change", run);
    return () => form.removeEventListener("change", run);
  }, [action]);
  return (
    <div ref={box} className="sm:col-span-2 min-h-5 text-sm" aria-live="polite">
      {pending ? <p className="text-ink-2"><Words k="Checking…" /></p>
        : state ? <p className={state.ok ? "text-ink font-medium" : "text-danger"}>{state.ok ? state.data?.text : state.message}</p> : null}
    </div>
  );
}

export function ApplyLeaveForm({ action, preview, types, staff, fixedStaff, defaultOpen, today, label = "Apply for leave" }: {
  action: Action; preview: (s: FormState<{ text: string }>, fd: FormData) => Promise<FormState<{ text: string }>>;
  types: LeaveTypeOption[]; staff: Option[] | null; fixedStaff?: Option; defaultOpen?: boolean; today: string; label?: string;
}) {
  const [typeId, setTypeId] = useState("");
  const [half, setHalf] = useState("");
  const type = types.find((t) => t.value === typeId);
  return (
    <FormDialog trigger={<><CalendarPlus size={17} aria-hidden="true" />{tx(label)}</>} triggerVariant="primary" title={fixedStaff ? `Apply leave for ${fixedStaff.label}` : "Apply for leave"} action={action} submitLabel="Apply"
      pendingText="Applying…" defaultOpen={defaultOpen} multipart wide hidden={fixedStaff ? { staffId: fixedStaff.value } : undefined}>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {staff && !fixedStaff && (
            <SelectField label="Staff member" name="staffId" options={staff} placeholder="Myself" defaultValue={f.val("staffId")} error={f.err("staffId")} className="sm:col-span-2"
              help="Leave empty to apply for yourself." />
          )}
          <SelectField label="Leave type" name="leaveTypeId" required options={types} placeholder="Choose" defaultValue={f.val("leaveTypeId")} error={f.err("leaveTypeId")}
            onChange={(e) => setTypeId(e.target.value)} help={type?.note} className="sm:col-span-2" />
          <TextField label="From date" name="from" type="date" required defaultValue={f.val("from", today)} error={f.err("from")} />
          {!half && <TextField label="To date" name="to" type="date" required defaultValue={f.val("to", today)} error={f.err("to")} />}
          {(!type || type.halfDay) && (
            <SelectField label="Half day" name="halfDay" value={half} onChange={(e) => setHalf(e.target.value)} error={f.err("halfDay")}
              options={[{ value: "", label: "No, full days" }, { value: "first", label: "First half" }, { value: "second", label: "Second half" }]} />
          )}
          <TextArea label="Reason" name="reason" required rows={2} defaultValue={f.val("reason")} error={f.err("reason")} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <label htmlFor="leave-doc" className="mb-1 block text-sm font-medium"><Words k="Document" /></label>
            <input id="leave-doc" name="document" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full text-sm text-ink-2 file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-4 file:font-medium file:text-ink hover:file:bg-sunken" aria-describedby="leave-doc-help" />
            <p id="leave-doc-help" className={`mt-1 text-sm ${f.err("document") ? "text-danger" : "text-ink-2"}`}>{f.err("document") ?? "Such as a doctor's note. Needed for some leave types and for long leave."}</p>
          </div>
          <Preview action={preview} />
        </div>
      )}
    </FormDialog>
  );
}

export function DecideButtons({ approvalId, approve, label }: { approvalId: string; approve: Action; label: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton action={approve} hidden={{ approvalId, decision: "approve" }} variant="primary" pendingText="Approving…"><Words k="Approve" /><span className="sr-only"> {label}</span></ActionButton>
      <FormDialog trigger="Reject" triggerSize="sm" triggerVariant="danger-outline" title={`Reject: ${label}`} action={approve} submitLabel="Reject" submitVariant="danger" hidden={{ approvalId, decision: "reject" }}>
        {(f) => <TextArea label="Reason" name="note" required rows={3} defaultValue={f.val("note")} error={f.err("note") ?? (f.state && !f.state.ok ? f.state.message : undefined)} help="At least 5 characters. The staff member sees it." />}
      </FormDialog>
    </div>
  );
}

export function CancelLeaveForm({ requestId, action, started }: { requestId: string; action: Action; started: boolean }) {
  return (
    <FormDialog trigger="Cancel leave" triggerSize="sm" triggerVariant="ghost" title="Cancel leave" action={action} submitLabel="Cancel leave" submitVariant="danger" hidden={{ requestId }} cancelLabel="Keep leave">
      {(f) => (
        <>
          <p className="text-ink-2">{started ? "This leave has started. The days from today are cancelled and given back; the days already taken stay." : "The days go back to the balance, and any substitutions for it are cancelled."}</p>
          <TextArea label="Reason" name="reason" required rows={2} defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}

export function AdjustBalanceForm({ staffId, staffName, academicYearId, types, action }: { staffId: string; staffName: string; academicYearId: string; types: Option[]; action: Action }) {
  return (
    <FormDialog trigger="Adjust" triggerSize="sm" title={`Adjust balance: ${staffName}`} action={action} submitLabel="Save adjustment" hidden={{ staffId, academicYearId }}>
      {(f) => (
        <>
          <SelectField label="Leave type" name="leaveTypeId" required options={types} placeholder="Choose" defaultValue={f.val("leaveTypeId")} error={f.err("leaveTypeId")} />
          <TextField label="Days" name="days" required inputMode="decimal" defaultValue={f.val("days")} error={f.err("days")} help="Minus to take away, like -1. Halves allowed, like 0.5." />
          <TextArea label="Reason" name="reason" required rows={2} defaultValue={f.val("reason")} error={f.err("reason")} help="Kept in the history." />
        </>
      )}
    </FormDialog>
  );
}

export function CarryForwardForm({ years, action }: { years: Option[]; action: Action }) {
  return (
    <FormDialog trigger="Carry forward" triggerSize="sm" title="Carry leave forward" action={action} submitLabel="Carry forward">
      {(f) => (
        <>
          <p className="text-ink-2"><Words k="Days left move to the next year, up to the maximum. Running it again does not add them twice." /></p>
          <SelectField label="From academic year" name="academicYearId" required options={years} defaultValue={f.val("academicYearId", years[0]?.value)} error={f.err("academicYearId")} />
        </>
      )}
    </FormDialog>
  );
}
