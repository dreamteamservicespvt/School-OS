"use client";

// The Staff Profile's edit panels: each section saves on its own (09 §2).

import { useActionState, useState } from "react";
import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { KeepCheck } from "@/components/ui/keep-select";
import { Button, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormDialog, type Action } from "../_components/forms";
import type { AccessLevel } from "@/lib/roles";
import { LEVEL_OPTIONS } from "@/lib/staff/role-words";
import { Pencil } from "lucide-react";

type Option = { value: string; label: string };
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ value: b, label: b }));
const GENDER = ["Female", "Male", "Other"].map((g) => ({ value: g, label: g }));

export type ProfileValues = {
  staffId: string; fullName: string; dateOfBirth: string; gender: string; bloodGroup: string; address: string; permanentAddress: string; qualification: string; experienceYears: string;
  phone: string; email: string; phoneVerified: boolean; emailVerified: boolean;
  staffCode: string; departmentId: string; designation: string; joiningDate: string; employmentType: string; reportingToId: string; campusId: string;
  emergency: { name: string; relation: string; phone: string }[];
  bankIfsc: string; bankName: string; uan: string; esiNo: string;
};

export function PersonalForm({ v, action, defaultOpen }: { v: ProfileValues; action: Action; defaultOpen?: boolean }) {
  return (
    <FormDialog trigger={<><Pencil size={15} aria-hidden="true" />Edit</>} triggerSize="sm" triggerVariant="ghost" title="Personal details" action={action} submitLabel="Save personal details" hidden={{ staffId: v.staffId }} defaultOpen={defaultOpen} wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" name="fullName" required defaultValue={f.val("fullName", v.fullName)} error={f.err("fullName")} className="sm:col-span-2" />
          <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={f.val("dateOfBirth", v.dateOfBirth)} error={f.err("dateOfBirth")} />
          <SelectField label="Gender" name="gender" defaultValue={f.val("gender", v.gender)} options={GENDER} placeholder="Choose" error={f.err("gender")} />
          <SelectField label="Blood group" name="bloodGroup" defaultValue={f.val("bloodGroup", v.bloodGroup)} options={BLOOD} placeholder="Choose" error={f.err("bloodGroup")} />
          <TextField label="Experience (years)" name="experienceYears" inputMode="numeric" defaultValue={f.val("experienceYears", v.experienceYears)} error={f.err("experienceYears")} />
          <TextField label="Qualifications" name="qualification" defaultValue={f.val("qualification", v.qualification)} error={f.err("qualification")} className="sm:col-span-2" />
          <TextArea label="Current address" name="address" rows={2} defaultValue={f.val("address", v.address)} error={f.err("address")} />
          <TextArea label="Permanent address" name="permanentAddress" rows={2} defaultValue={f.val("permanentAddress", v.permanentAddress)} error={f.err("permanentAddress")} />
        </div>
      )}
    </FormDialog>
  );
}

export function ContactForm({ v, action }: { v: ProfileValues; action: Action }) {
  return (
    <FormDialog trigger={<><Pencil size={15} aria-hidden="true" />Edit</>} triggerSize="sm" triggerVariant="ghost" title="Contact" action={action} submitLabel="Save contact" hidden={{ staffId: v.staffId }}>
      {(f) => (
        <>
          <TextField label="Phone" name="phone" required inputMode="numeric" defaultValue={f.val("phone", v.phone)} error={f.err("phone")} help="10-digit mobile. Changing it clears the verified mark unless you tick it again." />
          <TextField label="Email" name="email" type="email" defaultValue={f.val("email", v.email)} error={f.err("email")} />
          <CheckboxField name="phoneVerified" label="Phone verified" defaultChecked={v.phoneVerified} />
          <CheckboxField name="emailVerified" label="Email verified" defaultChecked={v.emailVerified} />
          {f.state?.data && (f.state.data as { link?: unknown }).link ? <CheckboxField name="allowDuplicate" label="It is a different person. Save anyway." /> : null}
        </>
      )}
    </FormDialog>
  );
}

export function EmploymentForm({ v, action, designations, departments, staff, campuses, types }: { v: ProfileValues; action: Action; designations: Option[]; departments: Option[]; staff: Option[]; campuses: Option[]; types: string[] }) {
  return (
    <FormDialog trigger={<><Pencil size={15} aria-hidden="true" />Edit</>} triggerSize="sm" triggerVariant="ghost" title="Employment" action={action} submitLabel="Save employment" hidden={{ staffId: v.staffId }} wide>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Staff ID" name="staffCode" required defaultValue={f.val("staffCode", v.staffCode)} error={f.err("staffCode")} help="Unique in the school. It is checked before saving." />
          <TextField label="Joining date" name="joiningDate" type="date" required defaultValue={f.val("joiningDate", v.joiningDate)} error={f.err("joiningDate")} />
          <SelectField label="Designation" name="designation" required defaultValue={f.val("designation", v.designation)} options={designations} error={f.err("designation")} help="To record a promotion with its date and reason, use Promotions." />
          <SelectField label="Department" name="departmentId" defaultValue={f.val("departmentId", v.departmentId)} options={departments} placeholder="No department" error={f.err("departmentId")} />
          <SelectField label="Employment type" name="employmentType" defaultValue={f.val("employmentType", v.employmentType)} options={types.map((t) => ({ value: t, label: t }))} error={f.err("employmentType")} />
          <SelectField label="Reporting manager" name="reportingToId" defaultValue={f.val("reportingToId", v.reportingToId)} options={staff.filter((s) => s.value !== v.staffId)} placeholder="None" error={f.err("reportingToId")} />
          {campuses.length > 1 && <SelectField label="Campus" name="campusId" defaultValue={f.val("campusId", v.campusId)} options={campuses} error={f.err("campusId")} />}
        </div>
      )}
    </FormDialog>
  );
}

export function EmergencyForm({ v, action }: { v: ProfileValues; action: Action }) {
  const rows = [0, 1, 2];
  return (
    <FormDialog trigger={<><Pencil size={15} aria-hidden="true" />{v.emergency.length ? "Edit" : "Add"}</>} triggerSize="sm" triggerVariant="ghost" title="Emergency contacts" action={action} submitLabel="Save contacts" hidden={{ staffId: v.staffId }} wide>
      {(f) => (
        <>
          <p className="text-ink-2">In the order to call them. Leave a row empty to remove it.</p>
          {rows.map((i) => (
            <fieldset key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
              <legend className="px-1 text-sm font-medium">{i === 0 ? "First to call" : i === 1 ? "Second" : "Third"}</legend>
              <TextField label="Name" name={`name${i}`} defaultValue={f.val(`name${i}`, v.emergency[i]?.name)} error={f.err(`name${i}`)} />
              <TextField label="Relation" name={`relation${i}`} defaultValue={f.val(`relation${i}`, v.emergency[i]?.relation)} error={f.err(`relation${i}`)} placeholder="Spouse" />
              <TextField label="Phone" name={`phone${i}`} inputMode="numeric" defaultValue={f.val(`phone${i}`, v.emergency[i]?.phone)} error={f.err(`phone${i}`)} />
            </fieldset>
          ))}
        </>
      )}
    </FormDialog>
  );
}

export function RestrictedForm({ v, action }: { v: ProfileValues; action: Action }) {
  return (
    <FormDialog trigger={<><Pencil size={15} aria-hidden="true" />Edit</>} triggerSize="sm" triggerVariant="ghost" title="Restricted details" action={action} submitLabel="Save restricted details" hidden={{ staffId: v.staffId }} wide>
      {(f) => (
        <>
          <Alert tone="info">Numbers are stored encrypted. Leave a number empty to keep the one on file. Only the last 4 characters go into the history.</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Aadhaar" name="aadhaar" inputMode="numeric" autoComplete="off" error={f.err("aadhaar")} placeholder="12 digits" />
            <TextField label="PAN" name="pan" autoComplete="off" error={f.err("pan")} placeholder="ABCDE1234F" />
            <TextField label="Bank account number" name="bankAccount" inputMode="numeric" autoComplete="off" error={f.err("bankAccount")} />
            <TextField label="IFSC" name="bankIfsc" defaultValue={f.val("bankIfsc", v.bankIfsc)} error={f.err("bankIfsc")} />
            <TextField label="Bank name" name="bankName" defaultValue={f.val("bankName", v.bankName)} error={f.err("bankName")} />
            <TextField label="UAN (PF)" name="uan" defaultValue={f.val("uan", v.uan)} error={f.err("uan")} />
            <TextField label="ESI number" name="esiNo" defaultValue={f.val("esiNo", v.esiNo)} error={f.err("esiNo")} />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export type ExtraField = { key: string; label: string; fieldType: string; required: boolean; choices: string[]; value: string };

export function ExtraFieldsForm({ staffId, fields, action }: { staffId: string; fields: ExtraField[]; action: Action }) {
  return (
    <FormDialog trigger={<><Pencil size={15} aria-hidden="true" />Edit</>} triggerSize="sm" triggerVariant="ghost" title="Extra fields" action={action} submitLabel="Save extra fields" hidden={{ staffId }}>
      {(f) => (
        <>
          {fields.map((x) => x.fieldType === "yesno" ? (
            <CheckboxField key={x.key} name={`cf:${x.key}`} label={x.label} defaultChecked={x.value === "Yes"} />
          ) : x.fieldType === "choice" ? (
            <SelectField key={x.key} label={x.label} name={`cf:${x.key}`} required={x.required} defaultValue={f.val(`cf:${x.key}`, x.value)} options={x.choices.map((c) => ({ value: c, label: c }))} placeholder="Choose" error={f.err(`cf:${x.key}`)} />
          ) : (
            <TextField key={x.key} label={x.label} name={`cf:${x.key}`} required={x.required} type={x.fieldType === "date" ? "date" : "text"} inputMode={x.fieldType === "number" ? "decimal" : undefined} defaultValue={f.val(`cf:${x.key}`, x.value)} error={f.err(`cf:${x.key}`)} />
          ))}
        </>
      )}
    </FormDialog>
  );
}

export function PhotoForm({ staffId, action, has }: { staffId: string; action: Action; has: boolean }) {
  return (
    <FormDialog trigger={has ? "Change photo" : "Add photo"} triggerSize="sm" triggerVariant="ghost" title="Photo" action={action} submitLabel="Save photo" hidden={{ staffId }} multipart>
      {(f) => (
        <div>
          <label htmlFor="photo-input" className="mb-1 block text-sm font-medium">Photo <span className="text-danger" aria-hidden="true">*</span></label>
          <input id="photo-input" name="photo" type="file" accept="image/jpeg,image/png" required className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" />
          <p className={`mt-1 text-sm ${f.err("photo") ? "text-danger" : "text-ink-2"}`}>{f.err("photo") ?? "JPG or PNG, up to 2 MB. A passport-style photo prints best on the ID card."}</p>
        </div>
      )}
    </FormDialog>
  );
}

export function StatusForm({ staffId, current, action, today }: { staffId: string; current: string; action: Action; today: string }) {
  return (
    <FormDialog trigger="Change status" triggerSize="md" title="Change status" action={action} submitLabel="Change status" hidden={{ staffId }}>
      {(f) => (
        <>
          <SelectField label="New status" name="status" required defaultValue={f.val("status", current === "ACTIVE" ? "ON_LEAVE" : "ACTIVE")} error={f.err("status")}
            options={[{ value: "ACTIVE", label: "Active" }, { value: "ON_LEAVE", label: "On leave (long leave)" }, { value: "SUSPENDED", label: "Suspended" }, { value: "RESIGNED", label: "Resigned (through Staff Exit)" }, { value: "RETIRED", label: "Retired (through Staff Exit)" }, { value: "TERMINATED", label: "Terminated (through Staff Exit)" }]} />
          <TextField label="From date" name="since" type="date" required defaultValue={f.val("since", today)} error={f.err("since")} />
          <TextArea label="Reason" name="reason" required rows={2} defaultValue={f.val("reason")} error={f.err("reason")} help="At least 5 characters. Kept in the history." />
        </>
      )}
    </FormDialog>
  );
}

type Role = { key: string; name: string; lines: string[] };
export function GiveLoginForm({ staffId, roles, defaultRole, modules, action, suggested }: { staffId: string; roles: Role[]; defaultRole: string | null; modules: { key: string; name: string }[]; action: Action; suggested: string }) {
  const [state, formAction] = useActionState(action, null);
  const [open, setOpen] = useState(false);
  // Held by React so a refused save keeps the roles ticked.
  const [roleKeys, setRoleKeys] = useState<string[]>(defaultRole ? [defaultRole] : []);
  if (state?.ok) {
    const data = state.data as { username: string; inviteLink: string };
    return <InviteLink username={data.username} link={data.inviteLink} />;
  }
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Give a login</Button>;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="staffId" value={staffId} />
      {state?.message && <Alert tone="danger">{state.message}</Alert>}
      <fieldset>
        <legend className="mb-2 font-medium">Roles</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <label key={r.key} className="flex items-start gap-3 rounded-lg border border-line p-3">
              <KeepCheck type="checkbox" name="roleKeys" value={r.key} checked={roleKeys.includes(r.key)}
                onChange={(e) => { const on = e.target.checked; setRoleKeys((k) => on ? [...k.filter((x) => x !== r.key), r.key] : k.filter((x) => x !== r.key)); }} className="mt-1 size-5 accent-brand" />
              <span><span className="font-medium">{r.name}</span><span className="block text-xs text-ink-2">{r.lines.slice(0, 3).join(" · ")}{r.lines.length > 3 ? " …" : ""}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextField label="Username" name="username" placeholder={suggested} help="Leave empty to use the school's format." error={state?.errors?.username} />
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer font-medium">Adjust permissions (advanced)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {modules.map((m) => <SelectField key={m.key} label={m.name} name={`perm:${m.key}`} defaultValue="" options={LEVEL_OPTIONS as { value: AccessLevel; label: string }[]} placeholder="As the role" />)}
        </div>
      </details>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        <SubmitButton pendingText="Making login…">Make login and invite</SubmitButton>
      </div>
    </form>
  );
}

export function InviteLink({ username, link }: { username: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const full = typeof window !== "undefined" ? `${window.location.origin}${link}` : link;
  return (
    <div className="rounded-xl border border-success/40 bg-success-soft p-4">
      <p className="font-medium">Sign-in link for {username} (works for 7 days)</p>
      <p className="mt-1 break-all text-sm">{full}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(full); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button>
        <a className={buttonClass("secondary", "sm")} href={`https://wa.me/?text=${encodeURIComponent(`Set your School OS password: ${full} (username ${username})`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
      </div>
      <p className="mt-2 text-sm">Shown only now. Make a new one any time.</p>
    </div>
  );
}

export function NewLinkButton({ staffId, action }: { staffId: string; action: Action }) {
  const [state, formAction] = useActionState(action, null);
  if (state?.ok) {
    const d = state.data as { link: string; username: string };
    return <InviteLink username={d.username} link={d.link} />;
  }
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="staffId" value={staffId} />
      <SubmitButton variant="secondary" size="sm" pendingText="Making link…">New sign-in link</SubmitButton>
      <span className="text-xs text-ink-2">Also resets the password: they set a new one.</span>
      {state && !state.ok && <span role="alert" className="text-sm text-danger">{state.message}</span>}
    </form>
  );
}

export function SwitchLoginForm({ staffId, on, action }: { staffId: string; on: boolean; action: Action }) {
  return (
    <FormDialog trigger={on ? "Switch login on" : "Switch login off"} triggerSize="sm" triggerVariant={on ? "secondary" : "danger-outline"} title={on ? "Switch login on" : "Switch login off"}
      action={action} submitLabel={on ? "Switch login on" : "Switch login off"} submitVariant={on ? "primary" : "danger"} hidden={{ staffId, turn: on ? "on" : "off" }}>
      {(f) => (
        <>
          <p className="text-ink-2">{on ? "They can sign in again with their password." : "They are signed out everywhere at once and cannot sign in to this school."}</p>
          <TextArea label="Reason" name="reason" required rows={2} error={f.err("reason")} defaultValue={f.val("reason")} help="At least 5 characters. Kept in the audit log." />
        </>
      )}
    </FormDialog>
  );
}

export function ReprintForm({ staffId }: { staffId: string }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Print ID card</Button>;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
      <TextField label="Reason for printing again" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Card lost" />
      <a aria-disabled={reason.trim().length < 3} className={`${buttonClass("primary", "sm")} ${reason.trim().length < 3 ? "pointer-events-none opacity-55" : ""}`}
        href={`/staff-hr-management/id-cards?staff=${staffId}&reason=${encodeURIComponent(reason)}`} target="_blank" rel="noopener">Print again</a>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}
