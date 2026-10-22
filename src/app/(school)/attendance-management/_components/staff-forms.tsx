"use client";

// Overtime and shift forms for Staff Attendance (optional features).

import { useState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { ActionButton, FormDialog, type Action } from "../../staff-hr-management/_components/forms";
import { Words } from "@/lib/i18n/client";

type Option = { value: string; label: string };

export function OvertimeForm({ action, staff, today }: { action: Action; staff: Option[]; today: string }) {
  return (
    <FormDialog trigger="Record overtime" triggerVariant="primary" title="Record overtime" action={action} submitLabel="Save overtime">
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Staff member" name="staffId" required options={staff} placeholder="Choose" defaultValue={f.val("staffId")} error={f.err("staffId")} className="sm:col-span-2" />
          <TextField label="Date" name="date" type="date" required max={today} defaultValue={f.val("date", today)} error={f.err("date")} />
          <TextField label="Hours" name="hours" inputMode="decimal" required placeholder="1.5" defaultValue={f.val("hours")} error={f.err("hours")} help="For example 1.5 for an hour and a half." />
          <TextArea label="Note" name="note" rows={2} maxLength={300} defaultValue={f.val("note")} className="sm:col-span-2" help="Optional. For example: annual day rehearsal." />
        </div>
      )}
    </FormDialog>
  );
}

export function ArchiveOvertime({ id, action }: { id: string; action: Action }) {
  return <ActionButton action={action} hidden={{ overtimeId: id }} variant="ghost" pendingText="Archiving…"><Words k="Archive" /></ActionButton>;
}

export function ShiftForm({ action, shift }: { action: Action; shift?: { id: string; name: string; startTime: string; endTime: string; lateAfterMin: number | null } }) {
  return (
    <FormDialog trigger={shift ? "Edit" : "Add shift"} triggerVariant={shift ? "ghost" : "primary"} triggerSize={shift ? "sm" : "md"} title={shift ? `Edit ${shift.name}` : "Add shift"}
      action={action} submitLabel="Save shift" hidden={shift ? { shiftId: shift.id } : undefined}>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Shift name" name="name" required maxLength={60} placeholder="Morning" defaultValue={f.val("name", shift?.name)} error={f.err("name")} className="sm:col-span-2" />
          <TextField label="Start time" name="startTime" type="time" required defaultValue={f.val("startTime", shift?.startTime ?? "08:00")} error={f.err("startTime")} />
          <TextField label="End time" name="endTime" type="time" required defaultValue={f.val("endTime", shift?.endTime ?? "16:00")} error={f.err("endTime")} />
          <TextField label="Late after (minutes)" name="lateAfterMin" type="number" min={0} max={240} defaultValue={f.val("lateAfterMin", shift?.lateAfterMin?.toString() ?? "")} error={f.err("lateAfterMin")}
            help="Empty uses the school's staff late rule (Attendance Settings)." className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}

export function AssignShiftForm({ action, shifts, staff, today }: { action: Action; shifts: Option[]; staff: (Option & { current: string })[]; today: string }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? staff.filter((s) => s.label.toLowerCase().includes(q.trim().toLowerCase())) : staff;
  return (
    <FormDialog trigger="Assign shift" title="Assign a shift" action={action} submitLabel="Assign" wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Shift" name="shiftId" required options={shifts} placeholder="Choose" defaultValue={f.val("shiftId")} error={f.err("shiftId")} />
          <TextField label="From date" name="fromDate" type="date" required defaultValue={f.val("fromDate", today)} error={f.err("fromDate")} />
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium"><Words k="Staff" /> <span className="text-danger">*</span></legend>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name" aria-label="Find staff by name"
              className="mb-2 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {staff.map((s) => (
                <li key={s.value} hidden={!shown.includes(s)}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                    <input type="checkbox" name="staffIds" value={s.value} className="size-5 accent-[var(--brand)]" />
                    <span className="flex-1">{s.label}</span>
                    <span className="text-sm text-ink-2">{s.current}</span>
                  </label>
                </li>
              ))}
            </ul>
            {f.err("staffIds") && <p className="mt-1 text-sm text-danger">{f.err("staffIds")}</p>}
          </fieldset>
        </div>
      )}
    </FormDialog>
  );
}

export function ArchiveShift({ id, action, restore }: { id: string; action: Action; restore?: boolean }) {
  return <ActionButton action={action} hidden={{ shiftId: id, ...(restore ? { restore: "1" } : {}) }} variant="ghost" pendingText="Saving…">{restore ? "Restore" : "Archive"}</ActionButton>;
}
