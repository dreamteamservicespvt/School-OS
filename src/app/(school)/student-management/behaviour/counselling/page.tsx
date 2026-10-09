import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { readListParams, skipTake } from "@/lib/list";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { BASE, studentPage } from "../../_lib/page";

export const metadata: Metadata = { title: "Counselling" };

/** Counselling cases: only for the roles set in Student Settings, and each counsellor's own cases. */
export default async function CounsellingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can, settings, tz } = await studentPage();
  if (!settings.counsellingOn) redirect(`${BASE}/behaviour`);
  const params = readListParams(await searchParams, ["status"]);
  const path = `${BASE}/behaviour/counselling`;
  const data = await withSchool(current.ctx, async (tx) => {
    const where = {
      archivedAt: null,
      ...(can.seeCounselling ? {} : { counsellorId: current.ctx.userId ?? "" }),
      ...(params.filters.status ? { status: params.filters.status } : {}),
    };
    const ids = params.q ? (await tx.student.findMany({ where: { fullName: { contains: params.q, mode: "insensitive" } }, select: { id: true }, take: 200 })).map((s) => s.id) : null;
    const full = ids ? { ...where, studentId: { in: ids } } : where;
    const [total, rows] = await Promise.all([
      tx.counsellingCase.count({ where: full }),
      tx.counsellingCase.findMany({ where: full, orderBy: [{ status: "desc" }, { nextSessionOn: "asc" }, { openedOn: "desc" }], ...skipTake(params) }),
    ]);
    const students = await tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    const people = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.counsellorId).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { total, rows, students, people };
  });
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "case", label: "Case", phone: "meta", cell: (r) => <span className="line-clamp-2">{r.reason}</span> },
    { key: "student", label: "Student", phone: "title", cell: (r) => data.students.find((s) => s.id === r.studentId)?.fullName ?? "" },
    { key: "counsellor", label: "Counsellor", cell: (r) => data.people.find((p) => p.id === r.counsellorId)?.displayName ?? <span className="text-ink-2">Not given yet</span> },
    { key: "status", label: "Status", phone: "badge", cell: (r) => <Badge tone={r.status === "OPEN" ? "warning" : "neutral"}>{r.status === "OPEN" ? "Open" : "Closed"}</Badge> },
    { key: "next", label: "Next session", phone: "meta", cell: (r) => (r.nextSessionOn ? formatDate(r.nextSessionOn, tz) : "") },
  ];
  return (
    <>
      <PageHeader title="Counselling" href={path} userId={current.user.id}>
        {can.contribute && <ButtonLink href={`${path}/new`} variant="primary">Refer to counselling</ButtonLink>}
      </PageHeader>
      <p className="-mt-3 mb-5 max-w-prose text-ink-2">Highly restricted. Confidential notes are seen only by the Counsellor.</p>
      {(can.seeCounselling || data.total > 0) ? (
        <>
          <ListToolbar placeholder="Search by student's name" showArchived={false} filters={[{ key: "status", label: "Status", options: [{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }] }]} />
          <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${path}/${r.id}`} total={data.total} params={params} path={path} caption="Counselling cases"
            empty={<EmptyState title="No counselling cases">Students referred to counselling show here.</EmptyState>} />
        </>
      ) : (
        <EmptyState title="Counselling cases are private">
          <p>You can refer a student; the counsellor is told at once. The case is then seen only by the counsellor and the roles the school allows.</p>
          {can.contribute && <p className="mt-3"><Link className="font-medium text-brand-text underline" href={`${path}/new`}>Refer a student</Link></p>}
        </EmptyState>
      )}
    </>
  );
}
