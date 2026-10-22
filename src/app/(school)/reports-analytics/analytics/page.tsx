import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarDays, Download, Lock } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { rangeWords } from "@/lib/periods";
import { AREA_LABEL, analyticsQuery, compareCampuses, loadArea, type AChart, type AreaView } from "@/lib/reports/analytics";
import { pinsOf } from "@/lib/reports/pins";
import { cellText } from "@/lib/reports/run";
import type { Row } from "@/lib/reports/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner, Bars, Chips, HBars, Legend, Stats } from "@/components/ui/kit";
import { Empty, SimpleTable } from "@/components/money/kit";
import { UrlSelect, UrlSwitch } from "@/components/money/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { CloseSheetButton, UrlSheet } from "@/components/ui/url-sheet";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { RepHead, ICON, iconOr } from "../_components/head";
import { ChartMenu } from "../_components/bits";
import { BASE, MODULE, one, qs, repGuard, withQ, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Analytics" };

const HREF = `${BASE}/analytics`;

/** Analytics (19 §2, mod-reports.jsx Analytics): trends you can open; each number opens the records behind it. */
export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await repGuard("analytics");
  const sp = await searchParams;
  const q = analyticsQuery(p.current, sp, p.dates, p.a);
  if (!q.area) redirect(`/no-access?m=${MODULE}`);
  const area = q.area;
  const { view, pins, both } = await withSchool(p.current.ctx, async (tx) => {
    const inp = { tx, who: p.current, range: q.range, setup: p.dates, today: p.today, campusId: q.both ? null : q.campusId, compare: q.compare };
    const [view, pins, both] = await Promise.all([
      loadArea(inp, area, { exam: q.exam }),
      pinsOf(tx, p.current.ctx, "chart"),
      q.both ? compareCampuses(inp) : null,
    ]);
    return { view, pins, both };
  }, { timeout: 60_000 });
  const range = `${rangeWords(q.range.from, q.range.to)}`;
  const canExport = can(p.current.permissions, MODULE, "export");
  const keepDates = { period: one(sp.period) || null, from: one(sp.from) || null, to: one(sp.to) || null, month: one(sp.month) || null };
  const base = { ...keepDates, area: one(sp.area) || null, campus: one(sp.campus) || null, compare: one(sp.compare) || null, exam: one(sp.exam) || null };
  const drillKey = one(sp.drill);
  const drill = drillKey ? view.drills[drillKey] ?? null : null;
  const drillHref = (k: string) => withQ(HREF, sp, { drill: k });
  const exportOf = (what: Record<string, string>) => qs(`${HREF}/export`, { ...base, ...what });
  const campusOptions = [
    ...(p.campuses.length > 1 ? [{ value: "", label: "All campuses" }] : []),
    ...p.campuses.map((c) => ({ value: p.campuses.length > 1 ? c.id : "", label: c.name })),
    ...(p.campuses.length > 1 ? [{ value: "both", label: "Both, side by side" }] : []),
  ];

  return (
    <div>
      <RepHead pageName="Analytics" href={HREF} sub="Trends you can open: tap a number or a class to see the records behind it" />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 p-4">
            <div className="flex flex-col gap-1.5 min-w-0 lg:w-72">
              <span className="text-[13px] font-semibold text-ink2"><Words k="Dates" /></span>
              <PeriodFilter {...p.dates} fallback={q.fallback} className="w-full" />
            </div>
            <div className="flex flex-col gap-1.5 lg:w-64">
              <span className="text-[13px] font-semibold text-ink2" aria-hidden="true"><Words k="Campus" /></span>
              <UrlSelect id="an-campus" param="campus" label="Campus" options={campusOptions} className="w-full" />
            </div>
            <div className="h-11 flex items-center lg:ml-2"><UrlSwitch id="an-cmp" param="compare" label="Compare with last year" /></div>
          </div>
          <p className="px-4 pb-3 -mt-1 text-[12.5px] text-ink3"><Words k="Showing:" /> {q.range.label} · {range}<Words k=". Numbers marked “today” are as on" /> {cellText(p.today, "date")}.</p>
        </Card>
        {q.areas.length > 1 && <Chips value={area} label="Analytics areas" options={q.areas.map((x) => ({ value: x, label: AREA_LABEL[x], href: qs(HREF, { ...keepDates, area: x === q.areas[0] ? null : x, campus: base.campus, compare: base.compare }) }))} />}
        {both && (
          <Card className="overflow-hidden">
            <CardHeader title="Campuses, side by side" description={`Same numbers, same dates · ${q.range.label}`} icon={Building2} />
            <SimpleTable minWidth={480} rows={both.rows} cols={both.columns.map((c, i) => ({ label: c.label, right: i > 0, render: (r: Row) => cellText(r[c.key], c.kind) }))} />
          </Card>
        )}
        {view.banner && <Banner tone="info" title={view.banner.title}>{view.banner.body}</Banner>}
        {view.stats.length > 0 && (
          <Stats items={view.stats.map((s) => ({ label: s.label, value: s.value, sub: s.sub, tone: s.tone, icon: iconOr(ICON, s.icon), href: s.drill && view.drills[s.drill] ? drillHref(s.drill) : undefined }))} />
        )}
        {view.charts.length === 0 && !view.banner && (
          <Card><Empty icon={CalendarDays} title="No figures for these dates" body={`Nothing was recorded in ${range}.`}
            action={<Link href={qs(HREF, { area: base.area })} className={buttonClass("secondary")}><Words k="Show this year" /></Link>} /></Card>
        )}
        <AreaCharts view={view} pins={pins} canExport={canExport} exportOf={exportOf} drillHref={drillHref} />
        {area === "teachers" && !p.a.teacherResults && (
          <Card><Empty icon={Lock} title="Seen by the Principal and Academic Head only" body="Results by teacher are sensitive. The syllabus summary is in Academics, Syllabus & Lesson Plans." /></Card>
        )}
      </div>
      {drill && (
        <UrlSheet wide title={drill.title} sub={drill.sub} closeHref={withQ(HREF, sp, { drill: null })}
          footer={<>
            <CloseSheetButton><Words k="Close" /></CloseSheetButton>
            {canExport && drill.table.rows.length > 0 && <a href={exportOf({ drill: drillKey })} download className={buttonClass("secondary")}><Download size={17} aria-hidden="true" /><Words k="Export these" /> {drill.table.rows.length}</a>}
          </>}>
          <div className="-mx-5">
            {drill.table.rows.length
              ? <SimpleTable minWidth={480} caption={drill.title} rows={drill.table.rows} cols={drill.table.columns.map((c) => ({ label: c.label, right: c.kind !== undefined && c.kind !== "text" && c.kind !== "date", render: (r: Row) => cellText(r[c.key], c.kind) }))}
                foot={drill.table.totals ? drill.table.columns.map((c) => cellText(drill.table.totals?.[c.key] ?? null, c.kind)) : undefined} />
              : <p className="px-5 py-6 text-[14px] text-ink3"><Words k="No records behind this number." /></p>}
          </div>
          <p className="text-[12.5px] text-ink3 mt-3">{drill.table.rows.length} {drill.table.rows.length === 1 ? "record" : "records"} · {drill.basis}</p>
        </UrlSheet>
      )}
    </div>
  );
}

function AreaCharts({ view, pins, canExport, exportOf, drillHref }: { view: AreaView; pins: string[]; canExport: boolean; exportOf: (w: Record<string, string>) => string; drillHref: (k: string) => string }) {
  if (!view.charts.length) return null;
  const wide = view.charts.length === 1 || view.charts.every((c) => c.kind === "table");
  return (
    <div className={cx("grid gap-5 lg:gap-6 items-start [&>*]:min-w-0", !wide && "xl:grid-cols-2")}>
      {view.charts.map((c) => (
        <Card key={c.key} className={c.kind === "table" ? "overflow-hidden" : undefined}>
          <CardHeader title={c.title} description={c.sub} icon={iconOr(ICON, c.icon)}
            action={<ChartMenu title={c.title} chartKey={c.key} exportHref={exportOf({ chart: c.key })} pinned={pins.includes(c.key)} canExport={canExport} />} />
          <ChartBody c={c} drillHref={drillHref} />
        </Card>
      ))}
    </div>
  );
}

function ChartBody({ c, drillHref }: { c: AChart; drillHref: (k: string) => string }) {
  if (c.kind === "empty") return <Empty icon={iconOr(ICON, c.icon)} title={c.empty ?? "Nothing in these dates"} body="Try a longer stretch of dates." />;
  if (c.kind === "table" && c.table) {
    const t = c.table;
    return (
      <>
        <SimpleTable minWidth={760} caption={c.title} rows={t.rows} cols={t.columns.map((col) => ({ label: col.label, right: col.kind !== undefined && col.kind !== "text", render: (r: Row) => cellText(r[col.key], col.kind) }))} />
        {c.note && <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">{c.note}</p>}
      </>
    );
  }
  return (
    <>
      {c.kind === "hbars" && c.hbars && <div className="px-5 pb-4"><HBars rows={c.hbars} max={c.max ?? 100} goal={c.goal} lowBelow={c.lowBelow} labelWidth={c.labelWidth ?? 64} unit={c.unit ?? "%"} /></div>}
      {c.kind === "bars" && c.bars && <div className="px-3 pb-2"><Bars data={c.bars} max={c.max} ticks={c.ticks} unit={c.unit ?? ""} ariaLabel={c.title} /></div>}
      {c.legend && <div className="px-5 pb-4"><Legend items={c.legend} /></div>}
      {(c.drills?.length || c.note) && (
        <div className={cx("px-5 pb-4", c.kind === "hbars" && c.note && "border-t border-line/70 pt-3")}>
          {c.note && <p className="text-[12.5px] text-ink3 font-semibold mb-2">{c.note}</p>}
          {c.drills && c.drills.length > 0 && (
            <div className="flex gap-1.5 flex-wrap items-center">
              {c.drills.map((d) => <Link key={d.drill} href={drillHref(d.drill)} scroll={false} className="h-7 px-2.5 rounded-lg text-[12.5px] font-semibold tnum transition bg-sunken hover:bg-line text-ink2 inline-flex items-center">{d.label}</Link>)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
