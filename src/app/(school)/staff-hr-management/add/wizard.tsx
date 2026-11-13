"use client";

// Add Staff in three steps (09 §2): details, what they can open (login and
// roles), and their classes and subjects. All three are saved together on
// "Create staff", then a summary shows the staff ID, login and invite link.

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { StaffDobField } from "../dob-field";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { checkIndianMobile } from "@/lib/format";
import type { FormState } from "@/lib/forms";
import type { AccessLevel } from "@/lib/roles";
import { LEVEL_OPTIONS, combineLevels, extraPermissions, levelWords } from "@/lib/staff/role-words";
import type { ModuleKey } from "@/lib/modules";
import type { Created } from "./actions";
import { SignInChoice } from "../_components/sign-in-choice";
import { Any, Words, useT } from "@/lib/i18n/client";
import { FormProblems, ProblemText, checkBoxes } from "@/components/ui/form-problems";
import { freePairs, stepThree, stepThreeSummary, type Taken } from "@/lib/staff/class-picks";
import { ShareMenu } from "@/components/ui/share-menu";
import { DraftHint, useFormDraft, useStateDraft } from "@/components/ui/form-draft";

type Option = { value: string; label: string };
export type WizardData = {
  usernameFormat: string;
  designations: { name: string; staffType: string; departmentId: string | null; roleKey: string | null }[];
  departments: Option[];
  staff: Option[];
  campuses: Option[];
  /** The campus chosen at first: the person's own (src/lib/campus.ts personCampusId); the classes in step 3 are of its year. */
  campusId: string;
  roles: { key: string; name: string; perms: Record<string, AccessLevel>; lines: string[] }[];
  yearName: string | null;
  classes: { id: string; name: string; sections: { id: string; name: string }[]; subjects: { id: string; name: string }[] }[];
  /** Who is class teacher of each section, and who teaches each subject and section, now (step 3). */
  taken: Taken;
  prefill: { applicationId: string; fullName: string; phone: string; email: string; qualification: string; experienceYears: string; designation: string; departmentId: string; joiningDate: string } | null;
  /** A login of this school with no staff record yet (Staff List link): its record is made and linked; no new login. */
  /** Why the login from the Staff List cannot be linked (already linked, another school...), or null. */
  linkProblem: string | null;
  linked: { id: string; username: string; displayName: string; phone: string; email: string; roleNames: string[]; roleKeys: string[] } | null;
  today: string;
  employmentTypes: string[];
  modules: { key: string; name: string }[];
};

type Dup = { message: string; href: string };
type Check = (prev: FormState<{ duplicates: Dup[] }>, fd: FormData) => Promise<FormState<{ duplicates: Dup[] }>>;
type Create = (prev: FormState<Created>, fd: FormData) => Promise<FormState<Created>>;

const STEP1_FIELDS = new Set(["fullName", "phone", "designation", "departmentId", "joiningDate", "gender", "email", "photo", "staffCode", "dateOfBirth", "bloodGroup", "aadhaar", "address", "permanentAddress", "qualification", "experienceYears", "employmentType", "reportingToId", "campusId", "phoneVerified", "emailVerified"]);

/** The line under step 3 in the screen's language (the English is stepThreeSummary in src/lib/staff/class-picks.ts). */
function stepThreeWords(t: ReturnType<typeof useT>, classTeacherOf: string | null, pairs: readonly string[]) {
  if (t.lang === "en") return stepThreeSummary({ classTeacherOf, pairs });
  const ct = classTeacherOf ? t("Class teacher of {section}.", { section: classTeacherOf }) : t("Not a class teacher.");
  const n = pairs.length;
  const sections = new Set(pairs.map((p) => p.split(":")[0])).size;
  const rest = !n ? t("No subjects chosen yet.") : n === 1 ? t("Teaches 1 subject in 1 section.") : t("Teaches {n} subjects across {sections} sections (one per subject and section).", { n: String(n), sections: String(sections) });
  return `${ct} ${rest}`;
}

function slug(s: string) { return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ""); }

export function Wizard({ data, checkDetails, create }: { data: WizardData; checkDetails: Check; create: Create }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, start] = useTransition();
  const t = useT();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ text: string; link?: { href: string; label: string } } | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [allowDup, setAllowDup] = useState(false);
  const [done, setDone] = useState<Created | null>(null);

  const p = data.prefill;
  const linked = data.linked;
  const [fullName, setFullName] = useState(p?.fullName ?? linked?.displayName ?? "");
  const [phone, setPhone] = useState(p?.phone ?? linked?.phone ?? "");
  const [designation, setDesignation] = useState(p?.designation ?? data.designations.find((d) => d.name === "Teacher")?.name ?? data.designations[0]?.name ?? "");
  const des = data.designations.find((d) => d.name === designation);
  const [deptTouched, setDeptTouched] = useState(Boolean(p?.departmentId));
  const [departmentId, setDepartmentId] = useState(p?.departmentId ?? des?.departmentId ?? "");
  const [photoName, setPhotoName] = useState<string | null>(null);

  const [giveLogin, setGiveLogin] = useState(!linked);
  const [rolesTouched, setRolesTouched] = useState(false);
  const [roleKeys, setRoleKeys] = useState<string[]>(des?.roleKey ? [des.roleKey] : []);
  const [exceptions, setExceptions] = useState<Record<string, AccessLevel>>({});
  const [openRole, setOpenRole] = useState<string | null>(null);

  // Step 3: the subjects taught ("sectionId:subjectId") and, apart from them, the one section they are class teacher of.
  const [pairs, setPairs] = useState<string[]>([]);
  const [ctSection, setCtSection] = useState("");
  const [classFilter, setClassFilter] = useState("");
  // What was typed comes back after a reload or a mistaken Back (owner test, note 7). Aadhaar, passwords and
  // the photo are never kept (src/lib/form-draft.ts); the class picks of step 3 are kept from their state.
  // A linked login keeps its own draft, so an earlier Add Staff draft never fills in another person.
  const draftName = linked ? `Add staff for ${linked.id}` : "Add staff";
  const draft = useFormDraft(formRef, draftName);
  const picksDraft = useStateDraft(`${draftName} picks`, { pairs, ctSection }, (v) => { setPairs(v.pairs); setCtSection(v.ctSection); });

  const teaching = (des?.staffType ?? "Teaching") === "Teaching";
  // A linked login keeps its roles from Settings, so step 3 follows those roles.
  const offer = stepThree(linked ? { teachingPost: teaching, giveLogin: true, roleKeys: linked.roleKeys } : { teachingPost: teaching, giveLogin, roleKeys });

  function chooseDesignation(name: string) {
    setDesignation(name);
    const d = data.designations.find((x) => x.name === name);
    if (!deptTouched) setDepartmentId(d?.departmentId ?? "");
    if (!rolesTouched && !linked) setRoleKeys(d?.roleKey && data.roles.some((r) => r.key === d.roleKey) ? [d.roleKey] : []);
  }

  const suggestedUsername = useMemo(() => {
    const parts = fullName.trim().split(/\s+/);
    if (data.usernameFormat === "phone") return phone.replace(/\D/g, "").slice(-10);
    if (data.usernameFormat === "staffid") return "staff ID";
    const first = slug(parts[0] ?? "");
    const last = slug(parts.slice(1).join(""));
    return data.usernameFormat === "firstlast" ? `${first}${last}` : last ? `${first}.${last}` : first;
  }, [fullName, phone, data.usernameFormat]);

  const base = combineLevels(data.roles.filter((r) => roleKeys.includes(r.key)).map((r) => r.perms as Partial<Record<ModuleKey, AccessLevel>>));
  const extras = extraPermissions(base, exceptions);
  const allocs = offer.subjects ? freePairs(pairs, data.taken) : [];
  const ctChosen = offer.classTeacher && ctSection && !data.taken.classTeacher[ctSection] ? ctSection : "";
  const sectionLabel = (id: string) => { for (const c of data.classes) { const x = c.sections.find((y) => y.id === id); if (x) return `${c.name} ${x.name}`; } return null; };

  function err(k: string) { return errors[k]; }

  function validateStep1(): boolean {
    const form = formRef.current!;
    // Every empty or wrong box of step 1 is marked at once, and the first comes into view (<FormProblems>).
    if (!checkBoxes(form.querySelector("fieldset[data-step='1']"))) return false;
    const phoneProblem = checkIndianMobile(phone);
    if (phoneProblem) { setErrors({ phone: phoneProblem }); return false; }
    const photo = form.querySelector<HTMLInputElement>("[name=photo]")?.files?.[0];
    if (photo && photo.size > 2 * 1024 * 1024) { setErrors({ photo: `The photo is ${(photo.size / 1024 / 1024).toFixed(1)} MB. Photos can be at most 2 MB.` }); return false; }
    return true;
  }

  function next() {
    setMessage(null);
    if (step === 1) {
      if (!validateStep1()) return;
      const fd = new FormData(formRef.current!);
      start(async () => {
        const res = await checkDetails(null, fd);
        if (!res?.ok) { setErrors(res?.errors ?? {}); setMessage({ text: res?.message ?? "Please check the details." }); return; }
        setErrors({});
        const found = res.data?.duplicates ?? [];
        setDups(found);
        if (found.length && !allowDup) { setMessage({ text: "Check this is not the same person before going on." }); return; }
        setStep(2);
        window.scrollTo({ top: 0 });
      });
    } else if (step === 2) {
      if (giveLogin && roleKeys.length === 0) { setErrors({ roleKeys: "Choose at least one role, or switch off the login." }); return; }
      setErrors({});
      setStep(3);
      window.scrollTo({ top: 0 });
    }
  }

  function submit(skipClasses = false) {
    setMessage(null);
    const fd = new FormData(formRef.current!);
    if (skipClasses) { fd.delete("alloc"); fd.delete("classTeacherSectionId"); }
    start(async () => {
      const res = await create(null, fd);
      if (res?.ok && res.data) { draft.done(); picksDraft.done(); setDone(res.data); window.scrollTo({ top: 0 }); return; }
      const errs = res?.errors ?? {};
      setErrors(errs);
      const link = (res?.data as unknown as { link?: { href: string; label: string } } | undefined)?.link;
      setMessage({ text: res?.message ?? "That did not save. Please try again.", link });
      if (Object.keys(errs).some((k) => STEP1_FIELDS.has(k))) setStep(1);
      else if (errs.classTeacherSectionId || errs.allocations) setStep(3);
      else if (errs.roleKeys || errs.username) setStep(2);
    });
  }

  // After saving, the page shows again and the login is now taken: the summary alone is shown, not that warning.
  if (done) return <Summary done={done} onAnother={() => window.location.reload()} />;

  const stepNames = ["Details", "What they can open", "Classes and subjects"];
  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); if (step < 3) next(); else submit(); }} className="space-y-5">
      <DraftHint draft={{ restored: draft.restored || picksDraft.restored, clear: () => { draft.clear(); picksDraft.clear(); }, done: () => { draft.done(); picksDraft.done(); } }} />
      <FormProblems errors={errors}>
      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {stepNames.map((n, i) => (
          <li key={n} aria-current={step === i + 1 ? "step" : undefined}
            className={`rounded-xl border px-3 py-2 text-sm ${step === i + 1 ? "border-brand bg-brand-soft text-brand-text" : step > i + 1 ? "border-line bg-surface text-ink" : "border-line bg-surface text-ink-2"}`}>
            <span className="block text-xs"><Words k="Step" /> {i + 1}{step > i + 1 ? " · done" : ""}</span>
            <span className="font-medium">{n}</span>
          </li>
        ))}
      </ol>

      {data.linkProblem && <Alert tone="warning">{data.linkProblem}</Alert>}
      {message && (
        <Alert tone="danger" action={message.link ? <Link className="font-medium underline" href={message.link.href}>{message.link.label}</Link> : undefined}>{message.text}</Alert>
      )}
      {p && <input type="hidden" name="applicationId" value={p.applicationId} />}
      {linked && <input type="hidden" name="linkLoginId" value={linked.id} />}

      {/* Step 1 */}
      <fieldset data-step="1" hidden={step !== 1} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <legend className="sr-only"><Words k="Step 1: Details" /></legend>
        {p && <Alert tone="info"><Words k="Filled from the accepted offer to" /> {p.fullName}<Words k=". Check and complete the details." /></Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" name="fullName" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} error={err("fullName")} autoComplete="off" />
          <TextField label="Phone" name="phone" required inputMode="numeric" value={phone} placeholder="10-digit mobile" onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setErrors((x) => ({ ...x, phone: phone ? checkIndianMobile(phone) ?? "" : "" }))} error={err("phone") || undefined} help="+91 is added. We check it is not on another staff record." />
          <SelectField label="Designation" name="designation" required value={designation} onChange={(e) => chooseDesignation(e.target.value)} error={err("designation")}
            options={data.designations.map((d) => ({ value: d.name, label: d.name }))} help="A designation is not a role: what they can open is chosen in step 2." />
          <SelectField label="Department" name="departmentId" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setDeptTouched(true); }} error={err("departmentId")}
            options={data.departments} placeholder="No department" />
          <TextField label="Joining date" name="joiningDate" type="date" required defaultValue={p?.joiningDate ?? data.today} error={err("joiningDate")} />
          <SelectField label="Gender" name="gender" defaultValue="" options={[{ value: "Female", label: "Female" }, { value: "Male", label: "Male" }, { value: "Other", label: "Other" }]} placeholder="Choose" error={err("gender")} />
          <TextField label="Email" name="email" type="email" defaultValue={p?.email ?? linked?.email} error={err("email")} help="Needed for an email invite." autoComplete="off" />
          <div>
            <label htmlFor="photo" className="mb-1 block text-sm font-medium"><Words k="Photo" /></label>
            <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
              className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:text-ink" />
            <p className={`mt-1 text-sm ${err("photo") ? "text-danger" : "text-ink-2"}`}>{err("photo") ?? (photoName ? `Chosen: ${photoName}` : "JPG or PNG, up to 2 MB. Made smaller for phones.")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <CheckboxField name="phoneVerified" label="Phone verified" />
          <CheckboxField name="emailVerified" label="Email verified" />
        </div>
        <details className="rounded-xl border border-line p-4" open={Object.keys(errors).some((k) => ["staffCode", "dateOfBirth", "bloodGroup", "aadhaar", "address", "permanentAddress", "qualification", "experienceYears", "employmentType", "reportingToId", "campusId"].includes(k)) || undefined}>
          <summary className="cursor-pointer font-medium"><Words k="More details" /></summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StaffDobField today={data.today} error={err("dateOfBirth")} />
            <SelectField label="Blood group" name="bloodGroup" defaultValue="" options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ value: b, label: b }))} placeholder="Choose" error={err("bloodGroup")} />
            <TextField label="Aadhaar" name="aadhaar" inputMode="numeric" maxLength={14} pattern="[0-9 ]{12,14}" title="12 digits" error={err("aadhaar")} help="Restricted: only HR, the School Admin and the Principal see it in full." autoComplete="off" />
            <SelectField label="Employment type" name="employmentType" defaultValue="Permanent" options={data.employmentTypes.map((t) => ({ value: t, label: t }))} error={err("employmentType")} />
            <TextField label="Qualifications" name="qualification" defaultValue={p?.qualification} error={err("qualification")} />
            <TextField label="Experience (years)" name="experienceYears" inputMode="numeric" defaultValue={p?.experienceYears} error={err("experienceYears")} />
            <SelectField label="Reporting manager" name="reportingToId" defaultValue="" options={data.staff} placeholder="None" error={err("reportingToId")} />
            {data.campuses.length > 1 ? <SelectField label="Campus" name="campusId" defaultValue={data.campusId} options={data.campuses} error={err("campusId")} /> : <input type="hidden" name="campusId" value={data.campuses[0]?.value ?? ""} />}
            <TextField label="Staff ID" name="staffCode" error={err("staffCode")} help="Leave empty to give the next free ID automatically." autoComplete="off" />
            <div />
            <TextArea label="Current address" name="address" rows={2} error={err("address")} />
            <TextArea label="Permanent address" name="permanentAddress" rows={2} error={err("permanentAddress")} />
          </div>
        </details>
        {dups.length > 0 && (
          <Alert tone="warning" title="This may be someone already on file">
            <ul className="mt-1 space-y-1">{dups.map((d) => <li key={d.message}>{d.message} <Link href={d.href} className="font-medium underline"><Words k="Open existing" /></Link></li>)}</ul>
            <CheckboxField name="allowDuplicate" label="It is a different person. Save anyway." className="mt-3" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} />
          </Alert>
        )}
        {dups.length === 0 && <input type="hidden" name="allowDuplicate" value="" />}
      </fieldset>

      {/* Step 2 */}
      <fieldset data-step="2" hidden={step !== 2} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <legend className="sr-only"><Words k="Step 2: What they can open" /></legend>
        {linked ? (
          <Alert tone="info" title="They already have a login">
            <Words k="This staff record is linked to the login" /> <b>{linked.username}</b>{linked.roleNames.length ? <> ({linked.roleNames.join(", ")})</> : null}. <Words k="No second login is made. Roles and permissions stay as they are; change them in Settings, Users & Permissions." />
          </Alert>
        ) : (
        <CheckboxField name="giveLogin" label="Give a login to School OS" checked={giveLogin} onChange={(e) => setGiveLogin(e.target.checked)}
          help="An invite link to set their own password, or a temporary password from you. No login is needed for the Time Table or payroll." />
        )}
        {giveLogin && !linked && (
          <>
            <div>
              <p className="mb-1 font-medium"><Words k="Roles" /> <span className="text-danger" aria-hidden="true">*</span></p>
              <p className="mb-3 text-sm text-ink-2"><Words k="Pick one or more. What each role can open is shown in plain words." /></p>
              {errors.roleKeys && <p className="mb-2 text-sm text-danger" role="alert">{errors.roleKeys}</p>}
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.roles.map((r) => (
                  <li key={r.key} className={`rounded-xl border p-3 ${roleKeys.includes(r.key) ? "border-brand bg-brand-soft/40" : "border-line"}`}>
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name="roleKeys" value={r.key} className="mt-1 size-5 accent-brand" checked={roleKeys.includes(r.key)}
                        onChange={(e) => { setRolesTouched(true); setRoleKeys((k) => (e.target.checked ? [...k, r.key] : k.filter((x) => x !== r.key))); }} />
                      <span className="flex-1">
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-sm text-ink-2">{r.lines.length} <Words k="module" />{r.lines.length === 1 ? "" : "s"}</span>
                      </span>
                    </label>
                    <button type="button" className="mt-1 min-h-9 text-sm font-medium text-brand-text hover:underline" aria-expanded={openRole === r.key} onClick={() => setOpenRole(openRole === r.key ? null : r.key)}>
                      {openRole === r.key ? "Hide what it can open" : "What it can open"}
                    </button>
                    {openRole === r.key && <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{r.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Username" name="username" placeholder={suggestedUsername} error={err("username")} autoComplete="off"
                help={`Leave empty to use ${data.usernameFormat === "staffid" ? "their staff ID" : `"${suggestedUsername || "the school's format"}"`} (a number is added if it is taken).`} />
              {data.campuses.length > 1 && <SelectField label="Campuses they can open" name="accessCampusId" defaultValue="" options={data.campuses} placeholder="All campuses" />}
            </div>
            <SignInChoice error={err("temporaryPassword")} />
            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer font-medium"><Words k="Adjust permissions (advanced)" /></summary>
              <p className="mt-2 text-sm text-ink-2"><Words k="Start from the roles; change a module only when this one person needs something different. Changes show on their profile." /></p>
              {extras.length > 0 && <Alert tone="warning" className="mt-3">{extras.length} <Words k="extra permission" />{extras.length === 1 ? "" : "s"} <Words k="beyond the chosen role" />{roleKeys.length === 1 ? "" : "s"}.</Alert>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {data.modules.map((m) => (
                  <SelectField key={m.key} label={m.name} name={`perm:${m.key}`} value={exceptions[m.key] ?? ""}
                    onChange={(e) => setExceptions((x) => { const n = { ...x }; if (e.target.value) n[m.key] = e.target.value as AccessLevel; else delete n[m.key]; return n; })}
                    options={LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} placeholder={`As the role: ${levelWords(base[m.key as ModuleKey])}`} />
                ))}
              </div>
            </details>
          </>
        )}
      </fieldset>

      {/* Step 3 */}
      <fieldset data-step="3" hidden={step !== 3} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <legend className="sr-only"><Words k="Step 3: Classes and subjects" /></legend>
        {!teaching ? (
          <p className="text-ink-2">{designation} <Words k="is not a teaching post, so there are no classes to give. Press Create staff." /></p>
        ) : data.classes.length === 0 ? (
          <Alert tone="info"><Words k="There are no sections in" /> {data.yearName ?? "the current academic year"} <Words k="yet. Skip this step; classes can be given later in Teacher Allocation." /></Alert>
        ) : (
          <>
            <p className="text-ink-2">{`Classes for ${data.yearName ?? "this year"}: choose the one section they are class teacher of, and tick the subjects they teach in each section. They stay from year to year until changed.`}</p>
            {offer.notes.length > 0 && <Alert tone="info">{offer.notes.map((n) => <span key={n} className="block"><Any text={n} /></span>)}</Alert>}
            {offer.classTeacher && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <p className="font-medium">{"Class teacher"}</p>
                <p className="mt-1 text-sm text-ink-2"><Words k="The class teacher takes the daily attendance of one section and writes its report card remarks. A teacher is class teacher of one section only; in other classes they teach subjects only." /></p>
                <label className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3">
                  <input type="radio" className="size-4 accent-brand" checked={!ctChosen} onChange={() => setCtSection("")} />
                  <Words k="Not a class teacher" />
                </label>
                <p className="mt-2 text-sm font-medium">{ctChosen ? t("Chosen: class teacher of {section}", { section: sectionLabel(ctChosen) }) : t("Chosen: not a class teacher")}</p>
                <ProblemText name="classTeacherSectionId" given={errors.classTeacherSectionId} />
              </div>
            )}
            <input type="hidden" name="classTeacherSectionId" value={ctChosen} />
            <TextField label="Find a class" name="classSearch" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} placeholder="Class 5" />
            <ul className="space-y-3">
              {data.classes.filter((c) => c.name.toLowerCase().includes(classFilter.trim().toLowerCase())).map((c) => {
                const free = c.sections.flatMap((x) => c.subjects.map((sub) => `${x.id}:${sub.id}`)).filter((k) => !data.taken.subject[k]);
                const all = free.length > 0 && free.every((k) => pairs.includes(k));
                const tick = (k: string, on: boolean) => setPairs((p) => (on ? [...p, k] : p.filter((y) => y !== k)));
                return (
                  <li key={c.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{c.name}</p>
                      {offer.subjects && free.length > 0 && (
                        <button type="button" className="min-h-9 text-sm font-medium text-brand-text hover:underline"
                          onClick={() => setPairs((p) => (all ? p.filter((k) => !free.includes(k)) : [...new Set([...p, ...free])]))}>
                          {all ? `Clear the subjects in ${c.name}` : `Tick every free subject in ${c.name}`}
                        </button>
                      )}
                    </div>
                    {offer.classTeacher && (
                      <div className="mt-3" role="radiogroup" aria-label={`Class teacher of a section of ${c.name}`}>
                        <p className="text-sm font-medium text-ink-2"><Words k="Class teacher of (one section only)" /></p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {c.sections.map((x) => {
                            const other = data.taken.classTeacher[x.id];
                            return (
                              <label key={x.id} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-1 ${other ? "cursor-not-allowed border-line bg-sunken text-ink3" : ctChosen === x.id ? "border-brand bg-brand-soft" : "border-line"}`}>
                                <input type="radio" className="size-4 accent-brand" disabled={Boolean(other)} checked={ctChosen === x.id} onChange={() => setCtSection(x.id)} />
                                <span>{`${c.name} ${x.name}`}{other && <span className="block text-xs">{`Class teacher: ${other}`}</span>}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {offer.subjects && (c.subjects.length === 0 ? (
                      <p className="mt-3 text-sm text-ink-2"><Words k="No subjects set for this class." /> <Link href="/academic-management" className="font-medium text-brand-text underline"><Words k="Subjects" /></Link></p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium text-ink-2"><Words k="Subjects taught (subject teacher)" /></p>
                        {c.sections.map((x) => (
                          <div key={x.id} className="flex flex-wrap items-center gap-2" role="group" aria-label={`Subjects taught in ${c.name} ${x.name}`}>
                            <span className="w-full text-sm sm:w-auto sm:min-w-20">{`${c.name} ${x.name}`}</span>
                            {c.subjects.map((sub) => {
                              const k = `${x.id}:${sub.id}`;
                              const by = data.taken.subject[k];
                              const on = !by && pairs.includes(k);
                              return (
                                <label key={sub.id} title={by ? `Taught by ${by}. A second (secondary) teacher is set in Teacher Allocation.` : undefined}
                                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1 ${by ? "cursor-not-allowed border-line bg-sunken text-ink3" : on ? "border-brand bg-brand-soft" : "border-line"}`}>
                                  <input type="checkbox" className="size-4 accent-brand" disabled={Boolean(by)} checked={on} onChange={(e) => tick(k, e.target.checked)} />
                                  <span>{sub.name}{by && <span className="block text-xs">{`Taught by ${by}`}</span>}</span>
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
            {allocs.map((a) => <input key={a} type="hidden" name="alloc" value={a} />)}
            <p className="text-sm text-ink-2" aria-live="polite">{stepThreeWords(t, ctChosen ? sectionLabel(ctChosen) : null, allocs)}</p>
          </>
        )}
        <ProblemText name="allocations" given={errors.allocations} />
      </fieldset>

      <div className="sticky bottom-16 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card sm:static sm:flex-row sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div>{step > 1 && <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={pending}><Words k="Back" /></Button>}</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {step === 3 && teaching && data.classes.length > 0 && <Button variant="secondary" data-submit onClick={() => submit(true)} disabled={pending}><Words k="Skip and create staff" /></Button>}
          {step < 3
            ? <Button type="submit" loading={pending} loadingText="Checking…"><Words k="Next" /></Button>
            : <Button type="submit" loading={pending} loadingText="Creating…"><Words k="Create staff" /></Button>}
        </div>
      </div>
      </FormProblems>
    </form>
  );
}

function Summary({ done, onAnother }: { done: Created; onAnother: () => void }) {
  const link = done.inviteLink && typeof window !== "undefined" ? `${window.location.origin}${done.inviteLink}` : null;
  const text = link ? `Welcome to School OS. Set your password and sign in: ${link} (username ${done.username})` : "";
  return (
    <section className="space-y-5 rounded-2xl border border-line bg-surface p-5" aria-labelledby="done-title">
      <div>
        <Badge tone="success"><Words k="Created" /></Badge>
        <h2 id="done-title" className="mt-2 text-xl font-semibold">{done.name} <Words k="is now on the staff" /></h2>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-ink-2"><Words k="Staff ID" /></dt><dd className="font-medium">{done.staffCode}</dd></div>
        <div><dt className="text-sm text-ink-2"><Words k="Login" /></dt><dd className="font-medium">{done.username ?? "No login"}</dd></div>
        <div><dt className="text-sm text-ink-2"><Words k="Roles" /></dt><dd className="font-medium">{done.roles.length ? done.roles.join(", ") : "None"}</dd></div>
        <div><dt className="text-sm text-ink-2"><Words k="Classes and subjects" /></dt><dd className="font-medium">{done.allocated ? `${done.allocated} in Teacher Allocation` : "None"}</dd></div>
        <div><dt className="text-sm text-ink-2"><Words k="Class teacher" /></dt><dd className="font-medium">{done.classTeacherOf ?? "No"}</dd></div>
      </dl>
      {done.temporary && done.username && (
        <Alert tone="info" title="Temporary password">
          <Words k="They sign in with the username" /> <b>{done.username}</b> <Words k="and the temporary password you typed. Give it to them in person: it is not shown again or sent by message. At their first sign-in they choose their own password." />
        </Alert>
      )}
      {link && (
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="font-medium"><Words k="Invite link (works for 7 days)" /></p>
          {done.sentWords && <p className="mt-1 text-sm">{done.sentWords}</p>}
          <p className="mt-1 break-all text-sm text-ink-2">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ShareMenu text={text} phone={done.phone} copyText={link} title="Your School OS login" />
            {done.email && <a className={buttonClass("secondary", "sm")} href={`mailto:${done.email}?subject=${encodeURIComponent("Your School OS login")}&body=${encodeURIComponent(text)}`}><Words k="Send by email" /></a>}
          </div>
          <p className="mt-2 text-sm text-ink-2"><Words k="The link is shown only now. A new one can be made later from the profile (New sign-in link)." /></p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/staff-hr-management/${done.staffId}`} variant="primary"><Words k="Open profile" /></ButtonLink>
        <a className={buttonClass("secondary")} href={`/staff-hr-management/id-cards?staff=${done.staffId}`} target="_blank" rel="noopener"><Words k="Print ID card" /></a>
        <Button variant="secondary" onClick={onAnother}><Words k="Add another" /></Button>
      </div>
    </section>
  );
}
