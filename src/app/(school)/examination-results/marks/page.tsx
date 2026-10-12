import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChevronRight, CircleDashed, ClipboardCheck, Lock, PencilLine, Send } from "lucide-react";
import { periodSetup } from "@/lib/period-setup";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { plural } from "@/lib/academic/common";
import { papersFor, type PaperRow } from "@/lib/exams/marks";
import { PAPER_STATUS_TONE, PAPER_STATUS_WORDS } from "@/lib/exams/common";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Banner, Chips, DataList, ListEmpty, Progress, Stats, Toolbar, TONE_SOFT, type StatItem } from "@/components/ui/kit";
import { ExportMenu, UrlSearch, UrlSelect } from "@/components/ui/kit-client";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { periodQuery } from "../_lib/period";
import { examPage, one, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { LockExamButton, RemindBar, RemindButton } from "./marks-ui";

export const metadata: Metadata = { title: "Marks Entry" };
const PATH = "/examination-results/marks";
const PAGE = 50;
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "LOCKED"] as const;
const STATUS_ICON = { NOT_STARTED: CircleDashed, IN_PROGRESS: PencilLine, SUBMITTED: Send, LOCKED: Lock };

export default async function MarksEntryPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (page.scope.office && !page.scope.manage) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const tz = page.current.school.timeZone;
  const dates = await periodSetup(page.current);
  const range = periodFromSearch(raw, dates);
  const within = range ? dateWhere(range) : null;
  const q = one(raw.q).trim();
  const examParam = one(raw.exam);
  const sectionId = one(raw.section);
  const status = (STATUSES as readonly string[]).includes(one(raw.status)) ? one(raw.status) : "";
  const pageNo = Math.max(1, Number(one(raw.page)) || 1);

  const { rows: all, exams } = await withSchool(page.current.ctx, async (tx) => ({
    rows: await papersFor(tx, page.current.ctx, page.scope, year.id, { q: q || undefined }),
    exams: await tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" } }, orderBy: { startDate: "desc" }, select: { id: true, title: true } }),
  }));
  // No exam chosen: the latest exam that still has papers to mark, else the latest one. "all" shows every exam.
  const pendingExam = exams.find((e) => all.some((r) => r.examId === e.id && (r.status === "NOT_STARTED" || r.status === "IN_PROGRESS")));
  const examId = examParam === "all" ? "" : exams.some((e) => e.id === examParam) ? examParam : page.scope.manage ? (pendingExam ?? exams[0])?.id ?? "" : "";
  const inRange = all.filter((r) => (!examId || r.examId === examId) && (!within || (r.date >= within.gte && r.date <= within.lte)) && (!sectionId || r.sectionId === sectionId));
  const count = (s: string) => inRange.filter((r) => r.status === s).length;
  const rows = status ? inRange.filter((r) => r.status === status) : inRange;
  const open = (r: PaperRow) => r.status === "NOT_STARTED" || r.status === "IN_PROGRESS";
  const overdue = (r: PaperRow) => Boolean(r.due && r.due < page.today && open(r));
  const href = (r: PaperRow) => withYear(`${PATH}/${r.entryId}/${r.sectionId}`, page);
  const link = (change: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v && k !== "page") p.set(k, v);
    for (const [k, v] of Object.entries(change)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return s ? `${PATH}?${s}` : PATH;
  };
  const filtered = Boolean(q || examParam || sectionId || status || range);
  const pending = inRange.filter(open);
  const dues = pending.map((r) => r.due).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime());
  const late = pending.filter(overdue);

  const dueBanner = late.length > 0
    ? <Banner tone="bad" title={`${plural(late.length, "paper")} ${late.length === 1 ? "is" : "are"} past the marks due date.`}>{page.scope.manage ? "Remind the teachers, or open a paper to enter marks for them." : "Enter and submit these first."}</Banner>
    : dues.length > 0
      ? <Banner tone="info" title={`Marks are due by ${formatDate(dues[dues.length - 1], tz)}.`}>{plural(pending.length, "paper")} still {pending.length === 1 ? "needs" : "need"} marks{dues[0].getTime() !== dues[dues.length - 1].getTime() ? `; the first is due ${formatDate(dues[0], tz)}` : ""}. Marks save as they are typed.</Banner>
      : null;

  // Teachers: their own papers, grouped by exam (08 §5, 05-roles "Own").
  if (!page.scope.manage) {
    // One card per exam title (an exam may be set up separately for each class group); exams with papers to mark first, then the latest.
    const latest = (t: string) => Math.max(...rows.filter((r) => r.examTitle === t).map((r) => r.date.getTime()));
    const hasOpen = (t: string) => rows.some((r) => r.examTitle === t && open(r));
    const groups = [...new Set(rows.map((r) => r.examTitle))].sort((a, b) => Number(hasOpen(b)) - Number(hasOpen(a)) || latest(b) - latest(a)).map((t) => [t, t] as const);
    const order = { IN_PROGRESS: 0, NOT_STARTED: 1, SUBMITTED: 2, LOCKED: 3 };
    return (
      <>
        <PageTop page={page} href={PATH} sub={`${[...new Set(all.map((r) => r.subjectName))].join(", ") || "Your subjects"} · only your subjects and classes`} />
        <div className="flex flex-col gap-5 lg:gap-6">
          {dueBanner}
          {all.length > 0 && (
            <Toolbar className="rounded-2xl border bg-surface">
              <Suspense><UrlSearch placeholder="Subject, class or exam" /></Suspense>
              {exams.length > 1 && <Suspense><UrlSelect name="exam" label="Exam" className="md:w-56" value={examId || "all"} reset={["page"]} options={[{ value: "all", label: "All exams" }, ...exams.map((e) => ({ value: e.id, label: e.title }))]} /></Suspense>}
              <Suspense><PeriodFilter {...dates} allLabel="All exam dates" /></Suspense>
            </Toolbar>
          )}
          {groups.length === 0 ? (
            filtered ? <Card><ListEmpty /></Card> : (
              <EmptyState title="No papers to mark yet" Icon={ClipboardCheck}>
                Papers appear here once a datesheet with your subjects is published. If a subject is missing, ask the Exam In-charge to check Teacher Allocation.
              </EmptyState>
            )
          ) : groups.map(([id, title]) => {
            const list = rows.filter((r) => r.examTitle === id).sort((a, b) => order[a.status] - order[b.status] || b.done / Math.max(1, b.of) - a.done / Math.max(1, a.of));
            const closed = list.every((r) => !open(r));
            return (
              <Card key={id}>
                <CardHeader title={title} description={closed ? "Submitted. A change needs a reason and an approval." : `${plural(list.length, "paper")} · ${list.filter((r) => !open(r)).length} submitted`} icon={closed ? Lock : ClipboardCheck} />
                <ul className="px-2 pb-2">
                  {list.map((r) => {
                    const Ic = STATUS_ICON[r.status];
                    return (
                      <li key={`${r.entryId}-${r.sectionId}`}>
                        <Link href={href(r)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/70 transition text-left">
                          <span className={cx("w-11 h-11 rounded-xl grid place-items-center shrink-0 font-semibold text-[13px]", TONE_SOFT[PAPER_STATUS_TONE[r.status]])}>{r.sectionLabel.replace(/^Class /, "")}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[14.5px] truncate">{r.subjectName} · {r.sectionLabel}</p>
                            <p className={cx("text-[12.5px] truncate", overdue(r) ? "text-bad font-medium" : "text-ink3")}>
                              {r.status === "LOCKED" ? `${r.of} of ${r.of} · locked` : `${r.done} of ${r.of} entered`} · paper {formatDate(r.date, tz)}{r.due && open(r) ? ` · ${overdue(r) ? "overdue since" : "due"} ${formatDate(r.due, tz)}` : ""}{r.waiting ? ` · ${plural(r.waiting, "change")} waiting` : ""}
                            </p>
                            {open(r) && <Progress value={r.of ? (r.done / r.of) * 100 : 0} className="mt-1.5 max-w-xs" />}
                          </div>
                          <span className="hidden sm:block shrink-0"><Pill tone={PAPER_STATUS_TONE[r.status]}><Ic size={12} aria-hidden="true" />{PAPER_STATUS_WORDS[r.status]}</Pill></span>
                          <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      </>
    );
  }

  // Exam In-charge and Principal: every paper, who is behind, and reminders.
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const behind = inRange.filter((r) => r.status === "NOT_STARTED" || overdue(r));
  const teachersBehind = new Set(behind.flatMap((r) => r.teachers.map((t) => t.name)));
  const sections = [...new Map(all.map((r) => [r.sectionId, r.sectionLabel])).entries()];
  const stats: StatItem[] = [
    { label: "Papers", value: inRange.length, sub: examId ? exams.find((e) => e.id === examId)?.title : "All exams", icon: ClipboardCheck, href: link({ status: "" }) },
    { label: "Submitted or locked", value: count("SUBMITTED") + count("LOCKED"), sub: `${count("LOCKED")} locked`, tone: "ok", icon: Lock, href: link({ status: "SUBMITTED" }) },
    { label: "In progress", value: count("IN_PROGRESS"), sub: "Being entered now", tone: "warn", icon: PencilLine, href: link({ status: "IN_PROGRESS" }) },
    { label: "Not started", value: count("NOT_STARTED"), sub: plural(teachersBehind.size, "teacher"), tone: count("NOT_STARTED") ? "bad" : undefined, icon: CircleDashed, href: link({ status: "NOT_STARTED" }) },
  ];
  const exportHref = `/examination-results/export?${new URLSearchParams({ kind: "entry-status", ...(examId ? { exam: examId } : {}), ...(one(raw.year) ? { year: one(raw.year) } : {}), ...Object.fromEntries(periodQuery(raw)) })}`;
  const examTitle = exams.find((e) => e.id === examId)?.title;

  return (
    <>
      <PageTop page={page} href={PATH} sub={`${examTitle ?? "Every exam"} · marks entry status for every paper`}>
        {page.writable && examId && count("SUBMITTED") > 0 && <LockExamButton examId={examId} title={examTitle ?? "this exam"} />}
        {page.writable && behind.length > 0 && <RemindButton keys={behind.map((r) => `${r.entryId}|${r.sectionId}`)} teachers={teachersBehind.size} papers={behind.length} />}
      </PageTop>
      <div className="flex flex-col gap-5 lg:gap-6">
        {all.length > 0 && <Stats items={stats} />}
        {dueBanner}
        <Card className="overflow-hidden">
          <Toolbar>
            <Suspense><UrlSearch placeholder="Subject, class or exam" /></Suspense>
            <Suspense><UrlSelect name="exam" label="Exam" className="md:w-52" value={examId || "all"} reset={["page"]} options={[{ value: "all", label: "All exams" }, ...exams.map((e) => ({ value: e.id, label: e.title }))]} /></Suspense>
            {sections.length > 1 && <Suspense><UrlSelect name="section" label="Class" className="md:w-40" reset={["page"]} options={[{ value: "", label: "All classes" }, ...sections.map(([value, label]) => ({ value, label }))]} /></Suspense>}
            <Suspense><PeriodFilter {...dates} allLabel="All exam dates" /></Suspense>
            {inRange.length > 0 && <ExportMenu href={exportHref} className="md:ml-auto" />}
          </Toolbar>
          {inRange.length > 0 && (
            <div className="px-3 py-3 border-b border-line">
              <Chips label="Status" value={status} options={[{ value: "", label: "All", count: inRange.length, href: link({ status: "" }) }, ...STATUSES.map((s) => ({ value: s, label: PAPER_STATUS_WORDS[s], count: count(s), href: link({ status: s }) }))]} />
            </div>
          )}
          {page.writable && shown.some(open) && <RemindBar form="mk-papers" />}
          <DataList rows={shown} rowKey={(r) => `${r.entryId}|${r.sectionId}`} href={href} minWidth={820} caption="Marks entry status"
            select={page.writable && shown.some(open) ? { form: "mk-papers", name: "papers", label: (r) => `Choose ${r.subjectName} ${r.sectionLabel}`, disabled: (r) => !open(r) } : undefined}
            empty={filtered ? <ListEmpty /> : (
              <ListEmpty icon={ClipboardCheck} title="No papers to mark yet" body="Papers appear here once a datesheet is published." />
            )}
            columns={[
              { key: "p", label: "Paper", render: (r) => <><p className="font-semibold">{r.subjectName} · {r.sectionLabel}</p><p className="text-[12.5px] text-ink3">{r.examTitle} · {formatDate(r.date, tz)}</p></> },
              { key: "t", label: "Teacher", render: (r) => r.teachers.length ? <div className="flex items-center gap-2"><Avatar name={r.teachers[0].name} size={28} /><span className="text-[13.5px]">{r.teachers.map((t) => t.name).join(", ")}</span></div> : <span className="text-ink3 text-[13px]">Not given</span> },
              { key: "e", label: "Entered", render: (r) => <div className="w-40"><Progress value={r.of ? (r.done / r.of) * 100 : 0} tone={open(r) ? "brand" : "ok"} /><p className="text-[12.5px] text-ink3 mt-1 tnum">{r.done} of {r.of} entered{r.waiting ? <span className="text-warn"> · {r.waiting} waiting</span> : null}</p></div> },
              { key: "d", label: "Marks due", nowrap: true, render: (r) => r.due ? <span className={cx("text-[13px]", overdue(r) ? "text-bad font-medium" : "text-ink3")}>{overdue(r) ? "Overdue " : ""}{formatDate(r.due, tz)}</span> : <span className="text-ink3 text-[13px]">No date</span> },
              { key: "s", label: "Status", nowrap: true, render: (r) => <Pill tone={PAPER_STATUS_TONE[r.status]}>{PAPER_STATUS_WORDS[r.status]}</Pill> },
            ]}
            mobile={(r) => ({ icon: STATUS_ICON[r.status], iconTone: PAPER_STATUS_TONE[r.status], title: `${r.subjectName} · ${r.sectionLabel}`, sub: `${r.teachers[0]?.name ?? "No teacher"} · ${r.done} of ${r.of}${overdue(r) ? " · overdue" : ""}`, pills: <Pill tone={PAPER_STATUS_TONE[r.status]}>{PAPER_STATUS_WORDS[r.status]}</Pill> })}
            footer={<span>Showing {shown.length ? (pageNo - 1) * PAGE + 1 : 0} to {(pageNo - 1) * PAGE + shown.length} of {rows.length}{pages > 1 && <> · {pageNo > 1 && <Link className="font-semibold text-brand hover:underline" href={`${link({})}${link({}).includes("?") ? "&" : "?"}page=${pageNo - 1}`}>Previous</Link>}{pageNo > 1 && pageNo < pages && " · "}{pageNo < pages && <Link className="font-semibold text-brand hover:underline" href={`${link({})}${link({}).includes("?") ? "&" : "?"}page=${pageNo + 1}`}>Next</Link>}</>}</span>} />
        </Card>
      </div>
    </>
  );
}
