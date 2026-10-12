import type { Metadata } from "next";
import { periodSetup } from "@/lib/period-setup";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { readListParams, PAGE_SIZE } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { periodQuery } from "../../_lib/period";
import { moderationList } from "@/lib/exams/marks";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ExportLinks } from "../../../academic-management/_components/export-links";
import { examPage, withYear, type SearchParams } from "../../_lib/page";
import { NoYear, PageTop } from "../../_components/page-top";

export const metadata: Metadata = { title: "Moderation report" };
const PATH = "/examination-results/results/moderation";

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  waiting: { label: "Waiting for approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

type Row = Awaited<ReturnType<typeof moderationList>>[number];

export default async function ModerationPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.manage) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} title="Moderation report" back={{ href: "/examination-results/results", label: "Results" }} href={PATH} /><NoYear /></>);
  const year = page.year;
  const params = readListParams(raw, ["exam", "status", "year"]);
  const { all, exams } = await withSchool(page.current.ctx, async (tx) => ({
    all: await moderationList(tx, { yearId: year.id, examId: params.filters.exam, status: params.filters.status }),
    exams: await tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" } }, orderBy: { startDate: "desc" }, select: { id: true, title: true } }),
  }));
  const tz = page.current.school.timeZone;
  const dates = await periodSetup(page.current);
  const range = periodFromSearch(raw, dates);
  const span = range ? momentWhere(range, tz) : null;
  const q = params.q.toLowerCase();
  const dated = span ? all.filter((r) => r.askedOn >= span.gte && r.askedOn < span.lt) : all;
  const rows = q ? all.filter((r) => `${r.student} ${r.admissionNo} ${r.subject} ${r.section} ${r.reason}`.toLowerCase().includes(q)) : dated;
  const shown = rows.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE);
  const columns: Column<Row>[] = [
    { key: "student", label: "Student", phone: "title", cell: (r) => <>{r.student}<span className="block text-sm text-ink-2">{r.section} · {r.admissionNo}</span></> },
    { key: "paper", label: "Paper", phone: "meta", cell: (r) => <>{r.subject}<span className="text-ink-2"> · {r.exam}</span></> },
    { key: "change", label: "Change", phone: "meta", cell: (r) => <span className="tabular-nums"><s className="text-ink-2">{r.oldMarks || "-"}</s> → <strong>{r.newMarks || "-"}</strong></span> },
    { key: "reason", label: "Reason", phone: "meta", cell: (r) => <span className="line-clamp-2">{r.reason}</span> },
    { key: "asked", label: "Asked", phone: "meta", cell: (r) => <>{r.askedBy}<span className="block text-sm text-ink-2">{formatDate(r.askedOn, tz)}</span></> },
    { key: "status", label: "Status", phone: "badge", cell: (r) => (
      <span className="flex flex-col items-start gap-1">
        <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
        {r.decidedBy && <span className="text-sm text-ink-2">{r.decidedBy}{r.decidedOn ? `, ${formatDate(r.decidedOn, tz)}` : ""}</span>}
      </span>
    ) },
  ];
  const filtered = Boolean(params.q || params.filters.exam || params.filters.status || range);
  const exportHref = `/examination-results/export?${new URLSearchParams({ kind: "moderation", ...(params.filters.exam ? { exam: params.filters.exam } : {}), ...(params.filters.status ? { status: params.filters.status } : {}), ...(params.filters.year ? { year: params.filters.year } : {}), ...Object.fromEntries(periodQuery(raw)) })}`;
  const waiting = all.filter((r) => r.status === "waiting").length;

  return (
    <>
      <PageTop page={page} title="Moderation report" back={{ href: "/examination-results/results", label: "Results" }} href={PATH}>
        <Link href={withYear("/examination-results/results", page)} className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">Back to Results</Link>
      </PageTop>
      <p className="-mt-3 mb-4 text-ink-2">Every change asked for after marks were submitted or locked, with the old and new marks, the reason and who decided. {waiting > 0 && <>{waiting} waiting: decide them in <Link href="/approvals" className="font-medium text-brand-text underline">Approvals</Link>.</>}</p>
      <ListToolbar placeholder="Search by student, subject or reason" showArchived={false} period={{ ...dates }}
        filters={[
          { key: "exam", label: "Exam", options: exams.map((e) => ({ value: e.id, label: e.title })) },
          { key: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]} />
      <DataTable rows={shown} columns={columns} rowKey={(r) => r.id} rowHref={(r) => (r.approvalId ? `/approvals/${r.approvalId}` : "/approvals")} total={rows.length} params={params} path={PATH} caption="Marks changes after lock"
        empty={filtered ? <EmptyState title="No changes match">Try another search or remove a filter.</EmptyState> : <EmptyState title="No changes after lock">When a teacher asks to change marks that are submitted or locked, it shows here with the old and new marks.</EmptyState>} />
      {rows.length > 0 && <div className="mt-4"><ExportLinks href={exportHref} label="Moderation report" /></div>}
    </>
  );
}
