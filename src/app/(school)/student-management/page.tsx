import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor, listHref } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { BUILT_MODULES } from "@/lib/modules";
import { can as canDo } from "@/lib/permissions";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { UserIcon } from "@/components/icons";
import { Avatar } from "@/components/students/avatar";
import { BulkBar, type BulkAction } from "@/components/students/bulk-bar";
import { CATEGORIES, GENDERS, LIST_COLUMNS, STATUS_LABEL, STATUS_TONE, STUDENT_STATUSES } from "@/lib/students/labels";
import { BASE, studentPage } from "./_lib/page";
import { EXPORT_FIELDS } from "./_lib/export-fields";
import { classOptions, classTiles, LIST_FILTERS, mainGuardian, photoSrc, primaryPhone, sectionNames, sectionOptions, studentListInclude, studentListWhere, type ListStudent } from "./_lib/queries";

export const metadata: Metadata = { title: "Student List" };

type Row = ListStudent & { sectionLabel: string; photo: string | null };

export default async function StudentListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, settings, year, can, tz } = await studentPage();
  const params = readListParams(await searchParams, LIST_FILTERS);
  const yearId = year?.id ?? null;

  const data = await withSchool(current.ctx, async (tx) => {
    const where = await studentListWhere(tx, current, params, yearId, year?.startDate ?? null, settings);
    const orderBy = orderByFor(params, { name: { fullName: params.dir }, admissionNo: { admissionNo: params.dir }, dateOfBirth: { dateOfBirth: params.dir } }, [{ fullName: "asc" }]);
    const [total, students, tiles, classes, sections] = await Promise.all([
      tx.student.count({ where }),
      tx.student.findMany({ where, include: studentListInclude(yearId), orderBy: orderBy as object, ...skipTake(params) }),
      classTiles(tx, current, yearId),
      classOptions(tx),
      sectionOptions(tx, current, yearId, { own: can.reach === "own" }),
    ]);
    const names = await sectionNames(tx, students.flatMap((s) => s.enrolments.map((e) => e.sectionId)));
    const rows: Row[] = students.map((s) => ({ ...s, sectionLabel: s.enrolments[0] ? names.get(s.enrolments[0].sectionId)?.label ?? "" : "", photo: photoSrc(s.photoFileId, current.ctx.schoolId) }));
    return { total, rows, tiles, classes, sections };
  });

  const show = new Set(settings.listColumns.length ? settings.listColumns : LIST_COLUMNS.map((c) => c.key));
  const columns: Column<Row>[] = [
    { key: "name", label: "Name", sortable: true, phone: "title", cell: (s) => (
      <span className="inline-flex items-center gap-3">
        {show.has("photo") && <Avatar name={s.fullName} src={s.photo} />}
        <span>{s.fullName}</span>
      </span>
    ) },
    ...(show.has("admissionNo") ? [{ key: "admissionNo", label: "Admission number", sortable: true, phone: "meta" as const, cell: (s: Row) => s.admissionNo }] : []),
    ...(show.has("classSection") ? [{ key: "class", label: "Class and section", phone: "meta" as const, cell: (s: Row) => s.sectionLabel ? `${s.sectionLabel}${show.has("rollNo") && s.enrolments[0]?.rollNo ? ` · Roll ${s.enrolments[0].rollNo}` : ""}` : <span className="text-ink-2">No class this year</span> }] : []),
    ...(show.has("rollNo") && !show.has("classSection") ? [{ key: "rollNo", label: "Roll number", cell: (s: Row) => s.enrolments[0]?.rollNo ?? "" }] : []),
    ...(show.has("guardian") ? [{ key: "guardian", label: "Father's or guardian's name", cell: (s: Row) => mainGuardian(s)?.guardian.name ?? <span className="text-ink-2">Not added</span> }] : []),
    ...(show.has("phone") ? [{ key: "phone", label: "Phone", phone: "meta" as const, cell: (s: Row) => <span className="whitespace-nowrap">{primaryPhone(s) ?? ""}</span> }] : []),
    ...(show.has("gender") ? [{ key: "gender", label: "Gender", cell: (s: Row) => s.gender ?? "" }] : []),
    ...(show.has("category") ? [{ key: "category", label: "Category", cell: (s: Row) => s.category ?? "" }] : []),
    ...(show.has("dateOfBirth") ? [{ key: "dateOfBirth", label: "Date of birth", sortable: true, cell: (s: Row) => (s.dateOfBirth ? formatDate(s.dateOfBirth, tz) : "") }] : []),
    ...(show.has("status") ? [{ key: "status", label: "Status", phone: "badge" as const, cell: (s: Row) => <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> }] : []),
  ];
  if (show.has("rollNo") && show.has("classSection")) {
    // Roll number shows with the class on phones; on computers it has its own column.
    const i = columns.findIndex((c) => c.key === "class");
    columns.splice(i, 1,
      { key: "class", label: "Class and section", phone: "meta", cell: (s) => s.sectionLabel ? (<><span className="md:hidden">{s.sectionLabel}{s.enrolments[0]?.rollNo ? ` · Roll ${s.enrolments[0].rollNo}` : ""}</span><span className="hidden md:inline">{s.sectionLabel}</span></>) : <span className="text-ink-2">No class this year</span> },
      { key: "rollNo", label: "Roll number", cell: (s) => s.enrolments[0]?.rollNo ?? "" });
  }

  const filtersInUrl = new URLSearchParams();
  if (params.q) filtersInUrl.set("q", params.q);
  for (const [k, v] of Object.entries(params.filters)) filtersInUrl.set(k, v);
  if (params.archived) filtersInUrl.set("archived", "1");

  const sectionFilter = data.sections.filter((s) => !params.filters.class || s.classId === params.filters.class);
  const bulk: BulkAction[] = [
    ...(can.reach === "all" && !can.lookupOnly ? [{ label: "Print ID cards", href: `${BASE}/certificates/id-cards/print`, file: true }, { label: "Print certificates", href: `${BASE}/certificates/new` }] : []),
    ...(can.manage ? [{ label: "Change section", href: `${BASE}/bulk-update?field=section` }, { label: "Update a field", href: `${BASE}/bulk-update` }] : []),
    ...(can.manage && settings.studentLoginsOn ? [{ label: "Student logins", href: `${BASE}/logins` }] : []),
    // Communication owns sending: its Send Message page opens with these students' parents chosen.
    ...(BUILT_MODULES.has("communication") && canDo(current.permissions, "communication", "create") ? [{ label: "Send message", href: "/communication?for=students" }] : []),
    { label: "Export", href: `${BASE}/export?format=xlsx`, file: true },
  ];

  return (
    <>
      <PageHeader title="Student List" href={BASE} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {can.manage && (
            <details className="relative">
              <summary className={buttonClass("secondary", "md", "list-none cursor-pointer")}>More</summary>
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-pop">
                <Link href={`${BASE}/bulk-update`} className="block rounded-lg px-3 py-2.5 hover:bg-surface-2">Bulk field update</Link>
                <Link href={`${BASE}/bulk-photos`} className="block rounded-lg px-3 py-2.5 hover:bg-surface-2">Bulk profile photos</Link>
                {settings.studentLoginsOn && <Link href={`${BASE}/logins`} className="block rounded-lg px-3 py-2.5 hover:bg-surface-2">Student logins</Link>}
                <Link href={`${BASE}/import/history`} className="block rounded-lg px-3 py-2.5 hover:bg-surface-2">Import history</Link>
              </div>
            </details>
          )}
          {can.manage && <ButtonLink href={`${BASE}/import`}>Import</ButtonLink>}
          {can.manage && <ButtonLink href={`${BASE}/new${params.filters.section ? `?section=${params.filters.section}` : ""}`} variant="primary">Add student</ButtonLink>}
        </div>
      </PageHeader>

      {data.tiles.length > 0 && (
        <section aria-label="Students by class" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            {data.tiles.map((t) => {
              const on = params.filters.class === t.id;
              return (
                <li key={t.id} className={`min-w-[9.5rem] shrink-0 rounded-xl border bg-surface p-3 sm:min-w-[10.5rem] ${on ? "border-brand ring-1 ring-brand" : "border-line"}`}>
                  <Link href={listHref(BASE, params, { class: on ? null : t.id, section: null, page: null })} className="block" aria-current={on ? "true" : undefined}>
                    <span className="block text-sm text-ink-2">{t.name}</span>
                    <span className="text-xl font-semibold">{t.total}</span>
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.sections.map((s) => (
                      <Link key={s.id} href={listHref(BASE, params, { class: t.id, section: s.id, page: null })}
                        className={`rounded-md px-1.5 py-0.5 text-xs ${params.filters.section === s.id ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>
                        {s.name} · {s.count}
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ListToolbar placeholder="Search by name, admission number or parent's phone"
        showArchived={can.manage}
        filters={[
          { key: "class", label: "Class", options: data.classes.filter((c) => can.reach === "all" || data.sections.some((s) => s.classId === c.value)) },
          { key: "section", label: "Section", options: sectionFilter.map((s) => ({ value: s.value, label: s.label })) },
          { key: "status", label: "Status", allLabel: "Status: studying", options: [...STUDENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })), { value: "all", label: "Every status" }] },
        ]}
        more={[
          { key: "gender", label: "Gender", options: GENDERS.map((g) => ({ value: g, label: g })) },
          { key: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
          { key: "new", label: "New this year", allLabel: "New this year: all", options: [{ value: "1", label: "Joined this year" }] },
          ...(can.seeDocuments ? [{ key: "docs", label: "Documents", options: [{ value: "missing", label: "Missing documents" }] }] : []),
          { key: "photo", label: "Photo", options: [{ value: "missing", label: "Missing photo" }] },
        ]}>
        {can.exportList && (
          <details className="relative">
            <summary className={buttonClass("secondary", "md", "list-none cursor-pointer")}>Export</summary>
            <form method="get" action={`${BASE}/export`} className="absolute right-0 z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-line bg-surface p-4 shadow-pop">
              {[...filtersInUrl.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Fields</legend>
                <div className="grid gap-1.5">
                  {EXPORT_FIELDS.filter((f) => !f.restricted || can.seeRestricted).map((f) => (
                    <label key={f.key} className="flex min-h-9 items-center gap-2 text-[15px]"><input type="checkbox" name="f" value={f.key} defaultChecked={f.default} className="size-5 accent-[var(--brand)]" />{f.label}</label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">File type</legend>
                <div className="flex flex-wrap gap-3">
                  {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([v, l]) => (
                    <label key={v} className="flex min-h-9 items-center gap-2"><input type="radio" name="format" value={v} defaultChecked={v === "xlsx"} className="size-4 accent-[var(--brand)]" />{l}</label>
                  ))}
                </div>
              </fieldset>
              <p className="text-sm text-ink-2">Exports the {data.total.toLocaleString("en-IN")} students in this list, with the filters shown.</p>
              <button type="submit" className={buttonClass("primary", "md", "w-full")}>Export</button>
            </form>
          </details>
        )}
      </ListToolbar>

      {!year && (
        <p className="mb-4 rounded-xl border border-line bg-warn-bg px-4 py-3 text-sm text-warn-text">
          No academic year is open, so students have no class yet. Open the year in <Link className="font-medium underline" href="/academic-management">Academic Management</Link>.
        </p>
      )}

      <DataTable rows={data.rows} columns={columns} rowKey={(s) => s.id} rowHref={(s) => `${BASE}/students/${s.id}`}
        total={data.total} params={params} path={BASE} caption="Students"
        select={bulk.length ? { form: "student-bulk", label: (s) => `Choose ${s.fullName}`, value: (s) => s.id } : undefined}
        empty={
          Object.keys(params.filters).length || params.q || params.archived ? (
            <EmptyState title="No students match these filters" icon={<UserIcon />}>
              <p>Try fewer filters, or search by admission number or parent&apos;s phone.</p>
              <p className="mt-3"><Link className="font-medium text-brand-text underline" href={BASE}>Show all studying students</Link></p>
            </EmptyState>
          ) : can.reach === "own" ? (
            <EmptyState title="No students in your classes yet" icon={<UserIcon />}>
              <p>You see the students of the sections you teach. Your sections are set in Academic Management, Teacher Allocation.</p>
            </EmptyState>
          ) : (
            <EmptyState title="No students yet" icon={<UserIcon />}>
              <p>Students come from Admission Management, or you can add them here or import your old list.</p>
              {can.manage && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <ButtonLink href={`${BASE}/import`}>Import students</ButtonLink>
                  <ButtonLink href={`${BASE}/new`} variant="primary">Add student</ButtonLink>
                </div>
              )}
            </EmptyState>
          )
        } />

      {bulk.length > 0 && <BulkBar form="student-bulk" actions={bulk} />}
    </>
  );
}
