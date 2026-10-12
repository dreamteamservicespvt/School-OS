import Link from "next/link";
import {
  Ban, BadgePercent, FileSpreadsheet, Globe, Hourglass, IndianRupee, ListTree, Percent, Printer, Receipt, ReceiptIndianRupee, Timer, Undo2, UserX, Wallet, type LucideIcon,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { cellText, FEE_REPORTS, findFeeReport, type ReportFilterKey } from "@/lib/fees/reports";
import { reportFilter } from "@/lib/fees/report-params";
import { PAYMENT_MODES } from "@/lib/fees/words";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Empty, HBars, SimpleTable, Toolbar } from "@/components/money/kit";
import { UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { ReportsFrame } from "@/components/list/reports-frame";
import { FeeHead } from "../_components/fee-head";
import { BASE, feeGuard, one, qs, type SearchParams } from "../_lib/page";
import { OldSoftwareBanner, OldSoftwareEmpty, allBeforeGoLive } from "@/components/money/go-live";

export const metadata = { title: "Fee Reports" };

const HREF = `${BASE}/reports`;
const SHOW = 500;

/** How each report shows in the list (mod-fees.jsx FEE_REPORT_LIST). */
const LOOK: Record<string, { group: string; sub: string; icon: LucideIcon }> = {
  collection: { group: "Collection", sub: "By date, class, fee head, mode and collector", icon: IndianRupee },
  "collection-details": { group: "Collection", sub: "Every payment, receipt by receipt", icon: ReceiptIndianRupee },
  modes: { group: "Collection", sub: "Cash, UPI, online, cheque and more", icon: Wallet },
  online: { group: "Collection", sub: "Successful, failed and not matched", icon: Globe },
  outstanding: { group: "Dues", sub: "By class, with the ageing groups", icon: Hourglass },
  defaulters: { group: "Dues", sub: "Students with overdue fees", icon: UserX },
  concessions: { group: "Discounts and penalties", sub: "By type, including scholarships", icon: BadgePercent },
  penalty: { group: "Discounts and penalties", sub: "Late fees added, waived and collected", icon: Timer },
  refunds: { group: "Discounts and penalties", sub: "Asked, approved and paid back", icon: Undo2 },
  cancelled: { group: "Audit and tax", sub: "Who cancelled, when, why", icon: Ban },
  audit: { group: "Audit and tax", sub: "Installment-wise breakdown", icon: ListTree },
  tax: { group: "Audit and tax", sub: "Taxable value and GST by period", icon: Receipt },
  gst: { group: "Audit and tax", sub: "Tax invoices with CGST and SGST", icon: Percent },
};

/** Fee Reports (06 §7, mod-fees.jsx FeeReports): each report with its filters, a total line, export and print. */
export default async function FeeReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeGuard("reports");
  const sp = await searchParams;
  const def = findFeeReport(one(sp.r)) ?? FEE_REPORTS[0];
  const { f, range } = reportFilter(sp, { ...p.dates, today: p.today, yearStart: p.year?.startDate ?? null });
  const has = (k: ReportFilterKey) => def.filters.includes(k);

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [result, classes, heads, collectors] = await Promise.all([
      def.run(tx, p.current.ctx, f, p.viewer),
      has("class") ? tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : [],
      has("head") ? tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }) : [],
      has("collector") ? tx.payment.groupBy({ by: ["collectedById"], where: { collectedById: { not: null } } }) : [],
    ]);
    const people = collectors.length ? await tx.userLogin.findMany({ where: { id: { in: collectors.map((c) => c.collectedById!).filter(Boolean) } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }) : [];
    return { result, classes, heads, people };
  });

  const keep: Record<string, string | null> = {
    period: one(sp.period) || null, from: one(sp.from) || null, to: one(sp.to) || null,
    class: f.classId, head: f.feeHeadId, mode: f.mode, by: f.collectorId, group: has("group") && f.group !== "month" ? f.group : null,
  };
  const links = FEE_REPORTS.map((r) => ({ key: r.key, name: r.label, href: qs(HREF, { r: r.key, period: keep.period, from: keep.from, to: keep.to }), ...(LOOK[r.key] ?? { group: "More", sub: r.about }) }));
  const exportHref = qs(`${HREF}/export`, { r: def.key, ...keep });
  const r = data.result;
  const datesWords = has("dates") ? (range ? range.label : `${formatDate(f.from)} to ${formatDate(f.to)}`) : `As on ${formatDate(p.today)}`;
  const chartMax = r.chart?.reduce((m, c) => (c.value > m ? c.value : m), BigInt(0)) ?? BigInt(0);
  const shown = r.rows.slice(0, SHOW);
  const filtersOn = has("class") || has("head") || has("mode") || has("collector") || has("group") || has("dates");

  return (
    <div>
      <FeeHead pageName="Fee Reports" href={HREF} sub={`${p.year?.name ?? "This year"} · ${datesWords}`} />
      <ReportsFrame reports={links} active={def.key}>
        {r.chart && r.chart.length > 0 && chartMax > BigInt(0) && (
          <Card>
            <CardHeader title={def.label} description={datesWords} />
            <div className="px-5 pb-5">
              <HBars labelWidth={120} rows={r.chart.map((c) => ({ key: c.label, label: c.label, value: Number((c.value * BigInt(1000)) / chartMax) / 10, text: formatRupees(c.value) }))} />
            </div>
          </Card>
        )}
        <Card className="overflow-hidden">
          <CardHeader title={def.label} description={def.about}
            action={<div className="flex items-center gap-1.5 shrink-0">
              <ExportButton href={exportHref} size="sm" always />
              <a href={`${exportHref}&format=pdf`} target="_blank" rel="noreferrer" className={`${buttonClass("ghost", "sm")} hidden sm:inline-flex`}><Printer size={15} aria-hidden="true" />Print</a>
            </div>} />
          {filtersOn && (
            <Toolbar className="md:flex-wrap border-t border-line">
              <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap w-full">
                {has("dates") && <PeriodFilter {...p.dates} allLabel={`${p.year?.name ?? "This year"} so far`} />}
                {has("group") && <UrlSegmented param="group" fallback="month" label="Group by" size="sm" options={[{ value: "day", label: "Daily" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />}
                {has("class") && <UrlSelect id="rep-class" param="class" label="Class" className="md:w-36" options={[{ value: "", label: "All classes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))]} />}
                {has("head") && <UrlSelect id="rep-head" param="head" label="Fee head" className="md:w-44" options={[{ value: "", label: "All fee heads" }, ...data.heads.map((h) => ({ value: h.id, label: h.name }))]} />}
                {has("mode") && <UrlSelect id="rep-mode" param="mode" label="Mode" className="md:w-40" options={[{ value: "", label: "All modes" }, ...PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))]} />}
                {has("collector") && <UrlSelect id="rep-by" param="by" label="Collected by" className="md:w-44" options={[{ value: "", label: "Everyone" }, ...data.people.map((u) => ({ value: u.id, label: u.displayName }))]} />}
              </div>
            </Toolbar>
          )}
          {has("dates") && <OldSoftwareBanner goLive={p.goLive} from={f.from} to={f.to} what="fee records" className="mx-5 mb-3" />}
          {has("dates") && allBeforeGoLive(p.goLive, f.from, f.to) ? <OldSoftwareEmpty goLive={p.goLive} what="fee records" /> : r.rows.length === 0 ? (
            <Empty icon={FileSpreadsheet} title="Nothing in this report" body={has("dates") ? "Nothing matches these dates and filters. Try a longer period." : "Nothing matches these filters."}
              action={<Link href={qs(HREF, { r: def.key })} scroll={false} className={buttonClass("secondary")}>Clear filters</Link>} />
          ) : (
            <SimpleTable minWidth={Math.max(560, r.columns.length * 120)} caption={def.label} rows={shown}
              cols={r.columns.map((c) => ({ label: c.label, right: c.kind === "money" || c.kind === "number", render: (row: Record<string, unknown>) => cellText(row[c.key] as never, c.kind) }))}
              foot={r.totals ? r.columns.map((c) => cellText((r.totals?.[c.key] ?? null) as never, c.kind)) : undefined} />
          )}
          {(r.note || r.rows.length > SHOW) && (
            <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">
              {r.rows.length > SHOW && `Showing the first ${SHOW} of ${r.rows.length} rows; the total line and the export have all of them. `}{r.note}
            </p>
          )}
        </Card>
      </ReportsFrame>
    </div>
  );
}
