"use client";

import { useState } from "react";
import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { ActionButton, ActionForm, FormDialog, type Action } from "../_components/forms";

type Option = { value: string; label: string };

export function DepartmentForm({ action, staff, d }: { action: Action; staff: Option[]; d?: { id: string; name: string; headStaffId: string | null } }) {
  return (
    <FormDialog trigger={d ? "Edit" : "Add department"} triggerSize="sm" triggerVariant={d ? "secondary" : "primary"} title={d ? `Edit ${d.name}` : "Add department"} action={action} submitLabel="Save" hidden={d ? { id: d.id } : undefined}>
      {(f) => (
        <>
          <TextField label="Name" name="name" required defaultValue={f.val("name", d?.name)} error={f.err("name")} />
          <SelectField label="Head of department" name="headStaffId" options={staff} placeholder="None" defaultValue={f.val("headStaffId", d?.headStaffId)} error={f.err("headStaffId")}
            help="Leave requests from this department go to the head first, then to the Principal." />
        </>
      )}
    </FormDialog>
  );
}

export function DesignationForm({ action, departments, roles, d }: { action: Action; departments: Option[]; roles: Option[]; d?: { id: string; name: string; staffType: string; defaultDepartmentId: string | null; defaultRoleKey: string | null } }) {
  return (
    <FormDialog trigger={d ? "Edit" : "Add designation"} triggerSize="sm" triggerVariant={d ? "secondary" : "primary"} title={d ? `Edit ${d.name}` : "Add designation"} action={action} submitLabel="Save" hidden={d ? { id: d.id } : undefined}>
      {(f) => (
        <>
          <TextField label="Name" name="name" required defaultValue={f.val("name", d?.name)} error={f.err("name")} help={d ? "Renaming changes it for every staff member with it." : undefined} />
          <SelectField label="Staff type" name="staffType" required defaultValue={f.val("staffType", d?.staffType ?? "Teaching")} options={[{ value: "Teaching", label: "Teaching" }, { value: "Non-teaching", label: "Non-teaching" }]} />
          <SelectField label="Usual department" name="defaultDepartmentId" options={departments} placeholder="None" defaultValue={f.val("defaultDepartmentId", d?.defaultDepartmentId)} />
          <SelectField label="Usual role" name="defaultRoleKey" options={roles} placeholder="No login by default" defaultValue={f.val("defaultRoleKey", d?.defaultRoleKey)} error={f.err("defaultRoleKey")}
            help="Offered first in Add Staff step 2. A designation is a post; the role decides what they can open." />
        </>
      )}
    </FormDialog>
  );
}

export type LeaveTypeValues = {
  id: string; name: string; code: string; daysPerYear: string; paid: boolean; carryForward: boolean; maxCarry: string; needsDocAfter: string;
  halfDayAllowed: boolean; documentRequired: boolean; countsHolidays: boolean; lossOfPay: boolean; sensitive: boolean; quota: Record<string, string>;
};

export function LeaveTypeForm({ action, groups, t }: { action: Action; groups: string[]; t?: LeaveTypeValues }) {
  const [paid, setPaid] = useState(t?.paid ?? true);
  const [carry, setCarry] = useState(t?.carryForward ?? false);
  return (
    <FormDialog trigger={t ? "Edit" : "Add leave type"} triggerSize="sm" triggerVariant={t ? "secondary" : "primary"} title={t ? `Edit ${t.name}` : "Add leave type"} action={action} submitLabel="Save" hidden={t ? { id: t.id } : undefined} wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" required defaultValue={f.val("name", t?.name)} error={f.err("name")} placeholder="Casual Leave" />
          <TextField label="Short code" name="code" defaultValue={f.val("code", t?.code)} error={f.err("code")} placeholder="CL" />
          <CheckboxField label="Paid leave, with a yearly balance" name="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="sm:col-span-2" />
          {paid && (
            <>
              <TextField label="Days a year" name="daysPerYear" inputMode="decimal" required defaultValue={f.val("daysPerYear", t?.daysPerYear ?? "12")} error={f.err("daysPerYear")} />
              <TextField label="Document needed after (days)" name="needsDocAfter" inputMode="numeric" defaultValue={f.val("needsDocAfter", t?.needsDocAfter)} error={f.err("needsDocAfter")} help="Empty means never, unless always needed below." />
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">Different days a year by employment type</legend>
                <p className="mb-2 text-sm text-ink-2">Leave empty to use the days a year above.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {groups.map((g) => <TextField key={g} label={g} name={`quota:${g}`} inputMode="decimal" defaultValue={f.val(`quota:${g}`, t?.quota[g])} error={f.err(`quota:${g}`)} />)}
                </div>
              </fieldset>
              <CheckboxField label="Carry unused days to next year" name="carryForward" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
              {carry && <TextField label="Most days carried" name="maxCarry" inputMode="decimal" defaultValue={f.val("maxCarry", t?.maxCarry ?? "10")} error={f.err("maxCarry")} />}
              <CheckboxField label="Days beyond the balance become loss of pay (not refused)" name="lossOfPay" defaultChecked={t?.lossOfPay ?? false} className="sm:col-span-2" />
            </>
          )}
          <CheckboxField label="Half days allowed" name="halfDayAllowed" defaultChecked={t?.halfDayAllowed ?? true} />
          <CheckboxField label="A document is always needed" name="documentRequired" defaultChecked={t?.documentRequired ?? false} />
          <CheckboxField label="Sundays and holidays inside the dates count" name="countsHolidays" defaultChecked={t?.countsHolidays ?? false} />
          <CheckboxField label="Private: colleagues see only “On leave”" name="sensitive" defaultChecked={t?.sensitive ?? false} />
        </div>
      )}
    </FormDialog>
  );
}

export function ArchiveButton({ action, id, label }: { action: Action; id: string; label: string }) {
  return <ActionButton action={action} hidden={{ id }} variant="ghost">Archive<span className="sr-only"> {label}</span></ActionButton>;
}

export function GeneralForm({ action, v, formats, fieldChoices }: {
  action: Action; formats: Option[]; fieldChoices: Option[];
  v: { staffIdPrefix: string; staffIdDigits: number; usernameFormat: string; noticeDays: number; reminderDays: number[]; documentTypes: string[]; requiredFields: string[] };
}) {
  return (
    <ActionForm action={action} submitLabel="Save settings" keep>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Staff ID prefix" name="staffIdPrefix" defaultValue={f.val("staffIdPrefix", v.staffIdPrefix)} error={f.err("staffIdPrefix")} help={`Next IDs look like ${v.staffIdPrefix}${"1".padStart(v.staffIdDigits, "0")}. Existing IDs do not change.`} />
          <TextField label="Number of digits" name="staffIdDigits" inputMode="numeric" defaultValue={f.val("staffIdDigits", String(v.staffIdDigits))} error={f.err("staffIdDigits")} />
          <SelectField label="Username format" name="usernameFormat" options={formats} defaultValue={f.val("usernameFormat", v.usernameFormat)} error={f.err("usernameFormat")} />
          <TextField label="Notice period (days)" name="noticeDays" inputMode="numeric" defaultValue={f.val("noticeDays", String(v.noticeDays))} error={f.err("noticeDays")} />
          <TextField label="Document reminders (days before expiry)" name="reminderDays" defaultValue={f.val("reminderDays", v.reminderDays.join(", "))} error={f.err("reminderDays")} help="Like 30, 7. Sent to HR and the staff member." />
          <TextArea label="Document types, one per line" name="documentTypes" rows={5} defaultValue={f.val("documentTypes", v.documentTypes.join("\n"))} error={f.err("documentTypes")} />
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Also required in Add Staff</legend>
            <p className="mb-2 text-sm text-ink-2">Name, phone, designation, joining date and employment type are always required.</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {fieldChoices.map((c) => <CheckboxField key={c.value} label={c.label} name="requiredFields" value={c.value} defaultChecked={v.requiredFields.includes(c.value)} />)}
            </div>
          </fieldset>
        </div>
      )}
    </ActionForm>
  );
}

export function FeatureSwitch({ action, k, on, label }: { action: Action; k: string; on: boolean; label: string }) {
  return <ActionButton action={action} hidden={{ key: k, on: on ? "no" : "yes" }} variant={on ? "secondary" : "primary"}>{on ? "Switch off" : "Switch on"}<span className="sr-only"> {label}</span></ActionButton>;
}
