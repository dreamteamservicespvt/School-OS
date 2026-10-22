import Link from "next/link";
import {
  Archive, BookOpen, Building2, ChartColumn, FileCode2, FileSpreadsheet, Gauge, Hourglass, Landmark, ListTree, Printer, ReceiptText, Scale, type LucideIcon,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupeesShort } from "@/lib/format";
import { cellText } from "@/lib/fees/reports";
import { FINANCE_REPORTS, findFinanceReport, type FinanceFilter } from "@/lib/finance/reports";
import { chosenFinancialYear, financialYears } from "@/lib/finance/years";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { ReportsFrame } from "@/components/list/reports-frame";
import { Empty, HBars, Legend, SimpleTable, Stack, Stats, Toolbar } from "@/components/money/kit";
import { Bars } from "@/components/money/bars";
import { UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { OldSoftwareBanner, allBeforeGoLive } from "@/components/money/go-live";
import { FinanceHead } from "../_components/finance-head";
import { BASE, financeGuard, financePeriod, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Finance Reports" };

const HREF = `${BASE}/reports`;
const SHOW = 500;
const ZERO = BigInt(0);

/** How each report shows in the list (mod-finance.jsx FIN_REPORTS). */
const LOOK: Record<string, { group: string; icon: LucideIcon }> = {
  "income-expense": { group: "Income and expense", icon: ChartColumn },
  "profit-loss": { group: "Income and expense", icon: Scale },
  department: { group: "Expenses", icon: Building2 },
  "expense-analysis": { group: "Expenses", icon: ReceiptText },
  "pending-expenses": { group: "Expenses", icon: Hourglass },
  books: { group: "Cash and bank", icon: Landmark },
  "day-book-summary": { group: "Cash and bank", icon: BookOpen },
  "budget-actual": { group: "Optional", icon: Gauge },
  "trial-balance": { group: "Optional", icon: ListTree },
};

/** Finance Reports (07 §7, mod-finance.jsx ReportsPage): every report by financial year, with a date range inside it. */
export default async function FinanceReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financeGuard("reports");
  const sp = await searchParams;
  const full = p.level === "full";
  const list = FINANCE_REPORTS.filter((r) => full || !r.fullOnly);
  const def = list.find((r) => r.key === one(sp.r)) ?? findFinanceReport("income-expense")!;
  const off = def.feature && !p.has(def.feature) ? def.feature : null;
  const old = one(sp.fy) === "old";
  const per = financePeriod(sp, p.dates, null);
  const group = one(sp.group) === "day" ? "day" : "month";
  const by = (["vendor", "month", "approver"] as const).find((b) => b === one(sp.by)) ?? "head";

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [fy, years] = await Promise.all([chosenFinancialYear(tx, p.current.ctx, old ? null : one(sp.fy), p.today), financialYears(tx)]);
    const end = fy.endDate < p.today ? fy.endDate : p.today;
    // The dates chosen, kept inside the financial year; with none chosen, the year so far.
    const from = per.from && per.from > fy.startDate ? per.from : fy.startDate;
    const to = per.to && per.to < end ? per.to : end;
    const f: FinanceFilter = { financialYearId: fy.id, yearStart: fy.startDate, from, to: to < from ? from : to, group, by, today: p.today, hidePay: p.payHeads };
    const result = old || off ? null : await def.run(tx, p.current.ctx, f);
    return { fy, years, f, result };
  });

  const { fy, f, result: r } = data;
  const has = (k: "dates" | "group" | "by") => def.filters.includes(k);
  const keep: Record<string, string | null> = { fy: one(sp.fy) || null, ...per.keep, group: has("group") && group !== "month" ? group : null, by: has("by") && by !== "head" ? by : null };
  const links = list.map((x) => ({ key: x.key, name: x.label, sub: x.about, href: qs(HREF, { r: x.key, fy: keep.fy, period: keep.period, from: keep.from, to: keep.to }), ...LOOK[x.key] }));
  const exportHref = qs(`${HREF}/export`, { r: def.key, ...keep });
  const dates = has("dates") ? `${formatDate(f.from)} to ${formatDate(f.to)}` : `As on ${formatDate(p.today)}`;
  const firstYear = data.years.at(-1);
  const showOld = firstYear && p.goLive >= firstYear.startDate;
  const yearOptions = [...[...data.years].sort((a, b) => (a.id === p.fy.id ? -1 : b.id === p.fy.id ? 1 : 0)).map((y) => ({ value: y.id === p.fy.id ? "" : y.id, label: `${y.name}${y.id === p.fy.id ? " (this year)" : ""}${y.status === "CLOSED" ? " · closed" : ""}` })), ...(showOld ? [{ value: "old", label: `Before ${formatDate(p.goLive)} (old software)` }] : [])];
  const before = has("dates") && allBeforeGoLive(p.goLive, f.from, f.to);

  // The money in and out by month, for the chart on "Income and expense".
  const months = new Map<string, { inc: bigint; exp: bigint }>();
  if (r && def.key === "income-expense" && group === "month") {
    for (const row of r.rows) {
      const k = String(row.period);
      const m = months.get(k) ?? { inc: ZERO, exp: ZERO };
      m.inc += (row.income as bigint | null) ?? ZERO;
      m.exp += (row.expense as bigint | null) ?? ZERO;
      months.set(k, m);
    }
  }
  const lakh = (v: bigint) => Math.round(Number(v) / 1e5) / 100;
  const peak = Math.max(1, ...[...months.values()].map((m) => Math.max(lakh(m.inc), lakh(m.exp))));
  const step = peak > 60 ? 20 : peak > 30 ? 10 : peak > 12 ? 5 : peak > 4 ? 2 : peak > 2 ? 1 : 0.5;
  const ticks = [0, step, step * 2, step * 3];
  const inc = (r?.totals?.income as bigint | undefined) ?? ZERO;
  const exp = (r?.totals?.expense as bigint | undefined) ?? ZERO;
  const chartMax = r?.chart?.reduce((m, c) => (c.value > m ? c.value : m), ZERO) ?? ZERO;
  const shown = r ? r.rows.slice(0, SHOW) : [];

  return (
    <div>
      <FinanceHead pageName="Finance Reports" href={HREF} sub="Every report works by financial year (April to March), with a date range inside it · also in Reports & Analytics"
        viewActions={p.can.export && p.has("finance-tally") && full ? <a href={qs(`${HREF}/tally`, { fy: keep.fy, period: keep.period, from: keep.from, to: keep.to })} className={buttonClass("secondary")}><FileCode2 size={17} aria-hidden="true" /><Words k="Export for Tally" /></a> : undefined} />
      <Toolbar className="!px-0 !pt-0 mb-5 md:!flex-row">
        <UrlSelect id="fr-fy" param="fy" label="Financial year" className="md:w-72" options={yearOptions} />
        {!old && has("dates") && <PeriodFilter {...p.dates} fallback={null} allLabel={`${fy.name} so far`} className="md:w-64" />}
      </Toolbar>
      {old ? (
        <Card><Empty icon={Archive} title="Kept in the old software"
          body={`School OS started on ${formatDate(p.goLive)}. Opening balances were brought in on that day; reports for earlier years stay in the old software’s files.`}
          action={<Link href={qs(HREF, { r: def.key })} className={buttonClass("secondary")}><Words k="Back to" /> {p.fy.name}</Link>} /></Card>
      ) : (
        <ReportsFrame reports={links} active={def.key}>
          {off ? (
            <Card><Empty icon={LOOK[def.key]?.icon ?? Gauge} title={off === "finance-budget" ? "Budgets are switched off" : "Accounts are switched off"}
              body={off === "finance-budget" ? "Switch budgets on in Finance Settings to see each head’s budget against what was spent, with alerts at 80% and 100%." : "Switch Accounts on in Finance Settings for journal entries, the ledger and the trial balance."}
              action={p.may("settings") ? <Link href={`${BASE}/settings`} className={buttonClass("secondary")}><Words k="Open Finance Settings" /></Link> : undefined} /></Card>
          ) : r && (
            <Stack>
              {has("dates") && <OldSoftwareBanner goLive={p.goLive} from={f.from} to={f.to} what="finance records" />}
              {def.key === "income-expense" && !before && (
                <Stats items={[
                  { label: "Income", value: formatRupeesShort(inc), tone: "ok", sub: dates },
                  { label: "Expenses", value: formatRupeesShort(exp), sub: dates },
                  { label: inc >= exp ? "Surplus" : "Shortfall", value: formatRupeesShort(inc >= exp ? inc - exp : exp - inc), tone: inc >= exp ? "brand" : "bad", sub: inc > ZERO ? `${Math.round((Number(inc - exp) * 100) / Number(inc))}% of income` : "No income yet" },
                ]} />
              )}
              {months.size > 0 && (
                <Card>
                  <CardHeader title="Money in and money out" description="By month (₹ lakh)" icon={ChartColumn} />
                  <div className="px-3 pb-2">
                    <Bars data={[...months.entries()].map(([k, m]) => ({ k: k.split(" ")[0].slice(0, 3), v: lakh(m.inc), v2: lakh(m.exp), tip: `${k}: ${cellText(m.inc, "money")} in, ${cellText(m.exp, "money")} out` }))}
                      max={ticks[3] * 1.15} ticks={ticks} ariaLabel="Income and expenses by month" />
                  </div>
                  <div className="px-5 pb-4 flex items-center gap-4 flex-wrap"><Legend items={[["bg-brand", "Income"], ["bg-ink3/25", "Expenses"]]} /></div>
                </Card>
              )}
              {def.key !== "income-expense" && r.chart && r.chart.length > 0 && chartMax > ZERO && !before && (
                <Card>
                  <CardHeader title={def.key === "expense-analysis" ? "Where the money went" : def.label} description={dates} icon={LOOK[def.key]?.icon} />
                  <div className="px-5 pb-5">
                    <HBars labelWidth={150} rows={r.chart.map((c) => ({ key: c.label, label: c.label, value: Number((c.value * BigInt(1000)) / chartMax) / 10, text: formatRupeesShort(c.value) }))} />
                  </div>
                </Card>
              )}
              <Card className="overflow-hidden">
                <CardHeader title={def.label} description={has("dates") ? dates : `As on ${formatDate(p.today)}`}
                  action={<div className="flex flex-wrap justify-end items-center gap-1.5">
                    {has("group") && <UrlSegmented param="group" fallback="month" label="Group by" size="sm" options={[{ value: "month", label: "Month" }, { value: "day", label: "Day" }]} />}
                    {p.can.export && <ExportButton href={exportHref} size="sm" always />}
                    {p.can.export && <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}format=pdf`} target="_blank" rel="noreferrer" className={`${buttonClass("ghost", "sm")} hidden sm:inline-flex`}><Printer size={15} aria-hidden="true" /><Words k="Print" /></a>}
                  </div>} />
                {has("by") && (
                  <div className="px-5 pb-3"><UrlSegmented param="by" fallback="head" label="Group by" size="sm" className="w-full md:w-auto" options={[{ value: "head", label: "Head" }, { value: "vendor", label: "Vendor" }, { value: "month", label: "Month" }, { value: "approver", label: "Approver" }]} /></div>
                )}
                {before ? (
                  <Empty icon={Archive} title="Kept in the old software" body={`School OS has finance records from ${formatDate(p.goLive)}. Earlier ones stay in the old software; their totals came in as opening balances.`} />
                ) : r.rows.length === 0 ? (
                  <Empty icon={FileSpreadsheet} title="Nothing in this report" body={has("dates") ? "Nothing matches these dates. Try a longer period." : "Nothing is waiting."}
                    action={def.key === "pending-expenses" ? <Link href={`${BASE}/expenses`} className={buttonClass("secondary")}><Words k="Open Expenses" /></Link> : undefined} />
                ) : (
                  <SimpleTable minWidth={Math.max(460, r.columns.length * 120)} caption={def.label} rows={shown}
                    cols={r.columns.map((c) => ({ label: c.label, right: c.kind === "money" || c.kind === "number", render: (row: Record<string, unknown>) => cellText(row[c.key] as never, c.kind) }))}
                    foot={r.totals ? r.columns.map((c) => cellText((r.totals?.[c.key] ?? null) as never, c.kind)) : undefined} />
                )}
                {(r.note || r.rows.length > SHOW || p.payHeads) && !before && (
                  <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">
                    {r.rows.length > SHOW && `Showing the first ${SHOW} of ${r.rows.length} rows; the total line and the export have all of them. `}{r.note}{p.payHeads ? `${r.note ? " " : ""}Staff pay is not shown to your role.` : ""}
                  </p>
                )}
              </Card>
            </Stack>
          )}
        </ReportsFrame>
      )}
    </div>
  );
}
