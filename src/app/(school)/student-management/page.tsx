import type { Metadata } from "next";
import Link from "next/link";
import { Info, Download, IdCard, FileBadge, ArrowRightLeft, PenLine, KeyRound, Send, Upload, UserPlus, Images, History, SearchX, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, listHref, orderByFor } from "@/lib/list";
import { formatDate, formatRupees } from "@/lib/format";
import { BUILT_MODULES } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { listFacts, feeFilterAvailable } from "@/lib/students/hooks";
import { admissionOnlyFor } from "@/lib/fees/access";
import { phoneShow, classShort } from "@/lib/students/show";
import { CATEGORIES, GENDERS, LIST_COLUMNS, STATUS_LABEL, STUDENT_STATUSES, type StudentStatusKey } from "@/lib/students/labels";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, Chips, Empty, ListFooter, SegLinks, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { InlineBulkBar, type BulkAction } from "@/components/ui/list-controls";
import { ListToolbar } from "@/components/list/list-toolbar";
import { MoreMenu } from "@/components/ui/more-menu";
import { BASE, studentPage } from "./_lib/page";
import { StudentsHead } from "./_lib/head";
import { EXPORT_FIELDS } from "./_lib/export-fields";
import { classTiles, LIST_FILTERS, mainGuardian, photoSrc, sectionNames, studentListInclude, studentListWhere, type ListStudent } from "./_lib/queries";

export const metadata: Metadata = { title: "Student List" };

type Row = ListStudent & { sectionLabel: string; photo: string | null; att: number | null; due: bigint | null; overdue: boolean };

const STEP = 25;

export default async function StudentListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, settings, year, can: ab, tz } = await studentPage();
  const raw = await searchParams;
  const params = readListParams(raw, LIST_FILTERS);
  const shownCount = Math.min(500, Math.max(STEP, Number.parseInt(String(raw.n ?? ""), 10) || STEP));
  const yearId = year?.id ?? null;
  const feesOn = feeFilterAvailable();
  if (!feesOn) delete params.filters.fee;

  const data = await withSchool(current.ctx, async (tx) => {
    const where = await studentListWhere(tx, current, params, yearId, year?.startDate ?? null, settings);
    const orderBy = orderByFor(params, { name: { fullName: params.dir }, admissionNo: { admissionNo: params.dir }, dateOfBirth: { dateOfBirth: params.dir } }, [{ fullName: "asc" }]);
    const [total, tiles] = await Promise.all([tx.student.count({ where }), classTiles(tx, current, yearId)]);
    let students;
    if (params.sort) {
      students = await tx.student.findMany({ where, include: studentListInclude(yearId), orderBy: orderBy as object, take: shownCount });
    } else {
      // Class, section and roll order, as on the class register (design: students.jsx).
      const keys = await tx.student.findMany({ where, select: { id: true, fullName: true, enrolments: { where: { archivedAt: null, ...(yearId ? { academicYearId: yearId } : {}) }, take: 1, select: { classId: true, sectionId: true, rollNo: true } } } });
      const classOrder = new Map(tiles.map((t, i) => [t.id, i]));
      const secNames = await sectionNames(tx, keys.flatMap((k) => k.enrolments.map((e) => e.sectionId)));
      const rank = (k: (typeof keys)[number]) => {
        const e = k.enrolments[0];
        return [e ? classOrder.get(e.classId) ?? 999 : 1000, e ? secNames.get(e.sectionId)?.sectionName ?? "" : "", e?.rollNo ?? 99999] as const;
      };
      keys.sort((a, b) => {
        const x = rank(a), y = rank(b);
        return x[0] - y[0] || x[1].localeCompare(y[1]) || x[2] - y[2] || a.fullName.localeCompare(b.fullName);
      });
      const ids = keys.slice(0, shownCount).map((k) => k.id);
      const found = await tx.student.findMany({ where: { id: { in: ids } }, include: studentListInclude(yearId) });
      const byId = new Map(found.map((x) => [x.id, x]));
      students = ids.map((id) => byId.get(id)!).filter(Boolean);
    }
    const names = await sectionNames(tx, students.flatMap((s) => s.enrolments.map((e) => e.sectionId)));
    const facts = await listFacts(tx, current.ctx, students.map((s) => s.id), yearId);
    // Class, section and roll order, as on the class register; sorting by a column keeps that column's order.
    const rows: Row[] = students.map((s) => {
      const f = facts.facts.get(s.id);
      const e = s.enrolments[0];
      return { ...s, sectionLabel: e ? classShort(names.get(e.sectionId)?.className ?? "", names.get(e.sectionId)?.sectionName) : "", photo: photoSrc(s.photoFileId, current.ctx.schoolId), att: f?.attendancePct ?? null, due: f?.feeDuePaise ?? null, overdue: Boolean(f?.feeOverdue) };
    });
    return { total, rows, tiles, has: facts.has };
  });

  const f = params.filters;
  const curClass = data.tiles.find((t) => t.id === f.class) ?? null;
  const studying = data.tiles.reduce((n, t) => n + t.total, 0);
  const show = new Set(settings.listColumns.length ? settings.listColumns : LIST_COLUMNS.map((c) => c.key));
  // The Admission Counsellor has Fee "View" for admission fees only: no fee column.
  const feeCol = can(current.permissions, "fee-management", "view") && !admissionOnlyFor(current);
  const seeFees = data.has.fees && feeCol;
  const href = (change: Record<string, string | null>) => listHref(BASE, { ...params, page: 1 }, { ...change, page: null });

  const feePill = (s: Row, cls = "") => s.due === null ? null
    : s.due > 0n ? <Pill tone={s.overdue ? "bad" : "warn"} className={cls}>{formatRupees(s.due)} {s.overdue ? "overdue" : "due"}</Pill>
      : <Pill tone="ok" dot={!cls} className={cls}>{cls ? "Fees paid" : "Paid"}</Pill>;

  const columns: DataColumn<Row>[] = [
    { key: "name", label: "Student", sortHref: listHref(BASE, params, { sort: "name", dir: params.sort === "name" && params.dir === "asc" ? "desc" : "asc", page: null }), sorted: params.sort === "name" ? params.dir : null, render: (s) => (
      <div className="flex items-center gap-3">
        {show.has("photo") && <Avatar name={s.fullName} src={s.photo} size={38} />}
        <div className="min-w-0">
          <p className="font-semibold leading-tight flex items-center gap-2">{s.fullName}{s.status !== "ACTIVE" && <Pill tone={s.status === "ADMITTED" ? "info" : "neutral"} className="!h-5 !text-[11px]">{s.status === "ADMITTED" ? "New" : STATUS_LABEL[s.status as StudentStatusKey]}</Pill>}</p>
          {show.has("admissionNo") && <p className="text-[12.5px] text-ink3 font-mono">{s.admissionNo}</p>}
        </div>
      </div>
    ) },
    ...(show.has("classSection") || show.has("rollNo") ? [{ key: "class", label: "Class", nowrap: true, render: (s: Row) => s.sectionLabel
      ? <><span className="font-medium">{s.sectionLabel}</span>{show.has("rollNo") && s.enrolments[0]?.rollNo ? <span className="text-ink3 text-[12.5px]"> · Roll {s.enrolments[0].rollNo}</span> : null}</>
      : <span className="text-ink3 text-[13px]">No class this year</span> }] : []),
    ...(show.has("guardian") || show.has("phone") ? [{ key: "parent", label: "Parent", render: (s: Row) => {
      const g = mainGuardian(s);
      return g ? <><p className="leading-tight">{show.has("guardian") ? g.guardian.name : g.relationship}</p>{show.has("phone") && <p className="text-[12.5px] text-ink3 tnum">{phoneShow(g.guardian.phone)}</p>}</> : <span className="text-ink3 text-[13px]">Not added</span>;
    } }] : []),
    ...(show.has("gender") ? [{ key: "gender", label: "Gender", render: (s: Row) => <span className="text-[13.5px]">{s.gender ?? "–"}</span> }] : []),
    ...(show.has("category") ? [{ key: "category", label: "Category", render: (s: Row) => <span className="text-[13.5px]">{s.category ?? "–"}</span> }] : []),
    ...(show.has("dateOfBirth") ? [{ key: "dob", label: "Date of birth", nowrap: true, render: (s: Row) => <span className="text-[13.5px] tnum">{s.dateOfBirth ? formatDate(s.dateOfBirth, tz) : "–"}</span> }] : []),
    { key: "att", label: "Attendance", render: (s) => s.att === null ? <span className="text-ink3" title="Shown once Attendance Management records attendance">–</span> : (
      <div className="flex items-center gap-2.5 w-28">
        <span className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden" aria-hidden="true"><span className={`block h-full rounded-full ${s.att < 85 ? "bg-warn" : "bg-ok"}`} style={{ width: `${s.att}%` }} /></span>
        <span className={`text-[13px] font-semibold tnum ${s.att < 85 ? "text-warn" : ""}`}>{s.att}%</span>
      </div>
    ) },
    ...(feeCol ? [{ key: "fees", label: "Fees", render: (s: Row) => feePill(s) ?? <span className="text-ink3" title="Shown once Fee Management has this student's fees">–</span> }] : []),
  ];

  const bulk: BulkAction[] = [
    ...(BUILT_MODULES.has("communication") && can(current.permissions, "communication", "create") ? [{ label: "Message parents", href: "/communication?for=students", icon: <Send size={15} aria-hidden="true" /> }] : []),
    ...(ab.reach === "all" && !ab.lookupOnly ? [{ label: "ID cards", href: `${BASE}/certificates/id-cards/print`, file: true, icon: <IdCard size={15} aria-hidden="true" /> }, { label: "Certificates", href: `${BASE}/certificates/new`, icon: <FileBadge size={15} aria-hidden="true" /> }] : []),
    ...(ab.manage ? [{ label: "Change section", href: `${BASE}/bulk-update?field=section`, icon: <ArrowRightLeft size={15} aria-hidden="true" /> }, { label: "Update a field", href: `${BASE}/bulk-update`, icon: <PenLine size={15} aria-hidden="true" /> }] : []),
    ...(ab.manage && settings.studentLoginsOn ? [{ label: "Student logins", href: `${BASE}/logins`, icon: <KeyRound size={15} aria-hidden="true" /> }] : []),
    { label: "Export", href: `${BASE}/export?format=xlsx`, file: true, icon: <Download size={15} aria-hidden="true" /> },
  ];

  const filtersInUrl = new URLSearchParams();
  if (params.q) filtersInUrl.set("q", params.q);
  for (const [k, v] of Object.entries(f)) filtersInUrl.set(k, v);
  if (params.archived) filtersInUrl.set("archived", "1");
  const anyFilter = Boolean(params.q || Object.keys(f).length || params.archived);
  const ownNote = ab.reach === "own" ? `Your classes: ${data.tiles.flatMap((t) => t.sections.map((s) => classShort(t.name, s.name))).join(", ") || "none yet"}` : null;
  const moreHref = data.rows.length < data.total ? listHref(BASE, params, { n: shownCount + STEP, page: null }) : null;

  return (
    <>
      <StudentsHead page="Student List" href={BASE}
        sub={ownNote ? `${ownNote} · ${studying.toLocaleString("en-IN")} students` : year ? `${studying.toLocaleString("en-IN")} studying in ${year.name}` : "No academic year is open"}
        actions={<>
          {ab.manage && <ButtonLink href={`${BASE}/import`} icon={Upload} className="max-md:hidden">Import</ButtonLink>}
          {ab.exportList && (
            <details className="relative hidden md:block">
              <summary className={buttonClass("secondary", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}><Download size={17} aria-hidden="true" />Export</summary>
              <form method="get" action={`${BASE}/export`} className="absolute right-0 z-30 mt-1.5 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-pop animate-rise">
                {[...filtersInUrl.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-semibold text-ink2">Fields</legend>
                  <div className="grid gap-1">
                    {EXPORT_FIELDS.filter((x) => !x.restricted || ab.seeRestricted).map((x) => (
                      <label key={x.key} className="flex min-h-9 items-center gap-2.5 text-[14px]"><input type="checkbox" name="f" value={x.key} defaultChecked={x.default} className="size-[18px] accent-[rgb(var(--brand))]" />{x.label}</label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-semibold text-ink2">File type</legend>
                  <div className="flex flex-wrap gap-4">
                    {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([v, l]) => (
                      <label key={v} className="flex min-h-9 items-center gap-2 text-[14px]"><input type="radio" name="format" value={v} defaultChecked={v === "xlsx"} className="size-4 accent-[rgb(var(--brand))]" />{l}</label>
                    ))}
                  </div>
                </fieldset>
                <p className="text-[12.5px] text-ink3">Exports the {data.total.toLocaleString("en-IN")} students in this list, with the filters shown. Logged in the export log.</p>
                <button type="submit" className={buttonClass("primary", "md", "w-full")}><Download size={17} aria-hidden="true" />Export {data.total.toLocaleString("en-IN")} students</button>
              </form>
            </details>
          )}
          {ab.manage && <ButtonLink href={`${BASE}/new${f.section ? `?section=${f.section}` : ""}`} variant="primary" icon={UserPlus}>Add student</ButtonLink>}
          {ab.manage && <MoreMenu label="More student tools" items={[
            { label: "Import students", href: `${BASE}/import`, icon: <Upload size={17} aria-hidden="true" /> },
            { label: "Bulk field update", href: `${BASE}/bulk-update`, icon: <PenLine size={17} aria-hidden="true" /> },
            { label: "Bulk profile photos", href: `${BASE}/bulk-photos`, icon: <Images size={17} aria-hidden="true" /> },
            ...(settings.studentLoginsOn ? [{ label: "Student logins", href: `${BASE}/logins`, icon: <KeyRound size={17} aria-hidden="true" /> }] : []),
            { label: "Import history", href: `${BASE}/import/history`, icon: <History size={17} aria-hidden="true" /> },
          ]} />}
        </>} />

      {!year && <Banner tone="warn" className="mb-4" title="No academic year is open.">Students have no class until the year is opened in <Link className="font-semibold underline" href="/academic-management">Academic Management</Link>.</Banner>}

      {data.tiles.length > 0 && (
        <Chips label="Students by class" value={f.class ?? "all"} options={[
          { value: "all", label: data.tiles.length === 1 ? "My class" : "All classes", count: studying, href: href({ class: null, section: null }) },
          ...data.tiles.map((t) => ({ value: t.id, label: t.name, count: t.total, href: href({ class: t.id, section: null }) })),
        ]} />
      )}
      {curClass && curClass.sections.length > 0 && (
        <div className="flex gap-2 mt-3 items-center flex-wrap animate-rise">
          <span className="text-[13px] text-ink3 font-medium mr-1">Section</span>
          <SegLinks size="sm" label="Section" value={f.section ?? "all"} options={[
            { value: "all", label: "All", href: href({ section: null }) },
            ...curClass.sections.map((s) => ({ value: s.id, label: s.name, href: href({ section: s.id }) })),
          ]} />
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        <Toolbar>
          <ListToolbar placeholder="Name, admission no., parent name or phone" showArchived={ab.manage}
            filters={feesOn && seeFees ? [{ key: "fee", label: "Fees", allLabel: "Fees: everyone", options: [{ value: "dues", label: "Has dues" }, { value: "overdue", label: "Overdue" }] }] : []}
            more={[
              { key: "status", label: "Status", allLabel: "Status: studying", options: [...STUDENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })), { value: "all", label: "Every status" }] },
              { key: "gender", label: "Gender", options: GENDERS.map((g) => ({ value: g, label: g })) },
              { key: "category", label: "Category", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
              { key: "new", label: "New this year", options: [{ value: "1", label: "Joined this year" }] },
              ...(ab.seeDocuments ? [{ key: "docs", label: "Documents", options: [{ value: "missing", label: "Missing documents" }] }] : []),
              { key: "photo", label: "Photo", options: [{ value: "missing", label: "Missing photo" }] },
            ]} />
        </Toolbar>

        {bulk.length > 0 && <InlineBulkBar form="student-bulk" actions={bulk} />}

        <DataList caption="Students" rows={data.rows} columns={columns} rowKey={(s) => s.id} minWidth={860}
          rowHref={(s) => `${BASE}/students/${s.id}`} rowLabel={(s) => `Open ${s.fullName}`}
          select={bulk.length ? { form: "student-bulk", label: (s) => `Select ${s.fullName}`, value: (s) => s.id, allLabel: "Select every student shown" } : undefined}
          mobile={(s) => {
            const g = mainGuardian(s);
            return {
              title: s.fullName, avatar: s.fullName, avatarSrc: show.has("photo") ? s.photo : null,
              sub: [s.sectionLabel || "No class", s.enrolments[0]?.rollNo ? `Roll ${s.enrolments[0].rollNo}` : null, g?.guardian.name].filter(Boolean).join(" · "),
              pills: [
                feePill(s, cardPill),
                s.att !== null ? <Pill key="a" tone={s.att < 85 ? "warn" : "neutral"} className={cardPill}>{s.att}% present</Pill> : null,
                s.status !== "ACTIVE" ? <Pill key="s" tone={s.status === "ADMITTED" ? "info" : "neutral"} className={cardPill}>{s.status === "ADMITTED" ? "New" : STATUS_LABEL[s.status as StudentStatusKey]}</Pill> : null,
              ].filter(Boolean) as React.ReactNode[],
            };
          }}
          footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={moreHref} />}
          empty={anyFilter ? (
            <Empty icon={SearchX} title="No students match"
              body={params.q ? <>Nobody called “{params.q}” in {curClass ? curClass.name : "any class"}. Try the admission number or the parent&apos;s phone.</> : "Try a different class or filter."}
              action={<ButtonLink href={BASE}>Clear filters</ButtonLink>} />
          ) : ab.reach === "own" ? (
            <Empty icon={Users} title="No students in your classes yet" body="You see the students of the sections you teach. Your sections are set in Academic Management, Teacher Allocation." />
          ) : (
            <Empty icon={Users} title="No students yet" body="Students come from Admission Management, or you can add them here or import your old list."
              action={ab.manage ? <div className="flex flex-wrap justify-center gap-2"><ButtonLink href={`${BASE}/import`} icon={Upload}>Import students</ButtonLink><ButtonLink href={`${BASE}/new`} variant="primary" icon={UserPlus}>Add student</ButtonLink></div> : undefined} />
          )} />
      </Card>
      {!data.has.attendance && data.rows.length > 0 && (
        <p className="mt-3 text-[12.5px] text-ink3 flex items-center gap-1.5"><Info size={14} aria-hidden="true" />Attendance shows here once Attendance Management records it{feeCol && !data.has.fees ? ", and fees once Fee Management has them" : ""}.</p>
      )}
    </>
  );
}
