import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { BASE, studentPage } from "../../_lib/page";
import { CERT_LABEL, LEAVING_TYPE_LABEL, studentFacts, tcFor } from "../load";

export const metadata: Metadata = { title: "Left" };

const FILTERS = ["type", "status"] as const;

/** Students who have left (and, with the filter, leaving requests that were cancelled). The records stay. */
export default async function LeftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, tz } = await studentPage();
  const params = readListParams(await searchParams, FILTERS);
  const path = `${BASE}/leaving/left`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    const nameIds = params.q ? (await tx.student.findMany({ where: { OR: [{ fullName: { contains: params.q, mode: "insensitive" } }, { admissionNo: { contains: params.q, mode: "insensitive" } }] }, select: { id: true } })).map((s) => s.id) : null;
    const where: Prisma.LeavingRequestWhereInput = {
      status: f.status === "CANCELLED" ? "CANCELLED" : "LEFT",
      ...(f.type ? { type: f.type as "TRANSFER" } : {}),
      ...(nameIds ? { studentId: { in: nameIds } } : {}),
    };
    const orderBy = orderByFor(params, { lastDate: { lastDate: params.dir } }, [{ lastDate: "desc" }]);
    const [total, rows] = await Promise.all([tx.leavingRequest.count({ where }), tx.leavingRequest.findMany({ where, orderBy: orderBy as object, ...skipTake(params) })]);
    return { total, rows, facts: await studentFacts(tx, rows.map((r) => r.studentId)), tcs: await tcFor(tx, rows.map((r) => r.id)) };
  });
  type Row = (typeof data.rows)[number];
  const cancelled = params.filters.status === "CANCELLED";
  const columns: Column<Row>[] = [
    { key: "student", label: "Student", phone: "title", cell: (r) => { const s = data.facts.get(r.studentId); return s ? `${s.name} (${s.admissionNo})` : ""; } },
    { key: "class", label: "Last class", phone: "meta", cell: (r) => data.facts.get(r.studentId)?.cls ?? "" },
    { key: "type", label: "Type", phone: "badge", cell: (r) => <Badge>{LEAVING_TYPE_LABEL[r.type]}</Badge> },
    { key: "reason", label: cancelled ? "Why cancelled" : "Reason", cell: (r) => (cancelled ? r.cancelReason : r.reason) ?? "" },
    { key: "lastDate", label: "Last date", sortable: true, phone: "meta", cell: (r) => formatDate(r.lastDate, tz) },
    { key: "destination", label: "Going to", cell: (r) => r.destinationSchool ?? "" },
    { key: "tc", label: "TC", cell: (r) => { const tc = data.tcs.get(r.id); return tc ? `${CERT_LABEL[tc.status]}${tc.number ? ` · ${tc.number}` : ""}` : "Not issued"; } },
  ];
  return (
    <>
      <PageHeader title="Left" href={path} userId={current.user.id} />
      <ListToolbar placeholder="Search by student's name or admission number"
        filters={[
          { key: "type", label: "Type", options: [{ value: "TRANSFER", label: "Transfer" }, { value: "WITHDRAWAL", label: "Withdrawal" }, { value: "GRADUATION", label: "Graduation" }] },
          { key: "status", label: "Show", allLabel: "Left", options: [{ value: "CANCELLED", label: "Cancelled requests" }] },
        ]} />
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/leaving/${r.id}`} total={data.total} params={params} path={path} caption="Students who left"
        empty={<EmptyState title={Object.keys(params.filters).length || params.q ? "Nothing matches these filters" : "Nobody has left yet"}>Students who transferred, withdrew or graduated show here. Their records are kept.</EmptyState>} />
    </>
  );
}
