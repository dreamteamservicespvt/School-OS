"use client";

// The application form at the counter (02 §2 "Form fields: New application").
// Opened from an enquiry, everything known is already filled. The class list
// shows seats left; previous school is asked for Class 2 and above.

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { CheckboxField, ErrorSummary, SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomFieldDef, CustomValues } from "@/lib/custom-field-rules";
import { saveApplicationAction } from "./actions";

export type FormClass = { value: string; label: string; previousSchool: boolean; seatsText: string; full: boolean };

export type ApplicationValues = Partial<Record<
  "id" | "enquiryId" | "classId" | "yearId" | "firstName" | "lastName" | "dateOfBirth" | "gender" | "fatherName" | "motherName" | "guardianName" | "guardianRelation" |
  "phone" | "altPhone" | "email" | "address" | "previousSchool" | "previousClass" | "previousMarks" | "secondLanguage" | "transportStop" | "category" | "religion" | "motherTongue" | "occupation",
  string | null
>> & { transportNeeded?: boolean; hostelNeeded?: boolean; customFields?: CustomValues };

type Props = {
  classes: FormClass[];
  years: Option[];
  genders: readonly string[];
  relations: readonly string[];
  categories: string[];
  restricted: boolean;
  customFields: CustomFieldDef[];
  values: ApplicationValues;
  parentHint?: string | null;
  cancelHref: string;
};

export function ApplicationForm(p: Props) {
  const [state, formAction] = useActionState(saveApplicationAction, null);
  const [force, setForce] = useState(false);
  const [classId, setClassId] = useState(state?.values?.classId ?? p.values.classId ?? "");
  const [dismissedFor, setDismissedFor] = useState<unknown>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (state?.ok && state.data?.id && !done.current) { done.current = true; router.push(`/admission-management/applications/${state.data.id}`); }
  }, [state, router]);
  const val = (k: keyof ApplicationValues) => state?.values?.[k] ?? (typeof p.values[k] === "string" ? (p.values[k] as string) : undefined);
  const err = (k: string) => state?.errors?.[k];
  const cls = p.classes.find((c) => c.value === classId);
  const matches = dismissedFor !== state ? state?.data?.matches ?? [] : [];
  const many = state?.errors && Object.keys(state.errors).length > 1;
  const edit = Boolean(p.values.id);

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {p.values.id && <input type="hidden" name="id" value={p.values.id} />}
      {p.values.enquiryId && <input type="hidden" name="enquiryId" value={p.values.enquiryId} />}
      {force && <input type="hidden" name="force" value="1" />}
      {many ? <ErrorSummary errors={state?.errors} /> : state && !state.ok && matches.length === 0 && state.message && <Alert tone="danger">{state.message}</Alert>}
      {matches.length > 0 && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn-bg p-4 text-warn-text">
          <p className="font-medium">This child may already have an application</p>
          <ul className="mt-2 space-y-1 text-sm">{matches.map((m) => <li key={`${m.kind}-${m.id}`}>{m.text}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={matches[0].href} className={buttonClass("secondary", "sm")}>Open existing</Link>
            <Button size="sm" variant="secondary" onClick={() => { setForce(true); setDismissedFor(state); setTimeout(() => formRef.current?.requestSubmit(), 0); }}>Save anyway</Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissedFor(state)}>Cancel</Button>
          </div>
        </div>
      )}

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-lg font-semibold">Admission</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Admission year" name="yearId" required options={p.years} defaultValue={val("yearId")} error={err("yearId")} disabled={edit} />
          {edit && <input type="hidden" name="yearId" value={p.values.yearId ?? ""} />}
          <SelectField label="Class applied for" name="classId" required options={p.classes.map((c) => ({ value: c.value, label: `${c.label} · ${c.seatsText}` }))} placeholder="Choose" value={classId} onChange={(e) => setClassId(e.target.value)} error={err("classId")} />
        </div>
        {cls?.full && <p className="mt-2 text-sm text-warn-text">{cls.label} is full. The application can still be made; the decision will offer the waiting list.</p>}
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-lg font-semibold">Child</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" name="firstName" required maxLength={80} defaultValue={val("firstName")} error={err("firstName")} />
          <TextField label="Last name" name="lastName" maxLength={80} defaultValue={val("lastName")} error={err("lastName")} />
          <TextField label="Date of birth" name="dateOfBirth" type="date" required defaultValue={val("dateOfBirth")} error={err("dateOfBirth")} help="Checked against the class age rule, if the school sets one." />
          <SelectField label="Gender" name="gender" required options={p.genders.map((g) => ({ value: g, label: g }))} placeholder="Choose" defaultValue={val("gender")} error={err("gender")} />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-lg font-semibold">Parents</legend>
        <p className="mb-3 text-sm text-ink-2">Give at least one name.{p.parentHint ? ` From the enquiry: ${p.parentHint}. Move it to the right box if needed.` : ""}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Father's name" name="fatherName" maxLength={120} defaultValue={val("fatherName")} error={err("fatherName")} />
          <TextField label="Mother's name" name="motherName" maxLength={120} defaultValue={val("motherName")} error={err("motherName")} />
          <TextField label="Guardian's name" name="guardianName" maxLength={120} defaultValue={val("guardianName")} error={err("guardianName")} help="Only if the child lives with a guardian." />
          <SelectField label="Guardian's relation" name="guardianRelation" options={p.relations.map((r) => ({ value: r, label: r }))} placeholder="Choose" defaultValue={val("guardianRelation")} error={err("guardianRelation")} />
          <TextField label="Parent's phone" name="phone" required inputMode="tel" defaultValue={val("phone")} error={err("phone")} help="Brothers and sisters already in the school are found from this number." />
          <TextField label="Other phone" name="altPhone" inputMode="tel" defaultValue={val("altPhone")} error={err("altPhone")} />
          <TextField label="Email" name="email" type="email" maxLength={200} defaultValue={val("email")} error={err("email")} />
          <TextField label="Occupation" name="occupation" maxLength={80} defaultValue={val("occupation")} error={err("occupation")} />
          <TextArea label="Address" name="address" required className="sm:col-span-2" rows={2} maxLength={400} defaultValue={val("address")} error={err("address")} />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-lg font-semibold">Previous school</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Previous school" name="previousSchool" required={cls?.previousSchool} maxLength={150} defaultValue={val("previousSchool")} error={err("previousSchool")} className="sm:col-span-3" />
          <TextField label="Last class" name="previousClass" maxLength={40} defaultValue={val("previousClass")} error={err("previousClass")} />
          <TextField label="Marks or %" name="previousMarks" maxLength={40} placeholder="82% or A2" defaultValue={val("previousMarks")} error={err("previousMarks")} />
        </div>
        {cls && !cls.previousSchool && <p className="mt-2 text-sm text-ink-2">Not needed for {cls.label}.</p>}
      </fieldset>

      <details className="rounded-2xl border border-line bg-surface p-5" open={Boolean(val("secondLanguage") || val("category") || val("religion"))}>
        <summary className="cursor-pointer text-lg font-semibold">Preferences and more details</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Second language" name="secondLanguage" maxLength={40} defaultValue={val("secondLanguage")} />
          {p.categories.length > 0 && <SelectField label="Category" name="category" options={p.categories.map((c) => ({ value: c, label: c }))} placeholder="Not given" defaultValue={val("category")} error={err("category")} />}
          <TextField label="Religion" name="religion" maxLength={40} defaultValue={val("religion")} />
          <TextField label="Mother tongue" name="motherTongue" maxLength={40} defaultValue={val("motherTongue")} />
          <CheckboxField label="Transport needed" name="transportNeeded" defaultChecked={p.values.transportNeeded} help="Used when Transport is switched on." />
          <TextField label="Transport stop" name="transportStop" maxLength={80} defaultValue={val("transportStop")} />
          <CheckboxField label="Hostel needed" name="hostelNeeded" defaultChecked={p.values.hostelNeeded} />
          {p.restricted && <TextField label="Child's Aadhaar (restricted)" name="aadhaar" inputMode="numeric" maxLength={14} error={err("aadhaar")} help={edit ? "Leave empty to keep what is saved. Only the Principal and School Admin see this." : "Only the Principal and School Admin see this."} />}
        </div>
        {p.customFields.length > 0 && (
          <div className="mt-4">
            <CustomFieldInputs fields={p.customFields} values={state?.values ?? p.values.customFields} errors={Object.fromEntries(Object.entries(state?.errors ?? {}).filter(([k]) => k.startsWith("cf_")).map(([k, v]) => [k.slice(3), v]))} />
          </div>
        )}
      </details>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={p.cancelHref} className={buttonClass("secondary")}>Cancel</Link>
        <SubmitButton pendingText="Saving…">{edit ? "Save changes" : "Save application"}</SubmitButton>
      </div>
      {!edit && <p className="text-sm text-ink-2">Consent, papers and the fee are taken on the next screen.</p>}
    </form>
  );
}
