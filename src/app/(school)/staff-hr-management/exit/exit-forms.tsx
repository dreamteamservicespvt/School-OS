"use client";

import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { ActionButton, ActionForm, FormDialog, type Action } from "../_components/forms";

type Option = { value: string; label: string };

export function NewExitForm({ action, staff, fixedStaff, today }: { action: Action; staff: Option[]; fixedStaff?: string; today: string }) {
  return (
    <ActionForm action={action} submitLabel="Record exit" pendingText="Saving…" multipart keep>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Staff member" name="staffId" required options={staff} placeholder="Choose" defaultValue={f.val("staffId", fixedStaff)} error={f.err("staffId")} className="sm:col-span-2" />
          <SelectField label="Type" name="type" required defaultValue={f.val("type", "RESIGNATION")} error={f.err("type")} className="sm:col-span-2"
            options={[{ value: "RESIGNATION", label: "Resignation" }, { value: "RETIREMENT", label: "Retirement (needs the Principal's approval)" }, { value: "TERMINATION", label: "Termination (needs the Principal's approval)" }]} />
          <TextField label="Date received" name="receivedOn" type="date" required defaultValue={f.val("receivedOn", today)} error={f.err("receivedOn")} />
          <TextField label="Last working day" name="lastWorkingDay" type="date" required defaultValue={f.val("lastWorkingDay")} error={f.err("lastWorkingDay")} help="The login is switched off at the end of this day." />
          <TextArea label="Reason" name="reason" required rows={3} defaultValue={f.val("reason")} error={f.err("reason")} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <label htmlFor="exit-letter" className="mb-1 block text-sm font-medium">Letter</label>
            <input id="exit-letter" name="letter" type="file" accept="image/jpeg,image/png,application/pdf" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" />
            <p className={`mt-1 text-sm ${f.err("letter") ? "text-danger" : "text-ink-2"}`}>{f.err("letter") ?? "Optional. The resignation letter, PDF or photo."}</p>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export function HandOverForm({ itemId, label, teaching, staff, action }: { itemId: string; label: string; teaching: boolean; staff: Option[]; action: Action }) {
  if (!teaching) return <ActionButton action={action} hidden={{ itemId }}>Mark handed over<span className="sr-only">: {label}</span></ActionButton>;
  return (
    <FormDialog trigger="Hand over" triggerSize="sm" title={`Hand over: ${label}`} action={action} submitLabel="Hand over" hidden={{ itemId }}>
      {(f) => (
        <>
          <SelectField label="Who takes it over" name="toStaffId" required options={staff} placeholder="Choose a teacher" defaultValue={f.val("toStaffId")} error={f.err("toStaffId")} />
          <p className="text-sm text-ink-2">Teacher Allocation and the Time Table periods move to them from the last working day. They are told.</p>
        </>
      )}
    </FormDialog>
  );
}

export function AddHandoverForm({ exitId, action }: { exitId: string; action: Action }) {
  return (
    <FormDialog trigger="Add item" triggerSize="sm" title="Add a handover item" action={action} submitLabel="Add" hidden={{ exitId }}>
      {(f) => (
        <>
          <SelectField label="Kind" name="kind" required defaultValue={f.val("kind", "asset")} error={f.err("kind")}
            options={[{ value: "asset", label: "Asset or equipment" }, { value: "book", label: "Book" }, { value: "document", label: "Document or file" }, { value: "other", label: "Other" }]} />
          <TextField label="What" name="label" required defaultValue={f.val("label")} error={f.err("label")} placeholder="Laptop, lab keys" />
        </>
      )}
    </FormDialog>
  );
}

export function ClearanceForm({ checkId, label, status, action }: { checkId: string; label: string; status: string; action: Action }) {
  return (
    <FormDialog trigger="Update" triggerSize="sm" title={label} action={action} submitLabel="Save" hidden={{ checkId }}>
      {(f) => (
        <>
          <SelectField label="Status" name="status" required defaultValue={f.val("status", status === "PENDING" ? "CLEARED" : status)} error={f.err("status")}
            options={[{ value: "CLEARED", label: "Cleared" }, { value: "NOT_NEEDED", label: "Not needed" }, { value: "PENDING", label: "Pending" }]} />
          <TextField label="Note" name="note" defaultValue={f.val("note")} error={f.err("note")} />
        </>
      )}
    </FormDialog>
  );
}

export function SettlementForm({ exitId, sent, action }: { exitId: string; sent: boolean; action: Action }) {
  return (
    <FormDialog trigger={sent ? "Mark settlement done" : "Send for final settlement"} triggerSize="sm" triggerVariant={sent ? "secondary" : "primary"} title="Final settlement" action={action}
      submitLabel={sent ? "Mark done" : "Send"} hidden={{ exitId, done: sent ? "yes" : "no" }}>
      {(f) => (
        <>
          <p className="text-ink-2">{sent ? "Mark it done once Salary Management has paid the final salary, leave encashment and any dues." : "Salary Management is told to work out the final salary, leave encashment and recoveries up to the last working day."}</p>
          <TextArea label="Note" name="note" rows={2} defaultValue={f.val("note")} error={f.err("note")} />
        </>
      )}
    </FormDialog>
  );
}

export function CancelExitForm({ exitId, action }: { exitId: string; action: Action }) {
  return (
    <FormDialog trigger="Cancel exit" triggerSize="sm" triggerVariant="danger-outline" title="Cancel this exit" action={action} submitLabel="Cancel exit" submitVariant="danger" hidden={{ exitId }}>
      {(f) => (
        <>
          <p className="text-ink-2">Use this if the resignation is withdrawn. Items already handed over stay with the new teacher.</p>
          <TextArea label="Reason" name="reason" required rows={2} defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}

export function CompleteExitButton({ exitId, action }: { exitId: string; action: Action }) {
  return <ActionButton action={action} hidden={{ exitId }} variant="primary" size="md">Complete exit</ActionButton>;
}
