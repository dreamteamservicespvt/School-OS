// Library Reports (13 §7): books issued, overdue, most read books and
// categories, fines, stock check results and the catalogue. The numbers on
// top use the same counts as the desk (the overdue count is the desk's own).
// Each report opens below with its rows and exports with the filters on
// screen; the same reports are in Reports & Analytics.
import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, ChevronRight, FileBarChart } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatRupees } from "@/lib/format";
import { sectionsForCurrentYears } from "@/lib/academic";
import { cellText } from "@/lib/reports/run";
import { Card, CardHeader } from "@/components/ui/card";
import { BarsChart } from "@/components/ui/bars-chart";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Empty, HBars, SimpleTable } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { LIBRARY_REPORT_LIST, copiesByStatus, fineTotals, issuedByClass, issuedByMonth, overdueBuckets, overdueCount, popularBooks, categoriesRead, stockSessions } from "@/lib/library/reports";
import { formatDate } from "@/lib/format";
import { LibHead } from "../_components/head";
import { BASE, libGuard, libPeriod, one, qs, type SearchParams } from "../_lib/page";
import { readReportFilter } from "../_lib/reports";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Library Reports · Library Management") };
}
const SHOW = 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function LibraryReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await libGuard("reports");
  const { current, can, tz, today } = p;
  const per = libPeriod(sp, p.dates, "acyear");
  const r = readReportFilter((k) => one(sp[k]), per.range, today);
  const f = r.f;

  const d = await withSchool(current.ctx, async (tx) => {
    const [sections, issued, overdue, fines, byMonth, byClass, popular, cats, buckets, copies, sessions] = await Promise.all([
      // Each campus's classes, from its own current year.
      sectionsForCurrentYears(tx, current.ctx, current.campusId),
      tx.bookIssue.count({ where: { ...(f.from && f.to ? { issuedOn: { gte: f.from, lte: f.to } } : {}), ...(f.sectionIds ? { sectionId: { in: f.sectionIds } } : {}) } }),
      overdueCount(tx, today, { sectionIds: f.sectionIds }),
      fineTotals(tx, current.ctx, f),
      issuedByMonth(tx, f),
      issuedByClass(tx, f),
      popularBooks(tx, f, 5),
      categoriesRead(tx, f),
      overdueBuckets(tx, today),
      copiesByStatus(tx),
      r.report?.key === "lib-stock" ? stockSessions(tx, f) : Promise.resolve([]),
    ]);
    const table = r.report ? await r.report.run(tx, current.ctx, r.forReport(r.report)) : null;
    return { sections, issued, overdue, fines, byMonth, byClass, popular, cats, buckets, copies, sessions, table };
  }, { timeout: 60_000 });

  const keep = { ...per.keep, sec: r.sec || null };
  const reportHref = (key: string | null) => `${qs(`${BASE}/reports`, { ...keep, r: key })}${key ? "#report" : ""}`;
  const exportHref = r.report ? qs(`${BASE}/reports/export`, { ...keep, r: r.report.key, session: r.session || null }) : "";
  const maxClass = Math.max(1, ...d.byClass.map((x) => x.value));
  const maxCat = Math.max(1, ...d.cats.map((x) => x.times));
  const t = d.table;

  return (
    <>
      <LibHead pageName="Library Reports" href={`${BASE}/reports`} mode={p.mode} />
      <Stack>
        <div className="flex gap-2 flex-wrap">
          <PeriodFilter {...p.dates} fallback="acyear" />
          {d.sections.length > 0 && <UrlSelect param="sec" label="Class" options={[{ value: "", label: "All classes and staff" }, ...d.sections.map((x) => ({ value: x.id, label: x.label }))]} />}
        </div>
        <Stats items={[
          { label: "Books issued", value: d.issued.toLocaleString("en-IN"), sub: per.label, href: reportHref("lib-issued") },
          { label: "Overdue now", value: d.overdue.toLocaleString("en-IN"), tone: d.overdue ? "bad" : undefined, sub: r.sec ? "in this class" : "same as Issue & Return", href: reportHref("lib-overdue") },
          { label: "Fines collected", value: formatRupees(d.fines.collected.paise), sub: per.label, tone: "ok", href: reportHref("lib-fines") },
          { label: "Fines due", value: formatRupees(d.fines.due.paise), sub: `${d.fines.waived.count} waived · ${d.fines.waiting.count} waiting`, href: reportHref("lib-fines") },
        ]} />
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Books issued by month" /></h2>
            {d.byMonth.length ? <BarsChart ariaLabel="Books issued by month" data={d.byMonth.map((m) => ({ k: `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(2, 4)}`, v: m.value }))} /> : <p className="text-[13.5px] text-ink3"><Words k="No books issued on these dates." /></p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Books issued by class" /></h2>
            {d.byClass.length ? <div className="max-h-[220px] overflow-y-auto scroll-thin pr-1"><HBars labelWidth={92} valueWidth={48} rows={d.byClass.map((x) => ({ key: x.key, label: x.label.replace(/^Class\s+/i, ""), value: (x.value / maxClass) * 100, text: x.value.toLocaleString("en-IN") }))} /></div> : <p className="text-[13.5px] text-ink3"><Words k="No books issued on these dates." /></p>}
          </Card>
          <Card>
            <CardHeader title="Most read books" icon={BarChart3} action={<Link href={reportHref("lib-popular")} className="text-[13px] font-semibold text-brand hover:underline"><Words k="All" /></Link>} divided />
            {d.popular.length ? (
              <ol className="divide-y divide-line/70">
                {d.popular.map((b, i) => (
                  <li key={b.bookId} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="grid place-items-center size-7 rounded-full bg-brand/10 text-brand text-[12.5px] font-semibold tnum shrink-0">{i + 1}</span>
                    <Link href={`${BASE}/books/${b.bookId}`} className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate hover:underline">{b.title}</p><p className="text-[12.5px] text-ink3 truncate">{b.author} · {b.category}</p></Link>
                    <span className="text-[13px] tnum text-ink2 shrink-0">{b.times}×</span>
                  </li>
                ))}
              </ol>
            ) : <p className="px-5 py-4 text-[13.5px] text-ink3"><Words k="No books issued on these dates." /></p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Most read categories" /></h2>
            {d.cats.length ? <HBars labelWidth={110} valueWidth={48} rows={d.cats.slice(0, 8).map((c) => ({ key: c.name, label: c.name, value: (c.times / maxCat) * 100, text: c.times.toLocaleString("en-IN") }))} /> : <p className="text-[13.5px] text-ink3"><Words k="No books issued on these dates." /></p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="How late the overdue books are" /></h2>
            <HBars labelWidth={92} valueWidth={48} rows={d.buckets.map((b) => ({ key: b.key, label: b.label, value: b.value, text: b.value.toLocaleString("en-IN"), tone: b.key === "30+" ? "bad" as const : "warn" as const }))} />
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Copies by status" /></h2>
            <HBars labelWidth={92} valueWidth={56} rows={d.copies.map((c) => ({ key: c.status, label: c.label, value: c.value, text: c.value.toLocaleString("en-IN"), tone: c.status === "AVAILABLE" ? "ok" as const : c.status === "LOST" || c.status === "DAMAGED" ? "warn" as const : "brand" as const }))} />
          </Card>
        </div>

        <Card>
          <CardHeader title="Reports" icon={FileBarChart} description="Open a report to see its rows and export it with the dates and class above." divided />
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px bg-line/70">
            {LIBRARY_REPORT_LIST.map((x, i, all) => (
              // The last report fills the rest of its row, so no empty grey cell shows.
              <li key={x.key} className={cx("bg-surface", i === all.length - 1 && cx(all.length % 2 === 1 && "sm:col-span-2", all.length % 3 === 1 ? "xl:col-span-3" : all.length % 3 === 2 ? "xl:col-span-2" : "xl:col-span-1"))}>
                <Link href={reportHref(x.key)} scroll={false} aria-current={r.report?.key === x.key ? "true" : undefined}
                  className={cx("flex items-start gap-3 px-5 py-4 h-full hover:bg-sunken/60 transition", r.report?.key === x.key && "bg-brand/5")}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px]">{x.name}</p>
                    <p className="text-[12.5px] text-ink3 mt-0.5">{x.sub}{x.dated ? "" : " (as on today)"}</p>
                  </div>
                  <ChevronRight size={18} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {r.report && t && (
          <Card id="report">
            <CardHeader title={r.report.name} description={`${r.report.dated ? per.label : "As on today"}${r.report.byClass && r.sec ? ` · ${d.sections.find((x) => x.id === r.sec)?.label ?? ""}` : ""} · ${t.rows.length.toLocaleString("en-IN")} row${t.rows.length === 1 ? "" : "s"}`} divided
              action={<div className="flex gap-2 items-center">
                {r.report.key === "lib-stock" && d.sessions.length > 0 && <UrlSelect param="session" label="Stock check" options={[{ value: "", label: "Every check" }, ...d.sessions.map((x) => ({ value: x.id, label: `${x.name} (${formatDate(x.startedAt, tz)})` }))]} />}
                {can.export && <ExportButton href={exportHref} size="sm" always />}
              </div>} />
            {t.rows.length ? (
              <>
                <SimpleTable caption={r.report.name} minWidth={Math.max(560, t.columns.length * 120)} rows={[...t.rows.slice(0, SHOW)]}
                  cols={t.columns.map((c) => ({ label: c.label, right: c.kind === "number" || c.kind === "money" || c.kind === "percent", render: (row: Record<string, unknown>) => cellText(row[c.key] as never, c.kind) }))}
                  foot={t.totals && t.rows.length <= SHOW ? t.columns.map((c) => cellText(t.totals![c.key], c.kind)) : undefined} />
                {t.rows.length > SHOW && <p className="px-5 py-3 border-t border-line text-[13px] text-ink3"><Words k="Showing the first" /> {SHOW} <Words k="of" /> {t.rows.length.toLocaleString("en-IN")} <Words k="rows. Export the report for all of them." /></p>}
              </>
            ) : <Empty icon={FileBarChart} title={t.empty ?? "Nothing matches"} />}
            {t.note && <p className="px-5 py-3 border-t border-line text-[13px] text-ink2">{t.note}</p>}
          </Card>
        )}
      </Stack>
    </>
  );
}
