import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { studentScope } from "@/lib/students/access";
import { BEHAVIOUR_KINDS, BEHAVIOUR_KIND_LABEL, isPositive, type BehaviourKind } from "@/lib/students/labels";
import { BASE, studentPage } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";

export const metadata: Metadata = { title: "Behaviour & Counselling" };

const FILTERS = ["kind", "status", "section"] as const;

export default async function BehaviourPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, year, can, settings, tz } = await studentPage();
  if (!can.seeBehaviour) redirect(`${BASE}/behaviour/counselling`);
  const params = readListParams(await searchParams, FILTERS);
  const path = `${BASE}/behaviour`;

  const data = await withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, year?.id);
    const f = params.filters;
    const studentWhere: Prisma.StudentWhereInput = { AND: [scope, ...(f.section && year ? [{ enrolments: { some: { sectionId: f.section, academicYearId: year.id, archivedAt: null } } }] : []), ...(params.q ? [{ fullName: { contains: params.q, mode: "insensitive" as const } }] : [])] };
    const where: Prisma.BehaviourIncidentWhereInput = {
      archivedAt: params.archived ? { not: null } : null,
      ...(year ? { academicYearId: year.id } : {}),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.status ? { status: f.status } : {}),
    };
    // Incident rows link to students by id only: narrow to the students in reach and filters.
    if (can.reach !== "all" || f.section || params.q) {
      const ids = (await tx.student.findMany({ where: studentWhere, select: { id: true } })).map((x) => x.id);
      where.students = { some: { studentId: { in: ids } } };
    }
    const orderBy = orderByFor(params, { date: { date: params.dir } }, [{ date: "desc" }, { createdAt: "desc" }]);
    const [total, rows, sections] = await Promise.all([
      tx.behaviourIncident.count({ where }),
      tx.behaviourIncident.findMany({ where, orderBy: orderBy as object, ...skipTake(params), include: { students: true } }),
      sectionOptions(tx, current, year?.id, { own: can.reach === "own" }),
    ]);
    const studentIds = [...new Set(rows.flatMap((r) => r.students.map((s) => s.studentId)))];
    const [students, reporters] = await Promise.all([
      tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true } }),
      tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.reportedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    // Points leaders this year (optional): the sum of each student's points.
    const mine = can.reach === "all" ? null : (await tx.student.findMany({ where: scope, select: { id: true } })).map((x) => x.id);
    const points = settings.pointsOn ? await tx.behaviourPointEntry.groupBy({ by: ["studentId"], where: mine ? { studentId: { in: mine } } : {}, _sum: { points: true }, orderBy: { _sum: { points: "desc" } }, take: 5 }) : [];
    const pointNames = points.length ? await tx.student.findMany({ where: { id: { in: points.map((p) => p.studentId) } }, select: { id: true, fullName: true } }) : [];
    return { total, rows, sections, students, reporters, points, pointNames };
  });
  type Row = (typeof data.rows)[number];
  const name = (id: string) => data.students.find((s) => s.id === id)?.fullName ?? "";

  const columns: Column<Row>[] = [
    { key: "date", label: "Date", sortable: true, phone: "meta", cell: (r) => formatDate(r.date, tz) },
    { key: "students", label: "Student(s)", phone: "title", cell: (r) => r.students.length > 2 ? `${name(r.students[0].studentId)} and ${r.students.length - 1} others` : r.students.map((s) => name(s.studentId)).join(", ") },
    { key: "type", label: "Type", phone: "badge", cell: (r) => <Badge tone={isPositive(r.kind) ? "success" : r.kind === "suspension" ? "danger" : "warning"}>{settings.incidentTypes.find((t) => t.key === r.typeKey)?.label ?? BEHAVIOUR_KIND_LABEL[r.kind as BehaviourKind]}</Badge> },
    { key: "description", label: "What happened", phone: "meta", cell: (r) => <span className="line-clamp-2">{r.description}</span> },
    { key: "reportedBy", label: "Reported by", cell: (r) => data.reporters.find((u) => u.id === r.reportedById)?.displayName ?? "" },
    { key: "action", label: "Action taken", cell: (r) => r.actionTaken ?? "" },
    { key: "status", label: "Status", cell: (r) => <Badge tone={r.status === "OPEN" ? "warning" : "neutral"}>{r.status === "OPEN" ? "Open" : "Closed"}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Behaviour & Counselling" href={path} userId={current.user.id}>
        {can.contribute && <ButtonLink href={`${path}/new`} variant="primary">Report incident</ButtonLink>}
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <div>
          <ListToolbar placeholder="Search by student's name" showArchived={can.manage}
            filters={[
              { key: "kind", label: "Type", options: BEHAVIOUR_KINDS.map((k) => ({ value: k, label: BEHAVIOUR_KIND_LABEL[k] })) },
              { key: "status", label: "Status", options: [{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }] },
              { key: "section", label: "Section", options: data.sections.map((s) => ({ value: s.value, label: s.label })) },
            ]} />
          <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${path}/${r.id}`} total={data.total} params={params} path={path} caption="Behaviour records"
            empty={
              <EmptyState title={Object.keys(params.filters).length || params.q ? "Nothing matches these filters" : "No behaviour records this year"}>
                <p>Incidents, warnings, suspensions, rewards and recognition show here.</p>
                {can.contribute && <p className="mt-3"><Link className="font-medium text-brand-text underline" href={`${path}/new`}>Report an incident</Link> (three taps on a phone: student, type, note).</p>}
              </EmptyState>
            } />
        </div>
        {settings.pointsOn && data.points.length > 0 && (
          <Card className="self-start">
            <CardHeader title="Most behaviour points" />
            <CardBody>
              <ol className="space-y-1">
                {data.points.map((p) => <li key={p.studentId} className="flex justify-between gap-2"><Link className="hover:underline" href={`${BASE}/students/${p.studentId}?tab=behaviour`}>{data.pointNames.find((s) => s.id === p.studentId)?.fullName}</Link><strong>{p._sum.points ?? 0}</strong></li>)}
              </ol>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
