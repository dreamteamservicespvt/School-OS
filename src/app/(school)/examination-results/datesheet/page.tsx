import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { readListParams, listHref } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { parseDay, plural } from "@/lib/academic/common";
import { datesheetList } from "@/lib/exams/datesheet";
import { EXAM_STATUS_TONE, shownExamStatus, patternLabel } from "@/lib/exams/common";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportLinks } from "../../academic-management/_components/export-links";
import { DateParam } from "../../academic-management/_components/pickers";
import { examPage, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";

export const metadata: Metadata = { title: "Datesheet" };
const PATH = "/examination-results/datesheet";
const PER_PAGE = 12;
const STATUSES = ["Draft", "Published", "Ongoing", "Completed", "Results published"] as const;

export default async function DatesheetPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.year) return (<><PageTop page={page} title="Datesheet" href={PATH} /><NoYear /></>);
  const params = readListParams(raw, ["class", "status", "from", "to", "year"]);
  const year = page.year;
  const canAdd = page.scope.datesheets && page.writable;
  const { list, classes } = await withSchool(page.current.ctx, async (tx) => {
    let onlyClassIds: string[] | null = null;
    if (page.scope.sectionIds) onlyClassIds = (await tx.section.findMany({ where: { id: { in: page.scope.sectionIds } }, select: { classId: true } })).map((s) => s.classId);
    const list = await datesheetList(tx, year.id, { q: params.q, classId: params.filters.class, from: parseDay(params.filters.from), to: parseDay(params.filters.to), archived: params.archived }, onlyClassIds);
    const classes = await tx.schoolClass.findMany({ where: { campusId: page.campusId, archivedAt: null, ...(onlyClassIds ? { id: { in: onlyClassIds } } : {}) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
    return { list, classes };
  });
  const shown = list.map((e) => ({ ...e, shown: shownExamStatus(e, page.today) })).filter((e) => !params.filters.status || e.shown === params.filters.status);
  const total = shown.length;
  const rows = shown.slice((params.page - 1) * PER_PAGE, params.page * PER_PAGE);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const filtered = Boolean(params.q || params.filters.class || params.filters.status || params.filters.from || params.filters.to || params.archived);
  const exportQuery = new URLSearchParams({ kind: "datesheets", ...(params.q ? { q: params.q } : {}), ...params.filters }).toString();

  return (
    <>
      <PageTop page={page} title="Datesheet" href={PATH}>
        {canAdd && <ButtonLink href={withYear(`${PATH}/new`, page)} variant="primary">Add datesheet</ButtonLink>}
      </PageTop>
      <ListToolbar placeholder="Search by exam title" showArchived={page.scope.datesheets}
        filters={[
          { key: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })) },
        ]}>
        <div className="flex flex-wrap gap-2">
          <DateParam name="from" label="From" current={params.filters.from ?? ""} />
          <DateParam name="to" label="To" current={params.filters.to ?? ""} />
        </div>
      </ListToolbar>

      {total === 0 ? (
        filtered ? <EmptyState title="No datesheets match">Try another search or remove a filter.</EmptyState> : (
          <EmptyState title="No datesheets yet">
            <p>A datesheet sets each subject&apos;s exam date, time, room and maximum marks. Creating one creates the exam.</p>
            {canAdd && <div className="mt-4"><ButtonLink href={withYear(`${PATH}/new`, page)} variant="primary">Add datesheet</ButtonLink></div>}
          </EmptyState>
        )
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Datesheets">
            {rows.map((e) => (
              <li key={e.id}>
                <Link href={withYear(`${PATH}/${e.id}`, page)} className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-brand/50 focus-visible:outline-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">{e.title}</h2>
                      <p className="text-sm text-ink-2">{e.typeName} · {patternLabel(e.pattern)}</p>
                    </div>
                    <Badge tone={e.archivedAt ? "danger" : EXAM_STATUS_TONE[e.shown]}>{e.archivedAt ? "Archived" : e.shown}</Badge>
                  </div>
                  <p className="mt-3 text-[15px]">{e.classNames.length > 4 ? `${e.classNames[0]} to ${e.classNames.at(-1)} (${e.classNames.length} classes)` : e.classNames.join(", ")}</p>
                  <p className="mt-1 text-sm text-ink-2">{formatDate(e.startDate)} to {formatDate(e.endDate)} · {year.name}</p>
                  <p className="mt-1 text-sm text-ink-2">{plural(e.students, "student")} · {plural(e.subjects, "subject")}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
            <p aria-live="polite">Showing {(params.page - 1) * PER_PAGE + 1} to {Math.min(total, params.page * PER_PAGE)} of {total}</p>
            {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center gap-2">
                {params.page > 1 && <Link className="min-h-11 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-2" href={listHref(PATH, params, { page: params.page - 1 })}>Previous</Link>}
                <span>Page {params.page} of {pages}</span>
                {params.page < pages && <Link className="min-h-11 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-2" href={listHref(PATH, params, { page: params.page + 1 })}>Next</Link>}
              </nav>
            )}
          </div>
          <div className="mt-4"><ExportLinks href={`/examination-results/export?${exportQuery}`} label="Datesheets" /></div>
        </>
      )}
    </>
  );
}
