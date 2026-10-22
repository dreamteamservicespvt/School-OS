import type { Metadata } from "next";
import { periodSetup } from "@/lib/period-setup";
import { Suspense } from "react";
import { CalendarDays, CalendarPlus, CalendarX, Eye, Send } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { plural, time12 } from "@/lib/academic/common";
import { EXAM_STATUS_TONE, classRange, dayDate, patternLabel, shownExamStatus, type ShownExamStatus } from "@/lib/exams/common";
import { cardNotes, nextExam, nextExamNumbers, studentsPerExam } from "@/lib/exams/board";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Band, Chips, ListEmpty, Toolbar, TONE_SOFT, type BandItem } from "@/components/ui/kit";
import { ExportMenu, UrlSearch, UrlSelect } from "@/components/ui/kit-client";
import { cx } from "@/components/ui/cx";
import { PeriodFilter } from "@/components/list/period-filter";
import { periodFromSearch } from "@/lib/periods";
import { examOverlaps, periodQuery } from "../_lib/period";
import { examPage, one, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { DatesheetMenu } from "./datesheet-ui";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Datesheet" };
const PATH = "/examination-results/datesheet";
const STATUSES: ShownExamStatus[] = ["Draft", "Published", "Ongoing", "Completed", "Results published"];

function inDays(from: Date, to: Date) {
  const d = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d > 1 ? `In ${d} days` : `${-d} days ago`;
}

export default async function DatesheetPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const s = page.scope;
  const q = one(raw.q).trim().slice(0, 60);
  const cls = one(raw.class);
  const st = one(raw.status);
  const archived = one(raw.archived) === "1";
  const canAdd = s.datesheets && page.writable;
  const teacherView = !s.manage && !s.office;
  const tz = page.current.school.timeZone;
  const dates = await periodSetup(page.current);
  const range = periodFromSearch(raw, dates);

  const data = await withSchool(page.current.ctx, async (tx) => {
    let onlyClassIds: string[] | null = null;
    if (s.sectionIds) onlyClassIds = (await tx.section.findMany({ where: { id: { in: s.sectionIds } }, select: { classId: true } })).map((x) => x.classId);
    const [exams, classes, terms] = await Promise.all([
      tx.exam.findMany({
        where: { academicYearId: year.id, archivedAt: archived ? { not: null } : null, ...examOverlaps(range), ...(onlyClassIds ? { classIds: { hasSome: onlyClassIds } } : {}) },
        orderBy: [{ startDate: "desc" }, { title: "asc" }],
        include: { entries: { where: { archivedAt: null }, select: { subjectId: true } } },
      }),
      tx.schoolClass.findMany({ where: { campusId: page.campusId, archivedAt: null, ...(onlyClassIds ? { id: { in: onlyClassIds } } : {}) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.term.findMany({ where: { academicYearId: year.id }, select: { id: true, name: true } }),
    ]);
    const students = await studentsPerExam(tx, year.id, exams);
    const notes = await cardNotes(tx, exams, students, page.today, tz);
    const next = archived ? null : await nextExam(tx, year.id, page.today, onlyClassIds);
    const numbers = next ? await nextExamNumbers(tx, next, s) : null;
    return { exams, classes, terms, students, notes, next, numbers };
  });

  const allClasses = await withSchool(page.current.ctx, (tx) => tx.schoolClass.findMany({ where: { campusId: page.campusId }, select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }));
  const classNames = (ids: string[]) => allClasses.filter((c) => ids.includes(c.id)).map((c) => c.name);
  const cards = data.exams.map((e) => {
    const n = data.notes.get(e.id)!;
    return {
      ...e, shown: shownExamStatus(e, page.today), classes: classNames(e.classIds), term: data.terms.find((t) => t.id === e.termId)?.name ?? "",
      students: data.students.get(e.id) ?? 0, subjects: new Set(e.entries.map((x) => x.subjectId)).size, note: n.note, extra: n.extra,
    };
  });
  const base = cards.filter((c) => !q || `${c.title} ${classRange(c.classes)}`.toLowerCase().includes(q.toLowerCase()));
  const byClass = base.filter((c) => !cls || c.classIds.includes(cls));
  const counts = Object.fromEntries(STATUSES.map((k) => [k, byClass.filter((c) => c.shown === k).length]));
  const rows = byClass.filter((c) => !st || c.shown === st);
  const filtered = Boolean(q || cls || st || range);

  const href = (change: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cls) sp.set("class", cls);
    if (st) sp.set("status", st);
    if (archived) sp.set("archived", "1");
    for (const [k, v] of periodQuery(raw)) sp.set(k, v);
    if (page.yearQuery) sp.set("year", year.id);
    for (const [k, v] of Object.entries(change)) { if (v) sp.set(k, v); else sp.delete(k); }
    const x = sp.toString();
    return x ? `${PATH}?${x}` : PATH;
  };

  // The bold strip: the exam that comes next.
  const next = data.next;
  const nn = data.numbers;
  let band: BandItem[] = [];
  if (next && nn) {
    const started = next.startDate <= page.today;
    const where = classRange(classNames(next.classIds));
    const head: BandItem = started
      ? { label: `${next.title} ends`, big: formatDate(next.endDate), foot: `Ongoing · ${where}`, href: withYear(`${PATH}/${next.id}`, page) }
      : { label: `${next.title} starts`, big: formatDate(next.startDate), foot: `${inDays(page.today, next.startDate)} · ${where}`, href: withYear(`${PATH}/${next.id}`, page) };
    if (teacherView) {
      const mine = nn.mine.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
      const upcoming = mine.find((m) => m.date >= page.today) ?? mine[0];
      const due = mine.map((m) => m.due).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0];
      const firstDuty = nn.duties.slice().sort((a, b) => a.date.getTime() - b.date.getTime() || a.startTime.localeCompare(b.startTime)).find((d) => d.date >= page.today) ?? nn.duties[0];
      band = [
        head,
        { label: upcoming ? `Your ${upcoming.subject} papers` : "Your papers", big: upcoming ? formatDate(upcoming.date) : "None", foot: upcoming ? [...new Set(mine.map((m) => m.className))].join(", ") : "No paper of yours in this exam" },
        { label: "Your invigilation", big: plural(nn.duties.length, "paper"), foot: firstDuty ? `First: ${dayDate(firstDuty.date)}, ${time12(firstDuty.startTime)}${firstDuty.room ? ` · ${firstDuty.room}` : ""}` : "None given to you" },
        { label: "Marks due", big: due ? formatDate(due) : "Not set", foot: mine.length ? `For ${plural(mine.length, "paper")}` : "Nothing to enter", href: withYear("/examination-results/marks", page) },
      ];
    } else {
      band = [
        head,
        { label: "Papers", big: String(nn.papers), foot: `${nn.perClass} per class · ${plural(nn.sections, "section")}` },
        { label: "Students writing", big: nn.students.toLocaleString("en-IN"), foot: nn.noPhoto ? `${nn.noPhoto} without a photo on the admit card` : "Every admit card has a photo" },
        next.status === "DRAFT"
          ? { label: "Datesheet", big: "Draft", foot: "Publish it to print admit cards", href: withYear(`${PATH}/${next.id}`, page) }
          : { label: "Admit cards printed", big: `${nn.printed} / ${nn.students}`, foot: nn.students - nn.printed > 0 ? `${nn.students - nn.printed} left to print` : "All printed", href: withYear(`/examination-results/admit-cards?exam=${next.id}`, page) },
      ];
    }
  }

  const mineSub = s.sectionIds && !s.office ? `Datesheets for your classes. View only.` : s.office ? "Prepare datesheets and publish them. Admit cards follow." : `${year.name} · creating a datesheet creates the exam`;
  const exportHref = `/examination-results/export?kind=datesheets${q ? `&q=${encodeURIComponent(q)}` : ""}${cls ? `&class=${cls}` : ""}${st ? `&status=${encodeURIComponent(st)}` : ""}${periodQuery(raw).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("")}${page.yearQuery ? `&${page.yearQuery}` : ""}`;

  return (
    <div>
      <PageTop page={page} href={PATH} sub={mineSub}>
        {canAdd && <ButtonLink href={withYear(`${PATH}/new`, page)} variant="primary" icon={CalendarPlus}><Words k="Add datesheet" /></ButtonLink>}
      </PageTop>
      <div className="flex flex-col gap-5 lg:gap-6">
        {band.length > 0 && <Band items={band} label="The next exam" />}

        {cards.length === 0 && !archived && !range ? (
          <EmptyState title="No datesheets yet" Icon={CalendarDays} action={canAdd ? <ButtonLink href={withYear(`${PATH}/new`, page)} variant="primary" icon={CalendarPlus}><Words k="Add datesheet" /></ButtonLink> : undefined}>
            <p><Words k="A datesheet sets each subject's exam date, time, room and maximum marks. Creating one creates the exam." /></p>
          </EmptyState>
        ) : (
          <Card>
            <Toolbar>
              <Suspense><UrlSearch placeholder="Search exam title" /></Suspense>
              <Suspense><UrlSelect name="class" label="Class" className="md:w-44" options={[{ value: "", label: "All classes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))]} /></Suspense>
              <Suspense><PeriodFilter {...dates} ahead allLabel="All dates" /></Suspense>
              <ExportMenu href={exportHref} className="hidden md:block" />
            </Toolbar>
            <div className="px-3 pt-3">
              <Chips label="Status" value={archived ? "archived" : st} options={[
                { value: "", label: "All", count: archived ? undefined : byClass.length, href: href({ status: null, archived: null }) },
                ...(archived ? [] : STATUSES.filter((k) => counts[k] || k === st).map((k) => ({ value: k, label: k, count: counts[k], href: href({ status: k }) }))),
                ...(s.datesheets ? [{ value: "archived", label: "Archived", count: archived ? byClass.length : undefined, href: href({ status: null, archived: "1" }) }] : []),
              ]} />
            </div>
            {rows.length === 0 ? (
              <ListEmpty icon={CalendarX} title={archived ? "No archived datesheets" : "No datesheet matches"} body={archived ? "Archived datesheets show here, and can be restored." : "Try another class or status."}
                action={filtered ? <ButtonLink href={href({ q: null, class: null, status: null })} variant="secondary"><Words k="Clear filters" /></ButtonLink> : undefined} />
            ) : (
              <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-3" aria-label="Datesheets">
                {rows.map((d) => {
                  const tone = d.archivedAt ? "bad" : EXAM_STATUS_TONE[d.shown];
                  const detail = withYear(`${PATH}/${d.id}`, page);
                  return (
                    <li key={d.id} className="rounded-2xl border border-line p-4 flex flex-col gap-3 hover:border-ink3/40 transition">
                      <div className="flex items-start gap-3">
                        <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[tone])}><CalendarDays size={19} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold text-[15px] leading-tight">{d.title}</h2>
                          <p className="text-[12.5px] text-ink3 mt-0.5">{classRange(d.classes)} · {d.term} · {patternLabel(d.pattern)}</p>
                        </div>
                        <Pill tone={tone}>{d.archivedAt ? "Archived" : d.shown}</Pill>
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-2 text-[13px]">
                        <div className="rounded-xl bg-sunken/60 px-2.5 py-2 min-w-0"><p className="text-[11.5px] text-ink3 font-semibold"><Words k="From" /></p><p className="font-semibold tnum truncate">{formatDate(d.startDate)}</p></div>
                        <div className="rounded-xl bg-sunken/60 px-2.5 py-2 min-w-0"><p className="text-[11.5px] text-ink3 font-semibold"><Words k="To" /></p><p className="font-semibold tnum truncate">{formatDate(d.endDate)}</p></div>
                        <div className="rounded-xl bg-sunken/60 px-2.5 py-2 min-w-0"><p className="text-[11.5px] text-ink3 font-semibold"><Words k="Students" /></p><p className="font-semibold tnum">{d.students}</p></div>
                      </div>
                      <p className="text-[12.5px] text-ink3">{plural(d.subjects, "subject")} · {d.note}<br />{d.extra}</p>
                      <div className="flex gap-2 mt-auto">
                        <ButtonLink href={detail} size="sm" variant="secondary" icon={Eye} className="flex-1"><Words k="View" /></ButtonLink>
                        {s.datesheets && page.writable && d.shown === "Draft" && !d.archivedAt && <ButtonLink href={`${detail}${detail.includes("?") ? "&" : "?"}publish=1`} size="sm" variant="soft" icon={Send} className="flex-1"><Words k="Publish" /></ButtonLink>}
                        {s.datesheets && (
                          <DatesheetMenu examId={d.id} title={`${d.title} · ${classRange(d.classes)}`} archived={Boolean(d.archivedAt)} writable={page.writable}
                            printHref={`${PATH}/${d.id}/print`} editHref={withYear(`${PATH}/${d.id}/edit`, page)} hasResults={d.shown === "Completed" || d.shown === "Results published" || d.shown === "Ongoing"} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum"><Words k="Showing" /> {rows.length ? 1 : 0} <Words k="to" /> {rows.length} <Words k="of" /> {rows.length}</div>
          </Card>
        )}
      </div>
    </div>
  );
}
