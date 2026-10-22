import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { canDecide } from "@/lib/approvals";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Copy, FileBadge, FileText, Printer, QrCode } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Banner, Col, DL } from "@/components/ui/blocks";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import { CERTIFICATE_LABEL, CERT_STATUS_LABEL, CERT_STATUS_TONE } from "@/lib/students/labels";
import { certificateData, certificateHtml, printContext } from "@/lib/students/certificates";
import { BASE, origin, studentPage } from "../../_lib/page";
import { cancelCertificateAction, decideCertificateAction, issueCertificateAction } from "../../_actions/certificates";
import { Words } from "@/lib/i18n/client";

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
      <BackLink href={`${BASE}/certificates`} label="Certificates & ID Cards" sub={student.fullName} />
      <PageHeader title={label} sub={<>{student.fullName} · <span className="font-mono">{cert.number ?? "number given when approved"}</span></>} href={`${BASE}/certificates/${id}`} userId={current.user.id}>
        {printable && <ButtonLink href={pdf} target="_blank" variant="primary" prefetch={false} icon={Printer}>{cert.status === "ISSUED" ? "Print / download PDF" : "View PDF"}</ButtonLink>}
      </PageHeader>
      <div className="grid items-start gap-5 lg:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Col>
          <Card>
            <CardHeader title="Details" icon={FileBadge} action={<Badge tone={CERT_STATUS_TONE[cert.status]}>{CERT_STATUS_LABEL[cert.status]}</Badge>} />
            <DL cols={1} rows={([
              ["Student", <><Link className="font-semibold text-brand hover:underline" href={`${BASE}/students/${student.id}`}>{student.fullName}</Link> · <span className="font-mono text-[13px]">{student.admissionNo}</span></>],
              ["Number", cert.number ? <span className="font-mono text-[13.5px]">{cert.number}</span> : "Given when approved"],
              ["Date of issue", formatDate(cert.issueDate, tz)],
              cert.purpose ? ["Purpose", cert.purpose] : null,
              ["Signatory", data.signatory ? `${data.signatory.name}, ${data.signatory.title}` : "Not chosen"],
              cert.duplicateReason ? ["Why a duplicate", cert.duplicateReason] : null,
              ["Asked", `${formatDateTime(cert.createdAt, tz)} by ${person(cert.requestedById)}`],
              cert.approvedById ? ["Approved by", person(cert.approvedById)] : null,
              cert.issuedAt ? ["Issued", `${formatDateTime(cert.issuedAt, tz)} by ${person(cert.issuedById)}`] : null,
              cert.cancelReason ? ["Why cancelled", cert.cancelReason] : null,
              settings.qrOn && cert.status === "ISSUED" ? ["QR check", <Link key="q" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline" href={`/verify/${cert.verifyCode}`} target="_blank"><QrCode size={15} aria-hidden="true" /><Words k="Open the public check" /></Link>] : null,
            ] as ([string, React.ReactNode] | null)[]).filter((r): r is [string, React.ReactNode] => r !== null)} />
          </Card>
          {can.manage && cert.status !== "CANCELLED" && (
            <Card>
              <CardBody className="flex flex-wrap gap-2 !pt-5">
                {cert.status === "REQUESTED" && (data.mayDecide ? (
                  <>
                    <ConfirmAction action={decideCertificateAction} fields={{ id, decision: "approve" }} trigger="Approve" triggerVariant="primary" title={`Approve this ${CERTIFICATE_LABEL[cert.type].toLowerCase()}?`} confirmLabel="Approve">
                      <Words k="It gets the next number in the series and can then be issued." />
                    </ConfirmAction>
                    <ConfirmAction action={decideCertificateAction} fields={{ id, decision: "reject" }} trigger="Reject" triggerVariant="danger-outline" title="Reject this request?" confirmLabel="Reject" confirmVariant="danger" reason={{ label: "Reason", min: 5 }}>
                      <Words k="The person who asked is told, with your reason." />
                    </ConfirmAction>
                  </>
                ) : <p className="w-full text-[13.5px] text-ink2"><Words k="Waiting for approval" />{data.approval?.currentApproverRole ? ` by the ${data.approval.currentApproverRole.replace(/-/g, " ")}` : ""}<Words k=". It shows in Approvals." /></p>)}
                {cert.status === "APPROVED" && <ActionButton action={issueCertificateAction} fields={{ id }} variant="primary" size="md"><Words k="Issue" /></ActionButton>}
                {cert.status === "ISSUED" && cert.type === "TC" && <ButtonLink href={`${BASE}/certificates/new?student=${cert.studentId}&type=TC`} icon={Copy}><Words k="Print a duplicate" /></ButtonLink>}
                <ConfirmAction action={cancelCertificateAction} fields={{ id }} trigger="Cancel certificate" triggerVariant="danger-outline" title="Cancel this certificate?" confirmLabel="Cancel certificate" confirmVariant="danger" reason={{ label: "Reason", min: 5 }}>
                  {cert.number ? `Number ${cert.number} is not used again. ` : ""}<Words k="The QR check will say Cancelled. The record stays." />
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </Col>
        <Card className="min-w-0">
          <CardHeader icon={FileText} title={printable ? "The certificate" : "Preview"} description={printable ? undefined : "How it will look. The number and QR code are added when it is issued."} />
          <CardBody>
            {cert.status === "APPROVED" && <Banner tone="info" className="mb-3"><Words k="Approved. Press Issue to print it." /></Banner>}
            <iframe title={label} srcDoc={data.html} sandbox="" className="h-[70vh] w-full rounded-xl border border-line bg-surface" />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
