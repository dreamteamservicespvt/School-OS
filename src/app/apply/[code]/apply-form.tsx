"use client";

// The online admission form a parent fills on their phone, without a login
// (02 §2, §10). Their mobile is confirmed with a one-time code when they give
// data consent; the school sees the application as "Submitted online".
import { useActionState, useState, useTransition } from "react";
import { CircleCheck, IndianRupee, Send, ShieldCheck } from "lucide-react";
import type { FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField, TextArea, TextField, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { KeepCheck } from "@/components/ui/keep-select";
import { FormProblem, PhoneField, SegField, SubHead, Submit } from "@/app/(school)/admission-management/_components/forms";
import { checkApplyCodeAction, sendApplyCodeAction, submitApplyAction } from "./actions";

type Cls = { id: string; name: string; fee: string | null; minAge: number | null; maxAge: number | null; previousSchool: boolean; previousSchoolNeeded: boolean };
type Consent = { type: string; title: string; text: string; required: boolean };

export function ApplyForm({ code, yearId, yearName, classes, preset, consents, categories, sources, relations, onlinePayment }: {
  code: string; yearId: string; yearName: string; classes: Cls[]; preset: string | null; consents: Consent[]; categories: string[]; sources: { key: string; label: string }[]; relations: string[]; onlinePayment: boolean;
}) {
  const [state, formAction] = useActionState(submitApplyAction.bind(null, code), null as FormState<unknown>);
  const [classId, setClassId] = useState(preset ?? "");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Held by React so a refused send keeps the ticks (APPLY-01).
  const [agreed, setAgreed] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const val = (k: string) => state?.values?.[k];
  const err = (k: string) => state?.errors?.[k];
  const cls = classes.find((c) => c.id === classId);
  const digits = phone.replace(/\D/g, "").slice(-10);
  const phoneOk = /^[6-9]\d{9}$/.test(digits);
  const onPhone = (v: string) => {
    setPhone(v);
    if (v.replace(/\D/g, "").slice(-10) !== digits) { setSent(null); setConfirmed(null); setOtp(""); setMsg(null); }
  };
  const send = () => start(async () => {
    const r = await sendApplyCodeAction(code, digits);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setSent(digits); setOtp(""); }
  });
  const check = () => start(async () => {
    const r = await checkApplyCodeAction(code, digits, otp);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setConfirmed(digits);
  });
  const ready = confirmed === digits && phoneOk;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="yearId" value={yearId} />
      <input type="hidden" name="code" value={ready ? otp : ""} />
      <FormProblem state={state} />

      <Card className="p-4 md:p-5 flex flex-col gap-4">
        <SubHead>Class</SubHead>
        <SelectField label={`Class wanted in ${yearName}`} name="classId" required options={classes.map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose the class"
          value={classId} onChange={(e) => setClassId(e.target.value)} error={err("classId")}
          help={cls ? [cls.minAge || cls.maxAge ? `Age ${cls.minAge ?? "any"} to ${cls.maxAge ?? "any"} on 1 June` : null, cls.fee ? `Application fee ${cls.fee}` : null].filter(Boolean).join(" · ") || undefined : undefined} />
      </Card>

      <Card className="p-4 md:p-5 flex flex-col gap-4">
        <SubHead>Child</SubHead>
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="First name" name="firstName" required maxLength={80} autoComplete="off" defaultValue={val("firstName")} error={err("firstName")} />
          <TextField label="Last name" name="lastName" maxLength={80} autoComplete="off" defaultValue={val("lastName")} error={err("lastName")} />
          <TextField label="Date of birth" name="dateOfBirth" type="date" required defaultValue={val("dateOfBirth")} error={err("dateOfBirth")} className="tnum" />
          <SegField name="gender" label="Gender" required defaultValue={val("gender") ?? "Female"} options={[{ value: "Female", label: "Girl" }, { value: "Male", label: "Boy" }, { value: "Other", label: "Other" }]} />
        </div>
        {categories.length > 0 && <SelectField label="Category" name="category" options={categories.map((c) => ({ value: c, label: c }))} placeholder="Not given" defaultValue={val("category") ?? ""} error={err("category")} />}
      </Card>

      <Card className="p-4 md:p-5 flex flex-col gap-4">
        <SubHead>Parents</SubHead>
        <p className="text-[13px] text-ink3 -mt-2">Give at least one parent’s or guardian’s name.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="Father’s name" name="fatherName" maxLength={120} defaultValue={val("fatherName")} error={err("fatherName")} />
          <TextField label="Mother’s name" name="motherName" maxLength={120} defaultValue={val("motherName")} error={err("motherName")} />
          <TextField label="Guardian’s name" name="guardianName" maxLength={120} defaultValue={val("guardianName")} error={err("guardianName")} help="Only if not the father or mother" />
          <SelectField label="Guardian is the child’s" name="guardianRelation" options={relations.map((r) => ({ value: r, label: r }))} placeholder="Choose" defaultValue={val("guardianRelation") ?? ""} error={err("guardianRelation")} />
          <PhoneField name="phone" label="Mobile number" required defaultValue={val("phone")} error={err("phone")} help="The school calls and messages you on this number." onValue={onPhone} />
          <PhoneField name="altPhone" label="Other mobile" defaultValue={val("altPhone")} error={err("altPhone")} />
          <TextField label="Email" name="email" type="email" maxLength={120} autoComplete="email" defaultValue={val("email")} error={err("email")} className="sm:col-span-2" />
        </div>
        <TextArea label="Home address" name="address" required rows={2} maxLength={400} defaultValue={val("address")} error={err("address")} />
      </Card>

      {cls?.previousSchool && (
        <Card className="p-4 md:p-5 flex flex-col gap-4">
          <SubHead>Previous school</SubHead>
          <div className="grid sm:grid-cols-3 gap-3">
            <TextField label="School name" name="previousSchool" required={cls.previousSchoolNeeded} maxLength={150} defaultValue={val("previousSchool")} error={err("previousSchool")} className="sm:col-span-3" />
            <TextField label="Last class" name="previousClass" maxLength={40} defaultValue={val("previousClass")} error={err("previousClass")} />
            <TextField label="Marks or %" name="previousMarks" maxLength={40} defaultValue={val("previousMarks")} error={err("previousMarks")} />
          </div>
        </Card>
      )}

      {sources.length > 0 && (
        <Card className="p-4 md:p-5">
          <SelectField label="How did you hear about us?" name="heardFrom" options={sources.map((s) => ({ value: s.key, label: s.label }))} placeholder="Choose, if you like" defaultValue={val("heardFrom") ?? ""} />
        </Card>
      )}

      <Card className="p-4 md:p-5 flex flex-col gap-4">
        <SubHead>Consent</SubHead>
        {consents.map((c) => (
          <div key={c.type} className="flex items-start gap-3">
            <KeepCheck id={`consent-${c.type}`} type="checkbox" name="consent" value={c.type} checked={agreed.includes(c.type)}
              onChange={(e) => { const on = e.target.checked; setAgreed((a) => on ? [...a.filter((t) => t !== c.type), c.type] : a.filter((t) => t !== c.type)); }} className="mt-0.5 size-5 shrink-0 rounded-md accent-brand" />
            <div className="min-w-0">
              <label htmlFor={`consent-${c.type}`} className="text-[14.5px] font-semibold">{c.title}{c.required && <span className="text-bad" aria-hidden="true"> *</span>}</label>
              <details className="text-[13px] text-ink3"><summary className="cursor-pointer text-brand font-semibold w-fit">Read the full text</summary><p className="mt-1 whitespace-pre-line">{c.text}</p></details>
            </div>
          </div>
        ))}
        {err("consent") && <p className="text-[12.5px] text-bad" role="alert">{err("consent")}</p>}
        <TextField label="Your name" name="givenByName" required maxLength={120} defaultValue={val("givenByName")} error={err("givenByName")} help="The parent or guardian giving consent" />
        <div className="rounded-xl bg-sunken/60 p-3.5 flex flex-col gap-3">
          <p className="text-[13.5px] text-ink2 flex items-start gap-2"><ShieldCheck size={17} className="shrink-0 mt-0.5 text-brand" aria-hidden="true" /><span>We send a one-time code to <b className="font-semibold text-ink tnum">{phoneOk ? `+91 ${digits}` : "your mobile"}</b> to confirm it is you.</span></p>
          {ready ? (
            <p className="text-[14px] font-semibold text-ok flex items-center gap-2"><CircleCheck size={18} aria-hidden="true" />Mobile number confirmed</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant={sent ? "secondary" : "primary"} icon={Send} disabled={!phoneOk || busy} onClick={send}>{sent ? "Send again" : "Send code"}</Button>
              {sent && (
                <>
                  <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="One-time code"
                    className={cx(inputCls(Boolean(err("code"))), "h-11 tnum tracking-widest sm:w-40")} />
                  <Button variant="primary" disabled={otp.length !== 6 || busy} onClick={check}>Confirm</Button>
                </>
              )}
            </div>
          )}
          {msg && !ready && <p className={cx("text-[13px]", msg.ok ? "text-ink2" : "text-bad")} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
          {err("code") && !msg && <p className="text-[13px] text-bad" role="alert">{err("code")}</p>}
        </div>
      </Card>

      {cls?.fee && (
        <p className="text-[13.5px] text-ink2 flex items-start gap-2 px-1"><IndianRupee size={16} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" />
          {onlinePayment ? `After you send the form, you can pay the application fee of ${cls.fee} online. The receipt is made once the payment is confirmed.` : `The application fee of ${cls.fee} is paid at the school office.`}
        </p>
      )}
      <Submit busyLabel="Sending…" icon={Send} disabled={!ready} className="w-full sm:w-auto sm:self-end">Send application</Submit>
      {!ready && <p className="text-[12.5px] text-ink3 text-center sm:text-right -mt-2">Confirm your mobile number above to send.</p>}
    </form>
  );
}
