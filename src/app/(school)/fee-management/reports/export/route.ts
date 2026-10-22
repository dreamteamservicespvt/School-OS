import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { currentYear } from "@/lib/academic/years";
import { personCampusId } from "@/lib/campus";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { todayIn } from "@/lib/staff/dates";
import { feePageAllowed, feeViewer } from "@/lib/fees/access";
import { cellText, FEE_REPORTS, findFeeReport, type Cell } from "@/lib/fees/reports";
import { reportFilter } from "@/lib/fees/report-params";
import { periodSetup } from "@/lib/period-setup";

export const dynamic = "force-dynamic";

/** One Fee Report with the filters on screen (P8), with its total line. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("fee-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export fee reports.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const format = (["csv", "xlsx", "pdf"].includes(sp.format) ? sp.format : "xlsx") as ExportFormat;
  const def = findFeeReport(sp.r ?? "") ?? FEE_REPORTS[0];
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const dates = await periodSetup(current);
  const data = await withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (!feePageAllowed(viewer, "reports") || viewer.see !== "all") return null;
    // "This year so far" is the person's own campus's current year, as on the screen.
    const year = await currentYear(tx, current.ctx, await personCampusId(tx, current.ctx, current));
    const { f, range } = reportFilter(sp, { ...dates, today, yearStart: year?.startDate ?? null });
    const result = await def.run(tx, current.ctx, f, viewer);
    const words = [
      def.filters.includes("dates") ? (range ? range.label : `${formatDate(f.from)} to ${formatDate(f.to)}`) : `As on ${formatDate(today)}`,
      f.classId && "one class", f.feeHeadId && "one fee head", f.mode && `mode ${f.mode}`, f.collectorId && "one collector",
    ].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: def.label, format, filters: words, rows: result.rows.length });
    return { result, words };
  });
  if (!data) return new Response("Your role does not see fee reports.", { status: 403 });
  const { result } = data;
  const rows: Record<string, Cell>[] = result.totals ? [...result.rows, result.totals] : result.rows;
  const columns: ExportColumn<Record<string, Cell>>[] = result.columns.map((c) => ({ label: c.label, value: (r) => cellText(r[c.key] ?? null, c.kind) }));
  return exportResponse(await buildExport(format, columns, rows, { title: def.label, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters: data.words + (result.note ? ` · ${result.note}` : "") }));
}
