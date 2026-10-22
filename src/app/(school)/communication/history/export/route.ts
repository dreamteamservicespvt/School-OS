import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";
import { CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { CODE_HIDDEN_LABEL, isCodeMessage } from "@/lib/messaging/one-time-code";
import { countsFor, HISTORY_FILTERS, historyWhere, messageCampusWhere, MESSAGE_STATUS_LABEL, senderNames, senderWords, type Counts } from "@/lib/communication/history";

export const dynamic = "force-dynamic";

/** Message History export (P8) with the filters on screen. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("communication", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export messages.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), HISTORY_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const full = reachFor(current.permissions, "communication", "view") === "all";
  type Row = { m: Awaited<ReturnType<typeof load>>["rows"][number]; c: Counts; by: string };
  async function load() {
    return withSchool(current!.ctx, async (tx) => {
      // A person limited to one campus gets the messages about their campus only.
      const rows = await tx.message.findMany({ where: { AND: [historyWhere(current!.ctx, full, params, tz), await messageCampusWhere(tx, current!.ctx, current!.campusId)] }, orderBy: { createdAt: "desc" }, take: 10000 });
      const counts = await countsFor(tx, current!.ctx, rows.map((r) => r.id));
      const names = await senderNames(tx, rows.map((r) => r.sentById));
      const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ");
      await logExport(tx, current!.ctx, { title: "Message History", format, filters, rows: rows.length });
      return { rows, counts, names, filters };
    });
  }
  const data = await load();
  const rows: Row[] = data.rows.map((m) => ({
    m,
    c: data.counts.get(m.id)!,
    by: senderWords(m, data.names),
  }));
  const columns: ExportColumn<Row>[] = [
    { label: "Date and time", value: (r) => formatDateTime(r.m.createdAt, tz) },
    { label: "Title or template", value: (r) => r.m.title ?? r.m.trigger ?? (isCodeMessage(r.m) ? CODE_HIDDEN_LABEL : r.m.body.slice(0, 80)) },
    { label: "Audience", value: (r) => r.m.audienceLabel },
    { label: "Sent by", value: (r) => r.by },
    { label: "Channel", value: (r) => r.m.channels.map((c) => CHANNEL_LABEL[c as Channel] ?? c).join(", ") },
    { label: "Recipients", value: (r) => r.m.recipientCount },
    { label: "Delivered", value: (r) => r.c.delivered },
    { label: "Test mode (not sent)", value: (r) => r.c.testMode },
    { label: "Read", value: (r) => r.c.read },
    { label: "Failed", value: (r) => r.c.failed },
    { label: "SMS backup", value: (r) => r.c.backup },
    { label: "Credits", value: (r) => r.m.creditCost },
    { label: "Status", value: (r) => MESSAGE_STATUS_LABEL[r.m.status] },
  ];
  return exportResponse(await buildExport(format, columns, rows, { title: "Message History", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
