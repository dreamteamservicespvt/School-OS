import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { withSchool } from "@/lib/db";
import { allocationGrid, allocationActiveOn, teacherWorkloads } from "@/lib/academic/allocation";
import { mapActiveOn } from "@/lib/academic/subjects";
import { isoDay, plural } from "@/lib/academic/common";
import { EmptyState } from "@/components/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { ExportLinks } from "../_components/export-links";
import { ParamSelect, ViewSwitch } from "../_components/pickers";
import { AllocationGrid } from "./allocation-ui";
import { GapsToggle, TeacherSearch } from "./filters";

export const metadata: Metadata = { title: "Teacher Allocation" };
const PATH = "/academic-management/teacher-allocation";

export default async function AllocationPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw, { notForOwn: "no-access" });
  if (!page.year) return (<><PageTop page={page} title="Teacher Allocation" href={PATH} /><NoYear page={page} /></>);
  const year = page.year;
  const view = one(raw.view) === "teachers" ? "teachers" : "grid";
  const own = page.scope.see === "own";
  const date = page.today < year.startDate ? year.startDate : page.today > year.endDate ? year.endDate : page.today;
  const canEdit = page.scope.manage && page.writable;
  const classFilter = one(raw.class);
  const gapsOnly = one(raw.gaps) === "1";
  const q = one(raw.q).trim().toLowerCase();

  const data = await withSchool(page.current.ctx, async (tx) => {
    const classes = await tx.schoolClass.findMany({ where: { campusId: page.campusId, archivedAt: null, sections: { some: { academicYearId: year.id, archivedAt: null, ...(page.scope.sectionIds ? { id: { in: page.scope.sectionIds } } : {}) } } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
    const classId = classes.some((c) => c.id === classFilter) ? classFilter : own ? "" : classes[0]?.id ?? "";
    let sectionIds = page.scope.sectionIds;
    if (classId) sectionIds = (await tx.section.findMany({ where: { classId, academicYearId: year.id, archivedAt: null, ...(page.scope.sectionIds ? { id: { in: page.scope.sectionIds } } : {}) }, select: { id: true } })).map((s) => s.id);
    const grid = view === "grid" ? await allocationGrid(tx, page.current.ctx, year.id, page.campusId, date, sectionIds) : null;
    // One campus: that campus's teachers only (also the teacher picker).
    const workloads = await teacherWorkloads(tx, page.current.ctx, year.id, page.campusId, date, own ? page.scope.staffId ?? "none" : null, own ? null : page.current);
    const subjectsTaught = await tx.teacherAllocation.findMany({ where: { academicYearId: year.id, ...allocationActiveOn(date) }, select: { staffId: true, subjectId: true }, distinct: ["staffId", "subjectId"] });
    const maps = grid ? await tx.subjectClass.findMany({ where: { classId: { in: [...new Set(grid.rows.map((r) => r.classId))] }, ...mapActiveOn(date) }, select: { classId: true, subjectId: true, periodsPerWeek: true } }) : [];
    const totalGaps = classId && !own ? (await allocationGrid(tx, page.current.ctx, year.id, page.campusId, date, page.scope.sectionIds)).gaps : grid?.gaps ?? 0;
    return { classes, classId, grid, workloads, subjectsTaught, maps, totalGaps };
  });

  const teachers = data.workloads.map((w) => ({ id: w.id, name: w.name, periods: w.periods, limit: w.limit, subjectIds: data.subjectsTaught.filter((s) => s.staffId === w.id).map((s) => s.subjectId) }));
  const ppw = Object.fromEntries(data.maps.map((m) => [`${m.classId}:${m.subjectId}`, m.periodsPerWeek]));
  const workloads = q ? data.workloads.filter((w) => w.name.toLowerCase().includes(q) || w.teaches.some((t) => t.subject.toLowerCase().includes(q) || t.label.toLowerCase().includes(q))) : data.workloads;
  const yearQ = page.yearQuery ? `&${page.yearQuery}` : "";

  return (
    <>
      <PageTop page={page} title="Teacher Allocation" href={PATH}>
        {/* Gap list G44: the allocation from an Excel sheet, on the one import engine. */}
        {page.scope.manage && <ButtonLink href="/academic-management/import?kind=academic-allocations" variant="ghost" icon={Upload}>Import from Excel</ButtonLink>}
      </PageTop>
      <ViewSwitch views={[{ value: "grid", label: "By class" }, { value: "teachers", label: own ? "My classes and load" : "Teachers and workload" }]} current={view} />
      {view === "grid" && data.grid && (
        <>
          {!own && data.totalGaps > 0 && <Alert tone="warning" className="mb-4" title={`${plural(data.totalGaps, "subject")} in ${data.classId ? "the school" : "these classes"} have no teacher yet`}>Gaps show in red. {canEdit ? "Click a cell to assign a teacher." : ""}</Alert>}
          <div className="no-print mb-4 flex flex-wrap items-end gap-3">
            <ParamSelect name="class" label="Class" current={data.classId} placeholder={own ? "All my classes" : "All classes"} options={data.classes.map((c) => ({ value: c.id, label: c.name }))} />
            <GapsToggle on={gapsOnly} />
          </div>
          {data.grid.rows.length === 0 ? (
            <EmptyState title="No sections here">Add classes and sections in Classes &amp; Sections, then map subjects to them.</EmptyState>
          ) : data.grid.subjects.length === 0 ? (
            <EmptyState title="No subjects mapped">Map subjects to this class in Subjects, By class. Then assign teachers here.</EmptyState>
          ) : (
            <AllocationGrid rows={data.grid.rows.map((r) => ({ ...r, cells: Object.fromEntries(Object.entries(r.cells).map(([k, cells]) => [k, cells?.map((c) => ({ ...c, fromDate: c.fromDate ? isoDay(c.fromDate) : null, toDate: c.toDate ? isoDay(c.toDate) : null })) ?? null])) }))}
              subjects={data.grid.subjects} teachers={teachers} canEdit={canEdit} yearId={year.id} today={isoDay(date)} gapsOnly={gapsOnly} ppw={ppw} />
          )}
          <div className="mt-4"><ExportLinks href={`/academic-management/export?kind=allocation${data.classId ? `&class=${data.classId}` : ""}${yearQ}`} label="Teacher allocation" /></div>
        </>
      )}
      {view === "teachers" && (
        <>
          {!own && <div className="no-print mb-4"><TeacherSearch value={one(raw.q)} /></div>}
          {workloads.length === 0 ? (
            <EmptyState title={own ? "No classes given to you yet" : "No teachers match"}>{own ? "Your classes appear here once the office assigns them in Teacher Allocation." : "Try another name or subject."}</EmptyState>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {workloads.map((w) => {
                const pct = Math.min(100, Math.round((w.periods / Math.max(1, w.limit)) * 100));
                const over = w.periods > w.limit;
                return (
                  <li key={w.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">{w.name}</h2>
                        <p className="text-sm text-ink-2">{w.designation}</p>
                      </div>
                      <Badge tone={over ? "danger" : w.periods === 0 ? "warning" : "neutral"}>{w.periods} of {w.limit} periods</Badge>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${w.periods} of ${w.limit} periods a week`}>
                      <div className={`h-full ${over ? "bg-danger" : pct > 90 ? "bg-warn" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                    </div>
                    {over && <p className="mt-2 text-sm text-danger">{w.name}: {w.periods} periods, limit {w.limit}.</p>}
                    {w.teaches.length === 0 ? <p className="mt-3 text-sm text-ink-2">No classes yet.</p> : (
                      <ul className="mt-3 flex flex-wrap gap-1.5 text-sm">
                        {w.teaches.map((t) => <li key={t.id} className={`rounded-full px-2.5 py-0.5 ${t.isMain ? "bg-surface-3" : "bg-brand-soft text-brand-text"}`}>{t.label}, {t.subject}{t.isMain ? "" : " (second)"}</li>)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!own && <div className="mt-4"><ExportLinks href={`/academic-management/export?kind=workload${yearQ}`} label="Teacher workload" /></div>}
        </>
      )}
    </>
  );
}
