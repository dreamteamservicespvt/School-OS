import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";
import { QUERY_STATUS_LABEL, QUERY_TYPE_LABEL, queryWhere } from "@/lib/communication/queries";
import { QUERY_FILTERS, queryLabels, queryListWhere } from "@/lib/communication/query-list";
import type { QueryType } from "@/lib/messaging/settings";
import type { Query } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Queries report (P8): internal notes are never exported. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("communication", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export queries.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), QUERY_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const full = reachFor(current.permissions, "communication", "view") === "all";
  const data = await withSchool(current.ctx, async (tx) => {
    const rows = await tx.query.findMany({ where: queryListWhere(await queryWhere(tx, current.ctx, full ? "all" : "own"), current.ctx, params), orderBy: { createdAt: "desc" }, take: 10000 });
    const labels = await queryLabels(tx, rows);
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ") || "Open and In progress";
    await logExport(tx, current.ctx, { title: "Queries", format, filters, rows: rows.length });
    return { rows, labels, filters };
  });
  const L = data.labels;
  const columns: ExportColumn<Query>[] = [
    { label: "Ticket", value: (q) => q.number },
    { label: "From", value: (q) => q.fromName },
    { label: "About", value: (q) => L.about(q) },
    { label: "Topic", value: (q) => L.topic(q) },
    { label: "Type", value: (q) => QUERY_TYPE_LABEL[q.type as QueryType] ?? q.type },
    { label: "Priority", value: (q) => q.priority },
    { label: "Owner", value: (q) => L.owner(q) },
    { label: "Status", value: (q) => QUERY_STATUS_LABEL[q.status] },
    { label: "Logged", value: (q) => formatDateTime(q.createdAt, tz) },
    { label: "Due by", value: (q) => (q.dueBy ? formatDateTime(q.dueBy, tz) : "") },
    { label: "Resolved", value: (q) => (q.resolvedAt ? formatDateTime(q.resolvedAt, tz) : "") },
    { label: "Rating", value: (q) => q.rating ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Queries", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
