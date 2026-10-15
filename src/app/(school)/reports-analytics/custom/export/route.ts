// Export of the custom report preview: every row, with only the fields the
// person may see, the filters on top. Logged in the export log.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { todayFor } from "@/lib/periods";
import { reportAccess } from "@/lib/reports/access";
import { AREAS, CustomProblem, cleanSpec, runCustom, specWords } from "@/lib/reports/custom";
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
  if (!reportAccess(current).pages.custom) return plain("Custom & Scheduled Reports are not open to your role.", 403);
  const u = new URL(req.url).searchParams;
  const format = (["csv", "xlsx", "pdf"].includes(u.get("format") ?? "") ? u.get("format") : "xlsx") as ExportFormat;
  try {
    const file = await withSchool(current.ctx, async (tx) => {
      const spec = cleanSpec({ area: u.get("area") ?? "", columns: u.getAll("col"), classId: u.get("class"), show: u.get("show") ?? "all", group: u.get("group") ?? "none", totals: u.get("nototals") !== "1" }, current);
      const t = await runCustom(tx, current, spec, todayFor(current.school.timeZone));
      const words = await specWords(tx, spec);
      const title = `Custom report: ${AREAS[spec.area].label}`;
      await logExport(tx, current.ctx, { title, format, filters: words, rows: t.rows.length });
      const rows: Row[] = t.totals ? [...t.rows, t.totals] : t.rows;
      return buildExport(format, t.columns.map((c) => ({ label: c.label, value: (r: Row) => cellText(r[c.key], c.kind) })), rows, { title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: words });
    }, { timeout: 60_000 });
    return exportResponse(file);
  } catch (e) {
    if (e instanceof CustomProblem) return plain(e.message, 400);
    throw e;
  }
}
