import type { Metadata } from "next";
import { Award, ClipboardCheck, MessageSquareText, Palette, PenLine, Users } from "lucide-react";
import { withSchool, type Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { plural } from "@/lib/academic/common";
import { DIRECT_REPORT_LIMIT, reportBoard } from "@/lib/exams/report-cards";
import { periodsForClass } from "@/lib/exams/report-status";
import { writesReportCards } from "@/lib/exams/scope";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Banner, Chips, Stats, Toolbar, type StatItem } from "@/components/ui/kit";
import { UrlSearch, UrlSelect } from "@/components/ui/kit-client";
import { examPage, one, sectionOptions, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { GradeGrid, RemarksGrid, StatusBoard, type GradeColumn } from "./report-cards-ui";

export const metadata: Metadata = { title: "Report Cards" };
const PATH = "/examination-results/report-cards";
const VIEWS = ["status", "remarks", "co-scholastic", "competencies"] as const;
type View = (typeof VIEWS)[number];

async function competenciesFor(tx: Tx, classId: string) {
  const subjects = await tx.subjectClass.findMany({ where: { classId, archivedAt: null }, select: { subjectId: true, subject: { select: { name: true } } } });
  const list = await tx.competency.findMany({ where: { archivedAt: null, subjectId: { in: subjects.map((x) => x.subjectId) } }, orderBy: { name: "asc" } });
  const name = (id: string) => subjects.find((x) => x.subjectId === id)?.subject.name ?? "";
  return list.map((c) => ({ ...c, subject: { name: name(c.subjectId) } })).sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

export default async function ReportCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const s = page.scope;

  const all = await sectionOptions(page);
  const sections = s.manage ? all : all.filter((x) => s.classTeacherOf.includes(x.id));
  if (sections.length === 0) {
    return (
      <>
        <PageTop page={page} href={PATH} />
        <EmptyState title="No report cards for you" Icon={Award}>
          <p>Report cards are written by the class teacher of each section. You are not a class teacher this year. Ask the Principal if this is wrong.</p>
        </EmptyState>
      </>
    );
  }
  const section = sections.find((x) => x.id === one(raw.section)) ?? sections.find((x) => s.classTeacherOf.includes(x.id)) ?? sections[0];
  const q = one(raw.q).trim().toLowerCase().slice(0, 60);
  const view: View = (VIEWS as readonly string[]).includes(one(raw.view)) ? (one(raw.view) as View) : "status";

  const data = await withSchool(page.current.ctx, async (tx) => {
    const periods = await periodsForClass(tx, year.id, section.classId);
    const examPeriods = periods.filter((p) => p.period.kind === "exam");
    const period = periods.find((p) => p.key === one(raw.period)) ?? examPeriods[examPeriods.length - 1] ?? periods[0];
    if (!period) return { periods, period: null, board: null, competencies: [], levels: [], teacher: null };
    const board = await reportBoard(tx, page.current.ctx, section.id, period.key);
    const [competencies, levels, sec] = await Promise.all([
      board?.features.competencies
        ? competenciesFor(tx, section.classId)
        : Promise.resolve([]),
      board?.features.competencies ? tx.competencyLevel.findMany({ where: { academicYearId: year.id, period: period.key } }) : Promise.resolve([]),
      tx.section.findFirst({ where: { id: section.id }, select: { classTeacherId: true } }),
    ]);
    const teacher = sec?.classTeacherId ? await tx.staff.findFirst({ where: { id: sec.classTeacherId }, select: { fullName: true } }) : null;
    return { periods, period, board, competencies, levels, teacher };
  });

  const canWrite = page.writable && writesReportCards(s, section.id);
  const classTeacher = canWrite && (s.manage || s.classTeacherOf.includes(section.id));
  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const base = { section: section.id, period: data.period?.key ?? "", view, q: one(raw.q), ...over };
    for (const [k, v] of Object.entries(base)) if (v && !(k === "view" && v === "status")) p.set(k, v);
    return withYear(`${PATH}${p.size ? `?${p}` : ""}`, page);
  };

  const sub = s.manage
    ? "Remarks, co-scholastic grades and printing, in the format of each class's board"
    : `${section.label} · you are the class teacher`;

  const top = (
    <Card className="overflow-hidden">
      <Toolbar>
        {data.periods.length > 0 && (
          <UrlSelect name="period" label="Report card" value={data.period?.key} className="md:w-80"
            options={data.periods.map((p) => ({ value: p.key, label: p.period.kind === "exam" ? `${p.label} report card` : p.label }))} />
        )}
        {sections.length > 1 && <UrlSelect name="section" label="Section" value={section.id} className="md:w-40" reset={["period", "q"]} options={sections.map((x) => ({ value: x.id, label: `Class ${x.label}` }))} />}
        <UrlSearch placeholder="Student name" />
      </Toolbar>
    </Card>
  );

  if (!data.period || !data.board) {
    return (
      <>
        <PageTop page={page} href={PATH} sub={sub} />
        <div className="flex flex-col gap-5">
          {top}
          <EmptyState title="No report cards yet" Icon={Award}>
            <p>A report card is made for each exam once its datesheet is published. {section.label} has no published exam this year yet.</p>
          </EmptyState>
        </div>
      </>
    );
  }

  const b = data.board;
  const rows = b.rows;
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.admissionNo.toLowerCase().includes(q));
  const ready = rows.filter((r) => r.status !== "NOT_READY").length;
  const sent = rows.filter((r) => r.status === "SENT").length;
  const ctDone = rows.filter((r) => r.classTeacherRemark).length;
  const prDone = rows.filter((r) => r.principalRemark).length;
  const coDone = rows.filter((r) => !r.missing.includes("Co-scholastic grades")).length;
  const marksIn = rows.filter((r) => !r.missing.includes("Marks")).length;
  const tone = (n: number) => (n === rows.length ? "ok" : "warn") as StatItem["tone"];

  const stats: StatItem[] = [
    { label: "Class teacher remarks", value: `${ctDone} of ${rows.length}`, sub: ctDone === rows.length ? "All written" : `${rows.length - ctDone} still to write`, tone: tone(ctDone), icon: MessageSquareText, href: link({ view: "remarks" }) },
    { label: "Principal remarks", value: `${prDone} of ${rows.length}`, sub: "Written by the Principal", icon: PenLine, href: link({ view: "remarks" }) },
    ...(b.features.coScholastic ? [{ label: "Co-scholastic grades", value: `${coDone} of ${rows.length}`, sub: coDone === rows.length ? "All given" : "Some areas have no grade", tone: tone(coDone), icon: Palette, href: link({ view: "co-scholastic" }) } as StatItem] : []),
    { label: "Results published", value: `${marksIn} of ${rows.length}`, sub: `${plural(ready, "report card")} ready`, tone: tone(marksIn), icon: ClipboardCheck },
  ];

  const views: { value: View; label: string }[] = [
    { value: "status", label: "Status and printing" },
    { value: "remarks", label: "Remarks" },
    ...(b.features.coScholastic && b.areas.length ? [{ value: "co-scholastic" as View, label: "Co-scholastic grades" }] : []),
    ...(b.features.competencies && data.competencies.length ? [{ value: "competencies" as View, label: "Competencies" }] : []),
  ];
  const v = views.some((x) => x.value === view) ? view : "status";

  const banner = ready === 0 ? (
    <Banner tone="info" title="Not ready yet.">
      Report cards are ready once the results of {data.period.label} are published for {section.label}. Remarks and grades can be written now.
    </Banner>
  ) : sent === rows.length ? (
    <Banner tone="ok" title="Every report card is sent.">They are on Parent Link for each family.</Banner>
  ) : (
    <Banner tone="ok" title={`${plural(ready, "report card")} of ${rows.length} ready.`}>
      Published report cards show on Parent Link at once. Print them for the parent-teacher meeting, or mark them as sent when handed over.
    </Banner>
  );

  const nameRows = shown.map((r) => ({ studentId: r.studentId, name: r.name, rollNo: r.rollNo === null ? null : String(r.rollNo) }));

  return (
    <>
      <PageTop page={page} href={PATH} sub={sub} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {top}
        {banner}
        <Stats items={stats} />
        <Card className="overflow-hidden">
          <CardHeader icon={Award} title={`${data.period.label} · ${section.label}`}
            description={`${plural(rows.length, "student")}${data.teacher ? ` · class teacher ${data.teacher.fullName}` : ""} · generated ${formatDate(page.today)}`} divided />
          <div className="px-4 pt-3 md:px-5">
            <Chips label="Show" value={v} options={views.map((x) => ({ value: x.value, label: x.label, href: link({ view: x.value }) }))} />
          </div>
          <div className="p-4 md:p-5">
            {shown.length === 0 ? (
              <EmptyState title="No student matches" Icon={Users} bare><p>Try a different name.</p></EmptyState>
            ) : v === "status" ? (
              <StatusBoard key={`${section.id}${data.period.key}`} rows={shown.map((r) => ({ studentId: r.studentId, name: r.name, rollNo: r.rollNo === null ? null : String(r.rollNo), admissionNo: r.admissionNo, status: r.status, missing: r.missing, published: r.published }))}
                sectionId={section.id} period={data.period.key} periodLabel={data.period.label} canWrite={canWrite} directLimit={DIRECT_REPORT_LIMIT} />
            ) : v === "remarks" ? (
              <RemarksGrid key={`${section.id}${data.period.key}`} sectionId={section.id} period={data.period.key} classTeacher={classTeacher} principal={canWrite && s.principal} suggestions={b.features.aiRemarks}
                rows={shown.map((r) => ({ studentId: r.studentId, name: r.name, rollNo: r.rollNo === null ? null : String(r.rollNo), classTeacherRemark: r.classTeacherRemark, principalRemark: r.principalRemark, attendancePresent: r.attendancePresent, attendanceWorking: r.attendanceWorking, attendanceFromRegister: r.attendanceFromRegister }))} />
            ) : v === "co-scholastic" ? (
              <GradeGrid key={`${section.id}${data.period.key}co`} kind="co-scholastic" sectionId={section.id} period={data.period.key} canWrite={classTeacher} rows={nameRows}
                columns={b.areas.map((a): GradeColumn => ({ id: a.id, name: a.name, options: a.grades, group: a.kind === "area" ? undefined : a.kind }))}
                values={Object.fromEntries(b.grades.filter((g) => rows.some((r) => r.studentId === g.studentId)).map((g) => [`${g.studentId}:${g.areaId}`, g.grade]))} />
            ) : (
              <GradeGrid key={`${section.id}${data.period.key}cp`} kind="competency" sectionId={section.id} period={data.period.key} canWrite={classTeacher} rows={nameRows}
                columns={data.competencies.map((c): GradeColumn => ({ id: c.id, name: c.name, options: c.levels, group: c.subject.name }))}
                values={Object.fromEntries(data.levels.filter((l) => rows.some((r) => r.studentId === l.studentId)).map((l) => [`${l.studentId}:${l.competencyId}`, l.level]))} />
            )}
          </div>
          {shown.length > 0 && <p className="border-t border-line px-4 py-3 text-[13px] text-ink3 md:px-5">Showing {shown.length} of {rows.length}</p>}
        </Card>
      </div>
    </>
  );
}
