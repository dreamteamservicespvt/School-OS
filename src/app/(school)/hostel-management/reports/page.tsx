// Hostel Reports (15 §7): occupancy by hostel and room, roll call absences by
// date and student, roll call against class attendance, outings by student
// and month with late returns, incidents by type and month, the visitors log
// and mess head counts and expenses by month. The numbers on top use the
// same counts as the pages; each report opens below with its rows and
// exports with the dates on screen. A warden's reports hold their own hostel.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, FileBarChart } from "lucide-react";
import { withSchool } from "@/lib/db";
import { cellText } from "@/lib/reports/run";
import { dateWhere, momentWhere } from "@/lib/periods";
import { Card, CardHeader } from "@/components/ui/card";
import { BarsChart } from "@/components/ui/bars-chart";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { Empty, HBars, SimpleTable, Stack, Stats } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { occupancy } from "@/lib/hostel/rooms";
import { HOSTEL_REPORT_LIST } from "@/lib/hostel/reports";
import { isoOf } from "@/lib/hostel/words";
import { HostelHead } from "../_components/head";
import { BASE, hostelGuard, hostelPeriod, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Hostel Reports · Hostel Management" };
const SHOW = 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function HostelReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("reports");
  const { current, can, tz, mine } = p;
  const ctx = current.ctx;
  const per = hostelPeriod(sp, p.dates, "thismonth");
  const report = HOSTEL_REPORT_LIST.find((x) => x.key === one(sp.r)) ?? null;
  const hostelIds = mine;
  const scope = hostelIds === null ? {} : { hostelId: { in: hostelIds } };

  const d = await withSchool(ctx, async (tx) => {
    const day = per.range ? { date: dateWhere(per.range) } : {};
    const moment = per.range ? momentWhere(per.range, tz) : undefined;
    const [occ, rolls, outings, late, incidents] = await Promise.all([
      occupancy(tx, hostelIds ?? undefined),
      tx.rollCall.findMany({ where: { ...scope, ...day }, select: { date: true, session: true, absentCount: true } }),
      tx.gatePass.count({ where: { kind: "HOSTEL_OUTING", archivedAt: null, status: { in: ["OUT", "RETURNED"] }, ...scope, ...(moment ? { fromAt: moment } : {}) } }),
      tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", archivedAt: null, status: { in: ["OUT", "RETURNED"] }, ...scope, ...(moment ? { fromAt: moment } : {}) }, select: { toAt: true, returnedAt: true, status: true } }),
      tx.hostelIncident.count({ where: { archivedAt: null, ...scope, ...(moment ? { at: moment } : {}) } }),
    ]);
    const lateCount = late.filter((x) => x.toAt && (x.returnedAt ?? (x.status === "OUT" ? p.now : null)) && ((x.returnedAt ?? p.now).getTime() > x.toAt.getTime())).length;
    const table = report ? await report.run(tx, ctx, { from: per.range ? new Date(`${per.range.from}T00:00:00Z`) : null, to: per.range ? new Date(`${per.range.to}T00:00:00Z`) : null, today: p.today, hostelIds, tz, now: p.now, phones: can.outings }) : null;
    return { occ, rolls, outings, lateCount, incidents, table };
  }, { timeout: 60_000 });

  const absences = d.rolls.reduce((a, r) => a + r.absentCount, 0);
  const byDay = new Map<string, number>();
  for (const r of d.rolls) byDay.set(isoOf(r.date), (byDay.get(isoOf(r.date)) ?? 0) + r.absentCount);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31);
  const keep = per.keep;
  const reportHref = (key: string | null) => `${qs(`${BASE}/reports`, { ...keep, r: key })}${key ? "#report" : ""}`;
  const exportHref = report ? qs(`${BASE}/reports/export`, { ...keep, r: report.key }) : "";
  const t = d.table;
  const o = d.occ.total;

  return (
    <>
      <HostelHead pageName="Hostel Reports" href={`${BASE}/reports`} mode={p.mode} sub={mine === null ? "Occupancy, roll call, outings, incidents, visitors and the mess." : `Reports for ${p.myHostels.map((h) => h.name).join(" and ") || "your hostel"}.`} />
      <Stack>
        <div className="flex gap-2 flex-wrap"><PeriodFilter {...p.dates} fallback="thismonth" /></div>
        <Stats items={[
          { label: "Beds taken", value: `${o.taken} / ${o.beds}`, sub: `${o.free} free · as on today`, href: reportHref("hostel-occupancy") },
          { label: "Roll call absences", value: absences.toLocaleString("en-IN"), sub: per.label, tone: absences ? "warn" : undefined, href: reportHref("hostel-absences") },
          { label: "Outings and leaves", value: d.outings.toLocaleString("en-IN"), sub: `${d.lateCount} late return${d.lateCount === 1 ? "" : "s"}`, tone: d.lateCount ? "bad" : undefined, href: reportHref("hostel-outings") },
          { label: "Incidents", value: d.incidents.toLocaleString("en-IN"), sub: per.label, href: reportHref("hostel-incidents") },
        ]} />
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Occupancy by hostel" /></h2>
            {d.occ.rows.length ? <HBars labelWidth={110} valueWidth={72} rows={d.occ.rows.map((r) => ({ key: r.hostel.id, label: r.hostel.name, value: r.beds ? (r.taken / r.beds) * 100 : 0, text: `${r.taken} / ${r.beds}`, tone: r.free === 0 ? "warn" as const : "brand" as const }))} /> : <p className="text-[13.5px] text-ink3"><Words k="No hostel yet." /></p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Roll call absences by day" /></h2>
            {days.length ? <BarsChart ariaLabel="Roll call absences by day" data={days.map(([k, v]) => ({ k: `${Number(k.slice(8))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`, v }))} /> : <p className="text-[13.5px] text-ink3"><Words k="No roll calls on these dates." /></p>}
          </Card>
        </div>

        <Card>
          <CardHeader title="Reports" icon={FileBarChart} description="Open a report to see its rows and export it with the dates above." divided />
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px bg-line/70">
            {HOSTEL_REPORT_LIST.map((x, i, all) => (
              <li key={x.key} className={cx("bg-surface", i === all.length - 1 && cx(all.length % 2 === 1 && "sm:col-span-2", all.length % 3 === 1 ? "xl:col-span-3" : all.length % 3 === 2 ? "xl:col-span-2" : "xl:col-span-1"))}>
                <Link href={reportHref(x.key)} scroll={false} aria-current={report?.key === x.key ? "true" : undefined}
                  className={cx("flex items-start gap-3 px-5 py-4 h-full hover:bg-sunken/60 transition", report?.key === x.key && "bg-brand/5")}>
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

        {report && t && (
          <Card id="report">
            <CardHeader title={report.name} description={`${report.dated ? per.label : "As on today"} · ${t.rows.length.toLocaleString("en-IN")} row${t.rows.length === 1 ? "" : "s"}`} divided
              action={can.export ? <ExportButton href={exportHref} size="sm" always /> : undefined} />
            {t.rows.length ? (
              <>
                <SimpleTable caption={report.name} minWidth={Math.max(560, t.columns.length * 120)} rows={[...t.rows.slice(0, SHOW)]}
                  cols={t.columns.map((c) => ({ label: c.label, right: c.kind === "number" || c.kind === "money" || c.kind === "percent", render: (row: Record<string, unknown>) => cellText(row[c.key] as never, c.kind) }))}
                  foot={t.totals && t.rows.length <= SHOW ? t.columns.map((c) => cellText(t.totals![c.key], c.kind)) : undefined} />
                {t.rows.length > SHOW && <p className="px-5 py-3 border-t border-line text-[13px] text-ink3"><Words k="Showing the first" /> {SHOW} <Words k="of" /> {t.rows.length.toLocaleString("en-IN")} <Words k="rows. Export the report for all of them." /></p>}
              </>
            ) : <Empty icon={FileBarChart} title={t.empty ?? "Nothing matches"} />}
            {t.note && <p className="px-5 py-3 border-t border-line text-[13px] text-ink2">{t.note}</p>}
            {t.links && t.links.length > 0 && <div className="px-5 py-3 border-t border-line flex gap-4 flex-wrap">{t.links.map((l) => <Link key={l.href} href={l.href} className="text-[13px] font-semibold text-brand hover:underline">{l.label}</Link>)}</div>}
          </Card>
        )}
      </Stack>
    </>
  );
}
