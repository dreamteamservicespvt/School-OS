"use client";

// The application form at the counter (02 §2 "Form fields: New application"),
// in the approved design (mod-admissions.jsx NewApplicationSheet). Opened from
// an enquiry, everything known is already filled. The class list shows seats
// left; previous school is asked for Class 2 and above. A new application is
// saved only once the guardian agrees to the data consent with a one-time code.

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Hash, Send, ShieldCheck, Users } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/chips";
import { Checkbox, Switch } from "@/components/ui/controls";
import { FieldShell, inputCls, SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomFieldDef, CustomValues } from "@/lib/custom-field-rules";
import { FormProblem, MoreDetails, PhoneField, SegField, SubHead, Submit } from "../_components/forms";
import { checkFormCodeAction, saveApplicationAction, sendFormCodeAction } from "./actions";

export type FormClass = { value: string; label: string; previousSchool: boolean; seatsText: string; full: boolean };

export type ApplicationValues = Partial<Record<
  "id" | "enquiryId" | "classId" | "yearId" | "firstName" | "lastName" | "dateOfBirth" | "gender" | "fatherName" | "motherName" | "guardianName" | "guardianRelation" |
  "phone" | "altPhone" | "email" | "address" | "previousSchool" | "previousClass" | "previousMarks" | "secondLanguage" | "transportStop" | "category" | "religion" | "motherTongue" | "occupation",
  string | null
>> & { transportNeeded?: boolean; hostelNeeded?: boolean; customFields?: CustomValues };

type Props = {
  classes: FormClass[];
  years: Option[];
  relations: readonly string[];
  categories: string[];
  restricted: boolean;
  customFields: CustomFieldDef[];
  values: ApplicationValues;
  parentHint?: string | null;
  cancelHref: string;
  /** The consent text version shown to the guardian, e.g. "version 2". */
  consentVersion?: string | null;
  photoConsentAsked?: boolean;
  applicationNo?: string | null;
};

const GENDER_OPTIONS = [{ value: "Female", label: "Girl" }, { value: "Male", label: "Boy" }, { value: "Other", label: "Other" }];

export function ApplicationForm(p: Props) {
  const [state, formAction] = useActionState(saveApplicationAction, null);
  const [force, setForce] = useState(false);
  const [classId, setClassId] = useState(state?.values?.classId ?? p.values.classId ?? "");
  const [dismissedFor, setDismissedFor] = useState<unknown>(null);
  const [transport, setTransport] = useState(Boolean(p.values.transportNeeded));
  const [hostel, setHostel] = useState(Boolean(p.values.hostelNeeded));
  const [phone, setPhone] = useState(p.values.phone ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [photo, setPhoto] = useState(false);
  const [busy, start] = useTransition();
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
  const edit = Boolean(p.values.id);
  const digits = phone.replace(/\D/g, "").slice(-10);
  const phoneOk = /^[6-9]\d{9}$/.test(digits);
  // A new phone number needs a new code.
  useEffect(() => { setSent(null); setChecked(false); setCode(""); setCodeMsg(null); }, [digits]);

  const sendCode = () => start(async () => {
    const r = await sendFormCodeAction(digits);
    setCodeMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setSent(digits); setChecked(false); setCode(""); }
  });
  const checkCode = () => start(async () => {
    const r = await checkFormCodeAction(digits, code);
    setChecked(r.ok);
    setCodeMsg({ ok: r.ok, text: r.ok ? "Data consent confirmed with the code. It is saved with the form." : r.message });
  });

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5 max-w-3xl">
      {p.values.id && <input type="hidden" name="id" value={p.values.id} />}
      {p.values.enquiryId && <input type="hidden" name="enquiryId" value={p.values.enquiryId} />}
      {force && <input type="hidden" name="force" value="1" />}
      {matches.length === 0 && <FormProblem state={state} />}
      {matches.length > 0 && (
        <div role="alert" className="rounded-2xl bg-warn/10 p-4">
          <p className="font-semibold flex items-center gap-2"><CircleAlert size={17} className="text-warn" aria-hidden="true" />This child may already have an application</p>
          <ul className="mt-2 space-y-1 text-[14px] text-ink2">{matches.map((m) => <li key={`${m.kind}-${m.id}`}>{m.text}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={matches[0].href} className={buttonClass("secondary", "sm")}>Open existing</Link>
            <Button size="sm" variant="secondary" onClick={() => { setForce(true); setDismissedFor(state); setTimeout(() => formRef.current?.requestSubmit(), 0); }}>Save anyway</Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissedFor(state)}>Cancel</Button>
          </div>
        </div>
      )}

      <Card className="p-4 md:p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-2.5 text-[13.5px]">
          <Hash size={16} className="text-ink3" aria-hidden="true" /><span className="text-ink3">Application number</span>
          <b className="font-mono font-semibold text-[13px] ml-auto">{p.applicationNo ?? "Given when saved"}</b>
        </div>
        <SubHead>Child</SubHead>
        <div className="grid md:grid-cols-2 gap-3">
          {edit ? (
            <>
              <input type="hidden" name="yearId" value={p.values.yearId ?? ""} />
              <FieldShell label="Admission year" id="na-year"><p id="na-year" className="h-11 flex items-center px-3.5 rounded-xl bg-sunken text-ink2">{p.years.find((y) => y.value === p.values.yearId)?.label ?? ""}</p></FieldShell>
            </>
          ) : (
            <SelectField label="Admission year" name="yearId" required options={p.years} defaultValue={val("yearId")} error={err("yearId")} />
          )}
          <FieldShell label="Class applied for" id="na-cls" required error={err("classId")}
            help={cls ? (cls.full ? <span className="text-warn font-semibold">{cls.label} is full. The application can still go on the waiting list.</span> : `Seats left · ${cls.seatsText}`) : undefined}>
            <select id="na-cls" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)} aria-invalid={err("classId") ? true : undefined} className={cx(inputCls(err("classId")), "h-11 pr-9")}>
              <option value="">Choose class</option>
              {p.classes.map((c) => <option key={c.value} value={c.value}>{c.label}{c.full ? " (full)" : ""}</option>)}
            </select>
          </FieldShell>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <TextField label="First name" name="firstName" required maxLength={80} placeholder="As on the birth certificate" defaultValue={val("firstName")} error={err("firstName")} />
          <TextField label="Last name" name="lastName" maxLength={80} defaultValue={val("lastName")} error={err("lastName")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Date of birth" name="dateOfBirth" type="date" required defaultValue={val("dateOfBirth")} error={err("dateOfBirth")} className="tnum" />
          <div>
            <SegField name="gender" label="Gender" required size="sm" options={GENDER_OPTIONS} defaultValue={val("gender") ?? ""} />
            {err("gender") && <p className="mt-1 text-[12.5px] text-bad">{err("gender")}</p>}
          </div>
        </div>

        <SubHead>Parents</SubHead>
        {p.parentHint && <p className="text-[13px] text-ink3 -mt-2">From the enquiry: {p.parentHint}. Move it to the right box if needed.</p>}
        <div className="grid md:grid-cols-2 gap-3">
          <TextField label="Father’s name" name="fatherName" maxLength={120} defaultValue={val("fatherName")} error={err("fatherName")} />
          <TextField label="Mother’s name" name="motherName" maxLength={120} defaultValue={val("motherName")} error={err("motherName")} help="At least one parent or guardian" />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <PhoneField name="phone" label="Parent’s phone" required defaultValue={val("phone") ?? undefined} error={err("phone")} help="Brothers and sisters already in the school are found from this number."
            onValue={setPhone} />
          <PhoneField name="altPhone" label="Other phone" defaultValue={val("altPhone") ?? undefined} error={err("altPhone")} />
        </div>
        <TextArea label="Home address" name="address" required rows={2} maxLength={400} placeholder="House number, street, area, PIN code" defaultValue={val("address")} error={err("address")} />

        {(!cls || cls.previousSchool || val("previousSchool")) && (
          <>
            <SubHead>Previous school</SubHead>
            <div className="grid md:grid-cols-3 gap-3">
              <TextField label="School name" name="previousSchool" required={cls?.previousSchool} maxLength={150} defaultValue={val("previousSchool")} error={err("previousSchool")} />
              <TextField label="Last class" name="previousClass" maxLength={40} placeholder="Class 4 (2025-26)" defaultValue={val("previousClass")} error={err("previousClass")} />
              <TextField label="Marks or %" name="previousMarks" maxLength={40} placeholder="86% or A1" defaultValue={val("previousMarks")} error={err("previousMarks")} />
            </div>
          </>
        )}

        <SubHead>Preferences</SubHead>
        <div className="grid md:grid-cols-2 gap-3">
          <TextField label="Second language" name="secondLanguage" maxLength={40} placeholder="Telugu or Hindi" defaultValue={val("secondLanguage")} />
          <div className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
            <div className="flex items-center gap-3 text-[14px]"><Switch on={transport} onChange={setTransport} label="Transport needed" /><span className="font-semibold">Transport needed</span></div>
            {transport && <input type="hidden" name="transportNeeded" value="on" />}
            {transport && <input name="transportStop" aria-label="Pick-up place" maxLength={80} placeholder="Pick-up place, e.g. Miyapur X Roads" defaultValue={val("transportStop")} className={cx(inputCls(false), "h-10")} />}
            <div className="flex items-center gap-3 text-[14px]"><Switch on={hostel} onChange={setHostel} label="Hostel needed" /><span className="font-semibold">Hostel needed</span></div>
            {hostel && <input type="hidden" name="hostelNeeded" value="on" />}
          </div>
        </div>

        <MoreDetails defaultOpen={Boolean(val("email") || val("category") || val("religion") || val("occupation") || err("email") || err("aadhaar"))}>
          <div className="grid md:grid-cols-2 gap-3">
            <TextField label="Email" name="email" type="email" maxLength={200} placeholder="name@example.com" defaultValue={val("email")} error={err("email")} />
            <TextField label="Occupation" name="occupation" maxLength={80} defaultValue={val("occupation")} error={err("occupation")} />
            <TextField label="Guardian’s name" name="guardianName" maxLength={120} defaultValue={val("guardianName")} error={err("guardianName")} help="Only if the child lives with a guardian." />
            <SelectField label="Guardian’s relation" name="guardianRelation" options={p.relations.map((r) => ({ value: r, label: r }))} placeholder="Choose" defaultValue={val("guardianRelation")} error={err("guardianRelation")} />
            <TextField label="Mother tongue" name="motherTongue" maxLength={40} defaultValue={val("motherTongue")} />
            <TextField label="Religion" name="religion" maxLength={40} defaultValue={val("religion")} />
            {p.categories.length > 0 && <SelectField label="Category" name="category" options={p.categories.map((c) => ({ value: c, label: c }))} placeholder="Not given" defaultValue={val("category")} error={err("category")} />}
            {p.restricted && <TextField label="Aadhaar (student)" name="aadhaar" inputMode="numeric" maxLength={14} placeholder="XXXX XXXX XXXX" error={err("aadhaar")} help={edit ? "Restricted. Leave empty to keep what is saved." : "Restricted. Only the Principal and School Admin see it."} />}
          </div>
          {p.customFields.length > 0 && (
            <CustomFieldInputs fields={p.customFields} values={state?.values ?? p.values.customFields} errors={Object.fromEntries(Object.entries(state?.errors ?? {}).filter(([k]) => k.startsWith("cf_")).map(([k, v]) => [k.slice(3), v]))} />
          )}
        </MoreDetails>

        {!edit && (
          <>
            <SubHead>Consent (DPDP Act 2023)</SubHead>
            <div className={cx("rounded-xl border p-3.5 flex flex-col gap-3", err("code") ? "border-bad ring-4 ring-bad/10" : "border-line")}>
              <p className="text-[13.5px] text-ink2 leading-relaxed">
                The guardian agrees to the school’s consent text{p.consentVersion ? ` (${p.consentVersion})` : ""} for the child’s data. A one-time code goes to <b className="font-semibold text-ink tnum">+91 {digits || "…"}</b>.
              </p>
              <input type="hidden" name="consent_data-processing" value={checked ? "on" : ""} />
              {checked ? (
                <>
                  <input type="hidden" name="code" value={code} />
                  <p className="text-[14px] font-semibold text-ok flex items-center gap-2"><ShieldCheck size={18} aria-hidden="true" />Data consent given, confirmed with the code</p>
                </>
              ) : !sent ? (
                <Button type="button" variant="soft" icon={Send} className="self-start" disabled={!phoneOk || busy} loading={busy} loadingText="Sending…" onClick={sendCode}>Send one-time code</Button>
              ) : (
                <div className="flex gap-2 items-end">
                  <FieldShell label="Code from the guardian" id="na-otp" className="flex-1">
                    <input id="na-otp" name="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" className={cx(inputCls(false), "h-11 tnum tracking-widest")} />
                  </FieldShell>
                  <Button type="button" variant="primary" disabled={code.length !== 6 || busy} loading={busy} onClick={checkCode}>Confirm</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={sendCode}>Send again</Button>
                </div>
              )}
              {!phoneOk && !checked && <p className="text-[12.5px] text-ink3">Type the parent’s phone above first.</p>}
              {p.photoConsentAsked !== false && (
                <div className="flex items-start gap-3 text-[13.5px]">
                  <Checkbox checked={photo} onChange={setPhoto} label="Photo consent" />
                  <span><b className="font-semibold">Photo consent</b> <span className="text-ink3">(separate): the child’s photo may be used in the gallery and on social media. Confirmed with the same code.</span></span>
                  {photo && <input type="hidden" name="consent_photo" value="on" />}
                </div>
              )}
              {codeMsg && <p role="status" className={cx("text-[12.5px] flex items-center gap-1.5", codeMsg.ok ? "text-ok" : "text-bad")}>{!codeMsg.ok && <CircleAlert size={14} aria-hidden="true" />}{codeMsg.text}</p>}
              {err("code") && !codeMsg && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><CircleAlert size={14} aria-hidden="true" />{err("code")}</p>}
            </div>
          </>
        )}
        {p.values.enquiryId && !edit && <Banner tone="info" icon={Users}>Saving sets the enquiry to Applied, so the family shows once in the funnel.</Banner>}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={p.cancelHref} className={buttonClass("secondary")}>Cancel</Link>
        <Submit busyLabel="Saving…">{edit ? "Save changes" : "Save application"}</Submit>
      </div>
    </form>
  );
}
