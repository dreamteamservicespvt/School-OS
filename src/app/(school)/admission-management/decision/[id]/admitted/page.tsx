import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fullPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { UNDO_ADMISSION_MS, type Conversion } from "@/lib/admission/convert";
import { feePlanApplies } from "@/lib/students/hooks";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { UndoAdmission } from "../../decision-forms";

export const metadata: Metadata = { title: "Admission confirmed" };

export default async function AdmittedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, tz } = await fullPage();
  const data = await withSchool(current.ctx, async (tx) => {
    const app = await tx.application.findFirst({ where: { id, archivedAt: null } });
    if (!app) return null;
    if (!app.studentId) return { admitted: false as const };
    const c = (app.conversion ?? null) as unknown as Conversion | null;
    const [student, section, guardians, links, consents] = await Promise.all([
      tx.student.findUnique({ where: { id: app.studentId }, select: { id: true, fullName: true, admissionNo: true } }),
      c ? tx.section.findUnique({ where: { id: c.sectionId }, select: { name: true, schoolClass: { select: { name: true } } } }) : null,
      c ? tx.guardian.findMany({ where: { id: { in: [...c.newGuardianIds, ...c.linkedGuardianIds] } }, select: { id: true, name: true, relationship: true, phone: true } }) : [],
      c?.parentLinkIds?.length ? tx.parentLink.findMany({ where: { id: { in: c.parentLinkIds } }, select: { id: true, guardianId: true, status: true } }) : [],
      c?.consentRecordIds?.length ? tx.consentRecord.count({ where: { id: { in: c.consentRecordIds }, withdrawnAt: null } }) : 0,
    ]);
    return { admitted: true as const, app, c, student, section, guardians, links, consents };
  });
  if (!data) notFound();
  if (!data.admitted) redirect(`${BASE}/applications/${id}`);
  const { app, c, student, section } = data;
  const now = Date.now();
  const undoUntil = app.admittedAt ? app.admittedAt.getTime() + UNDO_ADMISSION_MS : 0;
  const canUndo = viewer.change === "all" && undoUntil > now;
  const welcome = c?.welcome === "queued" || c?.welcome === "sent" ? "Sent to the parent with the admission number." : c?.welcome ? `Not sent (${c.welcome}). Send it from Communication.` : "Not sent. Check the \"admission-welcome\" rule in Communication.";

  const items: { label: string; value: React.ReactNode; href?: string; link?: string }[] = [
    { label: "Student record", value: `${student?.fullName ?? app.fullName}, admission no. ${student?.admissionNo ?? c?.admissionNo ?? ""}`, href: `/student-management/students/${app.studentId}`, link: "Open student" },
    { label: "Class and section", value: section ? `${section.schoolClass.name} ${section.name}, roll no. ${c?.rollNo ?? ""}` : "" },
    {
      label: "Parent records",
      value: (
        <ul className="space-y-1">
          {data.guardians.map((g) => (
            <li key={g.id}>
              <Link href={`/student-management/guardians/${g.id}`} className="text-brand-text hover:underline">{g.name}</Link> ({g.relationship}, {g.phone})
              {c?.linkedGuardianIds.includes(g.id) ? " · existing parent, linked (sibling)" : " · new"}
            </li>
          ))}
        </ul>
      ),
    },
    { label: "Consent", value: data.consents > 0 ? `${data.consents} consent ${data.consents === 1 ? "record" : "records"} moved to the parents' Consent Records.` : "No consent records were moved." , href: "/student-management/guardians/consent", link: "Consent Records" },
    { label: "Parent Link", value: data.links.length ? `${data.links.length} ${data.links.length === 1 ? "link" : "links"} made and sent, so the parent can see fees due, pay and download receipts.` : "Not made: Parent Link is off for this school, or the parent has no mobile number." },
    { label: "Fee plan", value: feePlanApplies() ? "Set up from the class fee structure for the year." : "Set up in Fee Management, once its fee structures are ready." },
    { label: "Welcome message", value: welcome },
    { label: "ID card", value: "Ready to print in Certificates & ID Cards.", href: `/student-management/certificates/id-cards/print?ids=${app.studentId}`, link: "Print ID card" },
  ];

  return (
    <>
      <PageHeader title="Admission confirmed" href={`${BASE}/decision/${id}/admitted`} userId={current.user.id} />
      <Alert tone="success" title={`${student?.fullName ?? app.fullName} is admitted`} className="mb-6">
        Admission no. {student?.admissionNo ?? c?.admissionNo}. Confirmed {app.admittedAt ? formatDateTime(app.admittedAt, tz) : ""} from application {app.applicationNo}.
      </Alert>
      <Card className="mb-6">
        <CardHeader title="Everything made for this admission" />
        <CardBody>
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.label} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-2">{i.label}</p>
                  <div className="mt-0.5 break-words">{i.value}</div>
                </div>
                {i.href && <Link href={i.href} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2">{i.link}</Link>}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href={`${BASE}/decision?tab=approved`} variant="primary">Next admission</ButtonLink>
        <ButtonLink href={`${BASE}/applications/${id}`}>Open application</ButtonLink>
        {canUndo && (
          <>
            <UndoAdmission id={id} />
            <span className="text-sm text-ink-2">Undo works until {formatDateTime(new Date(undoUntil), tz)}, if nothing else has happened to the student.</span>
          </>
        )}
      </div>
      {!canUndo && app.admittedAt && <p className="mt-3 text-sm text-ink-2">Admitted on {formatDate(app.admittedAt, tz)}. To reverse it now, record the student leaving in Student Management.</p>}
    </>
  );
}
