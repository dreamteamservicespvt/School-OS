import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { readListParams, skipTake } from "@/lib/list";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { CORRECTION_WORDS, statusName, type CorrectionEntry } from "@/lib/attendance/corrections";
import { statusList } from "@/lib/attendance/settings";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { SubNav } from "../../../staff-hr-management/_components/bits";
import { CORRECTION_STATUS } from "../../_components/words";

export const metadata: Metadata = { title: "Attendance corrections" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CorrectionsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = readListParams(raw, ["status", "kind", "for"]);
  const { current, access } = await attendancePage();
  const path = `${BASE}/register/corrections`;

  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await registerChoices(tx, access);
    const names = new Map(sections.map((s) => [s.id, s.name]));
    const scope: Prisma.AttendanceCorrectionWhereInput[] = [];
    if (access.students !== "none") scope.push(access.students === "all" ? { forWhom: "student" } : { forWhom: "student", sectionId: { in: sections.map((s) => s.id) } });
    if (access.staff === "all") scope.push({ forWhom: "staff" });
    if (scope.length === 0) scope.push({ requestedById: current.user.id });
    const where: Prisma.AttendanceCorrectionWhereInput = {
      archivedAt: null,
      OR: scope,
      ...(params.filters.status && params.filters.status in CORRECTION_STATUS ? { status: params.filters.status } : {}),
      ...(params.filters.kind ? { kind: params.filters.kind } : {}),
      ...(params.filters.for ? { forWhom: params.filters.for } : {}),
      ...(params.q ? { reason: { contains: params.q, mode: "insensitive" as const } } : {}),
    };
    const [rows, total, statuses] = await Promise.all([
      tx.attendanceCorrection.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(params) }),
      tx.attendanceCorrection.count({ where }),
      statusList(tx, current.ctx, { includeArchived: true }),
    ]);
    const askers = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.requestedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    const missing = rows.map((r) => r.sectionId).filter((x): x is string => Boolean(x) && !names.has(x!));
    if (missing.length) {
      const extra = await tx.section.findMany({ where: { id: { in: missing } }, include: { schoolClass: { select: { name: true } } } });
      for (const s of extra) names.set(s.id, `${s.schoolClass.name} ${s.name}`);
    }
    return { rows, total, statuses, names, askers: new Map(askers.map((a) => [a.id, a.displayName])) };
  });

  type Row = (typeof data.rows)[number];
  const who = (r: Row) => {
    const e = r.entries as CorrectionEntry[];
    return e.length === 1 ? e[0].name : `${e.length} ${r.forWhom === "staff" ? "staff" : "students"}`;
  };
  const change = (r: Row) => {
    const e = r.entries as CorrectionEntry[];
    const first = e[0];
    if (!first) return "";
    const text = `${statusName(data.statuses, first.from)} → ${statusName(data.statuses, first.to)}`;
    return e.length > 1 ? `${text} and ${e.length - 1} more` : text;
  };
  const columns: Column<Row>[] = [
    { key: "date", label: "Date", cell: (r) => `${formatDate(r.date, "UTC")}${r.periodNo ? `, period ${r.periodNo}` : ""}`, phone: "title" },
    { key: "class", label: "Class", cell: (r) => (r.forWhom === "staff" ? "Staff" : data.names.get(r.sectionId ?? "") ?? "Class"), phone: "meta" },
    { key: "who", label: "Who", cell: who, phone: "meta" },
    { key: "change", label: "Change", cell: change, phone: "meta" },
    { key: "kind", label: "Type", cell: (r) => CORRECTION_WORDS[r.kind] ?? r.kind },
    { key: "by", label: "Asked by", cell: (r) => data.askers.get(r.requestedById ?? "") ?? "Unknown" },
    { key: "status", label: "Status", cell: (r) => <Badge tone={CORRECTION_STATUS[r.status]?.tone ?? "neutral"}>{CORRECTION_STATUS[r.status]?.label ?? r.status}</Badge>, phone: "badge" },
  ];

  return (
    <>
      <PageHeader title="Attendance Register" href={path} userId={current.user.id}>
        {access.change !== "none" && <Link href={`${BASE}/register/correction`} className={buttonClass("primary")}>Request a correction</Link>}
      </PageHeader>
      <SubNav current="corrections" items={[
        { key: "class", label: "Class register", href: `${BASE}/register` },
        { key: "student", label: "Student calendar", href: `${BASE}/register?view=student` },
        { key: "corrections", label: "Corrections", href: path },
      ]} />
      <ListToolbar placeholder="Search reasons" showArchived={false} filters={[
        { key: "status", label: "Status", options: Object.entries(CORRECTION_STATUS).map(([value, s]) => ({ value, label: s.label })) },
        { key: "kind", label: "Type", options: Object.entries(CORRECTION_WORDS).map(([value, label]) => ({ value, label })) },
        ...(access.staff === "all" && access.students !== "none" ? [{ key: "for", label: "For", options: [{ value: "student", label: "Students" }, { value: "staff", label: "Staff" }] }] : []),
      ]} />
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${path}/${r.id}`} total={data.total} params={params} path={path}
        caption="Attendance corrections"
        empty={<EmptyState title={params.q || Object.keys(params.filters).length ? "No corrections match" : "No corrections yet"}>
          {params.q || Object.keys(params.filters).length ? "Try another search or reset the filters." : "After attendance locks, a change is asked for here and decided in Approvals."}
        </EmptyState>} />
    </>
  );
}
