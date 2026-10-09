import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { isCleared } from "@/lib/students/leaving";
import { BASE, studentPage } from "../_lib/page";
import { CERT_LABEL, CHECK_LABEL, CHECK_TONE, LEAVING_TYPE_LABEL, studentFacts, tcFor } from "./load";

export const metadata: Metadata = { title: "Leaving & Alumni" };

const FILTERS = ["type", "clearance"] as const;

/** Students in the leaving process: reason, last date, clearance per check, TC status. */
export default async function LeavingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can, tz } = await studentPage();
  const params = readListParams(await searchParams, FILTERS);
  const path = `${BASE}/leaving`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    const where: Prisma.LeavingRequestWhereInput = {
      status: "IN_PROGRESS",
      ...(f.type ? { type: f.type as "TRANSFER" } : {}),
      ...(f.clearance === "pending" ? { checks: { some: { status: { in: ["PENDING", "WAIVER_ASKED"] } } } } : f.clearance === "clear" ? { checks: { none: { status: { in: ["PENDING", "WAIVER_ASKED"] } } } } : {}),
      ...(params.q ? { OR: [{ reason: { contains: params.q, mode: "insensitive" as const } }, { studentId: { in: (await tx.student.findMany({ where: { OR: [{ fullName: { contains: params.q, mode: "insensitive" } }, { admissionNo: { contains: params.q, mode: "insensitive" } }] }, select: { id: true } })).map((s) => s.id) } }] } : {}),
    };
    const orderBy = orderByFor(params, { lastDate: { lastDate: params.dir } }, [{ lastDate: "asc" }]);
    const [total, rows] = await Promise.all([
      tx.leavingRequest.count({ where }),
      tx.leavingRequest.findMany({ where, orderBy: orderBy as object, ...skipTake(params), include: { checks: { orderBy: { name: "asc" } } } }),
    ]);
    const facts = await studentFacts(tx, rows.map((r) => r.studentId));
    const tcs = await tcFor(tx, rows.map((r) => r.id));
    return { total, rows, facts, tcs };
  });
  type Row = (typeof data.rows)[number];
  const checkNames = [...new Set(data.rows.flatMap((r) => r.checks.map((c) => c.name)))].sort();

  const columns: Column<Row>[] = [
    { key: "student", label: "Student", phone: "title", cell: (r) => { const s = data.facts.get(r.studentId); return s ? `${s.name} (${s.cls || s.admissionNo})` : ""; } },
    { key: "type", label: "Type", cell: (r) => LEAVING_TYPE_LABEL[r.type] },
    { key: "reason", label: "Reason", phone: "meta", cell: (r) => r.reason },
    { key: "lastDate", label: "Last date", sortable: true, phone: "meta", cell: (r) => formatDate(r.lastDate, tz) },
    ...checkNames.map((n): Column<Row> => ({
      key: `check-${n}`, label: n, cell: (r) => { const c = r.checks.find((x) => x.name === n); return c ? <Badge tone={CHECK_TONE[c.status]}>{c.status === "PENDING" ? c.detail : CHECK_LABEL[c.status]}</Badge> : ""; },
    })),
    { key: "clearance", label: "Clearance", phone: "badge", cell: (r) => isCleared(r.checks) ? <Badge tone="success">Clear</Badge> : <Badge tone="danger">Pending</Badge> },
    { key: "tc", label: "TC", cell: (r) => { const tc = data.tcs.get(r.id); return tc ? `${CERT_LABEL[tc.status]}${tc.number ? ` · ${tc.number}` : ""}` : "Not yet"; } },
  ];

  return (
    <>
      <PageHeader title="Leaving & Alumni" href={path} userId={current.user.id}>
        {can.manage && <ButtonLink href={`${path}/new`} variant="primary">Start leaving</ButtonLink>}
      </PageHeader>
      <ListToolbar placeholder="Search by student's name, admission number or reason"
        filters={[
          { key: "type", label: "Type", options: [{ value: "TRANSFER", label: "Transfer" }, { value: "WITHDRAWAL", label: "Withdrawal" }, { value: "GRADUATION", label: "Graduation" }] },
          { key: "clearance", label: "Clearance", options: [{ value: "pending", label: "Pending" }, { value: "clear", label: "Clear" }] },
        ]} />
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${path}/${r.id}`} total={data.total} params={params} path={path} caption="Students leaving"
        empty={
          <EmptyState title={Object.keys(params.filters).length || params.q ? "Nothing matches these filters" : "Nobody is leaving right now"}>
            <p>Students in the leaving process show here with their clearance and TC.</p>
            {can.manage && <p className="mt-3"><Link className="font-medium text-brand-text underline" href={`${path}/new`}>Start leaving</Link> for a student who is transferring or withdrawing.</p>}
          </EmptyState>
        } />
      {checkNames.length === 0 && data.rows.length > 0 && (
        <p className="mt-4 text-sm text-ink-2">No clearance checks run yet: fee dues and library books are checked here once Fee Management and Library Management are in use.</p>
      )}
    </>
  );
}
