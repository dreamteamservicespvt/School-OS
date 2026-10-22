import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CertificateType } from "@prisma/client";
import { ArrowRight, ArrowUpRight, FileBadge, Fingerprint, Hash, IdCard, LogOut, Medal, Workflow } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can as canDo } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { StudentsHead } from "../_lib/head";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, FormArea, FormCheck, FormFieldError, FormSelect, FormText } from "@/components/students/action-form";
import { previewAdmissionNo } from "@/lib/students/students";
import { currentPolicy } from "@/lib/students/settings";
import { BEHAVIOUR_KINDS, BEHAVIOUR_KIND_LABEL, CERTIFICATE_LABEL, ID_CARD_FIELDS, LIST_COLUMNS, OPTIONAL_FORM_FIELDS, STATUS_RULES } from "@/lib/students/labels";
import { BASE, studentPage } from "../_lib/page";
import { campusPrefixes } from "../_lib/queries";
import { saveSettingsAction } from "../_actions/settings";
import { aiAllowed } from "@/lib/settings/switch-rules";
import { schoolRoles } from "@/lib/school-roles";

export const metadata: Metadata = { title: "Student Settings" };

const SECTIONS = [
  { key: "general", label: "Student records" },
  { key: "status", label: "Status changes" },
  { key: "identifiers", label: "Identifier types" },
  { key: "leaving", label: "Leaving & alumni" },
  { key: "promotion", label: "Promotion policy" },
  { key: "certificates", label: "Certificates" },
  { key: "id-cards", label: "ID cards" },
  { key: "behaviour", label: "Behaviour" },
] as const;

/** Checkboxes sharing one name, shown as the design's tick chips. */
function Choices({ name, label, options, chosen, help }: { name: string; label: string; options: { key: string; label: string }[]; chosen: string[]; help?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-ink2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.key} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13.5px] font-medium transition has-[:checked]:border-brand/40 has-[:checked]:bg-brand/8 has-[:checked]:text-brand">
            <input type="checkbox" name={name} value={o.key} defaultChecked={chosen.includes(o.key)} className="size-4 accent-[rgb(var(--brand))]" />
            {o.label}
          </label>
        ))}
      </div>
      {help && <p className="mt-1.5 text-[12.5px] text-ink3">{help}</p>}
      <FormFieldError name={name} />
    </fieldset>
  );
}

const body = "space-y-4 px-5 pb-5";

/** Student Settings (03 §6): the rules for student records, all on one page as in the approved design. Each card saves on its own. */
export default async function StudentSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  if (!can.manage) redirect(BASE);
  // Only people who may open Settings get the link to Document Designs.
  const canSettings = canDo(current.permissions, "settings", "view");
  const sp = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    // One campus: that campus's years. Two campuses: each year named with its campus.
    const rawYears = await tx.academicYear.findMany({ where: { archivedAt: null, status: { not: "CLOSED" }, ...(current.campusId ? { campusId: current.campusId } : {}) }, orderBy: { startDate: "asc" } });
    const prefix = await campusPrefixes(tx, rawYears.map((y) => y.campusId));
    const years = rawYears.map((y) => ({ ...y, name: `${prefix.get(y.campusId) ?? ""}${y.name}` }));
    const policyYear = years.find((y) => y.id === sp.year) ?? (year && year.status !== "CLOSED" ? year : years[0]) ?? null;
    return {
      years, policyYear,
      sample: await previewAdmissionNo(tx, current.ctx),
      policy: policyYear ? await currentPolicy(tx, policyYear.id) : null,
      history: policyYear ? await tx.promotionPolicy.findMany({ where: { academicYearId: policyYear.id }, orderBy: { version: "desc" }, take: 10 }) : [],
      roles: await schoolRoles(tx, current.ctx, { where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
      signatories: await tx.signatory.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" } }),
    };
  });
  const roleOptions = [...new Map(data.roles.map((r) => [r.key!, { value: r.key!, label: r.name }])).values()];
  const save = (section: string) => saveSettingsAction.bind(null, section);
  const certTypes = (Object.keys(CERTIFICATE_LABEL) as CertificateType[]);

  return (
    <>
      <StudentsHead page="Student Settings" href={`${BASE}/settings`} sub={`The rules for student records at ${current.school.name}. Every change is logged.`} />

      <nav aria-label="Student Settings sections" className="-mx-4 mb-5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        <ul className="flex w-max gap-2">
          {SECTIONS.map((s) => (
            <li key={s.key}><a href={`#${s.key}`} className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink2 transition hover:border-ink3/50 hover:text-ink">{s.label}</a></li>
          ))}
        </ul>
      </nav>

      <div className="flex max-w-5xl flex-col gap-5 lg:gap-6">
        <Card id="general" className="scroll-mt-24">
          <CardHeader title="Student records" icon={Hash} description="Admission numbers, required fields, list columns and documents" />
          <div className={body}>
            <ActionForm action={save("general")} submitLabel="Save student records" pendingText="Saving…">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormText name="admissionPrefix" label="Prefix" defaultValue={settings.admissionPrefix} maxLength={20} help="Leave empty to use the school code, for example SPS/." />
                <FormText name="admissionPadding" label="Digits in the running number" type="number" min={1} max={8} required defaultValue={settings.admissionPadding} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken/60 px-4 py-3"><span className="text-[13.5px] text-ink2">Next number</span><b className="font-mono text-[15px]">{data.sample}</b></div>
              <FormCheck name="admissionUseYear" label="Put the year in the number (for example 2026/0001)" defaultChecked={settings.admissionUseYear} />
              <FormCheck name="admissionRestartYear" label="Restart the running number each year" help="Off: numbers keep running. Changing an admission number writes the old and new value to the history." defaultChecked={settings.admissionRestartYear} />
              <div className="border-t border-line pt-4"><Choices name="requiredFields" label="Required on the student form" options={OPTIONAL_FORM_FIELDS} chosen={settings.requiredFields} help="Name, date of birth, gender, class and a parent's phone are always required. Extra fields are added in Settings, Forms & Approvals." /></div>
              <Choices name="listColumns" label="Columns on the Student List" options={LIST_COLUMNS} chosen={settings.listColumns} />
              <FormArea name="requiredDocuments" label="Documents expected for every student" rows={4} defaultValue={settings.requiredDocuments.join("\n")} help="One per line. Shown as &quot;documents complete (5 of 6)&quot; on each student." />
              <div className="space-y-3 border-t border-line pt-4">
                <FormCheck name="studentLoginsOn" label="Student logins (optional)" help="Older students can sign in to see their own records." defaultChecked={settings.studentLoginsOn} />
                {aiAllowed(current) && <p className="text-[13px] text-ink3">Smart Import is switched on or off with the other AI features, in {canSettings ? <Link className="font-semibold text-brand underline" href="/settings/modules#ai">Settings, Modules On/Off</Link> : "Settings, Modules On/Off"}.</p>}
              </div>
            </ActionForm>
          </div>
        </Card>

        <Card id="status" className="scroll-mt-24">
          <CardHeader title="Student status and allowed changes" icon={Workflow} description="Only these changes are offered. Promotion and leaving only on their own pages." />
          <ul className="flex flex-col gap-2 px-5 pb-5 text-[13.5px]">
            {STATUS_RULES.map((r) => (
              <li key={`${r.from}-${r.to}`} className="grid items-start gap-x-2 gap-y-0.5 rounded-xl bg-sunken/50 px-3.5 py-2.5 md:grid-cols-[180px_24px_1fr]">
                <b className="font-semibold">{r.from}</b><ArrowRight size={15} className="mt-0.5 hidden text-ink3 md:block" aria-hidden="true" />
                <span><span className="text-ink">{r.to}</span><span className="block text-[12.5px] text-ink3">{r.how}</span></span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
          <Card id="identifiers" className="scroll-mt-24">
            <CardHeader title="Identifier types" icon={Fingerprint} description="Aadhaar, APAAR ID and PEN are kept on every student. Masked for roles that may not see them." />
            <div className={body}>
              <ul className="space-y-2 text-[14px]">
                <li className="flex items-center justify-between gap-3"><span>Aadhaar</span><Pill tone="bad">Highly restricted</Pill></li>
                <li className="flex items-center justify-between gap-3"><span>APAAR ID</span><Pill tone="warn">Restricted</Pill></li>
                <li className="flex items-center justify-between gap-3"><span>PEN (UDISE+)</span><Pill tone="warn">Restricted</Pill></li>
              </ul>
              <ActionForm action={save("identifiers")} submitLabel="Save identifier types" pendingText="Saving…" className="space-y-3 border-t border-line pt-4">
                <input type="hidden" name="rows" value={settings.identifierTypes.length} />
                {[...settings.identifierTypes, { key: "", label: "", level: "restricted" as const }].map((t, i) => (
                  <div key={`${t.key}-${i}`} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_11rem] sm:items-end">
                    <input type="hidden" name={`key_${i}`} value={t.key} />
                    <FormText name={`label_${i}`} label={t.key ? "Name" : "Add a type"} defaultValue={t.label} maxLength={60} placeholder={t.key ? undefined : "For example: Board registration number"} />
                    <FormSelect name={`level_${i}`} label="Who can see it" defaultValue={t.level} options={[{ value: "restricted", label: "Restricted" }, { value: "highly", label: "Highly restricted" }]} />
                    {t.key && <FormCheck name={`remove_${i}`} label="Remove this type" className="sm:col-span-2" />}
                  </div>
                ))}
              </ActionForm>
            </div>
          </Card>

          <Card id="leaving" className="scroll-mt-24">
            <CardHeader title="Leaving reasons and alumni" icon={LogOut} />
            <div className={body}>
              <ul className="flex flex-wrap gap-2" aria-label="Leaving reasons now">
                {[...new Set([...settings.leavingReasons, "Other"])].map((r) => <li key={r} className="inline-flex h-8 items-center rounded-full bg-sunken px-3 text-[13px] font-medium">{r}</li>)}
              </ul>
              <ActionForm action={save("leaving")} submitLabel="Save leaving reasons" pendingText="Saving…" className="space-y-4 border-t border-line pt-4">
                <FormArea name="leavingReasons" label="Leaving reasons, one per line" rows={7} required defaultValue={settings.leavingReasons.join("\n")} help="&quot;Other&quot; is always offered, with a box to write the reason. Reasons in use can be renamed; past records keep theirs." />
                <FormCheck name="alumniOn" label="Alumni records (optional)" help="Alumni list, donations, mentors and the job board." defaultChecked={settings.alumniOn} />
              </ActionForm>
            </div>
          </Card>
        </div>

        <Card id="promotion" className="scroll-mt-24">
          <CardHeader title={data.policyYear ? `Promotion policy · ${data.policyYear.name}${data.policy ? ` (version ${data.policy.version})` : ""}` : "Promotion policy"} icon={ArrowUpRight}
            description="Versioned per year. Changing it never changes past promotions." />
          <div className={body}>
            {!data.policyYear ? <p className="text-[14px] text-ink3">No open academic year. Open one in Academic Management to set its promotion policy.</p> : (
              <>
                {data.years.length > 1 && (
                  <form method="get" action={`${BASE}/settings#promotion`} className="flex flex-wrap items-end gap-2">
                    <label className="text-[13px] font-semibold text-ink2">Year
                      <select name="year" defaultValue={data.policyYear.id} className="ml-2 h-10 rounded-xl border border-line bg-surface px-2 text-[14px]">{data.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
                    </label>
                    <button type="submit" className={buttonClass("secondary", "sm")}>Show</button>
                  </form>
                )}
                {!data.policy && <p className="text-[13.5px] text-ink3">Not set yet: the defaults below apply.</p>}
                <ActionForm key={data.policyYear.id} action={save("promotion")} submitLabel="Save as new version" pendingText="Saving…">
                  <input type="hidden" name="academicYearId" value={data.policyYear.id} />
                  <FormCheck name="passRequired" label="Pass required to promote" help="From the final result in Examination & Results." defaultChecked={data.policy?.passRequired ?? true} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormText name="minAttendancePct" label="Minimum attendance %" type="number" min={0} max={100} defaultValue={data.policy?.minAttendancePct ?? ""} help="Below this, the suggestion is Detain. Leave empty for no minimum." />
                    <FormSelect name="exceptionApproverRole" label="Exceptions approved by" required defaultValue={data.policy?.exceptionApproverRole ?? "principal"} options={roleOptions} help="Changes from the suggestion need a reason." />
                  </div>
                  <FormCheck name="feeDuesAllowed" label="Students with fee dues can be promoted" help="On: dues show as a warning only." defaultChecked={data.policy?.feeDuesAllowed ?? true} />
                </ActionForm>
                {data.history.length > 1 && (
                  <details className="rounded-xl bg-sunken/50 px-4 py-3">
                    <summary className="cursor-pointer text-[13.5px] font-semibold">Earlier versions ({data.history.length - 1})</summary>
                    <ul className="mt-2 divide-y divide-line text-[13.5px]">
                      {data.history.slice(1).map((h) => <li key={h.id} className="py-2">Version {h.version} · {h.passRequired ? "pass required" : "pass not required"}{h.minAttendancePct != null ? `, ${h.minAttendancePct}% attendance` : ""}{h.feeDuesAllowed ? "" : ", no fee dues"} · <span className="text-ink3">{formatDateTime(h.createdAt, tz)}</span></li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        </Card>

        <Card id="certificates" className="scroll-mt-24">
          <CardHeader title="Certificates" icon={FileBadge} description="Designs live in Settings, Document Designs. Numbers run in a series per type and year, for example BONAFIDE/2026-27/0001." />
          <div className={body}>
            <ActionForm action={save("certificates")} submitLabel="Save certificates" pendingText="Saving…">
              <Choices name="approvalCertificates" label="Need approval before issuing" options={certTypes.filter((t) => t !== "TC").map((t) => ({ key: t, label: CERTIFICATE_LABEL[t] }))} chosen={settings.approvalCertificates} help="A transfer certificate always needs approval, and clearance must be done first." />
              {data.signatories.length === 0 ? <p className="text-[13.5px] text-ink3">No signatories yet. They are added in Settings, Document Designs.</p> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {certTypes.map((t) => <FormSelect key={t} name={`sig_${t}`} label={`Default signatory: ${CERTIFICATE_LABEL[t]}`} defaultValue={settings.defaultSignatories[t] ?? ""} placeholder="None" options={data.signatories.map((s) => ({ value: s.id, label: `${s.name}, ${s.title}` }))} />)}
                </div>
              )}
              <div className="space-y-3 border-t border-line pt-4">
                <FormCheck name="qrOn" label="QR code to verify (optional)" help="No personal data in the code; the check shows only number, type, date and Valid." defaultChecked={settings.qrOn} />
                <FormCheck name="migrationOn" label="Migration certificates (optional)" help="For students moving between boards or states." defaultChecked={settings.migrationOn} />
                <FormCheck name="digiLockerOn" label="DigiLocker-ready file (optional)" help="Adds a DigiLocker file on Certificates: the issued certificates with their numbers, student details and APAAR ID, in the columns DigiLocker asks for, to upload in the school's DigiLocker Issuer account." defaultChecked={settings.digiLockerOn} />
              </div>
            </ActionForm>
          </div>
        </Card>

        <Card id="id-cards" className="scroll-mt-24">
          <CardHeader title="ID cards" icon={IdCard} description="Photo, name, class, QR code, barcode, academic year and valid-until date always print. The look is set in Settings, Document Designs."
            action={canSettings && <Link href="/settings/document-designs" className={buttonClass("ghost", "sm")}>Document Designs<ArrowUpRight size={15} aria-hidden="true" /></Link>} />
          <div className={body}>
            <ActionForm action={save("id-cards")} submitLabel="Save ID cards" pendingText="Saving…">
              <Choices name="idCardFields" label="Also show" options={ID_CARD_FIELDS} chosen={settings.idCardFields} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormText name="idCardsPerPage" label="Cards per A4 sheet" type="number" min={1} max={8} required defaultValue={settings.idCardsPerPage} />
                <FormText name="idCardValidUntil" label="Valid until" type="date" defaultValue={settings.idCardValidUntil?.toISOString().slice(0, 10) ?? ""} help={`Leave empty to use the last day of the academic year${year ? ` (${formatDate(year.endDate, tz)})` : ""}.`} />
              </div>
              <FormCheck name="rfidOn" label="RFID cards (optional)" help="Records each student's RFID number for attendance devices." defaultChecked={settings.rfidOn} />
            </ActionForm>
          </div>
        </Card>

        <Card id="behaviour" className="scroll-mt-24">
          <CardHeader title="Behaviour" icon={Medal} description="Incident types and points, counselling and career guidance" />
          <div className={body}>
            {settings.incidentTypes.length > 0 && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {settings.incidentTypes.map((t) => (
                  <div key={t.key} className="rounded-xl bg-sunken/60 px-3 py-2.5">
                    <p className="truncate text-[12.5px] font-semibold">{t.label}</p>
                    <p className={`font-semibold tnum ${t.points > 0 ? "text-ok" : t.points < 0 ? "text-bad" : "text-ink3"}`}>{settings.pointsOn ? `${t.points > 0 ? "+" : ""}${t.points} points` : BEHAVIOUR_KIND_LABEL[t.kind]}</p>
                  </div>
                ))}
              </div>
            )}
            <ActionForm action={save("behaviour")} submitLabel="Save behaviour" pendingText="Saving…" className="space-y-3 border-t border-line pt-4">
              <input type="hidden" name="rows" value={settings.incidentTypes.length} />
              <p className="text-[13px] font-semibold text-ink2">Incident types</p>
              {[...settings.incidentTypes, { key: "", label: "", kind: "incident" as const, points: 0 }].map((t, i) => (
                <div key={`${t.key}-${i}`} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_11rem_7rem] sm:items-end">
                  <input type="hidden" name={`key_${i}`} value={t.key} />
                  <FormText name={`label_${i}`} label={t.key ? "Name" : "Add a type"} defaultValue={t.label} maxLength={60} />
                  <FormSelect name={`kind_${i}`} label="Kind" defaultValue={t.kind} options={BEHAVIOUR_KINDS.map((k) => ({ value: k, label: BEHAVIOUR_KIND_LABEL[k] }))} />
                  <FormText name={`points_${i}`} label="Points" inputMode="numeric" defaultValue={t.points} />
                  {t.key && <FormCheck name={`remove_${i}`} label="Remove this type" className="sm:col-span-3" />}
                </div>
              ))}
              <div className="space-y-3 pt-2">
                <FormCheck name="pointsOn" label="Behaviour points (optional)" help="Points per type, added up for each student." defaultChecked={settings.pointsOn} />
                <FormCheck name="counsellingOn" label="Counselling (optional)" help="Counselling cases and sessions. What the counsellor writes is seen only by the Counsellor; everyone else sees “Private”." defaultChecked={settings.counsellingOn} />
                <Choices name="counsellingRoles" label="Who can open counselling cases" options={roleOptions.map((r) => ({ key: r.value, label: r.label }))} chosen={settings.counsellingRoles} />
                <FormCheck name="careerOn" label="Career guidance (optional, secondary schools)" defaultChecked={settings.careerOn} />
              </div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
