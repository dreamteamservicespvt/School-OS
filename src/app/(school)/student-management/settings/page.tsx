import type { Metadata } from "next";
import Link from "next/link";
import { SettingsLink } from "@/components/settings-link";
import { redirect } from "next/navigation";
import type { CertificateType } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { StudentsHead } from "../_lib/head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FormArea, FormCheck, FormFieldError, FormSelect, FormText } from "@/components/students/action-form";
import { previewAdmissionNo } from "@/lib/students/students";
import { currentPolicy } from "@/lib/students/settings";
import { BEHAVIOUR_KINDS, BEHAVIOUR_KIND_LABEL, CERTIFICATE_LABEL, ID_CARD_FIELDS, LIST_COLUMNS, OPTIONAL_FORM_FIELDS, STATUS_RULES } from "@/lib/students/labels";
import { BASE, studentPage } from "../_lib/page";
import { saveSettingsAction } from "../_actions/settings";

export const metadata: Metadata = { title: "Student Settings" };

const TABS = [
  { key: "general", label: "Student records" },
  { key: "identifiers", label: "Identifier types" },
  { key: "promotion", label: "Promotion policy" },
  { key: "leaving", label: "Leaving & alumni" },
  { key: "certificates", label: "Certificates" },
  { key: "id-cards", label: "ID cards" },
  { key: "behaviour", label: "Behaviour" },
] as const;

/** Checkboxes sharing one name, each with its own value. */
function Choices({ name, label, options, chosen, help }: { name: string; label: string; options: { key: string; label: string }[]; chosen: string[]; help?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.key} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
            <input type="checkbox" name={name} value={o.key} defaultChecked={chosen.includes(o.key)} className="size-5 accent-brand" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {help && <p className="mt-1 text-sm text-ink-2">{help}</p>}
      <FormFieldError name={name} />
    </fieldset>
  );
}

/** Student Settings (03 §6): the rules for student records in this school. */
export default async function StudentSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "general";
  const data = await withSchool(current.ctx, async (tx) => {
    const years = await tx.academicYear.findMany({ where: { archivedAt: null, status: { not: "CLOSED" } }, orderBy: { startDate: "asc" } });
    const policyYear = years.find((y) => y.id === sp.year) ?? (year && year.status !== "CLOSED" ? year : years[0]) ?? null;
    return {
      years, policyYear,
      sample: tab === "general" ? await previewAdmissionNo(tx, current.ctx) : null,
      policy: policyYear ? await currentPolicy(tx, policyYear.id) : null,
      history: policyYear ? await tx.promotionPolicy.findMany({ where: { academicYearId: policyYear.id }, orderBy: { version: "desc" }, take: 10 }) : [],
      roles: await tx.role.findMany({ where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
      signatories: await tx.signatory.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" } }),
    };
  });
  const roleOptions = [...new Map(data.roles.map((r) => [r.key!, { value: r.key!, label: r.name }])).values()];
  const save = saveSettingsAction.bind(null, tab);
  const certTypes = (Object.keys(CERTIFICATE_LABEL) as CertificateType[]);

  return (
    <>
      <StudentsHead page="Student Settings" href={`${BASE}/settings`} sub={`The rules for student records at ${current.school.name}. Every change is logged.`} />
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Student Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-1 lg:flex-col">
            {TABS.map((t) => (
              <li key={t.key}>
                <Link href={`?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
                  className={`inline-flex h-10 w-full items-center whitespace-nowrap rounded-xl px-3 text-[14px] font-semibold transition ${tab === t.key ? "bg-brand/10 text-brand" : "text-ink2 hover:bg-sunken hover:text-ink"}`}>{t.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          {tab === "general" && (
            <>
              <Card>
                <CardHeader title="Student records" description={`Next admission number: ${data.sample}`} />
                <CardBody>
                  <ActionForm action={save} submitLabel="Save" pendingText="Saving…">
                    <h3 className="font-medium">Admission number format</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormText name="admissionPrefix" label="Prefix" defaultValue={settings.admissionPrefix} maxLength={20} help="Leave empty to use the school code, for example SPS/." />
                      <FormText name="admissionPadding" label="Digits in the running number" type="number" min={1} max={8} required defaultValue={settings.admissionPadding} />
                    </div>
                    <FormCheck name="admissionUseYear" label="Put the year in the number (for example 2026/0001)" defaultChecked={settings.admissionUseYear} />
                    <FormCheck name="admissionRestartYear" label="Restart the running number each year" defaultChecked={settings.admissionRestartYear} />
                    <Choices name="requiredFields" label="Required on the student form" options={OPTIONAL_FORM_FIELDS} chosen={settings.requiredFields} help="Name, date of birth, gender, class and a parent's phone are always required." />
                    <Choices name="listColumns" label="Columns on the Student List" options={LIST_COLUMNS} chosen={settings.listColumns} />
                    <FormArea name="requiredDocuments" label="Documents expected for every student" rows={5} defaultValue={settings.requiredDocuments.join("\n")} help="One per line. Shown as &quot;documents complete (5 of 6)&quot; on each student." />
                    <FormCheck name="studentLoginsOn" label="Student logins (optional)" help="Older students can sign in to see their own records." defaultChecked={settings.studentLoginsOn} />
                    <FormCheck name="smartImportOn" label="Smart Import (optional)" help="On Import students, matches your file's columns to the student fields and suggests fixes for dates, phone numbers and class names. Suggestions only: you check every one before anything is saved." defaultChecked={settings.smartImportOn} />
                  </ActionForm>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Student status and allowed changes" description={<>The default list. Extra fields for students are added in <SettingsLink href="/settings/forms-approvals">Settings, Forms &amp; Approvals</SettingsLink>.</>} />
                <CardBody>
                  <ul className="divide-y divide-line text-[15px]">
                    {STATUS_RULES.map((r) => <li key={`${r.from}-${r.to}`} className="grid gap-1 py-2 sm:grid-cols-3"><span>{r.from}</span><span>to {r.to}</span><span className="text-ink-2">{r.how}</span></li>)}
                  </ul>
                </CardBody>
              </Card>
            </>
          )}

          {tab === "identifiers" && (
            <Card>
              <CardHeader title="Identifier types" description="Aadhaar, APAAR ID and PEN are kept on every student. Add the school's own, each restricted or highly restricted." />
              <CardBody>
                <ActionForm action={save} submitLabel="Save" pendingText="Saving…">
                  <input type="hidden" name="rows" value={settings.identifierTypes.length} />
                  {[...settings.identifierTypes, { key: "", label: "", level: "restricted" as const }].map((t, i) => (
                    <div key={`${t.key}-${i}`} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
                      <input type="hidden" name={`key_${i}`} value={t.key} />
                      <FormText name={`label_${i}`} label={t.key ? "Name" : "Add a type"} defaultValue={t.label} maxLength={60} placeholder={t.key ? undefined : "For example: Board registration number"} />
                      <FormSelect name={`level_${i}`} label="Who can see it" defaultValue={t.level} options={[{ value: "restricted", label: "Restricted" }, { value: "highly", label: "Highly restricted" }]} />
                      {t.key ? <FormCheck name={`remove_${i}`} label="Remove" /> : <span />}
                    </div>
                  ))}
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {tab === "promotion" && (
            data.policyYear ? (
              <Card>
                <CardHeader title={`Promotion policy for ${data.policyYear.name}`} description={data.policy ? `Version ${data.policy.version}. Saving makes a new version; past promotions keep the rules they used.` : "Not set yet: the defaults below apply."} />
                <CardBody>
                  {data.years.length > 1 && (
                    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="tab" value="promotion" />
                      <label className="text-sm font-medium">Year
                        <select name="year" defaultValue={data.policyYear.id} className="ml-2 h-11 rounded-lg border border-line-strong bg-surface px-2">{data.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
                      </label>
                      <button type="submit" className="min-h-11 rounded-lg border border-line-strong px-4 font-medium hover:bg-surface-2">Show</button>
                    </form>
                  )}
                  <ActionForm key={data.policyYear.id} action={save} submitLabel="Save as new version" pendingText="Saving…">
                    <input type="hidden" name="academicYearId" value={data.policyYear.id} />
                    <FormCheck name="passRequired" label="Pass in the final result is required" defaultChecked={data.policy?.passRequired ?? true} />
                    <FormText name="minAttendancePct" label="Minimum attendance %" type="number" min={0} max={100} defaultValue={data.policy?.minAttendancePct ?? ""} help="Leave empty for no minimum." />
                    <FormCheck name="feeDuesAllowed" label="Students with fee dues can be promoted" help="When on, dues show as a warning only." defaultChecked={data.policy?.feeDuesAllowed ?? true} />
                    <FormSelect name="exceptionApproverRole" label="Who approves exceptions" required defaultValue={data.policy?.exceptionApproverRole ?? "principal"} options={roleOptions} />
                  </ActionForm>
                  {data.history.length > 1 && (
                    <>
                      <h3 className="mb-1 mt-5 font-medium">Earlier versions</h3>
                      <ul className="divide-y divide-line text-[15px]">
                        {data.history.slice(1).map((h) => <li key={h.id} className="py-2">Version {h.version} · {h.passRequired ? "pass required" : "pass not required"}{h.minAttendancePct != null ? `, ${h.minAttendancePct}% attendance` : ""}{h.feeDuesAllowed ? "" : ", no fee dues"} · {formatDateTime(h.createdAt, tz)}</li>)}
                      </ul>
                    </>
                  )}
                </CardBody>
              </Card>
            ) : <Card><CardBody><p className="text-ink-2">No open academic year. Open one in Academic Management to set its promotion policy.</p></CardBody></Card>
          )}

          {tab === "leaving" && (
            <Card>
              <CardHeader title="Leaving & alumni" />
              <CardBody>
                <ActionForm action={save} submitLabel="Save" pendingText="Saving…">
                  <FormArea name="leavingReasons" label="Leaving reasons" rows={8} required defaultValue={settings.leavingReasons.join("\n")} help="One per line. &quot;Other&quot; is always offered, with a box to write the reason." />
                  <FormCheck name="alumniOn" label="Alumni records (optional)" help="Alumni list, donations, mentors and the job board." defaultChecked={settings.alumniOn} />
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {tab === "certificates" && (
            <Card>
              <CardHeader title="Certificates" description={<>Certificate designs are set in <SettingsLink href="/settings/document-designs">Settings, Document Designs</SettingsLink>. Numbers run in a series per type and year, for example BONAFIDE/2026-27/0001.</>} />
              <CardBody>
                <ActionForm action={save} submitLabel="Save" pendingText="Saving…">
                  <Choices name="approvalCertificates" label="Need approval before issuing" options={certTypes.filter((t) => t !== "TC").map((t) => ({ key: t, label: CERTIFICATE_LABEL[t] }))} chosen={settings.approvalCertificates} help="A TC always needs approval." />
                  {data.signatories.length === 0 ? <p className="text-sm text-ink-2">No signatories yet. They are added in <SettingsLink href="/settings/document-designs">Settings, Document Designs</SettingsLink>.</p> : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {certTypes.map((t) => <FormSelect key={t} name={`sig_${t}`} label={`Default signatory: ${CERTIFICATE_LABEL[t]}`} defaultValue={settings.defaultSignatories[t] ?? ""} placeholder="None" options={data.signatories.map((s) => ({ value: s.id, label: `${s.name}, ${s.title}` }))} />)}
                    </div>
                  )}
                  <FormCheck name="qrOn" label="QR code to check a certificate (optional)" help="The code holds no personal data; the check shows only number, type, date and Valid." defaultChecked={settings.qrOn} />
                  <FormCheck name="migrationOn" label="Migration certificates (optional)" help="For students moving between boards or states." defaultChecked={settings.migrationOn} />
                  <FormCheck name="digiLockerOn" label="DigiLocker-ready file (optional)" help="Adds a DigiLocker file on Certificates: the issued certificates with their numbers, student details and APAAR ID, in the columns DigiLocker asks for, to upload in the school's DigiLocker Issuer account." defaultChecked={settings.digiLockerOn} />
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {tab === "id-cards" && (
            <Card>
              <CardHeader title="ID cards" description={<>Which details a card may show, and how many cards go on a page. The card&apos;s look (layout, colours, size, QR code and barcode) is set in <SettingsLink href="/settings/document-designs">Settings, Document Designs</SettingsLink>.</>} />
              <CardBody>
                <ActionForm action={save} submitLabel="Save" pendingText="Saving…">
                  <Choices name="idCardFields" label="Also show" options={ID_CARD_FIELDS} chosen={settings.idCardFields} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormText name="idCardsPerPage" label="Cards per A4 page" type="number" min={1} max={8} required defaultValue={settings.idCardsPerPage} />
                    <FormText name="idCardValidUntil" label="Valid until" type="date" defaultValue={settings.idCardValidUntil?.toISOString().slice(0, 10) ?? ""} help={`Leave empty to use the last day of the academic year${year ? ` (${formatDate(year.endDate, tz)})` : ""}.`} />
                  </div>
                  <FormCheck name="rfidOn" label="RFID cards (optional)" help="Record each student's RFID number for attendance devices." defaultChecked={settings.rfidOn} />
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {tab === "behaviour" && (
            <Card>
              <CardHeader title="Behaviour" />
              <CardBody>
                <ActionForm action={save} submitLabel="Save" pendingText="Saving…">
                  <input type="hidden" name="rows" value={settings.incidentTypes.length} />
                  <h3 className="font-medium">Incident types</h3>
                  {[...settings.incidentTypes, { key: "", label: "", kind: "incident" as const, points: 0 }].map((t, i) => (
                    <div key={`${t.key}-${i}`} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_11rem_7rem_auto] sm:items-end">
                      <input type="hidden" name={`key_${i}`} value={t.key} />
                      <FormText name={`label_${i}`} label={t.key ? "Name" : "Add a type"} defaultValue={t.label} maxLength={60} />
                      <FormSelect name={`kind_${i}`} label="Kind" defaultValue={t.kind} options={BEHAVIOUR_KINDS.map((k) => ({ value: k, label: BEHAVIOUR_KIND_LABEL[k] }))} />
                      <FormText name={`points_${i}`} label="Points" inputMode="numeric" defaultValue={t.points} />
                      {t.key ? <FormCheck name={`remove_${i}`} label="Remove" /> : <span />}
                    </div>
                  ))}
                  <FormCheck name="pointsOn" label="Behaviour points (optional)" help="Points per type, added up for each student." defaultChecked={settings.pointsOn} />
                  <FormCheck name="counsellingOn" label="Counselling (optional)" help="Counselling cases and sessions. What the counsellor writes is seen only by the Counsellor." defaultChecked={settings.counsellingOn} />
                  <Choices name="counsellingRoles" label="Who can open counselling cases" options={roleOptions.map((r) => ({ key: r.value, label: r.label }))} chosen={settings.counsellingRoles} />
                  <FormCheck name="careerOn" label="Career guidance (optional, secondary schools)" defaultChecked={settings.careerOn} />
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
