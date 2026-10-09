import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/communication/notices";
import { NOTICE_FILTERS, noticeCounts, noticeWhere } from "@/lib/communication/notice-list";
import type { Notice } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Notice read and acknowledgement report (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("communication", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export notices.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), NOTICE_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const full = reachFor(current.permissions, "communication", "view") === "all";
  const data = await withSchool(current.ctx, async (tx) => {
    const rows = await tx.notice.findMany({ where: noticeWhere(current.ctx, full, params), orderBy: { createdAt: "desc" }, take: 10000 });
    const counts = await noticeCounts(tx, rows.map((r) => r.id));
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Notices", format, filters, rows: rows.length });
    return { rows, counts, filters };
  });
  const c = (n: Notice) => data.counts.get(n.id)!;
  const columns: ExportColumn<Notice>[] = [
    { label: "Title", value: (n) => n.title },
    { label: "Audience", value: (n) => n.audienceLabel },
    { label: "Priority", value: (n) => PRIORITY_LABEL[n.priority] },
    { label: "Status", value: (n) => STATUS_LABEL[n.status] },
    { label: "Published", value: (n) => (n.publishedAt ? formatDate(n.publishedAt, tz) : "") },
    { label: "Expires", value: (n) => (n.expiresOn ? formatDate(n.expiresOn, "UTC") : "") },
    { label: "Staff and students", value: (n) => n.staffCount },
    { label: "Read", value: (n) => c(n).read },
    { label: "Acknowledged", value: (n) => (n.askAck ? c(n).acknowledged : "") },
    { label: "Parents", value: (n) => n.guardianCount },
    { label: "Seen by parents", value: (n) => c(n).seen },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Notices", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
