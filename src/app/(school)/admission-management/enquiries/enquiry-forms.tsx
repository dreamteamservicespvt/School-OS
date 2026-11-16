"use client";

// Add and edit an enquiry (02 §2; design: mod-admissions.jsx AddEnquirySheet).
// The required things now (02 §2 Form fields), the rest folded under More details. The phone is checked
// for a matching family when the person leaves it (02 Done when 2): Open
// existing, Add as sibling enquiry, or Not now (hides the warning only).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, ExternalLink, Pencil, Plus, TriangleAlert, Users } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { SelectField, TextArea, TextField, type Option } from "@/components/ui/field";
import { CustomFieldInputs } from "@/components/custom-fields";
import type { CustomFieldDef, CustomValues } from "@/lib/custom-field-rules";
import type { Match } from "@/lib/admission/enquiries";
import { FormProblem, MoreDetails, PhoneField, SegField, Submit, WhenField } from "../_components/forms";
import { addEnquiryAction, checkDuplicates, editEnquiryAction } from "./actions";
import { useT, Words } from "@/lib/i18n/client";
import { DraftHint, useFormDraft } from "@/components/ui/form-draft";

export type EnquiryChoices = {
  classes: Option[];
  sources: Option[];
  owners: Option[];
  defaultSource: string;
  defaultFollowUp: string;
  customFields: CustomFieldDef[];
  years: Option[];
  /** "this" = the running year (the child joins mid-year), "next" = the coming year. */
  yearKinds: Record<string, "this" | "next">;
  defaultYearId: string;
  ownerRule: string;
  ownerByClass: Record<string, string>;
  defaultOwner: string;
  turnNext: string | null;
};

export type SavedEnquiry = { id: string; childName: string; parentName: string; phone: string; email: string | null; classId: string | null; childDob: string | null; currentSchool: string | null; referredBy: string | null; customFields: CustomValues };

/** pick: what the person chose for the match. "new" = a different family that shares the phone (as Add student offers). */
function DuplicateBox({ matches, pick, onSibling, onNewFamily, onCancel, siblingLabel, family, onFamily }: { matches: Match[]; pick: "sibling" | "new" | null; onSibling: () => void; onNewFamily?: () => void; onCancel: () => void; siblingLabel: string; family: Match | null; onFamily: (m: Match) => void }) {
  const tr = useT();
  if (matches.length === 0) return null;
  // Two families on one phone: "Sibling of which family?" with one button each (layman loop 6, L6-01).
  const families = matches.filter((m) => m.family && m.kind !== "application");
  const asking = pick === "sibling" && families.length > 1 && !family;
  return (
    <div role="alert" className="rounded-xl border border-warn/40 bg-warn/12 p-3.5 animate-rise">
      {matches.slice(0, 3).map((m) => (
        <p key={`${m.kind}-${m.id}`} className="font-semibold text-[14px] flex gap-2"><TriangleAlert size={17} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />{m.text}</p>
      ))}
      {asking ? (
        <div className="mt-3">
          <p className="text-[13.5px] font-semibold"><Words k="Sibling of which family?" /></p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {families.map((m) => <Button key={`${m.kind}-${m.id}`} size="sm" variant="soft" icon={Users} onClick={() => onFamily(m)}>{m.family}</Button>)}
          </div>
        </div>
      ) : pick ? (
        <p className="text-[13px] text-ink2 mt-2 flex items-center gap-1.5"><Check size={15} className="text-ok" aria-hidden="true" />{pick === "new" ? <Words k="Will be added as a new family." /> : (family ?? families[0])?.family ? tr("Sibling of {family}", { family: (family ?? families[0])!.family! }) : <Words k="Will be added as a sibling enquiry, linked to the same family." />}</p>
      ) : (
        <div className="flex gap-2 mt-3 flex-wrap">
          <Link href={matches[0].kind === "enquiry" ? `/admission-management/enquiries?id=${matches[0].id}` : matches[0].href} className={buttonClass("secondary", "sm")}><ExternalLink size={15} aria-hidden="true" /><Words k="Open existing" /></Link>
          <Button size="sm" variant="soft" icon={Users} onClick={onSibling}>{siblingLabel}</Button>
          {onNewFamily && <Button size="sm" variant="secondary" onClick={onNewFamily}><Words k="Different family" /></Button>}
          <Button size="sm" variant="ghost" onClick={onCancel}><Words k="Not now" /></Button>
        </div>
      )}
    </div>
  );
}

const PRIMARY_SOURCES = ["walk-in", "phone", "referral", "website"];

function EnquiryForm({ c, saved, onDone, onCancel }: { c: EnquiryChoices; saved?: SavedEnquiry; onDone: (id: string) => void; onCancel: () => void }) {
  const mode = saved ? "edit" : "add";
  const [state, formAction, pending] = useActionState(saved ? editEnquiryAction : addEnquiryAction, null);
  const [typed, setTyped] = useState<Match[] | null>(null);
  const [pick, setPick] = useState<"sibling" | "new" | null>(null);
  const [family, setFamily] = useState<Match | null>(null);
  const sibling = pick !== null;
  const [classId, setClassId] = useState(saved?.classId ?? "");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState(c.defaultSource);
  const [yearPicked, setYearPicked] = useState<string | null>(null);
  // Say which year in plain words (L6-04): in November most enquiries are for next June.
  const yearKind = c.yearKinds[yearPicked ?? state?.values?.yearId ?? c.defaultYearId];
  const [, start] = useTransition();
  const t = useT();
  const done = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(formRef, mode === "add" ? "Add enquiry" : "Edit enquiry");
  const forget = draft.done;
  useEffect(() => {
    if (state?.ok && state.data?.id && !done.current) { done.current = true; forget(); onDone(state.data.id); }
  }, [state, onDone, forget]);
  const matches = typed ?? state?.data?.matches ?? [];
  const val = (k: string, d?: string | null) => state?.values?.[k] ?? d ?? undefined;
  const err = (k: string) => (k === "phone" && state?.data?.matches ? undefined : state?.errors?.[k]);
  const check = (e: React.FocusEvent<HTMLInputElement>) => {
    const form = e.currentTarget.form;
    const read = (n: string) => (form?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const phone = read("phone");
    const email = read("email");
    if (phone.replace(/\D/g, "").length !== 10 && !email.includes("@")) return setTyped([]);
    start(async () => { setTyped(await checkDuplicates(phone, email, saved?.id)); setPick(null); });
  };
  const ruleOwner = c.ownerRule === "class" && classId ? c.ownerByClass[classId] ?? c.defaultOwner : c.ownerRule === "turn" ? "" : c.defaultOwner;
  const ownerValue = owner || ruleOwner;
  // Say why this owner was picked: a first-time receptionist did not know why a teacher got her follow-ups (layman loop 4).
  const ruleName = c.owners.find((o) => o.value === ownerValue)?.label.replace(/ \(.*\)$/, "");
  const ownerHint = owner ? t("Changed by hand. The history keeps it.") : c.ownerRule === "turn" ? (c.turnNext ? t("Set by “Who gets new enquiries”: in turn, next is {name}", { name: c.turnNext }) : t("Set by “Who gets new enquiries”: in turn"))
    : ruleName ? t("School rule: new enquiries go to {name}. Follow-up calls go to them.", { name: ruleName }) : t("Follow-up calls go to this person. Usually leave as is.");
  const live = c.sources.map((s) => s.value);
  const segSources = PRIMARY_SOURCES.filter((s) => live.includes(s));
  const others = c.sources.filter((s) => !segSources.includes(s.value));
  // The family the sibling joins: the one picked, or the only one that matched.
  const matchFamilies = matches.filter((m) => m.family && m.kind !== "application");
  const sibFamily = family ?? (matchFamilies.length === 1 ? matchFamilies[0] : null);
  const blockedByMatch = (matches.length > 0 && !sibling) || (pick === "sibling" && matchFamilies.length > 1 && !family);
  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-4">
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <DraftHint draft={draft} />
      {sibling && <input type="hidden" name="force" value="1" />}
      {pick === "sibling" && sibFamily?.kind === "enquiry" && <input type="hidden" name="siblingOfId" value={sibFamily.id} />}
      {pick === "sibling" && sibFamily?.kind === "parent" && <input type="hidden" name="siblingOfParentId" value={sibFamily.id} />}
      {!state?.data?.matches && <FormProblem state={state} />}
      <TextField label="Child’s name" name="childName" required maxLength={120} placeholder="First and last name" autoComplete="off" defaultValue={val("childName", saved?.childName)} error={err("childName")} />
      <TextField label="Parent’s name" name="parentName" required maxLength={120} placeholder="Father, mother or guardian" autoComplete="off" defaultValue={val("parentName", saved?.parentName)} error={err("parentName")} />
      <PhoneField label="Phone" name="phone" required defaultValue={val("phone", saved?.phone)} error={err("phone")} onBlur={check} help="We find a family already linked to this number" />
      <DuplicateBox matches={matches} pick={pick} onSibling={() => setPick("sibling")} onNewFamily={mode === "add" ? () => setPick("new") : undefined} onCancel={() => setTyped([])} siblingLabel={mode === "add" ? "Add as sibling enquiry" : "Save anyway"} family={family} onFamily={setFamily} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField label="Class wanted" name="classId" options={c.classes} placeholder="Not decided" value={classId} onChange={(e) => setClassId(e.target.value)} error={err("classId")} />
        {mode === "add" ? <SelectField label="For year" name="yearId" options={c.years} defaultValue={val("yearId", c.defaultYearId)} onChange={(e) => setYearPicked(e.target.value)} error={err("yearId")}
          help={yearKind === "next" ? "Next school year" : yearKind === "this" ? "This school year: joins mid-year" : undefined} /> : <div />}
      </div>
      {mode === "add" && (
        <>
          {others.length === 0 || segSources.length < 2 ? (
            segSources.length >= 2 && others.length === 0
              ? <SegField name="source" label="Source" required size="sm" options={c.sources.map((s) => ({ value: s.value, label: s.label }))} defaultValue={val("source", c.defaultSource) ?? ""} help="Changing it later needs a reason." />
              : <SelectField label="Source" name="source" required options={c.sources} defaultValue={val("source", c.defaultSource)} error={err("source")} help="Changing it later needs a reason." />
          ) : (
            <div className="flex flex-col gap-2">
              <SegField name={segSources.includes(source) ? "source" : "_source"} label="Source" required size="sm"
                options={[...segSources.map((s) => ({ value: s, label: c.sources.find((x) => x.value === s)!.label })), { value: "_other", label: "More" }]}
                defaultValue={segSources.includes(source) ? source : "_other"} onChange={(v) => setSource(v === "_other" ? others[0].value : v)}
                help={segSources.includes(source) ? "Changing it later needs a reason." : undefined} />
              {!segSources.includes(source) && (
                <SelectField label="More sources" name="source" options={others} value={source} onChange={(e) => setSource(e.target.value)} error={err("source")} help="Changing it later needs a reason." />
              )}
            </div>
          )}
          <SelectField label="Owner" name="ownerStaffId" required options={c.owners} placeholder={c.ownerRule === "turn" ? "Next in turn" : "Choose the owner"} value={ownerValue} onChange={(e) => setOwner(e.target.value)} error={err("ownerStaffId")} help={ownerHint} />
          <WhenField label="Next follow-up" name="nextFollowUpAt" required defaultValue={val("nextFollowUpAt", c.defaultFollowUp)} error={err("nextFollowUpAt")} />
        </>
      )}
      <MoreDetails defaultOpen={mode === "edit" || Boolean(state?.values?.email || state?.values?.notes)}>
        <TextField label="Email" name="email" type="email" maxLength={200} placeholder="name@example.com" defaultValue={val("email", saved?.email)} error={err("email")} onBlur={check} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Child’s date of birth" name="childDob" type="date" defaultValue={val("childDob", saved?.childDob)} error={err("childDob")} />
          <TextField label="Current school" name="currentSchool" maxLength={150} defaultValue={val("currentSchool", saved?.currentSchool)} error={err("currentSchool")} />
        </div>
        <TextField label="Referred by" name="referredBy" maxLength={120} placeholder="A parent or staff member" defaultValue={val("referredBy", saved?.referredBy)} error={err("referredBy")} />
        {mode === "add" && <>
          <TextField label="Next action" name="nextAction" maxLength={200} placeholder="First call" defaultValue={val("nextAction")} error={err("nextAction")} />
          <TextArea label="Notes" name="notes" rows={2} maxLength={2000} defaultValue={val("notes")} error={err("notes")} />
        </>}
        {c.customFields.length > 0 && (
          <CustomFieldInputs fields={c.customFields} values={state?.values ?? saved?.customFields} errors={Object.fromEntries(Object.entries(state?.errors ?? {}).filter(([k]) => k.startsWith("cf_")).map(([k, v]) => [k.slice(3), v]))} />
        )}
      </MoreDetails>
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" onClick={() => { draft.discard(); onCancel(); }} disabled={pending}><Words k="Cancel" /></Button>
        <Submit busyLabel={mode === "add" ? "Adding…" : "Saving…"} disabled={blockedByMatch}>{mode === "add" ? "Add enquiry" : "Save changes"}</Submit>
      </div>
    </form>
  );
}

/** startOpen: the Dashboard's "Add enquiry" quick action (?do=add) opens the form at once, not just the list. */
export function AddEnquiryButton({ c, variant = "primary", label = "Add enquiry", size = "md", className, startOpen = false }: { c: EnquiryChoices; variant?: ButtonVariant; label?: string; size?: ButtonSize; className?: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [round, setRound] = useState(0);
  const router = useRouter();
  return (
    <>
      <Button variant={variant} size={size} icon={Plus} className={className} onClick={() => { setRound((r) => r + 1); setOpen(true); }}>{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add enquiry" sub="The basics now. The rest later.">
        <EnquiryForm key={round} c={c} onCancel={() => setOpen(false)} onDone={(id) => {
          setOpen(false);
          // Opened by its address (?do=add): replace it, so Back never shows an empty form after the save (layman loop 3).
          const to = `/admission-management/enquiries?id=${id}`;
          if (startOpen) router.replace(to); else router.push(to);
        }} />
      </Dialog>
    </>
  );
}

export function EditEnquiryButton({ c, saved }: { c: EnquiryChoices; saved: SavedEnquiry }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <button type="button" onClick={() => { setRound((r) => r + 1); setOpen(true); }} className="text-brand hover:underline inline-flex items-center gap-1"><Pencil size={12} aria-hidden="true" /><Words k="Edit" /></button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit enquiry" sub={`${saved.childName} · the history keeps every change`}>
        <EnquiryForm key={round} c={c} saved={saved} onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
