// "Export the chart data" and "Export these" on Analytics: the same rows as the
// chart or the list behind a number, with the dates and filters on top. Logged.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodSetup } from "@/lib/period-setup";
import { rangeWords, todayFor } from "@/lib/periods";
import { reportAccess } from "@/lib/reports/access";
import { AREA_LABEL, analyticsQuery, loadArea } from "@/lib/reports/analytics";
import { cellText } from "@/lib/reports/run";
import type { Row } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("reports-analytics", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to export reports.", 403);
    throw e;
  }
  const a = reportAccess(current);
  if (!a.pages.analytics) return plain("Analytics is not open to your role.", 403);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const format = (["csv", "xlsx", "pdf"].includes(sp.format) ? sp.format : "xlsx") as ExportFormat;
  const setup = await periodSetup(current);
  const q = analyticsQuery(current, sp, setup, a);
  const chartKey = sp.chart ?? "";
  const drillKey = sp.drill ?? "";
  const area = chartKey ? q.areas.find((x) => x === chartKey.split(".")[0]) : q.area;
  if (!area) return plain("This chart is not open to your role.", 403);
  const tz = current.school.timeZone;
  const out = await withSchool(current.ctx, async (tx) => {
    const view = await loadArea({ tx, who: current, range: q.range, setup, today: todayFor(tz), campusId: q.both ? null : q.campusId, compare: q.compare }, area, { exam: q.exam });
    const chart = chartKey ? view.charts.find((c) => c.key === chartKey) : null;
    const drill = !chart && drillKey ? view.drills[drillKey] : null;
    const table = chart?.data ?? drill?.table ?? null;
    if (!table) return null;
    const title = `${AREA_LABEL[area]}: ${chart?.title ?? drill?.title}`;
    const filters = `${q.range.label} (${rangeWords(q.range.from, q.range.to)})${q.compare ? ", with the same dates last year" : ""}`;
    await logExport(tx, current.ctx, { title, format, filters, rows: table.rows.length });
    const rows: Row[] = table.totals ? [...table.rows, table.totals] : table.rows;
    return buildExport(format, table.columns.map((c) => ({ label: c.label, value: (r: Row) => cellText(r[c.key], c.kind) })), rows, { title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters });
  }, { timeout: 60_000 });
  if (!out) return plain("This chart was not found.", 404);
  return exportResponse(out);
}
