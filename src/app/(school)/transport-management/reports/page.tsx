import { AlertTriangle, BadgeIndianRupee, Bus, CalendarCheck, Clock, FileWarning, Fuel, Timer, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { TR_REPORTS, type TrReportKey } from "@/lib/transport/reports";
import type { Cell, Column, Row, Table } from "@/lib/reports/types";
import { Card, CardHeader } from "@/components/ui/card";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { ReportsFrame } from "@/components/list/reports-frame";
import { Empty, SimpleTable, Stats } from "@/components/money/kit";
import { TrHead } from "../_components/head";
import { BASE, one, qs, trGuard, trPeriod, type SearchParams } from "../_lib/page";

export const metadata = { title: "Transport Reports" };

const HREF = `${BASE}/reports`;
const ICONS: Record<TrReportKey, typeof Bus> = { "tr-trips": CalendarCheck, "tr-timings": Timer, "tr-usage": Users, "tr-costs": Fuel, "tr-fees": BadgeIndianRupee, "tr-papers": FileWarning, "tr-alerts": AlertTriangle };
const GROUP: Record<TrReportKey, string> = { "tr-trips": "Trips and timings", "tr-timings": "Trips and timings", "tr-alerts": "Trips and timings", "tr-usage": "Students and fees", "tr-fees": "Students and fees", "tr-costs": "Vehicles", "tr-papers": "Vehicles" };

function cellText(c: Column, v: Cell): React.ReactNode {
  if (v == null || v === "") return <span className="text-ink3">—</span>;
  if (c.kind === "money" && typeof v === "bigint") return formatRupees(v);
  if (c.kind === "date" && v instanceof Date) return formatDate(v);
  if (c.kind === "percent" && typeof v === "number") return `${v}%`;
  if (typeof v === "number") return v.toLocaleString("en-IN");
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return formatDate(v);
  return v;
}

/** Transport Reports (12 §7): trips, timings, usage, costs, fees, papers and alerts. The same reports are in Reports & Analytics. */
export default async function TransportReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("reports");
  const sp = await searchParams;
  const visible = TR_REPORTS.filter((r) => r.key !== "tr-fees" || p.current.permissions["fee-management"]?.see === "all");
  const chosen = visible.find((r) => r.key === one(sp.r)) ?? visible[0];
  const period = trPeriod(sp, p.dates, chosen.key === "tr-fees" ? "finyear" : "last30");
  const range = chosen.dated ? period.range : null;

  const { table, head } = await withSchool(p.current.ctx, async (tx) => {
    const input = { tx, range, tz: p.tz, today: p.today, lateAfterMin: p.settings.lateAfterMin };
    const table: Table = await chosen.run(input);
    // The numbers at the top, for the same dates.
    const r30 = period.range;
    const [trips, alerts, students, costs] = await Promise.all([
      r30 ? tx.trip.groupBy({ by: ["status"], where: { date: { gte: new Date(`${r30.from}T00:00:00Z`), lte: new Date(`${r30.to}T00:00:00Z`) } }, _count: { _all: true } }) : Promise.resolve([]),
      r30 ? tx.transportAlert.count({ where: { at: { gte: new Date(`${r30.from}T00:00:00Z`), lte: new Date(`${r30.to}T23:59:59Z`) } } }) : Promise.resolve(0),
      tx.transportAssignment.count({ where: { status: "ACTIVE", fromDate: { lte: p.today }, OR: [{ toDate: null }, { toDate: { gte: p.today } }] } }),
      r30 ? Promise.all([
        tx.fuelLog.aggregate({ where: { cancelledAt: null, date: { gte: new Date(`${r30.from}T00:00:00Z`), lte: new Date(`${r30.to}T00:00:00Z`) } }, _sum: { amountPaise: true } }),
        tx.maintenanceLog.aggregate({ where: { cancelledAt: null, date: { gte: new Date(`${r30.from}T00:00:00Z`), lte: new Date(`${r30.to}T00:00:00Z`) } }, _sum: { amountPaise: true } }),
      ]) : Promise.resolve(null),
    ]);
    const n = (s: string) => trips.find((t) => t.status === s)?._count._all ?? 0;
    const cost = costs ? (costs[0]._sum.amountPaise ?? BigInt(0)) + (costs[1]._sum.amountPaise ?? BigInt(0)) : null;
    return { table, head: { completed: n("COMPLETED"), cancelled: n("CANCELLED"), alerts, students, cost } };
  });

  const keep = chosen.dated ? period.keep : {};
  const exportHref = qs(`${BASE}/export`, { list: "report", r: chosen.key, ...keep });
  return (
    <div>
      <TrHead page="reports" sub={`${period.label} · the same reports are in Reports & Analytics`} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Stats items={[
          { label: "Trips completed", value: head.completed, icon: CalendarCheck, sub: head.cancelled ? `${head.cancelled} cancelled` : period.label },
          { label: "Students on the buses", value: head.students, icon: Users, sub: "today" },
          { label: "Fuel and repairs", value: head.cost != null ? formatRupees(head.cost) : "—", icon: Fuel, sub: period.label },
          { label: "Alerts", value: head.alerts, icon: AlertTriangle, sub: period.label, tone: head.alerts ? "warn" : undefined },
        ]} />
        <ReportsFrame active={chosen.key} reports={visible.map((r) => ({ key: r.key, group: GROUP[r.key], name: r.name, sub: r.sub, icon: ICONS[r.key], href: qs(HREF, { r: r.key, ...period.keep }) }))}>
          <Card className="overflow-hidden">
            <CardHeader title={chosen.name} description={chosen.dated ? `${chosen.sub} · ${period.label}` : `${chosen.sub} · as on ${formatDate(p.today)}`} icon={ICONS[chosen.key] ?? Clock}
              action={p.can.export ? <ExportButton href={exportHref} size="sm" /> : undefined} />
            {chosen.dated && <div className="px-5 pb-3"><PeriodFilter {...p.dates} fallback={chosen.key === "tr-fees" ? "finyear" : "last30"} size="sm" /></div>}
            {table.rows.length === 0 ? <Empty icon={ICONS[chosen.key] ?? Clock} title="Nothing to show" body={table.empty ?? (chosen.dated ? `Nothing ${period.label.toLowerCase()}.` : "Nothing yet.")} /> : (
              <SimpleTable rows={table.rows} rowKey={(_, i) => i} caption={chosen.name} minWidth={Math.max(560, table.columns.length * 120)}
                cols={table.columns.map((c) => ({ label: c.label, right: c.kind === "number" || c.kind === "money" || c.kind === "percent", nowrap: c.kind === "money" || c.kind === "date", render: (r: Row) => cellText(c, r[c.key] ?? null) }))}
                foot={table.totals ? table.columns.map((c) => cellText(c, table.totals![c.key] ?? null)) : undefined} />
            )}
            {table.note && <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">{table.note}</p>}
          </Card>
        </ReportsFrame>
      </div>
    </div>
  );
}
