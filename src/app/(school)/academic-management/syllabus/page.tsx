import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { allocationActiveOn } from "@/lib/academic/allocation";
import { subjectsForClass } from "@/lib/academic/subjects";
import { flatten, lateWords, progressBoard, syllabusTree, type TreeNode } from "@/lib/academic/syllabus";
import { isoDay, parseDay, plural } from "@/lib/academic/common";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { ExportLinks } from "../_components/export-links";
import { ParamSelect, ViewSwitch } from "../_components/pickers";
import { AddTopItem, ArchivePlan, CopySyllabus, DailyLog, LessonPlanButton, PasteItems, SyllabusTree, type LogChapter, type Row } from "./syllabus-ui";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Syllabus & Lesson Plans") };
}
const PATH = "/academic-management/syllabus";
const PAGE_SIZE = 30;

export default async function SyllabusPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw);
  if (!page.year) return (<><PageTop page={page} title="Syllabus & Lesson Plans" href={PATH} /><NoYear page={page} /></>);
  const year = page.year;
  const { scope } = page;
  const ctx = page.current.ctx;
  const teacherOnly = !scope.manage;
  const views = [
    { value: "progress", label: "Progress" },
    { value: "syllabus", label: "Syllabus" },
    { value: "log", label: "Daily log" },
    { value: "plans", label: "Lesson plans" },
  ];
  const view = views.some((x) => x.value === one(raw.view)) ? one(raw.view) : teacherOnly ? "log" : "progress";
  const date = page.today < year.startDate ? year.startDate : page.today > year.endDate ? year.endDate : page.today;

  const data = await withSchool(ctx, async (tx) => {
    // Section and subject pairs from Teacher Allocation: the teacher's own, or every one.
    const allocations = await tx.teacherAllocation.findMany({
      where: { academicYearId: year.id, ...allocationActiveOn(date), ...(teacherOnly ? { staffId: scope.staffId ?? "none" } : {}), ...(scope.sectionIds && !teacherOnly ? { sectionId: { in: scope.sectionIds } } : {}) },
      include: { section: { include: { schoolClass: true } }, subject: true },
      orderBy: [{ section: { schoolClass: { sortOrder: "asc" } } }, { section: { name: "asc" } }, { subject: { name: "asc" } }],
    });
    const staffNames = new Map((await tx.staff.findMany({ where: { id: { in: allocations.map((a) => a.staffId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    const seen = new Set<string>();
    const pairs = allocations.filter((a) => a.isMain && a.section.archivedAt === null && !seen.has(`${a.sectionId}:${a.subjectId}`) && seen.add(`${a.sectionId}:${a.subjectId}`)).map((a) => ({
      key: `${a.sectionId}:${a.subjectId}`, sectionId: a.sectionId, classId: a.section.classId, subjectId: a.subjectId,
      label: `${a.section.schoolClass.name} ${a.section.name}`, subject: a.subject.name, teacher: staffNames.get(a.staffId) ?? null, className: a.section.schoolClass.name,
    }));
    const classes = await tx.schoolClass.findMany({ where: { campusId: page.campusId, archivedAt: null, sections: { some: { academicYearId: year.id, archivedAt: null } } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

    if (view === "progress") {
      const classId = one(raw.class);
      const chosen = classId ? pairs.filter((p) => p.classId === classId) : pairs;
      const board = await progressBoard(tx, year.id, chosen.slice(0, 300), page.today);
      return { kind: "progress" as const, pairs, classes, classId, board };
    }
    if (view === "syllabus") {
      const classId = classes.some((c) => c.id === one(raw.class)) ? one(raw.class) : teacherOnly ? pairs[0]?.classId ?? "" : classes[0]?.id ?? "";
      const subjects = classId ? await subjectsForClass(tx, classId, date) : [];
      const subjectId = subjects.some((s) => s.id === one(raw.subject)) ? one(raw.subject) : subjects[0]?.id ?? "";
      const sections = classId ? await tx.section.findMany({ where: { classId, academicYearId: year.id, archivedAt: null }, orderBy: { name: "asc" } }) : [];
      const sectionId = sections.some((s) => s.id === one(raw.section)) ? one(raw.section) : "";
      const tree = classId && subjectId ? await syllabusTree(tx, year.id, classId, subjectId, sectionId || null, page.today) : [];
      return { kind: "syllabus" as const, pairs, classes, classId, subjects, subjectId, sections, sectionId, tree };
    }
    if (view === "log") {
      const pairKey = pairs.some((p) => p.key === one(raw.pair)) ? one(raw.pair) : pairs[0]?.key ?? "";
      const pair = pairs.find((p) => p.key === pairKey) ?? null;
      const logDate = parseDay(one(raw.date)) ?? page.today;
      const tree = pair ? await syllabusTree(tx, year.id, pair.classId, pair.subjectId, pair.sectionId, page.today) : [];
      const ticked = pair ? await tx.syllabusProgressEntry.findMany({ where: { sectionId: pair.sectionId, date: logDate, archivedAt: null, status: "taught" }, select: { itemId: true } }) : [];
      return { kind: "log" as const, pairs, classes, pair, pairKey, logDate, tree, ticked: new Set(ticked.map((t) => t.itemId)) };
    }
    const pageNo = Math.max(1, Number(one(raw.page)) || 1);
    const pairKey = pairs.some((p) => p.key === one(raw.pair)) ? one(raw.pair) : "";
    const where = {
      academicYearId: year.id, archivedAt: null,
      ...(teacherOnly ? { staffId: scope.staffId ?? "none" } : {}),
      ...(pairKey ? { sectionId: pairKey.split(":")[0], subjectId: pairKey.split(":")[1] } : {}),
    };
    const [total, plans] = await Promise.all([
      tx.lessonPlan.count({ where }),
      tx.lessonPlan.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (pageNo - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    ]);
    const [topics, sections, subjects, staff] = await Promise.all([
      tx.syllabusItem.findMany({ where: { id: { in: plans.map((p) => p.topicId) } }, select: { id: true, title: true } }),
      tx.section.findMany({ where: { id: { in: plans.map((p) => p.sectionId) } }, include: { schoolClass: true } }),
      tx.subject.findMany({ where: { id: { in: plans.map((p) => p.subjectId) } }, select: { id: true, name: true } }),
      tx.staff.findMany({ where: { id: { in: plans.map((p) => p.staffId) } }, select: { id: true, fullName: true } }),
    ]);
    return { kind: "plans" as const, pairs, classes, pairKey, total, pageNo, plans: plans.map((p) => {
      const s = sections.find((x) => x.id === p.sectionId);
      return { ...p, topic: topics.find((t) => t.id === p.topicId)?.title ?? "", section: s ? `${s.schoolClass.name} ${s.name}` : "", subject: subjects.find((x) => x.id === p.subjectId)?.name ?? "", teacher: staff.find((x) => x.id === p.staffId)?.fullName ?? "" };
    }) };
  });

  const pairOptions = data.pairs.map((p) => ({ value: p.key, label: `${p.label}, ${p.subject}`, group: p.className }));
  const yearQ = page.yearQuery ? `&${page.yearQuery}` : "";

  return (
    <>
      <PageTop page={page} title="Syllabus & Lesson Plans" href={PATH}>
        {/* Gap list G44: chapters and topics with their planned month or week, from an Excel sheet. */}
        {page.scope.manage && <ButtonLink href="/academic-management/import?kind=academic-syllabus" size="sm" variant="ghost"><Words k="Import from Excel" /></ButtonLink>}
      </PageTop>
      <ViewSwitch views={views} current={view} />

      {data.kind === "progress" && (
        <>
          <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
            {!teacherOnly ? <ParamSelect name="class" label="Class" current={data.classId} placeholder="All classes" options={data.classes.map((c) => ({ value: c.id, label: c.name }))} /> : <span />}
            <ExportLinks href={`/academic-management/export?kind=syllabus-progress${data.classId ? `&class=${data.classId}` : ""}${yearQ}`} label="Syllabus progress" />
          </div>
          {data.board.length === 0 ? (
            <EmptyState title={teacherOnly ? "No classes given to you yet" : "No subjects with teachers yet"}>
              {teacherOnly ? "Your subjects show here once they are assigned to you in Teacher Allocation." : "Progress shows for each subject that has a teacher in Teacher Allocation."}
            </EmptyState>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.board.map((b) => {
                const behind = b.total > 0 && b.completedPct < b.plannedPct;
                return (
                  <li key={`${b.sectionId}:${b.subjectId}`} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">{b.label} · {b.subject}</h2>
                        <p className="text-sm text-ink-2">{b.teacher ?? "No teacher"}</p>
                      </div>
                      {b.total === 0 ? <Badge><Words k="No syllabus" /></Badge> : <Badge tone={behind ? "danger" : "success"}>{b.completedPct}%</Badge>}
                    </div>
                    {b.total > 0 && (
                      <>
                        <div className="relative mt-3 h-2.5 rounded-full bg-surface-3" role="img" aria-label={`${b.completedPct}% completed, ${b.plannedPct}% planned by today`}>
                          <div className={`h-full rounded-full ${behind ? "bg-danger" : "bg-success"}`} style={{ width: `${b.completedPct}%` }} />
                          <div className="absolute -top-1 h-4.5 w-0.5 bg-ink" style={{ left: `${b.plannedPct}%` }} title={`Planned by today: ${b.plannedPct}%`} />
                        </div>
                        <p className="mt-2 text-sm text-ink-2">{b.done} <Words k="of" /> {b.total} <Words k="topics done ·" /> {b.plannedPct}<Words k="% planned by today" /></p>
                        <p className={`mt-1 text-sm ${b.late.length ? "font-medium text-danger" : "text-success"}`}>{lateWords(b.late)}</p>
                      </>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      <Link className="min-h-11 py-2.5 font-medium text-brand-text hover:underline" href={`${PATH}?view=syllabus&class=${b.classId}&subject=${b.subjectId}&section=${b.sectionId}${yearQ}`}><Words k="Open syllabus" /></Link>
                      {(teacherOnly || scope.sectionIds === null || scope.sectionIds.includes(b.sectionId)) && <Link className="min-h-11 py-2.5 font-medium text-brand-text hover:underline" href={`${PATH}?view=log&pair=${b.sectionId}:${b.subjectId}${yearQ}`}><Words k="Daily log" /></Link>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {data.kind === "syllabus" && (
        data.classes.length === 0 ? <EmptyState title="No classes in this year"><Words k={"Add classes in Classes & Sections first."} /></EmptyState> : (
          <>
            <div className="no-print mb-4 flex flex-wrap items-end gap-3">
              <ParamSelect name="class" label="Class" current={data.classId} clear={["subject", "section"]} options={data.classes.map((c) => ({ value: c.id, label: c.name }))} />
              {data.subjects.length > 0 && <ParamSelect name="subject" label="Subject" current={data.subjectId} options={data.subjects.map((s) => ({ value: s.id, label: s.name }))} />}
              {data.sections.length > 0 && <ParamSelect name="section" label="Status for" current={data.sectionId} placeholder="No section (plan only)" options={data.sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))} />}
            </div>
            {data.subjects.length === 0 ? (
              <EmptyState title="No subjects mapped to this class"><Words k="Map subjects to the class in Subjects first." /></EmptyState>
            ) : (
              <SyllabusView tree={data.tree} canEdit={scope.manage && page.writable} where={{ yearId: year.id, classId: data.classId, subjectId: data.subjectId }} showStatus={Boolean(data.sectionId)} yearIds={page.years.map((y) => y.id)} />
            )}
          </>
        )
      )}

      {data.kind === "log" && (
        data.pairs.length === 0 ? (
          <EmptyState title="No classes given to you yet"><Words k="The daily log lists the subjects you teach. They appear once you are assigned in Teacher Allocation." /></EmptyState>
        ) : (
          <>
            <div className="no-print mb-4"><ParamSelect name="pair" label="Class and subject" current={data.pairKey} options={pairOptions} /></div>
            {data.tree.length === 0 ? (
              <EmptyState title="No syllabus for this subject yet">{scope.manage ? <><Words k="Set it up in the" /> <Link className="font-medium text-brand-text underline" href={`${PATH}?view=syllabus&class=${data.pair?.classId}&subject=${data.pair?.subjectId}${yearQ}`}><Words k="Syllabus view" /></Link>.</> : "Ask the Academic Head to set up the syllabus. Then tick topics here as you teach them."}</EmptyState>
            ) : !page.writable ? (
              <p className="text-ink-2">{year.name} <Words k="is closed. The daily log is read-only." /></p>
            ) : (
              <DailyLog key={`${data.pairKey}:${isoDay(data.logDate)}`} chapters={logChapters(data.tree, data.ticked)} yearId={year.id} sectionId={data.pair!.sectionId} date={isoDay(data.logDate)} maxDate={isoDay(page.today)} />
            )}
          </>
        )
      )}

      {data.kind === "plans" && (
        <>
          <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
            <ParamSelect name="pair" label="Class and subject" current={data.pairKey} placeholder={teacherOnly ? "All my classes" : "All classes"} options={pairOptions} />
            {page.writable && scope.staffId && data.pairs.length > 0 && <LessonPlanButton yearId={year.id} pairs={pairOptions} defaultPair={data.pairKey || undefined} />}
          </div>
          {data.plans.length === 0 ? (
            <EmptyState title="No lesson plans yet">{scope.staffId && data.pairs.length ? "Write a plan for the next topic. The topic and date are filled in from the syllabus and the Time Table." : "Lesson plans written by teachers show here."}</EmptyState>
          ) : (
            <>
              <ul className="space-y-3">
                {data.plans.map((p) => (
                  <li key={p.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">{p.topic}</h2>
                        <p className="text-sm text-ink-2">{formatDate(p.date)} · {p.section} · {p.subject}{teacherOnly ? "" : ` · ${p.teacher}`}</p>
                      </div>
                      {page.writable && (scope.manage || p.staffId === scope.staffId) && (
                        <div className="flex gap-1">
                          <LessonPlanButton yearId={year.id} pairs={pairOptions.some((o) => o.value === `${p.sectionId}:${p.subjectId}`) ? pairOptions : [...pairOptions, { value: `${p.sectionId}:${p.subjectId}`, label: `${p.section}, ${p.subject}`, group: "" }]}
                            plan={{ id: p.id, pair: `${p.sectionId}:${p.subjectId}`, topicId: p.topicId, date: isoDay(p.date), objectives: p.objectives, resources: p.resources, activities: p.activities }} />
                          <ArchivePlan id={p.id} title={p.topic} />
                        </div>
                      )}
                    </div>
                    <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                      <div><dt className="font-medium"><Words k="Objectives" /></dt><dd className="whitespace-pre-line text-ink-2">{p.objectives || "Not written"}</dd></div>
                      <div><dt className="font-medium"><Words k="Resources" /></dt><dd className="whitespace-pre-line break-words text-ink-2">{p.resources || "None"}</dd></div>
                      <div><dt className="font-medium"><Words k="Activities and homework" /></dt><dd className="whitespace-pre-line text-ink-2">{p.activities || "None"}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
              {data.total > PAGE_SIZE && (
                <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink-2">{plural(data.total, "plan")}<Words k=", page" /> {data.pageNo} <Words k="of" /> {Math.ceil(data.total / PAGE_SIZE)}</span>
                  <span className="flex gap-2">
                    {data.pageNo > 1 && <Link className={buttonClass("secondary", "sm")} href={`${PATH}?view=plans&page=${data.pageNo - 1}${data.pairKey ? `&pair=${data.pairKey}` : ""}${yearQ}`}><Words k="Previous" /></Link>}
                    {data.pageNo * PAGE_SIZE < data.total && <Link className={buttonClass("secondary", "sm")} href={`${PATH}?view=plans&page=${data.pageNo + 1}${data.pairKey ? `&pair=${data.pairKey}` : ""}${yearQ}`}><Words k="Next" /></Link>}
                  </span>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function SyllabusView({ tree, canEdit, where, showStatus, yearIds }: { tree: TreeNode[]; canEdit: boolean; where: { yearId: string; classId: string; subjectId: string }; showStatus: boolean; yearIds: string[] }) {
  const flat = flatten(tree);
  const rows: Row[] = flat.map((n) => {
    const siblings = flat.filter((x) => x.parentId === n.parentId);
    return {
      id: n.id, parentId: n.parentId, kind: n.kind, title: n.title, depth: n.depth, status: n.status,
      plannedFrom: n.plannedFrom ? isoDay(n.plannedFrom) : null, plannedTo: n.plannedTo ? isoDay(n.plannedTo) : null,
      ownPlannedTo: n.ownPlannedTo ? isoDay(n.ownPlannedTo) : null,
      leaves: n.leaves, done: n.done, hasChildren: n.children.length > 0, first: siblings[0]?.id === n.id, last: siblings[siblings.length - 1]?.id === n.id,
    };
  });
  return (
    <>
      {canEdit && (
        <div className="no-print mb-3 flex flex-wrap gap-2">
          <AddTopItem where={where} />
          <PasteItems where={where} />
          {tree.length === 0 && <CopySyllabus where={where} yearIds={yearIds} />}
        </div>
      )}
      {tree.length === 0 ? (
        <EmptyState title="No syllabus yet for this subject">{canEdit ? "Add units and chapters, paste a list, or copy one from another class or year." : "The syllabus appears here once the Academic Head sets it up."}</EmptyState>
      ) : (
        <>
          {showStatus && <p className="mb-2 text-sm text-ink-2"><Words k="Status for the chosen section: Planned, Taught, Completed, or Pending when the planned date has passed." /></p>}
          <SyllabusTree rows={rows} canEdit={canEdit} where={where} showStatus={showStatus} />
        </>
      )}
    </>
  );
}

/** Topics to tick, grouped under their chapter (or the nearest item with children). */
function logChapters(tree: TreeNode[], ticked: Set<string>): LogChapter[] {
  const out: LogChapter[] = [];
  const walk = (n: TreeNode) => {
    const leaves = n.children.filter((c) => c.children.length === 0);
    if (leaves.length) out.push({ id: n.id, title: n.title, status: n.status, topics: leaves.map((l) => ({ id: l.id, title: l.title, status: l.status, tickedToday: ticked.has(l.id) })) });
    for (const c of n.children) if (c.children.length) walk(c);
  };
  for (const n of tree) {
    if (n.children.length === 0) out.push({ id: n.id, title: n.title, status: n.status, topics: [{ id: n.id, title: n.title, status: n.status, tickedToday: ticked.has(n.id) }] });
    else walk(n);
  }
  return out;
}
