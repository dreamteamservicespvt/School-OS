import type { Metadata } from "next";
import { CalendarCheck2, CalendarDays, CalendarRange, ChartColumn, ChartLine, ChevronRight, Clock, FileText, ListChecks, MessageCircleQuestion, ScanFace, Table2, Timer, TrendingDown, TriangleAlert, UserCheck, Users, UserX } from "lucide-react";
import { reasonChoices } from "@/lib/attendance/absence-reasons";
import type { LucideIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { isoDay } from "@/lib/staff/dates";
import { attendancePage, onCampusFromPage } from "@/lib/attendance/page";
import { backToThisYear, withYearDates } from "@/lib/academic/view-year";
import { ViewYearStrip } from "@/components/view-year-strip";
import { BASE, sectionLimit } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { attendanceToday } from "@/lib/attendance/integrations";
import { percentText } from "@/lib/attendance/summary";
import { schoolBounds, clampMonth } from "@/lib/attendance/calendar-months";
import { schoolDays } from "@/lib/attendance/calendar";
import { DATED_REPORTS, rangePeople, readReportInput, reportsFor, runReport, withDates, type ReportKey, type ReportRow, type ReportTable } from "@/lib/attendance/reports";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Stats } from "@/components/ui/stats";
import { Chips } from "@/components/ui/chips";
import { Row } from "@/components/ui/rows";
import { HBars, Bars } from "@/components/ui/charts";
import { DataList } from "@/app/(school)/attendance-management/_components/data-list";
import { UrlDate, UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { MonthSelect } from "@/components/attendance/month-select";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { AttHead } from "../_components/att-head";
import { ExportMenu } from "../_components/export-menu";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Attendance Reports") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = `${BASE}/reports`;
const TABS: { key: ReportKey; label: string }[] = [
  { key: "daily", label: "Today" }, { key: "trends", label: "Trends" }, { key: "chronic", label: "Chronic absence" }, { key: "late", label: "Late arrivals" },
];
const ICON: Record<string, LucideIcon> = {
  daily: CalendarCheck2, monthly: Table2, "staff-monthly": Users, range: CalendarRange, trends: ChartLine, chronic: UserX, late: Clock, leave: CalendarDays, overtime: Timer, devices: ScanFace, reasons: MessageCircleQuestion,
};
const num = (v: string | number | null | undefined) => (typeof v === "number" ? v : v ? Number.parseFloat(String(v)) : Number.NaN);

export default async function ReportsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = await attendancePage();
  const { current, features } = page;
  // One campus chosen on the Dashboard (?campus=): that campus's sections only, as the card counted them.
  // Another year (?year=): that year's sections and dates, as at its last day when it is over (gap list G36).
  const { access, view } = await onCampusFromPage(page, sp.campus, sp.year);
  const today = view?.asOf ?? page.today;
  const list = reportsFor(access, features as Set<string>);
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const dates = await periodSetup(current);
  const range = periodFromSearch(withYearDates(sp, view, "d"), { ...dates, prefix: "d", fallback: "thismonth" });
  const input = withDates(readReportInput(get, today, list.map((r) => r.key as ReportKey)), range);
  const r = input.report;
  const info = list.find((x) => x.key === r);
  const isTab = TABS.some((t) => t.key === r);

  const data = await withSchool(current.ctx, async (tx) => {
    const sections = access.students !== "none" ? await registerChoices(tx, access) : [];
    const people = r === "range" ? await rangePeople(tx, access, input.sectionId ?? sections[0]?.id ?? null) : [];
    const bounds = await schoolBounds(tx, today);
    const fixed = { ...input, month: clampMonth(input.month, bounds), person: r === "range" ? input.person ?? people[0]?.value ?? null : input.person };
    const table = list.length ? await runReport(tx, current.ctx, access, fixed) : null;
    // Whole-school numbers cover every campus (each with its own year), or only the person's campus when limited to one.
    const day = r === "daily" ? await attendanceToday(tx, current.ctx, input.date, { sectionIds: access.students === "all" ? null : sections.map((s) => s.id), campusId: access.campusLimit }) : null;
    const year = access.yearId ? await tx.academicYear.findUnique({ where: { id: access.yearId }, select: { name: true, startDate: true, endDate: true } }) : null;
    const schoolDay = year ? await schoolDays(tx, current.ctx, year.startDate, year.endDate, access.campusId) : null;
    const dayNo = schoolDay ? schoolDay.working.filter((d) => d <= today).length : 0;
    // The day-by-day line for Trends: this month's school average per school day.
    const trend = r === "trends" ? await dailyTrend(tx) : [];
    return { sections, people, table, day, bounds, month: fixed.month, year, dayNo, total: schoolDay?.working.length ?? 0, trend };

    async function dailyTrend(t: typeof tx) {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const marks = await t.attendanceMark.groupBy({ by: ["date", "statusKey"], where: { date: { gte: from, lte: today }, studentId: { not: null }, periodNo: 0, archivedAt: null, ...(access.students === "all" ? sectionLimit(access) : { sectionId: { in: sections.map((s) => s.id) } }) }, _count: true });
      const byDay = new Map<string, { p: number; n: number }>();
      for (const m of marks) {
        if (["leave", "medical", "excused"].includes(m.statusKey)) continue;
        const k = isoDay(m.date);
        const a = byDay.get(k) ?? { p: 0, n: 0 };
        a.n += m._count;
        if (["present", "late"].includes(m.statusKey)) a.p += m._count;
        if (m.statusKey === "half-day") a.p += m._count / 2;
        byDay.set(k, a);
      }
      return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k: String(Number(k.slice(8))), v: Math.round((v.p / v.n) * 1000) / 10 }));
    }
  }, { timeout: 60_000 });

  const go = (key: string) => `${PATH}?report=${key}${view ? `&year=${view.id}` : ""}`;
  const ex = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "format") ex.set(k, v);
  ex.set("report", r);
  if (r === "range" && !ex.get("person") && data.people[0]) ex.set("person", data.people[0].value);
  const t = data.table;
  const exportBtn = t && t.rows.length > 0 ? <ExportMenu href={`${PATH}/export?${ex}`} /> : null;
  const sub = `Holidays, Sundays and days off are left out of every number${data.year ? ` · ${data.year.name}, school day ${data.dayNo} of ${data.total}` : ""}`;
  const tabs = TABS.filter((x) => list.some((l) => l.key === x.key));

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={PATH} sub={sub} />
      <ViewYearStrip year={view} back={backToThisYear(PATH, sp)} />
      {list.length === 0 ? (
        <EmptyState title="No reports for your role" Icon={FileText}><Words k="Attendance reports are for teachers of a class, HR, the School Admin and the Principal." /></EmptyState>
      ) : (
        <div className="flex flex-col gap-5 lg:gap-6">
          {tabs.length > 0 && (
            <Chips label="Report views" value={isTab ? r : ""} options={tabs.map((x) => ({ value: x.key, label: x.label, href: go(x.key) }))} />
          )}

          {r === "daily" && data.day && (
            <>
              {data.day.off ? <Banner tone="info" title={`${data.day.off}.`}><Words k="Attendance is off for this date. Choose another date." /></Banner> : (
                <Stats items={[
                  // The count and its % use the same students: those on leave are left out of both (TEACHING-19).
                  { label: "Students present", value: `${data.day.students.present.toLocaleString("en-IN")} of ${data.day.students.counted.toLocaleString("en-IN")}`, sub: data.day.students.marked ? `${percentText(data.day.students.percent)} · ${data.day.students.late} came late${data.day.students.leave ? ` · ${data.day.students.leave} on leave, not counted` : ""}${data.day.students.notMarked ? ` · ${data.day.students.notMarked} not marked` : ""}` : "Not marked yet", tone: "ok", icon: UserCheck },
                  { label: "Absent", value: data.day.students.absent, sub: `${data.day.students.leave} more on approved leave`, icon: UserX, tone: data.day.students.absent ? "bad" : undefined },
                  { label: "Classes marked", value: `${data.day.classes.total - data.day.classes.notMarked} of ${data.day.classes.total}`, sub: data.day.classes.notMarked ? `${data.day.classes.notMarked} not marked yet` : "Every class is marked", icon: ListChecks, tone: data.day.classes.notMarked ? "warn" : "ok", href: data.day.classes.notMarked ? BASE : undefined },
                  ...(access.staff === "all" ? [{ label: "Staff present", value: `${data.day.staff.present} of ${data.day.staff.total}`, sub: `${data.day.staff.late} late · ${data.day.staff.total - data.day.staff.marked} not in yet`, icon: Users, href: `${BASE}/staff` }] : []),
                ]} />
              )}
              <TableCard t={t} toolbar={<><UrlDate label="Date" value={isoDay(input.date)} max={isoDay(today)} className="sm:w-48" />{exportBtn}</>} />
            </>
          )}

          {r === "trends" && t && (
            <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
              <Card>
                <CardHeader icon={ChartColumn} title={`${new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(today)}, day by day`} description="School days only; students on leave are not counted" />
                <div className="px-5 pb-4">
                  {data.trend.length ? <Bars data={data.trend} max={100} ticks={[0, 50, 90]} unit="%" ariaLabel="Attendance this month by day" /> : <p className="text-[14px] text-ink3"><Words k="No attendance taken this month yet." /></p>}
                </div>
              </Card>
              <Card>
                <CardHeader icon={ChartLine} title="Month by month" description="School average, this year" action={exportBtn} />
                <div className="px-5 pb-4">
                  <Bars data={monthAverages(t)} max={100} ticks={[0, 50, 90]} unit="%" ariaLabel="Attendance by month" />
                </div>
              </Card>
              <Card className="xl:col-span-2">
                <CardHeader icon={CalendarCheck2} title="This year by class" description="Goal is 90%" />
                <div className="px-5 pb-5">
                  <HBars rows={t.rows.filter((x) => !Number.isNaN(num(x.year))).map((x) => ({ k: String(x.who), v: num(x.year), label: String(x.year) }))} goal={90} lowBelow={90} labelWidth={96} />
                </div>
              </Card>
              <TableCard t={t} className="xl:col-span-2" />
            </div>
          )}

          {r === "chronic" && t && (
            <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
              {(["streak", "below"] as const).map((kind) => {
                const rows = t.rows.filter((x) => (kind === "streak") === String(x.kind).startsWith("Absent"));
                return (
                  <Card key={kind}>
                    <CardHeader icon={kind === "streak" ? UserX : TrendingDown} title={kind === "streak" ? "Absent days in a row" : String(t.rows.find((x) => !String(x.kind).startsWith("Absent"))?.kind ?? "Below the threshold") + " this year"}
                      description="The parent, class teacher and Principal are told once" action={<>{rows.length > 0 && <Pill tone="bad">{rows.length}</Pill>}</>} />
                    {rows.length === 0 ? <div className="px-5 pb-5"><Banner tone="ok" title="Nobody right now."><Words k="Flags clear on their own when attendance recovers." /></Banner></div> : (
                      <ul className="px-2 pb-2">
                        {rows.map((x, i) => (
                          <li key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                            <Avatar name={String(x.who)} size={38} />
                            <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{x.who} <span className="text-ink3 font-normal">· {x.class}</span></p><p className="text-[12.5px] text-ink3 truncate"><Words k="Flagged on" /> {x.since}</p></div>
                            <span className="font-semibold tnum text-bad">{x.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
              {exportBtn && <div className="xl:col-span-2 flex justify-end">{exportBtn}</div>}
            </div>
          )}

          {r === "late" && t && (
            <>
              <div className="flex gap-2 flex-wrap"><PeriodFilter {...dates} prefix="d" fallback="thismonth" />{exportBtn}</div>
              <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
                {(access.staff === "all" ? ["Staff", "Student"] : ["Student"]).map((kind) => {
                  const rows = t.rows.filter((x) => x.kind === kind).slice(0, 10);
                  return (
                    <Card key={kind}>
                      <CardHeader icon={Clock} title={`${kind} late, ${(range?.label ?? "this month").toLowerCase()}`} description={kind === "Staff" ? "Times late · by the staff late rule" : "Late days · top ten"} />
                      <div className="px-5 pb-5">
                        {rows.length ? <HBars rows={rows.map((x) => ({ k: String(x.who), v: Number(x.count), label: String(x.count) }))} max={Math.max(5, ...rows.map((x) => Number(x.count)))} unit="" labelWidth={128} />
                          : <p className="text-[14px] text-ink3"><Words k="Nobody was late in these dates." /></p>}
                      </div>
                    </Card>
                  );
                })}
              </div>
              <TableCard t={t} />
            </>
          )}

          {!isTab && t && info && (
            <TableCard t={t} about={info.about} toolbar={<>
              {(r === "monthly" || r === "reasons") && data.sections.length > 0 && <UrlSelect param="section" label="Class and section" className="sm:w-52" options={[{ value: "", label: "Every class" }, ...data.sections.map((s) => ({ value: s.id, label: s.name }))]} />}
              {r === "reasons" && <UrlSelect param="reason" label="Reason" className="sm:w-52" options={[{ value: "", label: "Every reason, by class" }, ...reasonChoices(access.seesFees).map((x) => ({ value: x.key, label: x.label }))]} />}
              {r === "range" && data.sections.length > 0 && <UrlSelect param="section" label="Class and section" className="sm:w-52" value={input.sectionId ?? data.sections[0]?.id ?? ""} options={data.sections.map((s) => ({ value: s.id, label: s.name }))} />}
              {r === "range" && <UrlSelect param="person" label="Student or staff member" className="sm:w-60" value={input.person ?? data.people[0]?.value ?? ""} options={data.people} />}
              {["monthly", "staff-monthly"].includes(r) && <MonthSelect value={isoDay(data.month).slice(0, 7)} min={data.bounds.min} max={data.bounds.max} className="sm:w-64" />}
              {DATED_REPORTS.includes(r) && <PeriodFilter {...dates} prefix="d" fallback="thismonth" />}
              {exportBtn}
            </>} />
          )}

          <Card>
            <CardHeader icon={FileText} title="All attendance reports" description="Each one exports to Excel, CSV or PDF with the school name and the filters on top" />
            <ul className="px-2 pb-2 grid grid-cols-1 lg:grid-cols-2 gap-x-2">
              {list.map((x) => (
                <li key={x.key} className="min-w-0"><Row icon={ICON[x.key] ?? FileText} title={x.label} sub={x.about} href={go(x.key)} right={<ChevronRight size={18} className="text-ink3" aria-hidden="true" />} /></li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

/** The school average per month from the Trends table (each class's % weighted equally). */
function monthAverages(t: ReportTable) {
  return t.columns.filter((c) => c.numeric && c.key !== "year").map((c) => {
    const vals = t.rows.map((x) => num(x[c.key])).filter((v) => !Number.isNaN(v));
    return { k: c.label, v: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0 };
  }).filter((x) => x.v > 0);
}

function TableCard({ t, toolbar, about, className }: { t: ReportTable | null; toolbar?: React.ReactNode; about?: string; className?: string }) {
  if (!t) return null;
  const title = t.columns.find((c) => c.phone === "title") ?? t.columns[0];
  const badge = t.columns.find((c) => c.phone === "badge");
  const meta = t.columns.filter((c) => c.phone === "meta");
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="px-5 pt-4 pb-3">
        <h2 className="font-display text-[17px] font-semibold">{t.title}</h2>
        {about && <p className="text-[13px] text-ink3">{about} <Words k="Holidays, Sundays and other non-working days are left out." /></p>}
      </div>
      {toolbar && <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 px-3 pb-3 border-b border-line">{toolbar}</div>}
      {t.columns.length === 0 ? <EmptyState bare Icon={FileText} title="Nothing to show">{t.empty}</EmptyState> : (
        <DataList<ReportRow> rows={t.rows} rowKey={(x) => `${t.rows.indexOf(x)}`} caption={t.title} minWidth={Math.max(640, t.columns.length * 90)}
          columns={t.columns.map((c, j) => ({
            key: c.key, label: c.label, align: c.numeric ? "right" as const : undefined,
            render: (x: ReportRow) => j === 0
              ? <span className="font-semibold">{x[c.key] ?? ""}</span>
              : <span className={cx(c.numeric && "tnum", c.key === "percent" && x._tone === "danger" && "text-bad font-semibold", x._tone === "warning" && c.key === "notMarked" && "text-warn font-semibold")}>{x[c.key] ?? ""}</span>,
          }))}
          mobile={(x) => ({
            title: String(x[title.key] ?? ""), sub: meta.map((c) => `${c.label} ${x[c.key] ?? ""}`).join(" · "),
            icon: x._tone ? TriangleAlert : undefined, iconTone: x._tone === "danger" ? "bad" : x._tone === "warning" ? "warn" : undefined,
            right: badge ? <span className="font-semibold tnum text-[14px]">{x[badge.key] ?? ""}</span> : undefined,
          })}
          footer={t.footer ? <p className="px-4 py-3 border-t border-line text-[13px] text-ink3">{t.footer}</p> : undefined}
          empty={<EmptyState bare Icon={FileText} title="Nothing to show">{t.empty}</EmptyState>} />
      )}
    </Card>
  );
}
