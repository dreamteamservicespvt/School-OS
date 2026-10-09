import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { canDecide } from "@/lib/approvals";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import { CERTIFICATE_LABEL, CERT_STATUS_LABEL, CERT_STATUS_TONE } from "@/lib/students/labels";
import { certificateData, certificateHtml, printContext } from "@/lib/students/certificates";
import { BASE, origin, studentPage } from "../../_lib/page";
import { cancelCertificateAction, decideCertificateAction, issueCertificateAction } from "../../_actions/certificates";

export const metadata: Metadata = { title: "Certificate" };

/** One certificate: its status, the printed page, and the next step (approve, issue, print, cancel). */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { current, settings, can, tz } = await studentPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { id } });
    if (!cert) return null;
    const [student, approval, signatory, people] = await Promise.all([
      tx.student.findUnique({ where: { id: cert.studentId }, select: { id: true, fullName: true, admissionNo: true } }),
      cert.approvalId ? tx.approval.findUnique({ where: { id: cert.approvalId } }) : null,
      cert.signatoryId ? tx.signatory.findUnique({ where: { id: cert.signatoryId } }) : null,
      tx.userLogin.findMany({ where: { id: { in: [cert.requestedById, cert.issuedById, cert.approvedById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    const mayDecide = approval && cert.status === "REQUESTED" ? await canDecide(tx, current.ctx, approval) : false;
    // The page as printed: the saved details once issued; before that, filled from the record now.
    const issued = cert.status === "ISSUED" || cert.status === "CANCELLED";
    const shown = issued ? cert : { ...cert, data: await certificateData(tx, cert.studentId, cert.leavingRequestId, cert.data as Record<string, unknown>) };
    const html = await certificateHtml(shown, await printContext(tx, current.ctx, cert, issued ? await origin() : null));
    return { cert, student, approval, signatory, people, mayDecide, html };
  });
  if (!data || !data.student) notFound();
  const { cert, student } = data;
  const person = (uid: string | null) => data.people.find((p) => p.id === uid)?.displayName ?? "someone";
  const label = `${CERTIFICATE_LABEL[cert.type]}${cert.isDuplicate ? " (duplicate)" : ""}`;
  const pdf = `${BASE}/certificates/print?ids=${cert.id}`;
  const printable = cert.status === "ISSUED" || cert.status === "CANCELLED";

  return (
    <>
      <PageHeader title={`${label}${cert.number ? ` ${cert.number}` : ""}`} href={`${BASE}/certificates/${id}`} userId={current.user.id}>
        {printable && <ButtonLink href={pdf} target="_blank" variant="primary" prefetch={false}>{cert.status === "ISSUED" ? "Print / download PDF" : "View PDF"}</ButtonLink>}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" action={<Badge tone={CERT_STATUS_TONE[cert.status]}>{CERT_STATUS_LABEL[cert.status]}</Badge>} />
            <CardBody className="space-y-3">
              <Detail label="Student"><Link className="text-brand-text underline" href={`${BASE}/students/${student.id}`}>{student.fullName}</Link> · {student.admissionNo}</Detail>
              <Detail label="Number">{cert.number ?? "Given when approved"}</Detail>
              <Detail label="Date of issue">{formatDate(cert.issueDate, tz)}</Detail>
              {cert.purpose && <Detail label="Purpose">{cert.purpose}</Detail>}
              <Detail label="Signatory">{data.signatory ? `${data.signatory.name}, ${data.signatory.title}` : "Not chosen"}</Detail>
              {cert.duplicateReason && <Detail label="Why a duplicate">{cert.duplicateReason}</Detail>}
              <Detail label="Asked">{formatDateTime(cert.createdAt, tz)} by {person(cert.requestedById)}</Detail>
              {cert.approvedById && <Detail label="Approved by">{person(cert.approvedById)}</Detail>}
              {cert.issuedAt && <Detail label="Issued">{formatDateTime(cert.issuedAt, tz)} by {person(cert.issuedById)}</Detail>}
              {cert.cancelReason && <Detail label="Why cancelled">{cert.cancelReason}</Detail>}
              {settings.qrOn && cert.status === "ISSUED" && <Detail label="QR check"><Link className="text-brand-text underline" href={`/verify/${cert.verifyCode}`} target="_blank">Open the public check</Link></Detail>}
            </CardBody>
          </Card>
          {can.manage && cert.status !== "CANCELLED" && (
            <Card>
              <CardBody className="flex flex-wrap gap-2">
                {cert.status === "REQUESTED" && (data.mayDecide ? (
                  <>
                    <ConfirmAction action={decideCertificateAction} fields={{ id, decision: "approve" }} trigger="Approve" triggerVariant="primary" title={`Approve this ${CERTIFICATE_LABEL[cert.type].toLowerCase()}?`} confirmLabel="Approve">
                      It gets the next number in the series and can then be issued.
                    </ConfirmAction>
                    <ConfirmAction action={decideCertificateAction} fields={{ id, decision: "reject" }} trigger="Reject" triggerVariant="danger-outline" title="Reject this request?" confirmLabel="Reject" confirmVariant="danger" reason={{ label: "Reason", min: 5 }}>
                      The person who asked is told, with your reason.
                    </ConfirmAction>
                  </>
                ) : <p className="w-full text-sm text-ink-2">Waiting for approval{data.approval?.currentApproverRole ? ` by the ${data.approval.currentApproverRole.replace(/-/g, " ")}` : ""}. It shows in Approvals.</p>)}
                {cert.status === "APPROVED" && <ActionButton action={issueCertificateAction} fields={{ id }} variant="primary" size="md">Issue</ActionButton>}
                {cert.status === "ISSUED" && cert.type === "TC" && <ButtonLink href={`${BASE}/certificates/new?student=${cert.studentId}&type=TC`} size="sm">Print a duplicate</ButtonLink>}
                <ConfirmAction action={cancelCertificateAction} fields={{ id }} trigger="Cancel certificate" triggerVariant="danger-outline" title="Cancel this certificate?" confirmLabel="Cancel certificate" confirmVariant="danger" reason={{ label: "Reason", min: 5 }}>
                  {cert.number ? `Number ${cert.number} is not used again. ` : ""}The QR check will say Cancelled. The record stays.
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader title={printable ? "The certificate" : "Preview"} description={printable ? undefined : "How it will look. The number and QR code are added when it is issued."} />
          <CardBody>
            {cert.status === "APPROVED" && <Alert tone="info" className="mb-3">Approved. Press Issue to print it.</Alert>}
            <iframe title={label} srcDoc={data.html} sandbox="" className="h-[70vh] w-full rounded-lg border border-line bg-surface-2" />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
