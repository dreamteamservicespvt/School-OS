import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { ruleDef } from "@/lib/messaging/automatic";
import { LOG_FILTERS, logWhere, OUTCOME_LABEL } from "@/lib/communication/automation-log";
import type { AutomationLog } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Automation log (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("communication", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export the automation log.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), LOG_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const rows = await tx.automationLog.findMany({ where: logWhere(current.ctx, params), orderBy: { createdAt: "desc" }, take: 20000 });
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ") || "Everything";
    await logExport(tx, current.ctx, { title: "Automation log", format, filters, rows: rows.length });
    return { rows, filters };
  });
  const columns: ExportColumn<AutomationLog>[] = [
    { label: "When", value: (r) => formatDateTime(r.createdAt, tz) },
    { label: "Rule", value: (r) => ruleDef(r.ruleKey)?.label ?? r.ruleKey },
    { label: "Event", value: (r) => r.eventLabel },
    { label: "To", value: (r) => r.recipientName },
    { label: "Outcome", value: (r) => OUTCOME_LABEL[r.outcome] ?? r.outcome },
    { label: "Note", value: (r) => r.note ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Automation log", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
