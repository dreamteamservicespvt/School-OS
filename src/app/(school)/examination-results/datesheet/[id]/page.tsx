import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarRange, Check, DoorOpen, FileText, Grid3x3, Info, SlidersHorizontal } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { isoDay, plural } from "@/lib/academic/common";
import { campusHolidays, examDetail, marksExist, upcomingPapers } from "@/lib/exams/datesheet";
import { EXAM_STATUS_TONE, classRange, dayDate, patternLabel, shownExamStatus } from "@/lib/exams/common";
import { sittings } from "@/lib/exams/seating";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner, Col, DataList, Legend, MonthGrid, Split, TONE_SOFT, type DayCell } from "@/components/ui/kit";
import { UrlSelect } from "@/components/ui/kit-client";
import { cx } from "@/components/ui/cx";
import { examPage, one, withYear, type SearchParams } from "../../_lib/page";
import { CategoriesButton, PublishSheet, RestoreButton } from "../datesheet-ui";
import { DetailMenu } from "./detail-menu";

export const metadata: Metadata = { title: "Datesheet" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function DatesheetDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const raw = await searchParams;
  const page = await examPage(raw);
  const data = await withSchool(page.current.ctx, async (tx) => {
    const d = await examDetail(tx, id, { archived: true, scope: page.scope });
    if (!d) return null;
    let mineClassIds: string[] | null = null;
    if (page.scope.sectionIds) {
      const mine = await tx.section.findMany({ where: { id: { in: page.scope.sectionIds } }, select: { classId: true } });
      mineClassIds = mine.map((m) => m.classId);
      if (!d.exam.classIds.some((c) => mineClassIds!.includes(c))) return null;
    }
    const [locked, categories, scale, sitList, seated, counts, holidays, people] = await Promise.all([
      marksExist(tx, id),
      tx.markCategory.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
      d.exam.gradeScaleId ? tx.gradeScale.findFirst({ where: { id: d.exam.gradeScaleId }, select: { name: true } }) : null,
      sittings(tx, id),
      tx.seatAllocation.groupBy({ by: ["date", "startTime"], where: { examId: id, archivedAt: null }, _count: true }),
      tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: d.exam.academicYearId, classId: { in: d.exam.classIds }, archivedAt: null, status: "STUDYING" }, _count: true }),
      tx.calendarEntry.findMany({ where: { ...campusHolidays(d.campusId), startDate: { lte: d.exam.endDate }, endDate: { gte: new Date(Date.UTC(d.exam.startDate.getUTCFullYear(), d.exam.startDate.getUTCMonth(), 1)) } }, select: { startDate: true, endDate: true, title: true } }),
      tx.userLogin.findMany({ where: { id: { in: [d.exam.publishedById, d.exam.updatedById ?? d.exam.createdById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    return { ...d, mineClassIds, locked, categories: categories.map((c) => c.name), scaleName: scale?.name ?? null, sitList, seated: seated.length, students: counts.reduce((s, c) => s + c._count, 0), holidays, people };
  });
  if (!data) notFound();
  const { exam, entries } = data;
  const tz = page.current.school.timeZone;
  const status = shownExamStatus(exam, page.today);
  const tone = exam.archivedAt ? "bad" : EXAM_STATUS_TONE[status];
  const can = page.scope.datesheets && page.writable && !exam.archivedAt;
  const seatingOn = page.current.features.has("exam-seating");
  const classes = data.mineClassIds ? data.classes.filter((c) => data.mineClassIds!.includes(c.id)) : data.classes;
  const chosen = classes.find((c) => c.id === one(raw.class)) ?? classes[0];
  const sched = entries.filter((e) => e.classId === chosen?.id);
  const who = (uid: string | null) => data.people.find((p) => p.id === uid)?.displayName;
  const note = exam.status === "DRAFT"
    ? `Saved ${formatDate(exam.updatedAt, tz)}${who(exam.updatedById ?? exam.createdById) ? ` by ${who(exam.updatedById ?? exam.createdById)}` : ""}`
    : exam.publishedAt ? `Published ${formatDate(exam.publishedAt, tz)}${who(exam.publishedById) ? ` by ${who(exam.publishedById)}` : ""}` : "Published";
  const title = `${exam.title} · ${classRange(data.classes.map((c) => c.name))}`;
  const list = withYear("/examination-results/datesheet", page);
  // Papers already held are never announced to parents (TEACHING-13): the publish dialog says so.
  const ahead = upcomingPapers(entries, page.today);

  // Months the exam runs in, with exam days and holidays marked.
  const months: { y: number; m: number }[] = [];
  for (let d = new Date(Date.UTC(exam.startDate.getUTCFullYear(), exam.startDate.getUTCMonth(), 1)); d <= exam.endDate && months.length < 3; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  const examDays = new Set(entries.map((e) => isoDay(e.date)));
  const cellsFor = (y: number, m: number) => {
    const out: Record<number, DayCell> = {};
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) {
      const date = new Date(Date.UTC(y, m, d));
      const iso = isoDay(date);
      const h = data.holidays.find((x) => x.startDate <= date && x.endDate >= date);
      if (examDays.has(iso)) out[d] = { tone: "brand", title: `Exam day: ${entries.filter((e) => isoDay(e.date) === iso).map((e) => e.subjectName).filter((v, i, a) => a.indexOf(v) === i).join(", ")}` };
      else if (h) out[d] = { tone: "muted", title: h.title };
      else if (date.getUTCDay() === 0) out[d] = { tone: "muted", title: "Sunday" };
    }
    return out;
  };
  const todayIn = (y: number, m: number) => (page.today.getUTCFullYear() === y && page.today.getUTCMonth() === m ? page.today.getUTCDate() : null);
  const holidayWords = data.holidays.filter((h) => months.some((x) => h.startDate.getUTCMonth() === x.m || h.endDate.getUTCMonth() === x.m));

  return (
    <div>
      <Link href={list} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
        <ArrowLeft size={17} aria-hidden="true" />Datesheet <span className="text-ink3 font-normal">/ {title}</span>
      </Link>
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <span className={cx("w-12 h-12 rounded-2xl grid place-items-center shrink-0", TONE_SOFT[tone])}><CalendarDays size={22} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-[22px] md:text-[26px] font-semibold tracking-tight leading-tight">{title}</h1>
              <Pill tone={tone} dot>{exam.archivedAt ? "Archived" : status}</Pill>
            </div>
            <p className="text-[13.5px] text-ink3 mt-0.5">{formatDate(exam.startDate)} to {formatDate(exam.endDate)} · {data.typeName} · {data.termName} · {patternLabel(exam.pattern)} · {plural(data.students, "student")} · {note}</p>
          </div>
          <div className="flex gap-2 flex-wrap no-print">
            {can && exam.status === "DRAFT" && entries.length > 0 && (
              <PublishSheet examId={id} title={title} papers={entries.length} students={data.students} firstDay={formatDate(entries[0].date)}
                past={ahead.past} nextDay={ahead.next ? formatDate(ahead.next, "UTC") : null} startOpen={one(raw.publish) === "1"} />
            )}
            {can && exam.status !== "DRAFT" && !data.locked && <ButtonLink href={withYear(`/examination-results/datesheet/${id}/edit`, page)} icon={DoorOpen}>Rooms & invigilators</ButtonLink>}
            {seatingOn && exam.status !== "DRAFT" && !exam.archivedAt && page.scope.datesheets && <ButtonLink href={withYear(`/examination-results/datesheet/${id}/seating`, page)} icon={Grid3x3}>Seating</ButtonLink>}
            {exam.archivedAt && page.scope.datesheets && page.writable && <RestoreButton examId={id} />}
            <DetailMenu examId={id} title={title} printHref={`/examination-results/datesheet/${id}/print`}
              editHref={can ? withYear(`/examination-results/datesheet/${id}/edit`, page) : null} locked={data.locked}
              admitHref={exam.status !== "DRAFT" && !exam.archivedAt && page.scope.datesheets ? withYear(`/examination-results/admit-cards?exam=${id}`, page) : null}
              canArchive={can && !data.locked} />
          </div>
        </Card>

        {exam.archivedAt && <Banner tone="warn" title="Archived.">This datesheet is not shown to parents or on the School Calendar. Restore it to use it again.</Banner>}
        {!exam.archivedAt && status === "Draft" && <Banner tone="info" title="Draft.">Only staff can see it. Publishing puts the papers on the School Calendar and the Time Table, makes admit cards ready and tells parents.</Banner>}
        {!exam.archivedAt && (status === "Published" || status === "Ongoing") && !data.locked && <Banner tone="ok" title="Published.">Parents see this datesheet on Parent Link. The exam days are on the School Calendar and in the Time Table, and reminders go to parents the day before each paper.</Banner>}
        {!exam.archivedAt && data.locked && <Banner tone="info" title="Results exist for this datesheet.">Only the title can change now. Ask the Exam In-charge or the Principal for anything else.</Banner>}

        <Split side={340}>
          <Col>
            <Card className="overflow-hidden">
              <CardHeader icon={CalendarRange} title={`Schedule · ${chosen?.name ?? ""}`} description={`${plural(sched.length, "paper")} · listed by date and time`}
                action={classes.length > 1 ? <UrlSelect name="class" label="Class" className="w-36" value={chosen?.id} options={classes.map((c) => ({ value: c.id, label: c.name }))} /> : undefined} />
              <DataList bp="lg" minWidth={720} rowKey={(r) => r.id} rows={sched} caption={`Schedule for ${chosen?.name}`}
                footer={`${plural(sched.length, "paper")} · end time worked out from the start time and duration`}
                columns={[
                  { key: "day", label: "Date", nowrap: true, render: (r) => <span className="font-semibold tnum">{dayDate(r.date)}</span> },
                  { key: "sub", label: "Subject", render: (r) => <><p className="font-semibold">{r.subjectName}</p><p className="text-[12.5px] text-ink3">{r.gradeOnly ? "Graded" : r.categories.length ? r.categories.map((c) => `${c.name} ${c.max}`).join(" · ") : `One mark out of ${r.maxMarks}`}{r.pattern ? ` · ${patternLabel(r.pattern)}` : ""}</p></> },
                  { key: "time", label: "Time", nowrap: true, render: (r) => <span className="tnum">{r.time}<span className="block text-[12.5px] text-ink3">{r.duration}</span></span> },
                  { key: "room", label: "Room", render: (r) => r.room ?? <span className="text-ink3">Not set</span> },
                  { key: "inv", label: "Invigilator", render: (r) => r.invigilator ?? <span className="text-ink3">Not set</span> },
                  { key: "max", label: "Max marks", align: "right", render: (r) => <b className="font-semibold">{r.gradeOnly ? "Graded" : r.maxMarks}</b> },
                ]}
                mobile={(r) => ({ icon: FileText, iconTone: "brand", title: r.subjectName, sub: `${dayDate(r.date)} · ${r.time}`, right: <span className="text-[13px] font-semibold tnum">{r.gradeOnly ? "Graded" : r.maxMarks}<span className="block text-[11.5px] text-ink3 font-normal">max</span></span>, pills: <><Pill tone="neutral" className="!h-[22px] !text-[11.5px]">{r.room ?? "No room"}</Pill>{r.invigilator && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">{r.invigilator}</Pill>}</> })}
                empty={<p className="px-5 pb-5 text-ink3 text-[14px]">No papers for {chosen?.name} in this datesheet.</p>} />
            </Card>
            <Card>
              <CardHeader icon={SlidersHorizontal} title="Mark categories" description={data.locked ? "Marks are entered, so the split stays as it is." : "How each subject's marks are split. Teachers enter each part in Marks Entry."} />
              <ul className="px-5 pb-5 grid md:grid-cols-2 gap-2">
                {sched.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 rounded-xl border border-line pl-3.5 pr-1.5 py-1.5 min-h-12 text-[13.5px]">
                    <span className="min-w-0">
                      <span className="font-semibold truncate block">{x.subjectName}</span>
                      <span className="text-ink2 tnum text-[12.5px]">{x.gradeOnly ? "Graded" : x.categories.length ? x.categories.map((c) => `${c.name} ${c.max}`).join(" · ") : `Marks ${x.maxMarks}`}</span>
                    </span>
                    {can && !data.locked && !x.gradeOnly && <CategoriesButton entryId={x.id} subject={x.subjectName} maxMarks={x.maxMarks} current={x.categories} names={data.categories} classes={exam.classIds.length} />}
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
          <Col>
            {months.map(({ y, m }) => (
              <Card key={`${y}-${m}`}>
                <CardHeader icon={CalendarDays} title={`${MONTHS[m]} ${y}`} description="Exam days and holidays" />
                <div className="px-5 pb-5">
                  <MonthGrid compact year={y} month={m} cells={cellsFor(y, m)} today={todayIn(y, m)} />
                  <div className="mt-4"><Legend items={[["bg-brand/30", "Exam day"], ...holidayWords.filter((h) => h.startDate.getUTCMonth() === m || h.endDate.getUTCMonth() === m).map((h): [string, string] => ["bg-sunken", `${h.title} ${formatDate(h.startDate).slice(0, 5)}${h.endDate > h.startDate ? `–${formatDate(h.endDate).slice(0, 5)}` : ""}`])]} /></div>
                </div>
              </Card>
            ))}
            <Card>
              <CardHeader icon={Info} title="Good to know" />
              <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px] text-ink2">
                {["Subjects are listed by date and time.", "A subject with no exam date is left out of the datesheet.", "The pattern can be changed for one subject only.", "Mark categories are set after saving.", "Once results are uploaded, changes are restricted."].map((t) => (
                  <li key={t} className="flex gap-2"><Check size={16} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />{t}</li>
                ))}
              </ul>
              {data.scaleName && <p className="px-5 pb-5 -mt-2 text-[13px] text-ink3">Grade scale: {data.scaleName}</p>}
            </Card>
          </Col>
        </Split>
      </div>
    </div>
  );
}
