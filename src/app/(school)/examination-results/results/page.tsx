import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { examKey, finalKey, showMarks, showPercent } from "@/lib/exams/common";
import { examSettings } from "@/lib/exams/settings";
import { finalSheet, readiness, resultSheet, type SheetRow } from "@/lib/exams/results";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { ExportLinks } from "../../academic-management/_components/export-links";
import { ParamSelect, ViewSwitch } from "../../academic-management/_components/pickers";
import { examPage, one, sectionOptions, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { CancelScheduleButton, PublishButton, UnpublishButton } from "./results-ui";
import { LockExamButton } from "../marks/marks-ui";

export const metadata: Metadata = { title: "Results" };
const PATH = "/examination-results/results";

function localNow(tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export default async function ResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.results) redirect("/examination-results/datesheet");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const view = one(raw.view) === "final" ? "final" : "exam";
  const tz = page.current.school.timeZone;
  const sections = await sectionOptions(page);
  const exams = await withSchool(page.current.ctx, (tx) => tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" } }, orderBy: { startDate: "desc" } }));
  const views = [{ value: "exam", label: "Exam results" }, { value: "final", label: "Final result" }];
  const top = (extra?: React.ReactNode) => (
    <>
      <PageTop page={page} href={PATH}>
        {page.scope.manage && <Link href={withYear(`${PATH}/moderation`, page)} className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">Moderation report</Link>}
        {extra}
      </PageTop>
      <ViewSwitch views={views} current={view} keep={["section"]} />
    </>
  );
  if (sections.length === 0) return (<>{top()}<EmptyState title="No sections to show">Results show for the sections you teach. Ask the Exam In-charge if one is missing.</EmptyState></>);

  const sectionId = sections.some((s) => s.id === one(raw.section)) ? one(raw.section) : sections[0].id;
  const section = sections.find((s) => s.id === sectionId)!;
  const classExams = exams.filter((e) => e.classIds.includes(section.classId));
  const exam = view === "exam" ? classExams.find((e) => e.id === one(raw.exam)) ?? classExams[0] ?? null : null;
  const key = view === "final" ? finalKey(year.id) : exam ? examKey(exam.id) : null;

  const data = key ? await withSchool(page.current.ctx, async (tx) => {
    const settings = await examSettings(tx, page.current.ctx);
    const sheet = view === "final" ? null : await resultSheet(tx, page.current.ctx, exam!.id, sectionId);
    const final = view === "final" ? await finalSheet(tx, page.current.ctx, year.id, sectionId) : null;
    const pickable = view === "final" ? sections : sections.filter((s) => exam!.classIds.includes(s.classId));
    const ready = page.scope.publish ? await readiness(tx, page.current.ctx, key, pickable.map((s) => s.id)) : await readiness(tx, page.current.ctx, key, [sectionId]);
    const history = await tx.resultPublication.findMany({ where: { key, sectionIds: { has: sectionId } }, orderBy: { createdAt: "desc" }, take: 10 });
    const people = await tx.userLogin.findMany({ where: { id: { in: history.flatMap((h) => [h.createdById, h.unpublishedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { settings, sheet, final, ready, history, people };
  }, { timeout: 60_000 }) : null;

  const pickers = (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <ParamSelect name="section" label="Class" current={sectionId} options={sections.map((s) => ({ value: s.id, label: s.label }))} clear={["exam"]} />
      {view === "exam" && classExams.length > 0 && <ParamSelect name="exam" label="Exam" current={exam?.id ?? ""} options={classExams.map((e) => ({ value: e.id, label: e.title }))} />}
    </div>
  );
  if (!data || !key) return (<>{top()}{pickers}<EmptyState title={view === "final" ? "No exams yet" : "No published exams"}>{view === "final" ? "The final result combines the year's exams once they have marks." : `Results appear once a datesheet for ${section.className} is published and marks are entered.`}</EmptyState></>);

  const mine = data.ready.find((r) => r.sectionId === sectionId);
  const published = Boolean(mine?.published);
  const scheduled = mine?.scheduled ?? null;
  const title = view === "final" ? `the final result ${year.name}` : exam!.title;
  const ranks = data.settings.ranksOn;
  const rows: SheetRow[] = view === "final" ? data.final!.rows : data.sheet!.rows;
  const name = (id: string | null) => data.people.find((p) => p.id === id)?.displayName ?? "";
  const exportBase = `/examination-results/export?kind=${view === "final" ? "final-sheet" : "result-sheet"}&section=${sectionId}${exam ? `&exam=${exam.id}` : ""}${page.yearQuery ? `&${page.yearQuery}` : ""}`;

  return (
    <>
      {top(<>
        {page.scope.publish && page.writable && !published && !scheduled && <PublishButton keyName={key} title={title} chosen={sectionId} nowLocal={localNow(tz)} sections={data.ready.map((r) => ({ id: r.sectionId, label: r.label, ready: r.ready, problems: r.problems, published: r.published, scheduled: r.scheduled ? formatDateTime(r.scheduled.publishOn, tz) : null }))} />}
        {page.scope.publish && page.writable && published && <UnpublishButton keyName={key} title={title} sections={data.ready.filter((r) => r.published).map((r) => ({ id: r.sectionId, label: r.label }))} />}
        {page.scope.manage && page.writable && exam && !published && <LockExamButton examId={exam.id} title={exam.title} />}
      </>)}
      {pickers}

      <div className="mb-4 space-y-2">
        {published && <Alert tone="success" title="Published">{rows[0]?.publishedAt ? `Published on ${formatDateTime(rows[0].publishedAt, tz)}. ` : ""}Parents can download the report card on Parent Link. Published results keep the grade scale they were made with.</Alert>}
        {!published && scheduled && <Alert title="Publish date set" action={page.scope.publish && page.writable ? <CancelScheduleButton id={scheduled.id} when={formatDateTime(scheduled.publishOn, tz)} /> : undefined}>These results publish by themselves on {formatDateTime(scheduled.publishOn, tz)}.</Alert>}
        {!published && mine && mine.problems.length > 0 && <Alert tone="warning" title="Draft: not ready to publish">{mine.problems.join(" ")}</Alert>}
        {!published && mine?.ready && !scheduled && <Alert title="Draft">All marks are in. Totals, percentages and grades are worked out; {page.scope.publish ? "publish when ready." : "the Exam In-charge publishes the results."}</Alert>}
      </div>

      {rows.length === 0 ? <EmptyState title="No students">There are no students in {section.label}.</EmptyState> : view === "exam" ? (
        <ExamSheet rows={rows} columns={data.sheet!.columns} ranks={ranks} paperStatus={data.sheet!.paperStatus} section={section.label} />
      ) : (
        <FinalSheet rows={data.final!.rows} exams={data.final!.exams} ranks={ranks} />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ExportLinks href={exportBase} label={view === "final" ? "Final result sheet" : "Class result sheet"} />
      </div>

      {data.history.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Result history" description={`Publishing of ${title} for ${section.label}`} />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {h.status === "published" && `Published ${h.publishedAt ? formatDateTime(h.publishedAt, tz) : ""}${h.messagesSent ? `, ${h.messagesSent} parents messaged` : ""}`}
                  {h.status === "scheduled" && `Set to publish on ${formatDateTime(h.publishOn, tz)}`}
                  {h.status === "cancelled" && `Publish date ${formatDateTime(h.publishOn, tz)} cancelled`}
                  {h.status === "failed" && `Not published on ${formatDateTime(h.publishOn, tz)}: ${h.note ?? ""}`}
                  {h.status === "unpublished" && `Unpublished ${h.unpublishedAt ? formatDateTime(h.unpublishedAt, tz) : ""} by ${name(h.unpublishedById)}: ${h.note ?? ""}`}
                </span>
                <span className="text-ink-2">by {name(h.createdById) || "the school"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

type Cell = SheetRow["cells"][string];

function cellText(c: Cell | undefined, gradeOnly: boolean) {
  if (!c) return "";
  if (c.absent) return "AB";
  if (c.missing) return "Missing";
  return gradeOnly ? c.grade ?? "" : `${showMarks(c.marks)}${c.grace ? ` (+${c.grace})` : ""}`;
}

function outcomeTone(o: string | null) {
  return o === "Pass" ? "success" : o === "Fail" ? "danger" : o ? "warning" : "neutral";
}

function ExamSheet({ rows, columns, ranks, paperStatus, section }: { rows: SheetRow[]; columns: { id: string; name: string; max: number; gradeOnly: boolean; entryId: string | null }[]; ranks: boolean; paperStatus: { entryId: string; status: string }[]; section: string }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">Class result sheet for {section}</caption>
          <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Roll</th>
              <th scope="col" className="px-3 py-2 font-medium">Student</th>
              {columns.map((c) => {
                const st = paperStatus.find((p) => p.entryId === c.entryId)?.status;
                return <th key={c.id} scope="col" className="px-3 py-2 font-medium">{c.name}<span className="block text-xs font-normal">{c.gradeOnly ? "Graded" : `/ ${c.max}`}{st && st !== "LOCKED" && st !== "SUBMITTED" ? " · not submitted" : ""}</span></th>;
              })}
              <th scope="col" className="px-3 py-2 font-medium">Total</th>
              <th scope="col" className="px-3 py-2 font-medium">%</th>
              <th scope="col" className="px-3 py-2 font-medium">Grade</th>
              {ranks && <th scope="col" className="px-3 py-2 font-medium">Rank</th>}
              <th scope="col" className="px-3 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="px-3 py-2 tabular-nums text-ink-2">{r.rollNo ?? ""}</td>
                <th scope="row" className="px-3 py-2 font-medium"><Link className="text-brand-text hover:underline" href={`/examination-results/analysis?view=student&student=${r.studentId}`}>{r.name}</Link></th>
                {columns.map((c) => {
                  const cell = r.cells[c.id];
                  return <td key={c.id} className={`px-3 py-2 tabular-nums ${cell?.missing ? "bg-warn-bg text-warn-text" : cell?.passed === false ? "text-danger" : ""}`}>{cellText(cell, c.gradeOnly)}{cell && !c.gradeOnly && cell.grade && !cell.missing && !cell.absent && <span className="ml-1 text-xs text-ink-2">{cell.grade}</span>}</td>;
                })}
                <td className="px-3 py-2 font-medium tabular-nums">{r.complete ? `${showMarks(r.total)}/${showMarks(r.maxTotal)}` : ""}</td>
                <td className="px-3 py-2 tabular-nums">{r.complete ? showPercent(r.percent) : ""}</td>
                <td className="px-3 py-2">{r.complete ? r.grade : ""}</td>
                {ranks && <td className="px-3 py-2 tabular-nums">{r.rank ?? ""}</td>}
                <td className="px-3 py-2">{r.complete ? <Badge tone={outcomeTone(r.outcome)}>{r.outcome ?? ""}</Badge> : <span className="text-sm text-warn-text">{r.missing} missing</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={`Results of ${section}`}>
        {rows.map((r) => (
          <li key={r.studentId} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{r.rollNo ? `${r.rollNo}. ` : ""}{r.name}</span>
              {r.complete ? <Badge tone={outcomeTone(r.outcome)}>{r.outcome ?? ""}</Badge> : <Badge tone="warning">{r.missing} missing</Badge>}
            </div>
            {r.complete && <p className="text-sm">{showMarks(r.total)}/{showMarks(r.maxTotal)} · {showPercent(r.percent)} · {r.grade}{ranks && r.rank ? ` · Rank ${r.rank}` : ""}</p>}
            <p className="mt-1 text-sm text-ink-2">{columns.map((c) => `${c.name} ${cellText(r.cells[c.id], c.gradeOnly) || "-"}`).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function FinalSheet({ rows, exams, ranks }: { rows: (SheetRow & { exams: Record<string, { percent: number | null; grade: string | null; status: string; complete: boolean } | null> })[]; exams: { id: string; title: string; weight: number; counts: boolean }[]; ranks: boolean }) {
  const weighted = exams.some((e) => e.weight > 0);
  return (
    <>
      <p className="mb-2 text-sm text-ink-2">{weighted ? `Weights: ${exams.filter((e) => e.counts).map((e) => `${e.title} ${e.weight}%`).join(", ")}.` : "No weights are set in Exam Settings, so every exam counts equally."}</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">Final result sheet</caption>
          <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Roll</th><th scope="col" className="px-3 py-2 font-medium">Student</th>
              {exams.map((e) => <th key={e.id} scope="col" className="px-3 py-2 font-medium">{e.title}{!e.counts && <span className="block text-xs font-normal">not counted</span>}</th>)}
              <th scope="col" className="px-3 py-2 font-medium">Final %</th><th scope="col" className="px-3 py-2 font-medium">Grade</th>
              {ranks && <th scope="col" className="px-3 py-2 font-medium">Rank</th>}<th scope="col" className="px-3 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="px-3 py-2 tabular-nums text-ink-2">{r.rollNo ?? ""}</td>
                <th scope="row" className="px-3 py-2 font-medium">{r.name}</th>
                {exams.map((e) => { const x = r.exams[e.id]; return <td key={e.id} className={`px-3 py-2 tabular-nums ${x && !x.complete ? "text-warn-text" : ""}`}>{x ? (x.complete ? `${showPercent(x.percent)} ${x.grade ?? ""}` : "Incomplete") : "-"}</td>; })}
                <td className="px-3 py-2 font-medium tabular-nums">{r.complete ? showPercent(r.percent) : ""}</td>
                <td className="px-3 py-2">{r.complete ? r.grade : ""}</td>
                {ranks && <td className="px-3 py-2 tabular-nums">{r.rank ?? ""}</td>}
                <td className="px-3 py-2">{r.complete ? <Badge tone={outcomeTone(r.outcome)}>{r.outcome ?? ""}</Badge> : <span className="text-sm text-warn-text">Waiting for exams</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
