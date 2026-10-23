import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BadgeCheck, Calculator, CalendarClock, ChevronRight, CircleCheck, CircleX, EyeOff, FileClock, History, ListChecks, ListTodo, Send, Sigma, Table, TriangleAlert, Trophy } from "lucide-react";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch } from "@/lib/periods";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { plural, wordList } from "@/lib/academic/common";
import { examKey, finalKey, PAPER_STATUS_TONE, PAPER_STATUS_WORDS, showMarks, showPercent } from "@/lib/exams/common";
import { examSettings } from "@/lib/exams/settings";
import { bandsFor, finalSheet, isWeakResult, readiness, resultSheet, type SheetRow } from "@/lib/exams/results";
import { resultSubjects, teachesPaper } from "@/lib/exams/scope";
import { sectionStudents } from "@/lib/exams/roster";
import type { Band } from "@/lib/exams/grades";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { Pill, type PillTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner, DataList, ListEmpty, Stats, Timeline, Toolbar, TONE_SOFT } from "@/components/ui/kit";
import { ExportMenu, UrlSearch, UrlSelect } from "@/components/ui/kit-client";
import { cx } from "@/components/ui/cx";
import { examOverlaps } from "../_lib/period";
import { examPage, one, sectionOptions, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { CancelScheduleButton, PublishFlow, PublishedMenu, ResultTable, type TableCol, type TableRow } from "./results-ui";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Results") };
}
const PATH = "/examination-results/results";

const data_ids = (list: { id: string }[]) => list.map((x) => x.id);
const SHORT: Record<string, string> = {
  english: "Eng", mathematics: "Maths", science: "Sci", "social studies": "SS", "social science": "SS", "environmental studies": "EVS", telugu: "Tel", hindi: "Hin",
  sanskrit: "Skt", tamil: "Tam", kannada: "Kan", malayalam: "Mal", marathi: "Mar", urdu: "Urdu", "computer science": "CS", computers: "Comp", physics: "Phy", chemistry: "Chem", biology: "Bio",
  "general knowledge": "GK", "physical education": "PE", "art education": "Art", "work education": "WE",
};
const short = (name: string) => {
  const known = SHORT[name.trim().toLowerCase()];
  if (known) return known;
  if (name.length <= 6) return name;
  const words = name.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => w[0]).join("").toUpperCase().slice(0, 4) : `${name.slice(0, 4)}.`;
};
function toneOf(grade: string | null, bands: Band[]): PillTone {
  const sorted = [...bands].sort((a, b) => b.from - a.from);
  const i = sorted.findIndex((b) => b.grade === grade);
  if (i < 0) return "neutral";
  if (!sorted[i].passing) return "bad";
  return i < sorted.length / 3 ? "ok" : i < (2 * sorted.length) / 3 ? "brand" : "warn";
}

export default async function ResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.results) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const final = one(raw.exam) === "final" || one(raw.view) === "final";
  const tz = page.current.school.timeZone;
  const dates = await periodSetup(page.current);
  const sections = await sectionOptions(page);
  const range = final ? null : periodFromSearch(raw, dates);
  const exams = await withSchool(page.current.ctx, (tx) => tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" }, ...examOverlaps(range) }, orderBy: { startDate: "desc" } }));
  const s = page.scope;
  const sub = s.manage
    ? "Worked out as marks come in · publishing puts report cards on Parent Link"
    : `Results of your classes: ${sections.map((x) => x.label.replace(/^Class /, "")).join(", ") || "none yet"}. ${s.publish ? "" : "The Exam In-charge or the Principal publishes results."}`;
  const top = (
    <PageTop page={page} href={PATH} sub={sub}>
      {s.manage && <ButtonLink href={withYear(`${PATH}/moderation`, page)} variant="secondary" icon={ListChecks}><Words k="Moderation report" /></ButtonLink>}
    </PageTop>
  );
  if (sections.length === 0) return (<>{top}<EmptyState title="No sections to show"><Words k="Results show for the sections you teach. Ask the Exam In-charge if one is missing." /></EmptyState></>);

  // No section chosen: the person's own class, else the first section with a published exam.
  const withExams = sections.filter((x) => exams.some((e) => e.classIds.includes(x.classId)));
  const fallback = withExams.find((x) => s.classTeacherOf.includes(x.id)) ?? withExams[0] ?? sections[0];
  const sectionId = sections.some((x) => x.id === one(raw.section)) ? one(raw.section) : fallback.id;
  const section = sections.find((x) => x.id === sectionId)!;
  // A subject teacher sees only their own subjects here (owner's rules, 12 Oct 2026): no totals, ranks or final result.
  const only = resultSubjects(s, sectionId);
  if (only && final) redirect(withYear(`${PATH}?section=${sectionId}`, page));
  const classExams = exams.filter((e) => e.classIds.includes(section.classId));
  const exam = final ? null : classExams.find((e) => e.id === one(raw.exam)) ?? classExams[0] ?? null;
  const key = final ? finalKey(year.id) : exam ? examKey(exam.id) : null;
  const q = one(raw.q).trim().toLowerCase();

  const data = key ? await withSchool(page.current.ctx, async (tx) => {
    const settings = await examSettings(tx, page.current.ctx);
    const sheet = final ? null : await resultSheet(tx, page.current.ctx, exam!.id, sectionId, only);
    const fin = final ? await finalSheet(tx, page.current.ctx, year.id, sectionId) : null;
    const pickable = final ? sections : sections.filter((x) => exam!.classIds.includes(x.classId));
    const ready = await readiness(tx, page.current.ctx, key, s.publish ? pickable.map((x) => x.id) : [sectionId]);
    const roster = await sectionStudents(tx, data_ids(pickable), year.id);
    const history = await tx.resultPublication.findMany({ where: { key, sectionIds: { has: sectionId } }, orderBy: { createdAt: "desc" }, take: 10 });
    const people = await tx.userLogin.findMany({ where: { id: { in: history.flatMap((h) => [h.createdById, h.unpublishedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    const scale = await bandsFor(tx, page.current.ctx, exam?.gradeScaleId ?? null, section.board);
    return { settings, sheet, fin, ready, history, people, bands: scale.bands, roster: roster.map((r) => r.sectionId) };
  }, { timeout: 60_000 }) : null;

  const examOptions = [...classExams.map((e) => ({ value: e.id, label: e.title })), ...(only ? [] : [{ value: "final", label: "Final result (year)" }])];
  const exportHref = `/examination-results/export?kind=${final ? "final-sheet" : "result-sheet"}&section=${sectionId}${exam ? `&exam=${exam.id}` : ""}${page.yearQuery ? `&${page.yearQuery}` : ""}`;
  const toolbar = (
    <Toolbar>
      <Suspense><UrlSelect name="exam" label="Exam" className="md:w-56" value={final ? "final" : exam?.id ?? ""} reset={["view"]} options={examOptions.length > 1 ? examOptions : [{ value: "", label: "No published exams" }, ...examOptions]} /></Suspense>
      <Suspense><UrlSelect name="section" label="Class" className="md:w-40" value={sectionId} reset={final ? [] : ["exam"]} options={sections.map((x) => ({ value: x.id, label: x.label }))} /></Suspense>
      <Suspense><UrlSearch placeholder="Student name or roll" /></Suspense>
      {!final && <Suspense><PeriodFilter {...dates} ahead allLabel="All exam dates" /></Suspense>}
      {data && <ExportMenu href={exportHref} className="md:ml-auto" />}
    </Toolbar>
  );

  if (!data || !key) {
    return (
      <>
        {top}
        <Card className="overflow-hidden">
          {toolbar}
          <ListEmpty icon={Table} title={range ? "No exams in these dates" : "No published exams"} body={`Results appear once a datesheet for ${section.className} is published and marks are entered.`} />
        </Card>
      </>
    );
  }

  const mine = data.ready.find((r) => r.sectionId === sectionId);
  const published = Boolean(mine?.published);
  const scheduled = mine?.scheduled ?? null;
  const title = final ? `final result ${year.name}` : exam!.title;
  const ranks = data.settings.ranksOn;
  const allRows: SheetRow[] = final ? data.fin!.rows : data.sheet!.rows;
  // ?weak=1: below 50% or not passing, as the Dashboard's card counts them (isWeakResult, gap list G36).
  const weak = !only && one(raw.weak) === "1";
  const rows = allRows.filter((r) => (!q || r.name.toLowerCase().includes(q) || String(r.rollNo ?? "") === q) && (!weak || (r.complete && isWeakResult(r))));
  const name = (id: string | null) => data.people.find((p) => p.id === id)?.displayName ?? "";
  const complete = allRows.filter((r) => r.complete);
  const pct = complete.map((r) => r.percent ?? 0);
  const passed = complete.filter((r) => r.outcome === "Pass").length;
  const best = [...complete].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
  const failing = complete.filter((r) => r.outcome && r.outcome !== "Pass").length;
  const absentAny = allRows.filter((r) => Object.values(r.cells).some((c) => c.absent && !c.medical)).length;
  const studentsIn = (id: string) => data.roster.filter((x) => x === id).length;
  const publishSections = data.ready.map((r) => ({ id: r.sectionId, label: r.label, ready: r.ready, problems: r.problems, published: r.published, scheduled: r.scheduled ? formatDateTime(r.scheduled.publishOn, tz) : null, students: studentsIn(r.sectionId) || 0 }));
  const status = published ? { words: "Published", tone: "ok" as const } : scheduled ? { words: "Publish date set", tone: "info" as const } : mine?.waiting.length ? { words: `Published · ${mine.waiting.length} to publish`, tone: "info" as const } : { words: "Draft", tone: "neutral" as const };
  const lastPublished = data.history.find((h) => h.status === "published");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  // Papers with marks still missing in this section (design HyMissing). Students who joined after the exam are left out.
  const missing = !final && data.sheet ? data.sheet.columns.map((c) => ({
    c, count: data.sheet!.rows.filter((r) => !r.leftOut && r.cells[c.id]?.missing).length,
    status: data.sheet!.paperStatus.find((p) => p.entryId === c.entryId)?.status ?? "NOT_STARTED",
  })).filter((x) => x.count > 0) : [];

  const banners = (
    <div className="p-3 flex flex-col gap-3">
      {published && (
        <Banner tone="ok" title={`Published${lastPublished?.publishedAt ? ` ${formatDateTime(lastPublished.publishedAt, tz)}` : ""}${lastPublished && name(lastPublished.createdById) ? ` by ${name(lastPublished.createdById)}` : ""}.`}
          action={s.publish && page.writable ? <PublishedMenu keyName={key} title={final ? "the final" : exam!.title} chosen={sectionId} sections={data.ready.filter((r) => r.published).map((r) => ({ id: r.sectionId, label: r.label }))} /> : undefined}>
          <Words k="Report cards are on Parent Link" />{lastPublished?.messagesSent ? ` and ${plural(lastPublished.messagesSent, "parent")} ${lastPublished.messagesSent === 1 ? "was" : "were"} messaged` : ""}<Words k=". Kept in the result history; a later grade scale change does not alter it." />
        </Banner>
      )}
      {!published && scheduled && (
        <Banner tone="info" icon={CalendarClock} title={`Set to publish on ${formatDateTime(scheduled.publishOn, tz)}.`} action={s.publish && page.writable ? <CancelScheduleButton id={scheduled.id} when={formatDateTime(scheduled.publishOn, tz)} /> : undefined}>
          <Words k="The results publish by themselves then, if every mark is still complete." />
        </Banner>
      )}
      {only && missing.length > 0 && (
        <Banner tone="warn" title={`Draft. ${missing.map((m) => m.c.name).join(", ")} marks are not all in for ${section.label}.`}><Words k="A draft with missing marks cannot be published." /></Banner>
      )}
      {!only && !published && !scheduled && mine && mine.waiting.length === 0 && mine.problems.length > 0 && (
        <Banner tone="warn" title={`Draft. ${mine.problems[0]}`}>{mine.problems.slice(1).join(" ")}{missing.length ? " A draft with missing marks cannot be published." : ""}</Banner>
      )}
      {!only && !published && !scheduled && mine?.ready && mine.waiting.length === 0 && (
        <Banner tone="info" icon={BadgeCheck} title="Ready to publish."
          action={s.publish && page.writable ? <PublishFlow size="sm" label="Review and publish" keyName={key} title={final ? "final" : exam!.title} chosen={sectionId} today={today} sections={publishSections} /> : <Pill tone="info"><Words k="Waiting for the Exam In-charge" /></Pill>}>
          <Words k="All marks are in for" /> {section.label}<Words k=". Totals, percentages" />{ranks ? ", ranks" : ""} <Words k="and grades are worked out." />
        </Banner>
      )}
      {!only && mine && mine.waiting.length > 0 && (
        <Banner tone="brand" icon={BadgeCheck} title={`Published, except ${plural(mine.waiting.length, "result")} added later: ${mine.waiting.join(", ")}.`}
          action={s.publish && page.writable && mine.ready && !scheduled ? <PublishFlow size="sm" label="Publish" keyName={key} title={final ? "final" : exam!.title} chosen={sectionId} today={today} sections={publishSections} /> : undefined}>
          {mine.ready ? "Marks were added for a student who joined late. Publishing it puts their report card on Parent Link and tells only their parents; the others' published results do not change." : mine.problems.join(" ")}
        </Banner>
      )}
      {!only && mine && mine.leftOut.length > 0 && (
        <Banner tone="info" title={`${wordList(mine.leftOut)} joined after ${final ? "the year's exams" : "this exam"}.`}>
          {final
            ? "They are left out of the final result and do not stop it being published."
            : `Left out of ${exam!.title}; they do not stop the results being published. ${data.settings.lateMarks === "off" ? "Your school does not add late marks (Exam Settings, Late joiners)." : "To include them, the subject teacher adds their marks on each paper; this needs approval."}`}
          {final ? "" : ` In the final result, a missed exam is ${data.settings.lateJoinRule === "zero" ? "counted as 0%" : "left out and the exams they sat count in its place"}.`}
        </Banner>
      )}
      {final && (
        <Banner tone="info" icon={Sigma} title="Final result for the year.">
          {data.fin!.exams.some((e) => e.weight > 0) ? `Combines the exams with the weights in Exam Settings: ${data.fin!.exams.filter((e) => e.counts).map((e) => `${e.title} ${e.weight}%`).join(", ")}.` : "No weights are set in Exam Settings, so every exam counts equally."}
        </Banner>
      )}
    </div>
  );

  const bands = data.bands;
  const tableCols: TableCol[] = final ? [] : data.sheet!.columns.map((c) => {
    const st = data.sheet!.paperStatus.find((p) => p.entryId === c.entryId)?.status;
    return { id: c.id, name: c.name, short: short(c.name), max: c.max, gradeOnly: c.gradeOnly, notIn: !st || (st !== "SUBMITTED" && st !== "LOCKED") };
  });
  const tableRows: TableRow[] = final ? [] : rows.map((r) => {
    const cells: TableRow["cells"] = {};
    for (const c of data.sheet!.columns) {
      const x = r.cells[c.id];
      cells[c.id] = !x || (r.leftOut && x.missing) ? { text: "—", tone: null, grade: null, v: null }
        : x.absent ? { text: x.medical ? "ML" : "AB", tone: "info", grade: null, v: 0 }
        : x.missing ? { text: "—", tone: "warn", grade: null, v: null }
        : c.gradeOnly ? { text: x.grade ?? "", tone: null, grade: x.grade, v: null }
        : { text: `${showMarks(x.marks)}${x.grace ? `+${x.grace}` : ""}`, tone: x.passed === false ? "bad" : null, grade: x.grade, v: c.max ? Math.round(((x.marks ?? 0) / c.max) * 1000) / 10 : null };
    }
    const failedIn = data.sheet!.columns.filter((c) => r.cells[c.id]?.passed === false).map((c) => short(c.name));
    const absentIn = data.sheet!.columns.filter((c) => r.cells[c.id]?.absent && !r.cells[c.id]?.medical).map((c) => short(c.name));
    const result = r.leftOut ? { text: "Joined after this exam", tone: "neutral" as const }
      : !r.complete ? { text: `${r.missing} missing`, tone: "warn" as const }
      : r.outcome === "Pass" ? (absentIn.length ? { text: `Pass · AB ${absentIn.join(", ")}`, tone: "ok" as const } : { text: "Pass", tone: "ok" as const })
      : r.outcome === "Fail" ? { text: `Fail${failedIn.length ? ` · ${failedIn.join(", ")}` : ""}`, tone: "bad" as const }
      : { text: r.outcome ?? "", tone: "warn" as const };
    return {
      id: r.studentId, roll: r.rollNo, name: r.name, cells, total: r.complete ? `${showMarks(r.total)}/${showMarks(r.maxTotal)}` : "—", percent: r.complete ? showPercent(r.percent) : "—",
      grade: r.complete ? r.grade : null, gradeTone: toneOf(r.grade, bands), rank: r.complete ? r.rank : null, result, profile: `/student-management/students/${r.studentId}`,
    };
  });
  const canOpenPaper = (subjectId: string) => s.manage || teachesPaper(s, sectionId, subjectId);

  // A subject teacher's numbers: their own subject(s) only, from the cells they may see.
  const subjectStats = only && !final ? (() => {
    const cols = data.sheet!.columns.filter((c) => !c.gradeOnly && c.max > 0);
    const marked = rows.flatMap((r) => cols.map((c) => ({ name: r.name, x: r.cells[c.id], max: c.max }))).filter((m) => m.x && !m.x.missing && !m.x.absent && m.x.marks !== null);
    const v = (m: (typeof marked)[number]) => Math.round(((m.x!.marks ?? 0) / m.max) * 1000) / 10;
    const best = [...marked].sort((a, b) => v(b) - v(a))[0];
    return {
      name: cols.length === 1 ? cols[0].name : "Subject",
      counted: marked.length,
      average: marked.length ? Math.round((marked.reduce((t, m) => t + v(m), 0) / marked.length) * 10) / 10 : null,
      passed: marked.filter((m) => m.x!.passed !== false).length,
      failed: marked.filter((m) => m.x!.passed === false).length,
      absent: rows.filter((r) => cols.some((c) => r.cells[c.id]?.absent && !r.cells[c.id]?.medical)).length,
      best: best ? { name: best.name, v: v(best) } : null,
    };
  })() : null;

  return (
    <>
      {top}
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card className="overflow-hidden">{toolbar}{banners}</Card>

        {!final && missing.length > 0 && (
          <Card>
            <CardHeader title={`Missing marks · ${section.label}`} description="Results stay in draft until every mark is in" icon={ListTodo} />
            <ul className="px-2 pb-2">
              {missing.map(({ c, count, status: st }) => {
                const inner = (
                  <>
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-warn/12 text-warn"><FileClock size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px]">{c.name}</p>
                      <p className="text-[12.5px] text-ink3 truncate">{plural(count, "student")} <Words k="without" /> {c.gradeOnly ? "a grade" : "marks"}</p>
                    </div>
                    <span className="hidden sm:block shrink-0"><Pill tone={PAPER_STATUS_TONE[st as keyof typeof PAPER_STATUS_TONE] ?? "neutral"}>{PAPER_STATUS_WORDS[st as keyof typeof PAPER_STATUS_WORDS] ?? st}</Pill></span>
                  </>
                );
                return (
                  <li key={c.id}>
                    {c.entryId && canOpenPaper(c.id)
                      ? <Link href={withYear(`/examination-results/marks/${c.entryId}/${sectionId}`, page)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/70 text-left">{inner}<ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" /></Link>
                      : <div className="w-full flex items-center gap-3 px-3 py-3">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {only && subjectStats && (
          <Stats items={[
            { label: `${subjectStats.name} average`, value: subjectStats.average === null ? "—" : showPercent(subjectStats.average), sub: `${subjectStats.counted} of ${allRows.length} marked`, icon: Calculator },
            { label: "Passed", value: `${subjectStats.passed} of ${subjectStats.counted}`, sub: `${data.settings.passPercentSubject}% to pass`, tone: subjectStats.counted && subjectStats.passed === subjectStats.counted ? "ok" : undefined, icon: CircleCheck },
            { label: "Highest", value: subjectStats.best ? showPercent(subjectStats.best.v) : "—", sub: subjectStats.best?.name, tone: subjectStats.best ? "ok" : undefined, icon: Trophy },
            { label: "Did not pass", value: subjectStats.failed, sub: `${plural(subjectStats.absent, "student")} absent`, tone: subjectStats.failed ? "warn" : undefined, icon: subjectStats.failed ? TriangleAlert : CircleX },
          ]} />
        )}

        {!only && complete.length > 0 && (
          <Stats items={[
            { label: "Class average", value: pct.length ? showPercent(Math.round((pct.reduce((a, b) => a + b, 0) / pct.length) * 10) / 10) : "—", sub: `${complete.length} of ${allRows.length} complete`, icon: Calculator },
            { label: "Passed", value: `${passed} of ${complete.length}`, sub: `${data.settings.passPercentSubject}% in every subject`, tone: complete.length && passed === complete.length ? "ok" : undefined, icon: CircleCheck },
            { label: "Highest", value: best ? showPercent(best.percent) : "—", sub: best?.name, tone: best ? "ok" : undefined, icon: Trophy },
            { label: "Did not pass", value: failing, sub: final ? "In the final result" : `${plural(absentAny, "student")} absent for a paper`, tone: failing ? "warn" : undefined, icon: failing ? TriangleAlert : CircleX },
          ]} />
        )}

        {allRows.length === 0 ? <EmptyState title="No students"><Words k="There are no students in" /> {section.label}.</EmptyState> : !final ? (
          <Card className="overflow-hidden">
            <CardHeader title={`${exam!.title} · ${section.label}`} icon={Table}
              description={only ? `Only the subject${tableCols.length === 1 ? "" : "s"} you teach in ${section.label}: ${tableCols.map((c) => c.name).join(", ") || "none"}` : `${data.sheet!.columns.filter((c) => !c.gradeOnly).length ? `Total out of ${showMarks(Math.max(0, ...allRows.map((r) => r.maxTotal)))}` : "Graded subjects"}${ranks ? ` · ${data.settings.tieRule === "dense" ? "same rank for a tie, next rank follows" : "same rank for a tie, next rank skipped"}` : ""}`}
              action={<Pill tone={status.tone} dot>{status.words}</Pill>} />
            {rows.length ? <ResultTable columns={tableCols} rows={tableRows} ranks={ranks} subjectOnly={Boolean(only)} examTitle={exam!.title} section={section.label} passMark={data.settings.passPercentSubject} /> : <ListEmpty />}
            <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum flex flex-wrap gap-x-4"><Words k="Showing" /> {rows.length} <Words k="of" /> {allRows.length}<span><Words k="AB = absent · ML = medical leave · red = below the pass mark" />{tableCols.some((c) => c.notIn) ? " · • = marks not submitted" : ""}</span></div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader title={`Final result · ${section.label}`} description="Weighted from the exams held. Exams not yet published show as waiting." icon={Sigma} action={<Pill tone={status.tone} dot>{status.words}</Pill>} />
            <div className="border-t border-line">
              <DataList bp="md" minWidth={680} rows={rows} rowKey={(r) => r.studentId} caption={`Final result of ${section.label}`}
                empty={<ListEmpty />}
                footer={`Showing ${rows.length} of ${allRows.length} students · weights from Exam Settings`}
                columns={[
                  { key: "n", label: "Student", render: (r) => <span className="whitespace-nowrap"><span className="text-ink3 tnum inline-block w-7">{r.rollNo ?? ""}</span><span className="font-medium">{r.name}</span></span> },
                  ...data.fin!.exams.map((e) => ({
                    key: e.id, label: `${e.title}${e.counts && e.weight ? ` · ${e.weight}%` : !e.counts ? " · not counted" : ""}`, align: "right" as const,
                    render: (r: SheetRow) => { const x = (r as SheetRow & { exams: Record<string, { percent: number | null; complete: boolean; leftOut: boolean } | null> }).exams[e.id]; return x ? (x.leftOut ? <span className="text-ink3"><Words k="Joined later" /></span> : x.complete ? showPercent(x.percent) : <span className="text-warn"><Words k="Incomplete" /></span>) : <span className="text-ink3"><Words k="Waiting" /></span>; },
                  })),
                  { key: "f", label: "Final", align: "right", render: (r) => r.complete ? <span className="font-semibold">{showPercent(r.percent)} · {r.grade}</span> : <span className="text-ink3">—</span> },
                  ...(ranks ? [{ key: "rk", label: "Rank", align: "center" as const, render: (r: SheetRow) => r.rank ?? "—" }] : []),
                  { key: "o", label: "Result", render: (r) => r.complete ? <span className={cx("font-semibold text-[13px]", r.outcome === "Pass" ? "text-ok" : "text-bad")}>{r.outcome}</span> : <span className="text-ink3 text-[13px]">{r.leftOut ? "Joined after the exams" : "Waiting for exams"}</span> },
                ]}
                mobile={(r) => ({ lead: <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0 font-semibold text-[13px] tnum", TONE_SOFT.neutral)}>{r.rollNo ?? "–"}</span>, title: r.name, sub: data.fin!.exams.map((e) => `${e.title} ${(r as SheetRow & { exams: Record<string, { percent: number | null } | null> }).exams[e.id]?.percent ?? "–"}`).join(" · "), right: <span className="font-semibold tnum text-[14px]">{r.complete ? showPercent(r.percent) : "—"}<span className="block text-[11.5px] text-ink3 font-normal">{r.complete ? r.grade : "so far"}</span></span> })} />
            </div>
          </Card>
        )}

        {data.history.length > 0 && (
          <Card>
            <CardHeader title="Result history" description={`Publishing of ${title} for ${section.label}`} icon={History} />
            <div className="px-5">
              <Timeline items={data.history.map((h) => ({
                icon: h.status === "published" ? Send : h.status === "scheduled" ? CalendarClock : h.status === "unpublished" ? EyeOff : CircleX,
                tone: h.status === "published" ? "ok" as const : h.status === "scheduled" ? "info" as const : h.status === "unpublished" || h.status === "failed" ? "warn" as const : "neutral" as const,
                what: h.status === "published" ? <><Words k="Published" />{h.messagesSent ? `, ${plural(h.messagesSent, "parent")} messaged` : ""}</>
                  : h.status === "scheduled" ? <><Words k="Set to publish on" /> {formatDateTime(h.publishOn, tz)}</>
                  : h.status === "cancelled" ? <><Words k="Publish date" /> {formatDateTime(h.publishOn, tz)} <Words k="cancelled" /></>
                  : h.status === "failed" ? <><Words k="Not published on" /> {formatDateTime(h.publishOn, tz)}: {h.note ?? ""}</>
                  : <><Words k="Unpublished by" /> {name(h.unpublishedById) || "the school"}: “{h.note ?? ""}”</>,
                when: `${formatDateTime(h.unpublishedAt ?? h.publishedAt ?? h.createdAt, tz)} · ${name(h.createdById) || "the school"}`,
              }))} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
