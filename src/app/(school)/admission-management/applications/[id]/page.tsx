import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { decryptField, maskLast4 } from "@/lib/crypto";
import { fullPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { CLOSED_STAGES, movableTo, OPEN_STAGES, stageLabel } from "@/lib/admission/applications";
import { DOC_STATUS_LABEL, progressOf } from "@/lib/admission/documents";
import { COUNTER_MODES, feeStatus, modeLabel } from "@/lib/admission/fee";
import { admissionConsentTexts } from "@/lib/admission/consent";
import { outcomeLabel } from "@/lib/admission/tests";
import { blockers } from "@/lib/admission/convert";
import { classRule, docLabel, DOC_TYPES, stageOn } from "@/lib/admission/settings";
import { seatsFor } from "@/lib/admission/seats";
import { consentLabel } from "@/lib/data-security/consent";
import { loadCustomFields, visibleFields } from "@/lib/custom-fields";
import { CustomFieldValues } from "@/components/custom-fields";
import type { CustomValues } from "@/lib/custom-field-rules";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DocProgress, Facts, FeeBadge, StageBadge } from "../../_components/bits";
import { AppActions, CancelPayment, ConsentForms, DocActions, ExceptionDialog, FeeForm, RemindButton, UploadDoc } from "./app-forms";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, settings, tz } = await fullPage();
  const data = await withSchool(current.ctx, async (tx) => {
    const app = await tx.application.findFirst({
      where: { id, archivedAt: null },
      include: {
        documents: { orderBy: { docType: "asc" } }, payments: { orderBy: { createdAt: "desc" } }, activities: { orderBy: { at: "desc" }, take: 200 },
        tests: { where: { archivedAt: null }, include: { test: true } }, interviews: { orderBy: { startsAt: "desc" } },
      },
    });
    if (!app) return null;
    const [cls, year, rule, consents, texts, enquiry, sibling, student, seats, staff, fields, block, approval] = await Promise.all([
      tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } }),
      tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { name: true } }),
      classRule(tx, app.classId),
      tx.admissionConsent.findMany({ where: { applicationId: app.id } }),
      admissionConsentTexts(tx, current.school.name),
      app.enquiryId ? tx.enquiry.findUnique({ where: { id: app.enquiryId }, select: { id: true, childName: true } }) : null,
      app.siblingStudentId ? tx.student.findUnique({ where: { id: app.siblingStudentId }, select: { id: true, fullName: true, admissionNo: true } }) : null,
      app.studentId ? tx.student.findUnique({ where: { id: app.studentId }, select: { id: true, fullName: true, admissionNo: true } }) : null,
      seatsFor(tx, app.academicYearId, [app.classId]),
      tx.staff.findMany({ select: { id: true, fullName: true, userLoginId: true } }),
      loadCustomFields(tx, "application"),
      app.stage === "APPROVED" ? blockers(tx, current.ctx, app) : Promise.resolve([] as string[]),
      app.approvalId ? tx.approval.findUnique({ where: { id: app.approvalId }, select: { id: true, status: true } }) : null,
    ]);
    return { app, cls, year, rule, consents, texts, enquiry, sibling, student, seat: seats.get(app.classId), staff, fields: visibleFields(fields, current.roles), block, approval };
  });
  if (!data) notFound();
  const { app } = data;
  const full = viewer.change === "all";
  const closed = CLOSED_STAGES.includes(app.stage);
  const p = progressOf(app.documents, data.rule.documents);
  const fee = feeStatus(app, app.payments);
  const by = (userId: string | null) => (userId ? data.staff.find((s) => s.userLoginId === userId)?.fullName ?? "Staff" : "Parent (online)");
  const docTypes = DOC_TYPES.map((d) => ({ value: d.key, label: d.label }));
  const nextMissing = data.rule.documents.find((d) => !app.documents.some((x) => x.docType === d.type && (x.status === "RECEIVED" || x.status === "VERIFIED")))?.type;
  const moves = full && (OPEN_STAGES.includes(app.stage) || app.stage === "WAITING_LIST") ? movableTo(settings, app.stage).map((s) => ({ value: s, label: s === "DECISION" ? "Send for decision" : `Move to ${stageLabel(s)}` })) : [];
  const dataConsent = data.consents.find((c) => c.consentType === "data-processing" && !c.withdrawnAt && c.otpVerifiedAt);
  const prefs = (app.preferences ?? {}) as { secondLanguage?: string | null; transportNeeded?: boolean; transportStop?: string | null; hostelNeeded?: boolean };
  let aadhaar: string | null = null;
  if (app.aadhaarEnc && viewer.restricted) {
    try { aadhaar = maskLast4(decryptField(app.aadhaarEnc)); } catch { aadhaar = "On file"; }
  }

  return (
    <>
      <PageHeader title={app.fullName} href={`${BASE}/applications/${app.id}`} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {full && !closed && app.stage !== "APPROVED" && <ButtonLink href={`${BASE}/applications/${app.id}/edit`}>Edit form</ButtonLink>}
          {app.stage === "DECISION" && <ButtonLink href={`${BASE}/decision?focus=${app.id}`} variant="primary">Decide</ButtonLink>}
          {app.stage === "APPROVED" && full && <ButtonLink href={`${BASE}/decision/${app.id}/confirm`} variant="primary">Confirm admission</ButtonLink>}
          {app.stage === "ADMITTED" && <ButtonLink href={`${BASE}/decision/${app.id}/admitted`} variant="primary">Admission result</ButtonLink>}
        </div>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-medium">{app.applicationNo}</span>
        <StageBadge stage={app.stage} />
        {app.channel === "online" && <Badge tone="brand">Filled online</Badge>}
        {app.sentBackAt && !closed && <Badge tone="warning">Sent back to parent {formatDate(app.sentBackAt, tz)}</Badge>}
        {app.waitingRank !== null && <Badge tone="warning">Waiting list: number {app.waitingRank}</Badge>}
      </div>
      {app.stage === "APPROVED" && data.block.length > 0 && (
        <Alert tone="warning" title="Before the admission can be confirmed" className="mb-4">
          <ul className="list-disc pl-5">{data.block.map((b) => <li key={b}>{b}</li>)}</ul>
        </Alert>
      )}
      {full && !closed && (
        <Card className="mb-5">
          <CardBody>
            <AppActions id={app.id} canReview={app.stage === "SUBMITTED" || app.stage === "SUBMITTED_ONLINE"} moves={moves} closed={closed} />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Application" />
          <CardBody>
            <Facts items={[
              ["Class applied for", `${data.cls?.name ?? ""}${data.year ? ` (${data.year.name})` : ""}`],
              ["Seats left in the class", data.seat ? `${data.seat.free} of ${data.seat.seats}` : "No sections yet"],
              ["Date of birth", formatDate(app.dateOfBirth, "UTC")],
              ["Gender", app.gender],
              ["Father", app.fatherName],
              ["Mother", app.motherName],
              ["Guardian", app.guardianName ? `${app.guardianName} (${app.guardianRelation ?? "Guardian"})` : null],
              ["Parent's phone", <a key="p" href={`tel:+91${app.phone}`} className="text-brand-text hover:underline">+91 {app.phone}</a>],
              ["Other phone", app.altPhone],
              ["Email", app.email],
              ["Address", app.address],
              ["Previous school", app.previousSchool ? `${app.previousSchool}${app.previousClass ? `, ${app.previousClass}` : ""}${app.previousMarks ? `, ${app.previousMarks}` : ""}` : null],
              ["Sibling in this school", data.sibling ? `${data.sibling.fullName} (${data.sibling.admissionNo})` : null],
              ["Category", app.category],
              ["Second language", prefs.secondLanguage ?? null],
              ["Transport", prefs.transportNeeded ? `Needed${prefs.transportStop ? `, stop: ${prefs.transportStop}` : ""}` : null],
              ["Hostel", prefs.hostelNeeded ? "Needed" : null],
              ["Religion", app.religion],
              ["Mother tongue", app.motherTongue],
              ["Occupation", app.occupation],
              ["Aadhaar (restricted)", aadhaar],
              ["From enquiry", data.enquiry ? <Link key="e" href={`${BASE}/enquiries/${data.enquiry.id}`} className="text-brand-text hover:underline">{data.enquiry.childName}</Link> : null],
              ["Submitted", formatDateTime(app.createdAt, tz)],
              ["Reviewed", app.reviewedAt ? `${formatDate(app.reviewedAt, tz)}${app.reviewNote ? `: ${app.reviewNote}` : ""}` : null],
              ["Decision", app.decidedAt ? `${formatDate(app.decidedAt, tz)}${app.decisionRemarks ? `: ${app.decisionRemarks}` : ""}` : null],
              ["Withdrawn", app.withdrawnAt ? `${formatDate(app.withdrawnAt, tz)}: ${app.withdrawnReason ?? ""}` : null],
              ["Student", data.student ? `${data.student.fullName}, admission no. ${data.student.admissionNo}` : null],
            ]} />
            {data.fields.length > 0 && <div className="mt-4"><CustomFieldValues fields={data.fields} values={(app.customFields ?? {}) as CustomValues} /></div>}
            {data.approval && <p className="mt-4 text-sm"><Link href={`/approvals/${data.approval.id}`} className="text-brand-text underline">Open the approval request</Link></p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Documents" description={<DocProgress verified={p.requiredVerified} required={p.required} missing={p.missing} />} action={full && !closed ? <UploadDoc applicationId={app.id} docTypes={docTypes} defaultType={nextMissing} /> : undefined} />
          <CardBody>
            <ul className="divide-y divide-line">
              {app.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">{docLabel(d.docType)}{d.required ? "" : <span className="text-sm font-normal text-ink-2"> (optional)</span>}</p>
                    <p className="text-sm text-ink-2">
                      <Badge tone={d.status === "VERIFIED" ? "success" : d.status === "REJECTED" ? "danger" : d.status === "RECEIVED" ? "brand" : "neutral"}>{DOC_STATUS_LABEL[d.status]}</Badge>
                      {d.originalSeen && " · Original seen"}
                      {d.verifiedAt && ` · Verified by ${by(d.verifiedById)}, ${formatDateTime(d.verifiedAt, tz)}`}
                      {d.rejectReason && ` · ${d.rejectReason}`}
                    </p>
                    {d.fileId && <a href={`${BASE}/files/${d.fileId}`} target="_blank" rel="noopener" className="text-sm text-brand-text underline">View file</a>}
                  </div>
                  {full && !closed && <DocActions docId={d.id} status={d.status} canVerify={Boolean(d.fileId || d.originalSeen)} originalSeen={d.originalSeen} />}
                </li>
              ))}
            </ul>
            {full && !closed && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.missing.length > 0 && <RemindButton id={app.id} />}
                {viewer.overCapacity && !p.complete && !app.papersException && <ExceptionDialog id={app.id} />}
              </div>
            )}
            {app.papersException && <p className="mt-3 text-sm text-warn-text">Exception: may be admitted with papers pending. {app.papersException}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Consent" description="Data consent is needed before the admission. Each consent keeps the version of the text agreed to." />
          <CardBody>
            <ul className="space-y-2">
              {data.texts.map((t) => {
                const c = data.consents.find((x) => x.consentType === t.type && !x.withdrawnAt && x.otpVerifiedAt);
                return (
                  <li key={t.type} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{consentLabel(t.type)}{t.required ? "" : " (optional)"}</span>
                    {c ? <Badge tone="success">Given by {c.givenByName}, {formatDate(c.givenAt, tz)}{c.version ? `, version ${c.version}` : ""}</Badge> : <Badge tone={t.required ? "warning" : "neutral"}>Not given</Badge>}
                  </li>
                );
              })}
            </ul>
            {full && !closed && !dataConsent && <div className="mt-4"><ConsentForms id={app.id} phone={`•••••${app.phone.slice(-4)}`} texts={data.texts} parent={app.fatherName ?? app.motherName ?? app.guardianName ?? ""} /></div>}
          </CardBody>
        </Card>

        {(app.feeDuePaise || app.payments.length > 0) && (
          <Card>
            <CardHeader title="Application fee" description={<FeeBadge status={fee} />} action={full && fee.key !== "paid" && !closed && app.feeDuePaise ? <FeeForm id={app.id} left={String(Number(fee.duePaise - fee.paidPaise) / 100)} modes={COUNTER_MODES.map((m) => ({ value: m.value, label: m.label }))} /> : undefined} />
            <CardBody>
              <p>Due: {app.feeDuePaise ? formatRupees(app.feeDuePaise) : "Nothing"} · Paid: {formatRupees(fee.paidPaise)}</p>
              {app.payments.length > 0 && (
                <ul className="mt-3 divide-y divide-line">
                  {app.payments.map((pay) => (
                    <li key={pay.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {formatRupees(pay.amountPaise)} · {modeLabel(pay.mode)}{pay.reference ? ` (${pay.reference})` : ""} · {pay.status === "CONFIRMED" ? (pay.cancelledAt ? `Cancelled: ${pay.cancelReason}` : `Receipt ${pay.receiptNo}`) : pay.status === "PENDING" ? "Waiting for payment confirmation" : `Failed${pay.failedReason ? `: ${pay.failedReason}` : ""}`}
                        <span className="block text-sm text-ink-2">{formatDateTime(pay.confirmedAt ?? pay.createdAt, tz)}</span>
                      </span>
                      <span className="flex gap-1">
                        {pay.status === "CONFIRMED" && !pay.cancelledAt && <a href={`${BASE}/applications/${app.id}/receipt/${pay.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-brand-text underline">Receipt</a>}
                        {pay.status === "CONFIRMED" && !pay.cancelledAt && viewer.overCapacity && <CancelPayment paymentId={pay.id} />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}

        {(stageOn(settings, "test") || stageOn(settings, "interview") || app.tests.length > 0 || app.interviews.length > 0) && (
          <Card>
            <CardHeader title="Test & Interview" action={full && !closed ? <ButtonLink href={`${BASE}/tests?tab=interviews&schedule=${app.id}`} size="sm">Schedule interview</ButtonLink> : undefined} />
            <CardBody>
              {app.tests.length === 0 && app.interviews.length === 0 && <p className="text-ink-2">No test or interview yet. Schedule a test for several applicants on the Test & Interview page.</p>}
              <ul className="space-y-2">
                {app.tests.map((b) => (
                  <li key={b.id}>
                    <span className="font-medium">{b.test.title}</span>, {formatDateTime(b.test.startsAt, tz)}{b.test.venue ? `, ${b.test.venue}` : ""}:{" "}
                    {b.absent ? "Absent" : b.marks !== null ? `${b.marks.toString()} of ${b.test.maxMarks}` : "Not scored yet"}{b.remarks ? ` · ${b.remarks}` : ""}
                  </li>
                ))}
                {app.interviews.map((i) => (
                  <li key={i.id} className={i.cancelledAt ? "text-ink-2 line-through" : ""}>
                    Interview with {data.staff.find((s) => s.id === i.interviewerStaffId)?.fullName ?? "staff"}, {formatDateTime(i.startsAt, tz)}: {outcomeLabel(i.outcome)}{i.notes ? ` · ${i.notes}` : ""}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader title="History" description="Every step, newest first. Nothing here is deleted." />
          <CardBody>
            <ol className="space-y-3">
              {app.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-line pl-3">
                  <p className="text-sm">{a.text}</p>
                  <p className="text-xs text-ink-2">{by(a.byId)} · {formatDateTime(a.at, tz)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
