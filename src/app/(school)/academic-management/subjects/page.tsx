import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { isoDay } from "@/lib/academic/common";
import { subjectTypeLabel } from "@/lib/academic/subjects";
import { featureOn } from "@/lib/academic/scope";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { ExportLinks } from "../_components/export-links";
import { ClassPicker, ViewSwitch } from "../_components/pickers";
import { AddSubjectButton, CopyMapButton, MapRowActions, MapSubjectButton, OptionButton, RecordChoicesButton, RemoveChoiceButton, SubjectRowActions } from "./subjects-ui";

export const metadata: Metadata = { title: "Subjects" };
const PATH = "/academic-management/subjects";

export default async function SubjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw, { notForOwn: "no-access" });
  if (!page.year) return (<><PageTop page={page} title="Subjects" href={PATH} /><NoYear page={page} /></>);
  const electivesOn = featureOn(page.current, "academic-electives");
  const view = ["class", "electives"].includes(one(raw.view)) && (one(raw.view) !== "electives" || electivesOn) ? one(raw.view) : "list";
  const canEdit = page.scope.manage && page.writable;
  // The page's campus already limits a person who sees every class (One campus too).
  const only = page.scope.see === "own" ? page.scope.sectionIds : null;
  const classes = await withSchool(page.current.ctx, (tx) => tx.schoolClass.findMany({
    where: { campusId: page.campusId, archivedAt: null, ...(only ? { sections: { some: { id: { in: only } } } } : {}) },
    orderBy: { sortOrder: "asc" }, select: { id: true, name: true },
  }));
  const views = [{ value: "list", label: "Subject list" }, { value: "class", label: "By class" }, ...(electivesOn ? [{ value: "electives", label: "Elective choices" }] : [])];

  return (
    <>
      <PageTop page={page} title="Subjects" href={PATH}>
        {canEdit && view === "list" && <AddSubjectButton classes={classes} today={isoDay(page.today)} />}
      </PageTop>
      <ViewSwitch views={views} current={view} />
      {view === "list" && <SubjectList raw={raw} page={page} canEdit={canEdit} />}
      {view === "class" && <ByClass raw={raw} page={page} classes={classes} canEdit={canEdit} />}
      {view === "electives" && <Electives raw={raw} page={page} classes={classes} canEdit={canEdit} />}
    </>
  );
}

type P = { raw: Record<string, string | string[] | undefined>; page: Awaited<ReturnType<typeof academicPage>>; canEdit: boolean };

async function SubjectList({ raw, page, canEdit }: P) {
  const params = readListParams(raw, ["type"]);
  const where: Prisma.SubjectWhereInput = {
    schoolId: page.current.ctx.schoolId,
    archivedAt: params.archived ? { not: null } : null,
    ...(params.filters.type ? { type: params.filters.type as Prisma.SubjectWhereInput["type"] } : {}),
    ...(params.q ? { OR: [{ name: { contains: params.q, mode: "insensitive" } }, { code: { contains: params.q, mode: "insensitive" } }] } : {}),
  };
  const { rows, total } = await withSchool(page.current.ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.subject.findMany({
        where, ...skipTake(params),
        orderBy: orderByFor(params, { name: 1, code: 1, type: 1 }, { name: "asc" }) as Prisma.SubjectOrderByWithRelationInput,
        // The classes of the page's campus (subjects are the whole school's; each campus maps its own classes).
        include: { classes: { where: { archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: page.today } }], schoolClass: { campusId: page.campusId } }, include: { schoolClass: { select: { name: true, sortOrder: true, archivedAt: true } } } } },
      }),
      tx.subject.count({ where }),
    ]);
    return { rows, total };
  });
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "name", label: "Subject", sortable: true, phone: "title", cell: (r) => <>{r.name}{r.gradeOnly && <span className="ml-2 text-sm text-ink-2">grade only</span>}</> },
    { key: "code", label: "Code", sortable: true, phone: "meta", cell: (r) => r.code },
    { key: "type", label: "Type", sortable: true, phone: "badge", cell: (r) => <Badge tone={r.type === "CORE" ? "neutral" : "brand"}>{subjectTypeLabel(r.type)}</Badge> },
    {
      key: "classes", label: "Classes", phone: "meta", cell: (r) => {
        const names = r.classes.filter((c) => !c.schoolClass.archivedAt).sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder).map((c) => c.schoolClass.name);
        return names.length === 0 ? <span className="text-ink-2">Not mapped yet</span> : names.length > 4 ? `${names[0]} to ${names[names.length - 1]} (${names.length})` : names.join(", ");
      },
    },
  ];
  return (
    <>
      <ListToolbar placeholder="Search subjects by name or code" filters={[{ key: "type", label: "Type", options: [{ value: "CORE", label: "Core" }, { value: "OPTIONAL", label: "Optional" }, { value: "ELECTIVE", label: "Elective" }, { value: "LANGUAGE", label: "Language" }] }]} showArchived={page.scope.manage} />
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} total={total} params={params} path={PATH} caption="Subjects"
        actions={canEdit ? (r) => <SubjectRowActions s={{ id: r.id, name: r.name, code: r.code, type: r.type, gradeOnly: r.gradeOnly, archived: Boolean(r.archivedAt) }} /> : undefined}
        empty={params.q || params.filters.type || params.archived
          ? <EmptyState title="No subjects match">Try another search or remove a filter.</EmptyState>
          : <EmptyState title="No subjects yet">Add the subjects you teach, such as English, Mathematics and Science, and the classes they are taught in.</EmptyState>} />
      <div className="mt-4"><ExportLinks href={`/academic-management/export?kind=subjects${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}${params.filters.type ? `&type=${params.filters.type}` : ""}${page.yearQuery ? `&${page.yearQuery}` : ""}`} label="Subjects" /></div>
    </>
  );
}

async function ByClass({ raw, page, classes, canEdit }: P & { classes: { id: string; name: string }[] }) {
  if (classes.length === 0) return <EmptyState title="No classes yet">Add classes in Classes &amp; Sections first.</EmptyState>;
  const classId = classes.some((c) => c.id === one(raw.class)) ? one(raw.class) : classes[0].id;
  const cls = classes.find((c) => c.id === classId)!;
  const { maps, subjects } = await withSchool(page.current.ctx, async (tx) => ({
    maps: await tx.subjectClass.findMany({ where: { classId, archivedAt: null }, include: { subject: true }, orderBy: [{ toDate: { sort: "desc", nulls: "first" } }, { subject: { name: "asc" } }] }),
    subjects: await tx.subject.findMany({ where: { schoolId: page.current.ctx.schoolId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  }));
  const current = maps.filter((m) => !m.toDate || m.toDate >= page.today);
  const ended = maps.filter((m) => m.toDate && m.toDate < page.today);
  const total = current.reduce((n, m) => n + m.periodsPerWeek, 0);
  const today = isoDay(page.today);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <ClassPicker classes={classes} current={classId} />
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <CopyMapButton fromClassId={classId} fromName={cls.name} classes={classes} />
            <MapSubjectButton classId={classId} className={cls.name} subjects={subjects.filter((s) => !current.some((m) => m.subjectId === s.id))} today={today} />
          </div>
        )}
      </div>
      <Card>
        <CardHeader title={`Subjects of ${cls.name}`} description={`${current.length} subjects, ${total} periods a week`} />
        {current.length === 0 ? <p className="p-5 text-ink-2">No subjects mapped to {cls.name} yet.{canEdit && " Add a subject, or copy another class's subjects here."}</p> : (
          <MapTable rows={current} canEdit={canEdit} className={cls.name} today={today} />
        )}
      </Card>
      {ended.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Ended" description="Subjects that stopped. Their past marks and homework stay linked." />
          <MapTable rows={ended} canEdit={canEdit} className={cls.name} today={today} ended />
        </Card>
      )}
    </>
  );
}

function MapTable({ rows, canEdit, className, today, ended }: { rows: { id: string; periodsPerWeek: number; fromDate: Date | null; toDate: Date | null; subject: { name: string; code: string; type: string; gradeOnly: boolean } }[]; canEdit: boolean; className: string; today: string; ended?: boolean }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-[15px]">
        <thead className="bg-surface-2 text-sm text-ink-2"><tr>
          <th scope="col" className="px-4 py-2 font-medium">Subject</th>
          <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Type</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Periods a week</th>
          <th scope="col" className="px-4 py-2 font-medium">From</th>
          <th scope="col" className="px-4 py-2 font-medium">To</th>
          {canEdit && <th scope="col"><span className="sr-only">Actions</span></th>}
        </tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2 font-medium">{m.subject.name} <span className="text-sm font-normal text-ink-2">{m.subject.code}</span></td>
              <td className="hidden px-4 py-2 sm:table-cell">{subjectTypeLabel(m.subject.type)}{m.subject.gradeOnly ? ", grade only" : ""}</td>
              <td className="px-4 py-2 text-right tabular-nums">{m.periodsPerWeek}</td>
              <td className="px-4 py-2">{m.fromDate ? formatDate(m.fromDate) : <span className="text-ink-2">Start of year</span>}</td>
              <td className="px-4 py-2">{m.toDate ? formatDate(m.toDate) : <span className="text-ink-2">No end</span>}</td>
              {canEdit && <td className="px-2 py-1 text-right"><MapRowActions m={{ id: m.id, subject: m.subject.name, periodsPerWeek: m.periodsPerWeek, ended: Boolean(ended) }} className={className} today={today} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Electives({ raw, page, classes, canEdit }: P & { classes: { id: string; name: string }[] }) {
  if (classes.length === 0) return <EmptyState title="No classes yet">Add classes in Classes &amp; Sections first.</EmptyState>;
  const year = page.year!;
  const classId = classes.some((c) => c.id === one(raw.class)) ? one(raw.class) : classes[0].id;
  const cls = classes.find((c) => c.id === classId)!;
  const data = await withSchool(page.current.ctx, async (tx) => {
    const options = await tx.electiveOption.findMany({ where: { academicYearId: year.id, classId, archivedAt: null }, orderBy: [{ groupName: "asc" }], include: { choices: { where: { archivedAt: null } } } });
    const subjects = await tx.subject.findMany({ where: { schoolId: page.current.ctx.schoolId, archivedAt: null, classes: { some: { classId, archivedAt: null, toDate: null } } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    const enrolments = await tx.enrolment.findMany({ where: { academicYearId: year.id, classId, archivedAt: null, status: "STUDYING", ...(page.scope.sectionIds ? { sectionId: { in: page.scope.sectionIds } } : {}) }, include: { student: { select: { id: true, fullName: true } } }, orderBy: [{ rollNo: "asc" }] });
    const sections = new Map((await tx.section.findMany({ where: { id: { in: [...new Set(enrolments.map((e) => e.sectionId))] } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    return { options, subjects, enrolments, sections };
  });
  const subjectName = new Map(data.subjects.map((s) => [s.id, s.name]));
  const studentName = new Map(data.enrolments.map((e) => [e.studentId, e.student.fullName]));
  const groups = [...new Set(data.options.map((o) => o.groupName))];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <ClassPicker classes={classes} current={classId} view="electives" />
        {canEdit && <OptionButton yearId={year.id} classId={classId} subjects={data.subjects} />}
      </div>
      {data.options.length === 0 ? (
        <EmptyState title={`No choices for ${cls.name} yet`}>Add the optional subjects or languages {cls.name} can choose from, with seats if they are limited.</EmptyState>
      ) : groups.map((g) => {
        const opts = data.options.filter((o) => o.groupName === g);
        const chosen = new Set(opts.flatMap((o) => o.choices.map((c) => c.studentId)));
        const notChosen = data.enrolments.filter((e) => !chosen.has(e.studentId));
        return (
          <Card key={g} className="mb-4">
            <CardHeader title={`${g}, ${cls.name}`} description={`${chosen.size} chosen, ${notChosen.length} not chosen yet`}
              action={canEdit ? <RecordChoicesButton options={opts.map((o) => ({ id: o.id, label: subjectName.get(o.subjectId) ?? "", left: o.seats === null ? null : o.seats - o.choices.length }))} students={notChosen.map((e) => ({ id: e.studentId, name: e.student.fullName, rollNo: e.rollNo, section: `${cls.name} ${data.sections.get(e.sectionId) ?? ""}` }))} /> : undefined} />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {opts.map((o) => (
                <div key={o.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{subjectName.get(o.subjectId) ?? "Archived subject"}</h3>
                      <p className="text-sm text-ink-2">{o.seats === null ? `${o.choices.length} chose it, no seat limit` : `${o.choices.length} of ${o.seats} seats taken`}{o.prerequisite ? `. Needs: ${o.prerequisite}` : ""}</p>
                    </div>
                    {canEdit && <OptionButton yearId={year.id} classId={classId} subjects={data.subjects} option={{ id: o.id, subjectId: o.subjectId, groupName: o.groupName, seats: o.seats, prerequisite: o.prerequisite }} />}
                  </div>
                  {o.seats !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><div className={`h-full ${o.choices.length >= o.seats ? "bg-danger" : "bg-brand"}`} style={{ width: `${Math.min(100, (o.choices.length / Math.max(1, o.seats)) * 100)}%` }} /></div>}
                  {o.choices.length > 0 && (
                    <ul className="mt-3 divide-y divide-line text-sm">
                      {o.choices.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 py-1">
                          <span>{studentName.get(c.studentId) ?? "Student"}</span>
                          {canEdit && <RemoveChoiceButton id={c.id} name={studentName.get(c.studentId) ?? "this student"} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {notChosen.length > 0 && <p className="border-t border-line px-5 py-3 text-sm text-ink-2"><strong className="text-ink">Not chosen yet:</strong> {notChosen.slice(0, 12).map((e) => e.student.fullName).join(", ")}{notChosen.length > 12 ? ` and ${notChosen.length - 12} more` : ""}</p>}
          </Card>
        );
      })}
    </>
  );
}
