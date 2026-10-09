import type { Metadata } from "next";
import Link from "next/link";
import type { CertificateType, Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { canDecide } from "@/lib/approvals";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { ConfirmAction } from "@/components/students/confirm-action";
import { CERTIFICATE_LABEL, CERT_STATUS_LABEL, CERT_STATUS_TONE } from "@/lib/students/labels";
import { BASE, studentPage } from "../_lib/page";
import { decideCertificateAction } from "../_actions/certificates";

export const metadata: Metadata = { title: "Certificates & ID Cards" };

const FILTERS = ["type", "status"] as const;

/** Certificates issued and requested: number, type, student, date, status; requests waiting for approval on top. */
export default async function CertificatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, settings, can, tz } = await studentPage();
  const params = readListParams(await searchParams, FILTERS);
  const path = `${BASE}/certificates`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    const nameIds = params.q ? (await tx.student.findMany({ where: { OR: [{ fullName: { contains: params.q, mode: "insensitive" } }, { admissionNo: { contains: params.q, mode: "insensitive" } }] }, select: { id: true } })).map((s) => s.id) : null;
    const where: Prisma.CertificateWhereInput = {
      ...(f.type && f.type in CERTIFICATE_LABEL ? { type: f.type as CertificateType } : {}),
      ...(f.status && f.status in CERT_STATUS_LABEL ? { status: f.status as "ISSUED" } : {}),
      ...(params.q ? { OR: [{ number: { contains: params.q, mode: "insensitive" as const } }, { studentId: { in: nameIds ?? [] } }] } : {}),
    };
    const orderBy = orderByFor(params, { date: { issueDate: params.dir } }, [{ createdAt: "desc" }]);
    const [total, rows, waiting] = await Promise.all([
      tx.certificate.count({ where }),
      tx.certificate.findMany({ where, orderBy: orderBy as object, ...skipTake(params) }),
      tx.certificate.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "asc" }, take: 30 }),
    ]);
    const approvals = await tx.approval.findMany({ where: { id: { in: waiting.map((w) => w.approvalId).filter((x): x is string => Boolean(x)) } } });
    const mayDecide = new Set<string>();
    for (const a of approvals) if (await canDecide(tx, current.ctx, a)) mayDecide.add(a.id);
    const students = await tx.student.findMany({ where: { id: { in: [...rows, ...waiting].map((r) => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } });
    return { total, rows, waiting, mayDecide, students };
  });
  type Row = (typeof data.rows)[number];
  const who = (id: string) => data.students.find((s) => s.id === id);
  const types = (Object.keys(CERTIFICATE_LABEL) as CertificateType[]).filter((t) => t !== "MIGRATION" || settings.migrationOn);
  const columns: Column<Row>[] = [
    { key: "number", label: "Number", phone: "meta", cell: (r) => r.number ?? "Not yet given" },
    { key: "type", label: "Type", phone: "title", cell: (r) => `${CERTIFICATE_LABEL[r.type]}${r.isDuplicate ? " (duplicate)" : ""}` },
    { key: "student", label: "Student", phone: "meta", cell: (r) => { const s = who(r.studentId); return s ? `${s.fullName} (${s.admissionNo})` : ""; } },
    { key: "date", label: "Date", sortable: true, cell: (r) => formatDate(r.issueDate, tz) },
    { key: "status", label: "Status", phone: "badge", cell: (r) => <Badge tone={CERT_STATUS_TONE[r.status]}>{CERT_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Certificates & ID Cards" href={path} userId={current.user.id}>
        {can.manage && <ButtonLink href={`${path}/new`} variant="primary">Issue certificate</ButtonLink>}
      </PageHeader>
      {data.waiting.length > 0 && (
        <Card className="mb-4">
          <CardHeader title={`Waiting for approval (${data.waiting.length})`} description="A TC always needs approval; other types as set in Student Settings." />
          <CardBody>
            <ul className="divide-y divide-line">
              {data.waiting.map((c) => {
                const s = who(c.studentId);
                const mine = c.approvalId && data.mayDecide.has(c.approvalId);
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`${path}/${c.id}`} className="font-medium hover:underline">{CERTIFICATE_LABEL[c.type]}{c.isDuplicate ? " (duplicate)" : ""} for {s?.fullName}</Link>
                      <p className="text-sm text-ink-2">{s?.admissionNo} · asked {formatDateTime(c.createdAt, tz)}{c.purpose ? ` · ${c.purpose}` : ""}</p>
                    </div>
                    {mine ? (
                      <div className="flex flex-wrap gap-2">
                        <ConfirmAction action={decideCertificateAction} fields={{ id: c.id, decision: "approve" }} trigger="Approve" triggerVariant="primary" title={`Approve the ${CERTIFICATE_LABEL[c.type]} for ${s?.fullName}?`} confirmLabel="Approve">
                          It gets the next number in the series and can then be issued.
                        </ConfirmAction>
                        <ConfirmAction action={decideCertificateAction} fields={{ id: c.id, decision: "reject" }} trigger="Reject" triggerVariant="danger-outline" title="Reject this request?" confirmLabel="Reject" confirmVariant="danger" reason={{ label: "Reason", min: 5 }}>
                          The person who asked is told, with your reason.
                        </ConfirmAction>
                      </div>
                    ) : <Badge tone="warning">Waiting for the approver</Badge>}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
      <ListToolbar placeholder="Search by number, student's name or admission number"
        filters={[
          { key: "type", label: "Type", options: types.map((t) => ({ value: t, label: CERTIFICATE_LABEL[t] })) },
          { key: "status", label: "Status", options: Object.entries(CERT_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
        ]} />
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${path}/${r.id}`} total={data.total} params={params} path={path} caption="Certificates"
        empty={
          <EmptyState title={Object.keys(params.filters).length || params.q ? "Nothing matches these filters" : "No certificates yet"}>
            <p>Bonafide, study, character certificates and TCs show here with their number and status.</p>
            {can.manage && <p className="mt-3"><Link className="font-medium text-brand-text underline" href={`${path}/new`}>Issue a certificate</Link></p>}
          </EmptyState>
        } />
    </>
  );
}
