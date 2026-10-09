"use client";

// Add and edit an enquiry (02 §2): five fields up front, more details folded
// away, and the duplicate check when the phone or email is left (02 Done
// when 2). A match shows a box with Open existing, Add as sibling enquiry and
// Cancel.

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass, type ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { ErrorSummary, SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomFieldDef, CustomValues } from "@/lib/custom-field-rules";
import type { Match } from "@/lib/admission/enquiries";
import { addEnquiryAction, checkDuplicates, editEnquiryAction } from "./actions";

export type EnquiryChoices = {
  classes: Option[];
  sources: Option[];
  owners: Option[];
  defaultSource: string;
  defaultFollowUp: string;
  customFields: CustomFieldDef[];
};

type Saved = { id: string; childName: string; parentName: string; phone: string; email: string | null; classId: string | null; childDob: string | null; currentSchool: string | null; referredBy: string | null; customFields: CustomValues };

function DuplicateBox({ matches, onSibling, onCancel, siblingLabel = "Add as sibling enquiry" }: { matches: Match[]; onSibling: () => void; onCancel: () => void; siblingLabel?: string }) {
  if (matches.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-warn/40 bg-warn-bg p-4 text-warn-text">
      <p className="font-medium">This family may already be in School OS</p>
      <ul className="mt-2 space-y-1 text-sm">
        {matches.map((m) => <li key={`${m.kind}-${m.id}`}>{m.text}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={matches[0].href} className={buttonClass("secondary", "sm")}>Open existing</Link>
        <Button size="sm" variant="secondary" onClick={onSibling}>{siblingLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function Fields({ c, saved, state, mode, onDuplicates }: { c: EnquiryChoices; saved?: Saved; state: Awaited<ReturnType<typeof addEnquiryAction>>; mode: "add" | "edit"; onDuplicates: (m: Match[]) => void }) {
  const val = (k: string, d?: string | null) => state?.values?.[k] ?? d ?? undefined;
  const err = (k: string) => state?.errors?.[k];
  const [, start] = useTransition();
  const check = (e: React.FocusEvent<HTMLInputElement>) => {
    const form = e.currentTarget.form;
    const read = (n: string) => (form?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const phone = read("phone");
    const email = read("email");
    if (phone.replace(/\D/g, "").length < 10 && !email.includes("@")) return;
    start(async () => onDuplicates(await checkDuplicates(phone, email, saved?.id)));
  };
  const more = Boolean(saved?.email || saved?.childDob || saved?.currentSchool || saved?.referredBy || state?.values?.email || state?.values?.notes);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Child's name" name="childName" required maxLength={120} defaultValue={val("childName", saved?.childName)} error={err("childName")} autoComplete="off" />
        <TextField label="Parent's name" name="parentName" required maxLength={120} defaultValue={val("parentName", saved?.parentName)} error={err("parentName")} autoComplete="off" />
        <TextField label="Phone" name="phone" required inputMode="tel" placeholder="98765 43210" help="10 digits; +91 is added" defaultValue={val("phone", saved?.phone)} error={err("phone")} onBlur={check} />
        <SelectField label="Class wanted" name="classId" options={c.classes} placeholder="Not decided" defaultValue={val("classId", saved?.classId)} error={err("classId")} />
        {mode === "add" && (
          <>
            <SelectField label="Source" name="source" required options={c.sources} defaultValue={val("source", c.defaultSource)} error={err("source")} />
            <SelectField label="Owner" name="ownerStaffId" options={c.owners} placeholder="As set in Admission Settings" defaultValue={val("ownerStaffId")} error={err("ownerStaffId")} />
            <TextField label="Next follow-up" name="nextFollowUpAt" type="datetime-local" required defaultValue={val("nextFollowUpAt", c.defaultFollowUp)} error={err("nextFollowUpAt")} />
            <TextField label="Next action" name="nextAction" maxLength={200} placeholder="Call to fix a school visit" defaultValue={val("nextAction")} error={err("nextAction")} />
          </>
        )}
      </div>
      <details open={more || mode === "edit"} className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer font-medium">More details</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Email" name="email" type="email" maxLength={200} defaultValue={val("email", saved?.email)} error={err("email")} onBlur={check} />
          <TextField label="Child's date of birth" name="childDob" type="date" defaultValue={val("childDob", saved?.childDob)} error={err("childDob")} />
          <TextField label="Current school" name="currentSchool" maxLength={150} defaultValue={val("currentSchool", saved?.currentSchool)} error={err("currentSchool")} />
          <TextField label="Referred by" name="referredBy" maxLength={120} defaultValue={val("referredBy", saved?.referredBy)} error={err("referredBy")} />
          {mode === "add" && <TextArea label="Notes" name="notes" className="sm:col-span-2" maxLength={2000} defaultValue={val("notes")} error={err("notes")} />}
        </div>
        {c.customFields.length > 0 && (
          <div className="mt-4">
            <CustomFieldInputs fields={c.customFields} values={state?.values ?? saved?.customFields} errors={Object.fromEntries(Object.entries(state?.errors ?? {}).filter(([k]) => k.startsWith("cf_")).map(([k, v]) => [k.slice(3), v]))} />
          </div>
        )}
      </details>
    </>
  );
}

function EnquiryForm({ c, saved, mode, onDone, onCancel }: { c: EnquiryChoices; saved?: Saved; mode: "add" | "edit"; onDone: (id: string) => void; onCancel: () => void }) {
  const [state, formAction] = useActionState(mode === "add" ? addEnquiryAction : editEnquiryAction, null);
  const [typedMatches, setMatches] = useState<Match[]>([]);
  const [dismissed, setDismissed] = useState<unknown>(null);
  const matches = typedMatches.length ? typedMatches : state?.data?.matches && dismissed !== state ? state.data.matches : [];
  const [force, setForce] = useState(false);
  const [siblingOf, setSiblingOf] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (state?.ok && state.data?.id && !done.current) { done.current = true; onDone(state.data.id); }
  }, [state, onDone]);
  const sibling = () => {
    const enquiry = matches.find((m) => m.kind === "enquiry");
    setSiblingOf(enquiry?.id ?? null);
    setForce(true);
    setMatches([]);
    setDismissed(state);
    // Submit after the hidden fields are in the form.
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  };
  const showSummary = state && !state.ok && state.errors && Object.keys(state.errors).length > 1;
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {saved && <input type="hidden" name="id" value={saved.id} />}
      {force && <input type="hidden" name="force" value="1" />}
      {siblingOf && <input type="hidden" name="siblingOfId" value={siblingOf} />}
      {showSummary ? <ErrorSummary errors={state.errors} /> : state && !state.ok && !state.data?.matches && state.message && <Alert tone="danger">{state.message}</Alert>}
      <DuplicateBox matches={matches} onSibling={sibling} onCancel={() => { setMatches([]); setDismissed(state); onCancel(); }} siblingLabel={mode === "add" ? "Add as sibling enquiry" : "Save anyway"} />
      <Fields c={c} saved={saved} state={state} mode={mode} onDuplicates={setMatches} />
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <SubmitButton pendingText="Saving…">{mode === "add" ? "Add enquiry" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddEnquiry({ c, variant = "primary", label = "Add enquiry", startOpen = false }: { c: EnquiryChoices; variant?: ButtonVariant; label?: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [round, setRound] = useState(0);
  const router = useRouter();
  return (
    <>
      <Button variant={variant} onClick={() => { setRound((r) => r + 1); setOpen(true); }}>{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add enquiry" wide>
        <EnquiryForm key={round} c={c} mode="add" onCancel={() => setOpen(false)} onDone={(id) => { setOpen(false); router.push(`/admission-management/enquiries/${id}`); }} />
      </Dialog>
    </>
  );
}

export function EditEnquiry({ c, saved }: { c: EnquiryChoices; saved: Saved }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setRound((r) => r + 1); setOpen(true); }}>Edit</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit enquiry" wide>
        <EnquiryForm key={round} c={c} saved={saved} mode="edit" onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
