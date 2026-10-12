import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { todayIn } from "@/lib/staff/dates";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch } from "@/lib/periods";
import { cellText, type Cell } from "@/lib/fees/reports";
import { FINANCE_REPORTS, type FinanceFilter } from "@/lib/finance/reports";
import { financeLevel, financePageAllowed, hiddenPayHeads } from "@/lib/finance/access";
import { financeFeaturesOn } from "@/lib/finance/settings";
import { chosenFinancialYear } from "@/lib/finance/years";

export const dynamic = "force-dynamic";

/** One Finance Report with the year and dates on screen (P8), with its total line. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export finance reports.", { status: 403 });
    throw e;
  }
  if (!financePageAllowed(current.permissions, "reports")) return new Response("Your role does not see Finance Reports.", { status: 403 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const format = (["csv", "xlsx", "pdf"].includes(sp.format) ? sp.format : "xlsx") as ExportFormat;
  const full = financeLevel(current.permissions) === "full";
  const def = FINANCE_REPORTS.find((r) => r.key === sp.r && (full || !r.fullOnly)) ?? FINANCE_REPORTS[0];
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const range = periodFromSearch(sp, { ...(await periodSetup(current)), fallback: null });
  const data = await withSchool(current.ctx, async (tx) => {
    if (def.feature && !(await financeFeaturesOn(tx, current.ctx)).has(def.feature)) return null;
    const fy = await chosenFinancialYear(tx, current.ctx, sp.fy, today);
    const end = fy.endDate < today ? fy.endDate : today;
    const pick = (d: string | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);
    const rf = pick(range?.from), rt = pick(range?.to);
    const from = rf && rf > fy.startDate ? rf : fy.startDate;
    const to0 = rt && rt < end ? rt : end;
    const to = to0 < from ? from : to0;
    const by = (["vendor", "month", "approver"] as const).find((b) => b === sp.by) ?? "head";
    const f: FinanceFilter = { financialYearId: fy.id, yearStart: fy.startDate, from, to, group: sp.group === "day" ? "day" : "month", by, today, hidePay: await hiddenPayHeads(tx, current.permissions) };
    const result = await def.run(tx, current.ctx, f);
    const words = [def.filters.includes("dates") ? `${formatDate(from)} to ${formatDate(to)}` : `As on ${formatDate(today)}`, `financial year ${fy.name}`, f.hidePay ? "staff pay not shown" : null].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: def.label, format, filters: words, rows: result.rows.length });
    return { result, words };
  });
  if (!data) return new Response("This report is switched off in Finance Settings.", { status: 404 });
  const { result } = data;
  const rows: Record<string, Cell>[] = result.totals ? [...result.rows, result.totals] : result.rows;
  const columns: ExportColumn<Record<string, Cell>>[] = result.columns.map((c) => ({ label: c.label, value: (r) => cellText(r[c.key] ?? null, c.kind) }));
  return exportResponse(await buildExport(format, columns, rows, { title: def.label, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters: data.words + (result.note ? ` · ${result.note}` : "") }));
}
