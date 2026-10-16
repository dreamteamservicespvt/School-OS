"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, Alert } from "@/components/ui/alert";
import { CheckboxField, ErrorSummary, SelectField, TextArea, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { BLOOD_GROUPS, CATEGORIES, GENDERS, RELATIONS } from "@/lib/students/labels";
import type { FormState } from "@/lib/forms";
import { addStudent, checkAdmissionNo, parentsForPhone, type AddStudentData } from "../_actions/students";

type Section = { value: string; label: string; seats: number; filled: number };
type Parent = { id: string; name: string; relationship: string; children: string[] };

export function AddStudentForm({ sections, defaultSection, today, nextAdmissionNo, nextRolls, feePlanNote, required, showAadhaar }: {
  sections: Section[]; defaultSection: string; today: string; nextAdmissionNo: string; nextRolls: Record<string, number>;
  feePlanNote: string; required: string[]; showAadhaar: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(addStudent, null);
  const v = (k: string, d = "") => (state && !state.ok ? state.values?.[k] ?? d : d);
  const err = (k: string) => state?.errors?.[k];
  const [sectionId, setSectionId] = useState(v("sectionId", defaultSection));
  const [parents, setParents] = useState<Parent[]>([]);
  const [linkId, setLinkId] = useState(v("linkGuardianId"));
  const [admNote, setAdmNote] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const duplicates = (state?.data as AddStudentData | undefined)?.duplicates ?? [];
  const section = sections.find((s) => s.value === sectionId);
  const left = section ? section.seats - section.filled : null;

  useEffect(() => {
    if (state && !state.ok && !duplicates.length) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state, duplicates.length]);

  const lookPhone = async (phone: string) => {
    const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (digits.length !== 10) { setParents([]); setLinkId(""); return; }
    const found = await parentsForPhone(digits);
    setParents(found);
    if (!found.some((p) => p.id === linkId)) setLinkId("");
  };
  const linked = parents.find((p) => p.id === linkId);
  const req = (k: string) => required.includes(k);

  return (
    <form ref={formRef} action={action} className="space-y-5" key={state?.ok ? "done" : "form"}>
      <FormMessage state={state && !duplicates.length ? state : null} />
      <ErrorSummary errors={state?.errors} />

      {duplicates.length > 0 && (
        <Alert tone="warning" title="This student may already be on record">
          <ul className="mt-1 space-y-1">
            {duplicates.map((d) => (
              <li key={d.id}>
                <strong>{d.fullName}</strong> ({d.admissionNo}): {d.why}.{" "}
                <Link href={`/student-management/students/${d.id}`} className="font-medium underline" target="_blank">Open existing</Link>
              </li>
            ))}
          </ul>
          <TextArea name="duplicateReason" label="Reason to save anyway" required rows={2} className="mt-3"
            help="For example: twins, or a different child with the same name. Kept in the history." defaultValue={v("duplicateReason")} error={err("duplicateReason")} />
          <div className="mt-3"><SubmitButton pendingText="Saving…">Save anyway</SubmitButton></div>
        </Alert>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Student</legend>
        <TextField name="fullName" label="Full name" required autoComplete="off" defaultValue={v("fullName")} error={err("fullName")} className="sm:col-span-2" />
        <SelectField name="sectionId" label="Class and section" required placeholder="Choose" options={sections.map((s) => ({ value: s.value, label: `${s.label} (${Math.max(0, s.seats - s.filled)} seats left)` }))}
          defaultValue={v("sectionId", defaultSection)} onChange={(e) => setSectionId(e.target.value)} error={err("sectionId")}
          help={left === null ? undefined : left > 0 ? `${left} of ${section!.seats} seats left.` : `${section!.label} is full. Choose another section, or add seats in Academic Management.`} />
        <TextField name="dateOfBirth" label="Date of birth" type="date" required max={today} defaultValue={v("dateOfBirth")} error={err("dateOfBirth")} />
        <fieldset>
          <legend className="mb-1 text-[13px] font-semibold text-ink2">Gender<span className="text-bad" aria-hidden="true"> *</span></legend>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <label key={g} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-brand/8">
                <input type="radio" name="gender" value={g} defaultChecked={v("gender") === g} required className="size-4 accent-brand" />{g}
              </label>
            ))}
          </div>
          {err("gender") && <p className="mt-1 text-[13.5px] text-bad">{err("gender")}</p>}
        </fieldset>
        <TextField name="admissionDate" label="Admission date" type="date" required defaultValue={v("admissionDate", today)} error={err("admissionDate")} />
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Parent or guardian</legend>
        <SelectField name="guardianRelation" label="Relation" required options={RELATIONS.map((r) => ({ value: r, label: r }))} defaultValue={v("guardianRelation", "Father")} error={err("guardianRelation")} />
        <TextField name="guardianPhone" label="Parent's phone" required type="tel" inputMode="numeric" autoComplete="off" placeholder="10-digit mobile"
          defaultValue={v("guardianPhone")} error={err("guardianPhone")} onBlur={(e) => lookPhone(e.target.value)}
          onChange={(e) => { if (e.target.value.replace(/\D/g, "").length >= 10) void lookPhone(e.target.value); }}
          help="+91. A parent already on record with this phone can be linked (brother or sister)." />
        {parents.length > 0 && (
          <div className="rounded-xl border border-brand/40 bg-brand/8 p-3 sm:col-span-2" role="status">
            <p className="font-medium">This phone belongs to a parent already on record.</p>
            <div className="mt-2 space-y-2">
              {parents.map((p) => (
                <label key={p.id} className="flex min-h-11 items-start gap-2">
                  <input type="radio" name="linkChoice" checked={linkId === p.id} onChange={() => setLinkId(p.id)} className="mt-1 size-4 accent-brand" />
                  <span>Link <strong>{p.name}</strong> ({p.relationship}{p.children.length ? `, parent of ${p.children.join(", ")}` : ""})</span>
                </label>
              ))}
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="linkChoice" checked={!linkId} onChange={() => setLinkId("")} className="size-4 accent-brand" />
                <span>Add as a new parent</span>
              </label>
            </div>
          </div>
        )}
        <input type="hidden" name="linkGuardianId" value={linkId} />
        <TextField name="guardianName" label="Parent's or guardian's name" required className="sm:col-span-2"
          defaultValue={linked?.name ?? v("guardianName")} key={linked?.id ?? "new"} readOnly={Boolean(linked)} error={err("guardianName")}
          help={linked ? "Linked to the existing parent. Their details are changed on the parent's page." : undefined} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Numbers</legend>
        <TextField name="admissionNo" label="Admission number" autoComplete="off" placeholder={nextAdmissionNo}
          defaultValue={v("admissionNo")} error={err("admissionNo") ?? admNote ?? undefined}
          onBlur={async (e) => { const r = await checkAdmissionNo(e.target.value); setAdmNote(r.taken); }}
          help={`Leave empty for the next number (${nextAdmissionNo}). Type one only when moving old records.`} />
        <TextField name="rollNo" label="Roll number" inputMode="numeric" placeholder={sectionId && nextRolls[sectionId] ? String(nextRolls[sectionId]) : "Next free number"}
          defaultValue={v("rollNo")} error={err("rollNo")} help="Leave empty for the next free number in the section." />
      </fieldset>

      <CheckboxField name="applyFeePlan" label="Apply class fee plan" defaultChecked={state && !state.ok ? state.values?.applyFeePlan === "on" : true} help={feePlanNote} />

      <details className="rounded-xl border border-line" open={[...required, "bloodGroup", "category", "religion", "motherTongue", "address", "aadhaar", "previousSchool"].some((k) => v(k)) || required.length > 0 || undefined}>
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">More details</summary>
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
          <SelectField name="bloodGroup" label="Blood group" required={req("bloodGroup")} placeholder="Not known" options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))} defaultValue={v("bloodGroup")} error={err("bloodGroup")} />
          <SelectField name="category" label="Category" required={req("category")} placeholder="Choose" options={CATEGORIES.map((c) => ({ value: c, label: c }))} defaultValue={v("category")} error={err("category")} />
          <TextField name="religion" label="Religion" required={req("religion")} defaultValue={v("religion")} error={err("religion")} />
          <TextField name="motherTongue" label="Mother tongue" required={req("motherTongue")} defaultValue={v("motherTongue")} error={err("motherTongue")} />
          <TextArea name="address" label="Address" required={req("address")} rows={2} className="sm:col-span-2" defaultValue={v("address")} error={err("address")} />
          {showAadhaar && <TextField name="aadhaar" label="Aadhaar number" required={req("aadhaar")} inputMode="numeric" autoComplete="off" defaultValue={v("aadhaar")} error={err("aadhaar")} help="Restricted. Stored encrypted and shown masked." />}
          <TextField name="previousSchool" label="Previous school" required={req("previousSchool")} className="sm:col-span-2" defaultValue={v("previousSchool")} error={err("previousSchool")} />
          <p className="text-[13.5px] text-ink2 sm:col-span-2">Photo, identifiers, emergency contacts and the school&apos;s extra fields are added on the Student Profile after saving.</p>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        {!duplicates.length && <SubmitButton pendingText="Adding…">Add student</SubmitButton>}
        <Link href="/student-management" className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-ink2 transition hover:bg-sunken hover:text-ink">Cancel</Link>
      </div>
    </form>
  );
}
