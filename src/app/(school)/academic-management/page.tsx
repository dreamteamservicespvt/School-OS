import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { classesForYear, teacherChoices } from "@/lib/academic/structure";
import { LEVELS, plural } from "@/lib/academic/common";
import { featureOn } from "@/lib/academic/scope";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { academicPage, one, type SearchParams } from "./_lib/page";
import { NoYear, PageTop } from "./_components/page-top";
import { ExportLinks } from "./_components/export-links";
import { AddClassButtons, ClassesBoard, StreamsButton } from "./classes-board";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Classes & Sections") };
}

export default async function ClassesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw, { notForOwn: "home", arrangerOk: true });
  const { current, year, scope } = page;
  if (!year) return (<><PageTop page={page} title="Classes & Sections" href="/academic-management" /><NoYear page={page} /></>);
  const archived = one(raw.archived) === "1";
  const data = await withSchool(current.ctx, async (tx) => {
    const [classes, teachers, streams, school] = await Promise.all([
      // The page's campus already limits a person who sees every class (One campus too), so classes with no section yet still show.
      classesForYear(tx, current.ctx, page.campusId, year.id, scope.see === "own" ? scope.sectionIds : null),
      scope.manage ? teacherChoices(tx, current.ctx, year.id, current) : Promise.resolve([]),
      tx.stream.findMany({ where: { schoolId: current.ctx.schoolId, campusId: page.campusId, archivedAt: null }, orderBy: { name: "asc" } }),
      tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { board: true } }),
    ]);
    let archivedSections: { id: string; label: string; archivedAt: Date }[] = [];
    if (archived && scope.manage) {
      const rows = await tx.section.findMany({ where: { academicYearId: year.id, archivedAt: { not: null }, schoolClass: { campusId: page.campusId } }, include: { schoolClass: true }, orderBy: { archivedAt: "desc" }, take: 50 });
      archivedSections = rows.map((r) => ({ id: r.id, label: `${r.schoolClass.name} ${r.name}`, archivedAt: r.archivedAt! }));
    }
    return { classes, teachers, streams, archivedSections, schoolBoard: school?.board ?? null };
  });

  const sections = data.classes.flatMap((c) => c.sections);
  const students = sections.reduce((n, s) => n + s.students, 0);
  const seatsLeft = sections.reduce((n, s) => n + Math.max(0, s.seats - s.students), 0);
  const canEdit = scope.manage && page.writable;
  const streamsOn = featureOn(current, "academic-streams");
  const boardsOn = featureOn(current, "academic-boards");
  const yearQ = page.yearQuery ? `&${page.yearQuery}` : "";

  return (
    <>
      <PageTop page={page} title="Classes & Sections" href="/academic-management">
        {canEdit && <AddClassButtons yearId={year.id} classes={data.classes.map((c) => ({ id: c.id, name: c.name }))} levels={[...LEVELS]} boardsOn={boardsOn} schoolBoard={data.schoolBoard} />}
      </PageTop>
      {scope.see === "own" && !scope.arrange && <p className="-mt-3 mb-4 text-ink-2"><Words k="Your classes in" /> {year.name}<Words k=": the sections you teach or are class teacher of." /></p>}

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Classes", data.classes.length],
          ["Sections", sections.length],
          ["Students", students],
          ["Seats left", seatsLeft],
        ].map(([label, n]) => (
          <Card key={label as string} as="div" className="p-4">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{(n as number).toLocaleString("en-IN")}</dd>
          </Card>
        ))}
      </dl>

      {data.classes.length === 0 ? (
        scope.see === "own" ? (
          <EmptyState title={`You have no classes in ${year.name}`}><Words k="Your classes appear here once the office gives you a section or a subject in Teacher Allocation." /></EmptyState>
        ) : (
          <EmptyState title={`No classes in ${year.name} yet`}>
            <p><Words k="Add your classes in teaching order, for example Nursery, LKG, UKG, then Class 1 to Class 10, each with its sections." /></p>
            {canEdit && <div className="mt-4 flex justify-center"><AddClassButtons yearId={year.id} classes={[]} levels={[...LEVELS]} boardsOn={boardsOn} schoolBoard={data.schoolBoard} quickOnly /></div>}
          </EmptyState>
        )
      ) : (
        <ClassesBoard
          yearId={year.id}
          classes={data.classes}
          teachers={data.teachers}
          streams={data.streams.map((s) => ({ id: s.id, name: s.name }))}
          canEdit={canEdit}
          streamsOn={streamsOn}
          boardsOn={boardsOn}
          schoolBoard={data.schoolBoard}
          levels={[...LEVELS]}
          archived={archived && scope.manage ? data.archivedSections.map((s) => ({ id: s.id, label: s.label, archivedOn: s.archivedAt.toISOString() })) : null}
          showArchivedToggle={scope.manage}
        />
      )}

      <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-3">
        {streamsOn && canEdit ? <StreamsButton yearId={year.id} streams={data.streams.map((s) => ({ id: s.id, name: s.name }))} /> : <span />}
        <ExportLinks href={`/academic-management/export?kind=class-strength${yearQ}`} label="Class strength and seats" />
      </div>
      {sections.length > 0 && <p className="mt-2 text-sm text-ink-2">{plural(sections.filter((s) => !s.classTeacherId).length, "section")} <Words k="without a class teacher." /></p>}
    </>
  );
}
