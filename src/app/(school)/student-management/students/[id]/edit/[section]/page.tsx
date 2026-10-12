import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ActionForm, FormArea, FormCheck, FormSelect, FormText } from "@/components/students/action-form";
import { BLOOD_GROUPS, CATEGORIES, GENDERS } from "@/lib/students/labels";
import { StudentNotFound } from "@/lib/students/access";
import { BASE, studentPage, todayIso } from "../../../../_lib/page";
import { loadProfile } from "../../../../_lib/profile";
import {
  saveContactAction, saveEnrolmentAction, saveExtraFieldsAction, saveIdentifiersAction, savePersonalAction, savePreviousSchoolAction,
} from "../../../../_actions/students";

export const metadata: Metadata = { title: "Edit student" };

const TITLES: Record<string, string> = {
  personal: "Personal", contact: "Contact", enrolment: "Enrolment", previous: "Previous school", identifiers: "Identifiers", extra: "Extra fields",
};

export default async function EditStudentSection({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params;
  if (!TITLES[section]) notFound();
  const { current, settings, year, can, tz } = await studentPage();
  if (!can.manage) redirect(`${BASE}/students/${id}`);
  if (section === "identifiers" && !can.seeRestricted) redirect(`${BASE}/students/${id}`);
  let p;
  try {
    p = await withSchool(current.ctx, (tx) => loadProfile(tx, current, id, can, settings, year?.id ?? null));
  } catch (e) {
    if (e instanceof StudentNotFound) notFound();
    throw e;
  }
  const s = p.student;
  const back = `${BASE}/students/${id}${section === "previous" ? "?tab=academics" : ""}`;
  const cancel = <Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Back to profile</Link>;
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
  const sectionTabs = Object.entries(TITLES).filter(([k]) => (k !== "identifiers" || can.seeRestricted) && (k !== "extra" || p.customFields.length > 0));

  return (
    <>
      <BackLink href={back} label={s.fullName} sub="Edit" />
      <PageHeader title={`${TITLES[section]}: ${s.fullName}`} href={`${BASE}/students/${id}/edit/${section}`} userId={current.user.id} />
      <nav aria-label="Sections" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {sectionTabs.map(([k, label]) => (
            <li key={k}><Link href={`${BASE}/students/${id}/edit/${k}`} aria-current={k === section ? "page" : undefined}
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-[15px] ${k === section ? "bg-brand-soft font-semibold text-brand-text" : "text-ink-2 hover:bg-surface-2"}`}>{label}</Link></li>
          ))}
        </ul>
      </nav>
      <Card className="max-w-3xl">
        <CardBody>
          {section === "personal" && (
            <ActionForm action={savePersonalAction.bind(null, id)} submitLabel="Save personal details" pendingText="Saving…" footer={cancel} className="grid gap-4 sm:grid-cols-2">
              <FormText name="fullName" label="Full name" required defaultValue={s.fullName} className="sm:col-span-2" />
              <FormText name="dateOfBirth" label="Date of birth" type="date" required max={todayIso(tz)} defaultValue={iso(s.dateOfBirth)} />
              <FormSelect name="gender" label="Gender" required placeholder="Choose" options={GENDERS.map((g) => ({ value: g, label: g }))} defaultValue={s.gender} />
              <FormSelect name="bloodGroup" label="Blood group" placeholder="Not known" options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))} defaultValue={s.bloodGroup} />
              <FormSelect name="category" label="Category" placeholder="Not given" options={CATEGORIES.map((c) => ({ value: c, label: c }))} defaultValue={s.category} />
              <FormText name="religion" label="Religion" defaultValue={s.religion} />
              <FormText name="motherTongue" label="Mother tongue" defaultValue={s.motherTongue} />
              {can.seeRestricted && (
                <div className="space-y-2 sm:col-span-2">
                  <FormText name="aadhaar" label="Aadhaar number" inputMode="numeric" autoComplete="off"
                    help={s.aadhaarEnc ? `On record: ${p.identifiers.find((i) => i.key === "aadhaar")?.value ?? "hidden"}. Leave empty to keep it.` : "Restricted. Stored encrypted and shown masked to others."} />
                  {s.aadhaarEnc && <FormCheck name="keepAadhaar" label="Keep the Aadhaar number on record when the box is empty" defaultChecked />}
                </div>
              )}
            </ActionForm>
          )}
          {section === "contact" && (
            <ActionForm action={saveContactAction.bind(null, id)} submitLabel="Save contact details" pendingText="Saving…" footer={cancel} className="grid gap-4 sm:grid-cols-2">
              <FormArea name="address" label="Current address" rows={2} defaultValue={s.address} className="sm:col-span-2" />
              <FormText name="city" label="City" defaultValue={s.city} />
              <FormText name="state" label="State" defaultValue={s.state} />
              <FormText name="pinCode" label="PIN code" inputMode="numeric" defaultValue={s.pinCode} />
              <FormArea name="permanentAddress" label="Permanent address" rows={2} defaultValue={p.permanentAddress} className="sm:col-span-2" help="Leave empty when it is the same as the current address." />
              <FormText name="studentPhone" label="Student's phone" type="tel" inputMode="numeric" defaultValue={p.studentPhone} />
              <FormText name="studentEmail" label="Student's email" type="email" defaultValue={p.studentEmail} />
            </ActionForm>
          )}
          {section === "enrolment" && (
            <ActionForm action={saveEnrolmentAction.bind(null, id)} submitLabel="Save enrolment details" pendingText="Saving…" footer={cancel} className="grid gap-4 sm:grid-cols-2">
              <FormText name="admissionNo" label="Admission number" required defaultValue={s.admissionNo} help="Must be unique in the school. The old number is kept in the history." />
              <FormText name="admissionDate" label="Admission date" type="date" defaultValue={iso(s.joiningDate)} />
              <FormText name="rollNo" label="Roll number" inputMode="numeric" defaultValue={p.now?.rollNo ?? ""} disabled={!p.now} help={p.now ? `In ${p.now.section?.schoolClass.name} ${p.now.section?.name}.` : "The student has no class this year."} />
              <div className="text-sm text-ink-2 sm:col-span-2">
                Class and section: {p.now?.section ? `${p.now.section.schoolClass.name} ${p.now.section.name}` : "none this year"}. To move within the class use{" "}
                <Link className="font-medium text-brand-text underline" href={`${BASE}/students/${id}/section`}>Change section</Link>; to move class, use Promotion.
              </div>
            </ActionForm>
          )}
          {section === "previous" && (
            <>
              {p.previousLocked && (
                <Alert tone="warning" className="mb-4" title={`Locked: ${p.previousLocked} is closed`}>
                  {can.seeRestricted ? "You can make an authorised correction. Give the reason; it is kept in the history." : "Only the School Admin or Principal can correct it, with a reason."}
                </Alert>
              )}
              {(!p.previousLocked || can.seeRestricted) && (
                <ActionForm action={savePreviousSchoolAction.bind(null, id)} submitLabel={p.previousLocked ? "Save correction" : "Save previous school"} pendingText="Saving…" footer={cancel} className="grid gap-4 sm:grid-cols-2">
                  <FormText name="schoolName" label="School name" required defaultValue={p.previous?.schoolName ?? s.previousSchool} className="sm:col-span-2" />
                  <FormText name="board" label="Board" defaultValue={p.previous?.board} placeholder="CBSE, ICSE, State Board…" />
                  <FormText name="lastClass" label="Last class" defaultValue={p.previous?.lastClass} />
                  <FormText name="year" label="Year" defaultValue={p.previous?.year} placeholder="2025-26" />
                  <FormText name="marks" label="Marks or %" defaultValue={p.previous?.marks} />
                  {p.previousLocked && <FormArea name="correctionReason" label="Reason for the correction" required rows={2} className="sm:col-span-2" />}
                </ActionForm>
              )}
            </>
          )}
          {section === "identifiers" && (
            <ActionForm action={saveIdentifiersAction.bind(null, id)} submitLabel="Save identifiers" pendingText="Saving…" footer={cancel} className="grid gap-4 sm:grid-cols-2">
              <FormText name="apaarId" label="APAAR ID" inputMode="numeric" autoComplete="off" defaultValue={s.apaarId} help="12 digits." />
              <FormText name="pen" label="PEN" inputMode="numeric" autoComplete="off" defaultValue={s.pen} help="11 digits." />
              {settings.identifierTypes.filter((t) => !["apaar", "pen", "aadhaar"].includes(t.key)).map((t) => {
                const has = p.identifiers.find((i) => i.key === t.key)?.value;
                return (
                  <div key={t.key} className="space-y-2">
                    <FormText name={`id_${t.key}`} label={t.label} autoComplete="off" help={has ? `On record: ${has}. Leave empty to keep it.` : t.level === "highly" ? "Highly restricted." : "Restricted."} />
                    {has && <FormCheck name={`clear_${t.key}`} label={`Remove the ${t.label} on record`} />}
                  </div>
                );
              })}
              <p className="text-sm text-ink-2 sm:col-span-2">Aadhaar is changed with the personal details. Identifier types are set in Student Settings.</p>
            </ActionForm>
          )}
          {section === "extra" && (
            p.customFields.length === 0 ? <p className="text-ink-2">The school has no extra fields for students. They are added in Settings, Forms &amp; Approvals.</p> : (
              <ActionForm action={saveExtraFieldsAction.bind(null, id)} submitLabel="Save extra fields" pendingText="Saving…" footer={cancel} className="grid gap-4 sm:grid-cols-2">
                {p.customFields.map((f) => {
                  const v = p.extra[f.key] ?? "";
                  if (f.fieldType === "choice") return <FormSelect key={f.id} name={`cf_${f.key}`} label={f.label} required={f.required} placeholder="Choose" options={f.choices.map((c) => ({ value: c, label: c }))} defaultValue={v} />;
                  if (f.fieldType === "yesno") return <FormCheck key={f.id} name={`cf_${f.key}`} label={f.label} defaultChecked={v === "Yes"} />;
                  return <FormText key={f.id} name={`cf_${f.key}`} label={f.label} required={f.required} type={f.fieldType === "date" ? "date" : "text"} inputMode={f.fieldType === "number" ? "decimal" : undefined} defaultValue={v} />;
                })}
              </ActionForm>
            )
          )}
        </CardBody>
      </Card>
    </>
  );
}
