// Inventory Reports (14 §7): stock in hand and its value, movements, low
// stock, issues, book sets by class, purchases, pending orders, unpaid bills,
// the asset register and its value, assets by location, warranty and AMC
// due, maintenance costs, and audit variances. The numbers on top are the
// same as on the pages; each report opens below and exports with the filters
// on screen. The same reports are in Reports & Analytics.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, FileBarChart } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatRupees } from "@/lib/format";
import { sectionsForCurrentYears } from "@/lib/academic";
import { cellText } from "@/lib/reports/run";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Empty, HBars, SimpleTable } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { INVENTORY_REPORT_LIST, movementTotals, valueByCategory } from "@/lib/inventory/reports";
import { totalsFor, reorderOf } from "@/lib/inventory/stock";
import { MOVE_KIND, stockState } from "@/lib/inventory/words";
import { InvHead } from "../_components/head";
import { BASE, invGuard, invPeriod, one, qs, type SearchParams } from "../_lib/page";
import { readReportFilter, STORE_REPORTS } from "../_lib/reports";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Inventory Reports · Inventory Management" };
const SHOW = 100;
const ZERO = BigInt(0);

export default async function InventoryReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("reports");
  const { current, can, today } = p;
  const per = invPeriod(sp, p.dates, "finyear");
  const r = readReportFilter((k) => one(sp[k]), per.range, today);
  const f = r.f;
  const dated = f.from && f.to ? { gte: f.from, lte: f.to } : undefined;

  const d = await withSchool(current.ctx, async (tx) => {
    const [sections, byCat, moves, orders, maint, items, totals, stores, cats, unpaid] = await Promise.all([
      // Each campus's classes, from its own current year.
      sectionsForCurrentYears(tx, current.ctx, current.campusId),
      valueByCategory(tx),
      movementTotals(tx, f),
      tx.purchaseOrder.aggregate({ where: { status: { notIn: ["CANCELLED", "WAITING"] }, ...(dated ? { date: dated } : {}) }, _sum: { totalPaise: true }, _count: true }),
      tx.maintenanceRequest.aggregate({ where: { status: "DONE", ...(dated ? { doneOn: dated } : {}) }, _sum: { costPaise: true }, _count: true }),
      tx.item.findMany({ where: { archivedAt: null }, include: { category: true } }),
      totalsFor(tx),
      tx.storeLocation.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
      tx.itemCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.purchaseInvoice.findMany({ select: { expenseId: true } }).then(async (bills) => {
        const ids = bills.map((b) => b.expenseId).filter((x): x is string => Boolean(x));
        if (!ids.length) return ZERO;
        const ex = await tx.expense.findMany({ where: { id: { in: ids }, status: { notIn: ["CANCELLED", "DRAFT", "WAITING"] } }, select: { amountPaise: true, paidPaise: true } });
        return ex.reduce((a, e) => a + (e.amountPaise - e.paidPaise), ZERO);
      }),
    ]);
    const low = items.filter((i) => { const ro = reorderOf(i, i.category); return ro > 0 && stockState(totals.get(i.id) ?? 0, ro) !== "OK"; }).length;
    const table = r.report ? await r.report.run(tx, current.ctx, r.forReport(r.report)) : null;
    return { sections, byCat, moves, orders, maint, low, stores, cats, unpaid, table };
  }, { timeout: 60_000 });

  const value = d.byCat.reduce((a, c) => a + c.value, ZERO);
  const keep = { ...per.keep, sec: r.sec || null, store: r.store || null, cat: r.cat || null, group: r.group !== "vendor" ? r.group : null };
  const reportHref = (key: string | null) => `${qs(`${BASE}/reports`, { ...keep, r: key })}${key ? "#report" : ""}`;
  const exportHref = r.report ? qs(`${BASE}/reports/export`, { ...keep, r: r.report.key }) : "";
  const maxCat = Math.max(1, ...d.byCat.map((c) => Number(c.value / BigInt(100))));
  const moveRows = d.moves.filter((m) => m.count > 0).sort((a, b) => b.count - a.count);
  const maxMove = Math.max(1, ...moveRows.map((m) => m.count));
  const t = d.table;

  return (
    <>
      <InvHead pageName="Inventory Reports" href={`${BASE}/reports`} mode={p.mode} />
      <Stack>
        <div className="flex gap-2 flex-wrap">
          <PeriodFilter {...p.dates} fallback="finyear" />
          {d.sections.length > 0 && r.report?.byClass && <UrlSelect param="sec" label="Class" options={[{ value: "", label: "All classes" }, ...d.sections.map((x) => ({ value: x.id, label: x.label }))]} />}
          {r.report && STORE_REPORTS.has(r.report.key) && d.stores.length > 1 && <UrlSelect param="store" label="Store" options={[{ value: "", label: "All stores" }, ...d.stores.map((s) => ({ value: s.id, label: s.name }))]} />}
          {r.report && STORE_REPORTS.has(r.report.key) && <UrlSelect param="cat" label="Category" options={[{ value: "", label: "All categories" }, ...d.cats.map((c) => ({ value: c.id, label: c.name }))]} />}
          {r.report?.key === "inv-purchases" && <UrlSelect param="group" label="Group by" options={[{ value: "", label: "By vendor" }, { value: "item", label: "By item" }, { value: "month", label: "By month" }]} />}
        </div>
        <Stats items={[
          { label: "Stock value", value: formatRupees(value), sub: "As on today", href: reportHref("inv-stock") },
          { label: "Low stock", value: d.low.toLocaleString("en-IN"), tone: d.low ? "warn" : undefined, sub: "Same as Items & Stock", href: reportHref("inv-low") },
          { label: "Purchases", value: formatRupees(d.orders._sum.totalPaise ?? ZERO), sub: `${d.orders._count.toLocaleString("en-IN")} orders · ${per.label}`, href: reportHref("inv-purchases") },
          { label: "Unpaid bills", value: formatRupees(d.unpaid), tone: d.unpaid > ZERO ? "warn" : undefined, sub: "As on today", href: reportHref("inv-unpaid") },
          { label: "Maintenance cost", value: formatRupees(d.maint._sum.costPaise ?? ZERO), sub: `${d.maint._count.toLocaleString("en-IN")} done · ${per.label}`, href: reportHref("inv-maintenance") },
        ]} />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Stock value by category" /></h2>
            {d.byCat.length ? <HBars labelWidth={110} valueWidth={96} rows={d.byCat.slice(0, 8).map((c) => ({ key: c.id, label: c.name, value: (Number(c.value / BigInt(100)) / maxCat) * 100, text: formatRupees(c.value) }))} /> : <p className="text-[13.5px] text-ink3"><Words k="No stock in hand." /></p>}
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-[15px] mb-3"><Words k="Stock movements ·" /> {per.label}</h2>
            {moveRows.length ? <HBars labelWidth={110} valueWidth={56} rows={moveRows.map((m) => ({ key: m.kind, label: MOVE_KIND[m.kind].label, value: (m.count / maxMove) * 100, text: m.count.toLocaleString("en-IN"), tone: ["DAMAGED", "LOST", "EXPIRED"].includes(m.kind) ? "bad" as const : "brand" as const }))} /> : <p className="text-[13.5px] text-ink3"><Words k="No stock moved on these dates." /></p>}
          </Card>
        </div>

        <Card>
          <CardHeader title="Reports" icon={FileBarChart} description="Open a report to see its rows and export it with the filters above." divided />
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-px bg-line/70">
            {INVENTORY_REPORT_LIST.map((x, i, all) => (
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
            <CardHeader title={r.report.name} description={`${r.report.dated ? per.label : "As on today"} · ${t.rows.length.toLocaleString("en-IN")} row${t.rows.length === 1 ? "" : "s"}`} divided
              action={can.export ? <ExportButton href={exportHref} size="sm" always /> : undefined} />
            {t.rows.length ? (
              <>
                <SimpleTable caption={r.report.name} minWidth={Math.max(560, t.columns.length * 120)} rows={[...t.rows.slice(0, SHOW)]}
                  cols={t.columns.map((c) => ({ label: c.label, right: c.kind === "number" || c.kind === "money" || c.kind === "percent", render: (row: Record<string, unknown>) => cellText(row[c.key] as never, c.kind) }))}
                  foot={t.totals && t.rows.length <= SHOW ? t.columns.map((c) => cellText(t.totals![c.key], c.kind)) : undefined} />
                {t.rows.length > SHOW && <p className="px-5 py-3 border-t border-line text-[13px] text-ink3"><Words k="Showing the first" /> {SHOW} <Words k="of" /> {t.rows.length.toLocaleString("en-IN")} <Words k="rows. Export the report for all of them." /></p>}
              </>
            ) : <Empty icon={FileBarChart} title={t.empty ?? "Nothing matches"} />}
            {t.note && <p className="px-5 py-3 border-t border-line text-[13px] text-ink2">{t.note}</p>}
            {t.links && t.links.length > 0 && (
              <div className="px-5 py-3 border-t border-line flex gap-4 flex-wrap text-[13.5px]">
                {t.links.map((l) => <Link key={l.href} href={l.href} className="font-semibold text-brand hover:underline">{l.label}</Link>)}
              </div>
            )}
          </Card>
        )}
      </Stack>
    </>
  );
}
