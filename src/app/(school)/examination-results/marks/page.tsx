import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { readListParams, PAGE_SIZE } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { periodQuery } from "../_lib/period";
import { papersFor, type PaperRow } from "@/lib/exams/marks";
import { PAPER_STATUS_TONE, PAPER_STATUS_WORDS } from "@/lib/exams/common";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ExportLinks } from "../../academic-management/_components/export-links";
import { examPage, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { LockExamButton } from "./marks-ui";

export const metadata: Metadata = { title: "Marks Entry" };
const PATH = "/examination-results/marks";

export default async function MarksEntryPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (page.scope.office && !page.scope.manage) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const params = readListParams(raw, ["exam", "status", "year"]);
  const tz = page.current.school.timeZone;
  const range = periodFromSearch(raw, { timeZone: tz });
  const within = range ? dateWhere(range) : null;
  const { rows: all, exams } = await withSchool(page.current.ctx, async (tx) => ({
    rows: await papersFor(tx, page.current.ctx, page.scope, year.id, { examId: params.filters.exam, status: params.filters.status, q: params.q }),
    exams: await tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" } }, orderBy: { startDate: "desc" }, select: { id: true, title: true } }),
  }));
  const rows = within ? all.filter((r) => r.date >= within.gte && r.date <= within.lte) : all;
  const total = rows.length;
  const shown = rows.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE);
  const overdue = (r: PaperRow) => r.due && r.due < page.today && (r.status === "NOT_STARTED" || r.status === "IN_PROGRESS");
  const columns: Column<PaperRow>[] = [
    { key: "subject", label: "Paper", phone: "title", cell: (r) => <>{r.subjectName} · {r.sectionLabel}</> },
    { key: "exam", label: "Exam", phone: "meta", cell: (r) => <>{r.examTitle}<span className="text-ink-2"> · {formatDate(r.date, tz)}</span></> },
    { key: "due", label: "Marks due", phone: "meta", cell: (r) => (r.due ? <span className={overdue(r) ? "font-medium text-danger" : ""}>{overdue(r) ? "Overdue since " : "Due "}{formatDate(r.due, tz)}</span> : <span className="text-ink-2">No date</span>) },
    { key: "progress", label: "Progress", phone: "meta", cell: (r) => (
      <span className="flex items-center gap-2">
        <span className="h-2 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><span className="block h-full bg-brand" style={{ width: `${r.of ? Math.round((r.done / r.of) * 100) : 0}%` }} /></span>
        {r.done} of {r.of} entered{r.waiting ? <span className="text-warn-text"> · {r.waiting} change{r.waiting === 1 ? "" : "s"} waiting</span> : null}
      </span>
    ) },
    { key: "status", label: "Status", phone: "badge", cell: (r) => <Badge tone={PAPER_STATUS_TONE[r.status]}>{PAPER_STATUS_WORDS[r.status]}</Badge> },
  ];
  const filtered = Boolean(params.q || params.filters.exam || params.filters.status || range);
  const exportHref = `/examination-results/export?${new URLSearchParams({ kind: "entry-status", ...(params.filters.exam ? { exam: params.filters.exam } : {}), ...(params.filters.year ? { year: params.filters.year } : {}), ...Object.fromEntries(periodQuery(raw)) })}`;

  return (
    <>
      <PageTop page={page} href={PATH}>
        {page.scope.manage && page.writable && params.filters.exam && <LockExamButton examId={params.filters.exam} title={exams.find((e) => e.id === params.filters.exam)?.title ?? "this exam"} />}
      </PageTop>
      {!page.scope.manage && <p className="-mt-3 mb-4 text-ink-2">Your papers: the subjects and sections given to you in Teacher Allocation.</p>}
      <ListToolbar placeholder="Search by subject, class or exam" showArchived={false} period={{ timeZone: tz }}
        filters={[
          { key: "exam", label: "Exam", options: exams.map((e) => ({ value: e.id, label: e.title })) },
          { key: "status", label: "Status", options: Object.entries(PAPER_STATUS_WORDS).map(([value, label]) => ({ value, label })) },
        ]} />
      <DataTable rows={shown} columns={columns} rowKey={(r) => `${r.entryId}-${r.sectionId}`} rowHref={(r) => withYear(`${PATH}/${r.entryId}/${r.sectionId}`, page)} total={total} params={params} path={PATH} caption="Papers to mark"
        empty={filtered ? <EmptyState title="No papers match">Try another search or remove a filter.</EmptyState> : (
          <EmptyState title="No papers to mark yet">
            {page.scope.manage ? "Papers appear here once a datesheet is published." : "Papers appear here once a datesheet with your subjects is published. If a subject is missing, ask the Exam In-charge to check Teacher Allocation."}
          </EmptyState>
        )} />
      {total > 0 && page.scope.manage && <div className="mt-4"><ExportLinks href={exportHref} label="Marks entry status" /></div>}
    </>
  );
}
