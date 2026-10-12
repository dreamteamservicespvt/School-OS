import type { Metadata } from "next";
import Link from "next/link";
import { SettingsLink } from "@/components/settings-link";
import { redirect } from "next/navigation";
import type { CertificateType } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ActionForm, FormSelect, FormText } from "@/components/students/action-form";
import { StudentPicker } from "@/components/students/student-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { studentScope } from "@/lib/students/access";
import { blockMessage, isCleared } from "@/lib/students/leaving";
import { originalTc } from "@/lib/students/certificates";
import { CERTIFICATE_LABEL } from "@/lib/students/labels";
import { BASE, studentPage, todayIso } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { requestCertificateAction } from "../../_actions/certificates";

export const metadata: Metadata = { title: "Issue certificate" };

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));
const CONDUCT = ["Good", "Very good", "Excellent", "Satisfactory"];

/** Issue certificate (03 §2): student, type, purpose, date of issue, signatory; preview; issue (or send for approval). */
export default async function IssueCertificatePage({ searchParams }: { searchParams: Promise<{ student?: string; type?: string; ids?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  if (!can.manage) redirect(`${BASE}/certificates`);
  const sp = await searchParams;
  const types = (Object.keys(CERTIFICATE_LABEL) as CertificateType[]).filter((t) => t !== "MIGRATION" || settings.migrationOn);
  const type = (types.includes(sp.type as CertificateType) ? sp.type : "BONAFIDE") as CertificateType;
  const wanted = [...new Set([...(sp.ids ?? "").split(","), sp.student ?? ""].filter(isId))].slice(0, 200);
  const data = await withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, year?.id);
    const students = wanted.length ? await tx.student.findMany({ where: { AND: [scope, { id: { in: wanted } }] }, select: { id: true, fullName: true, admissionNo: true } }) : [];
    const signatories = await tx.signatory.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" } });
    const sections = await sectionOptions(tx, current, year?.id);
    // For a TC on one student: what clearance says now, and whether an original was issued.
    let tc: { block: string | null; original: string | null } | null = null;
    if (type === "TC" && students.length === 1) {
      const req = await tx.leavingRequest.findFirst({ where: { studentId: students[0].id, status: { in: ["IN_PROGRESS", "LEFT"] } }, orderBy: { createdAt: "desc" }, include: { checks: true } });
      const original = await originalTc(tx, students[0].id);
      tc = {
        block: !req ? "A TC is given only to a student who is leaving. Start leaving on Leaving & Alumni first." : isCleared(req.checks) ? null : blockMessage(req.checks),
        original: original ? `${original.number} on ${formatDate(original.issuedAt ?? original.issueDate, tz)}` : null,
      };
    }
    return { students, signatories, sections, tc };
  });
  const defaultSig = settings.defaultSignatories[type] ?? data.signatories[0]?.id ?? "";
  const back = sp.student ? `${BASE}/students/${sp.student}` : `${BASE}/certificates`;
  const firstStudent = data.students.length === 1 ? data.students[0] : null;

  return (
    <>
      <PageHeader title="Issue certificate" href={`${BASE}/certificates/new`} userId={current.user.id} />
      <p className="-mt-3 mb-5 max-w-prose text-ink-2">The certificate fills from the student&apos;s record. Preview it, then issue. A TC always goes for approval first{settings.approvalCertificates.length ? `, and so do ${settings.approvalCertificates.map((t) => CERTIFICATE_LABEL[t as CertificateType]?.toLowerCase()).filter(Boolean).join(", ")}` : ""}.</p>
      <Card className="max-w-2xl">
        <CardBody>
          {data.tc?.block && (
            <Alert tone="warning" className="mb-4" title="TC blocked" action={firstStudent ? <Link className="font-medium underline" href={`${BASE}/leaving${data.tc.block.includes("Start leaving") ? `/new?student=${firstStudent.id}` : ""}`}>{data.tc.block.includes("Start leaving") ? "Start leaving" : "Open Leaving & Alumni"}</Link> : undefined}>{data.tc.block}</Alert>
          )}
          {data.tc?.original && <Alert tone="info" className="mb-4">An original TC was issued ({data.tc.original}). A new one prints as Duplicate and needs a reason.</Alert>}
          {data.signatories.length === 0 && <Alert tone="warning" className="mb-4">No signatories are set up. Add the Principal&apos;s name and signature in <SettingsLink href="/settings/document-designs">Settings, Document Designs</SettingsLink>. A character certificate needs a signatory.</Alert>}
          <ActionForm action={requestCertificateAction}
            footer={<>
              <SubmitButton pendingText="Saving…">Issue</SubmitButton>
              <button type="submit" formAction={`${BASE}/certificates/preview`} formMethod="get" formTarget="_blank" formNoValidate className={buttonClass("secondary")}>Preview</button>
              <Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>
            </>}>
            <StudentPicker name="studentIds" label={data.students.length > 1 ? "Students" : "Student"} multiple={data.students.length > 1 || !sp.student} initial={data.students.map((s) => ({ id: s.id, name: s.fullName, admissionNo: s.admissionNo, cls: "" }))}
              anyStatus sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} help="Several students get one certificate each (not for a TC)." />
            <FormSelect name="type" label="Certificate type" required defaultValue={type} options={types.map((t) => ({ value: t, label: CERTIFICATE_LABEL[t] }))} />
            <FormText name="purpose" label="Purpose" maxLength={200} help="Needed for a bonafide certificate, for example: bank account opening." />
            <FormText name="issueDate" label="Date of issue" type="date" required defaultValue={todayIso(tz)} />
            {data.signatories.length > 0 && <FormSelect name="signatoryId" label="Signatory" required defaultValue={defaultSig} options={data.signatories.map((s) => ({ value: s.id, label: `${s.name}, ${s.title}` }))} />}
            <FormSelect name="conduct" label="Conduct" defaultValue="Good" options={CONDUCT.map((c) => ({ value: c, label: c }))} help="Printed on a TC and a character certificate." />
            <FormText name="duplicateReason" label="Reason for a duplicate" required={Boolean(type === "TC" && data.tc?.original)} maxLength={300} help="Only for a second copy of a TC, for example: the original was lost." />
            <p className="text-sm text-ink-2">Certificate number: given automatically, next in the series for the type and year{type === "TC" ? " (when approved)" : ""}.</p>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
