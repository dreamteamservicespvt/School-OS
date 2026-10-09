import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import type { CreditLedgerEntry } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Credit history (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("settings", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export credit history.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), ["channel"]);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const ch = params.filters.channel;
    const rows = await tx.creditLedgerEntry.findMany({
      where: { schoolId: current.ctx.schoolId, ...(ch === "whatsapp" || ch === "sms" ? { channel: ch } : {}), ...(params.q ? { note: { contains: params.q, mode: "insensitive" as const } } : {}) },
      orderBy: { createdAt: "desc" }, take: 50000,
    });
    const filters = [params.q && `search "${params.q}"`, ch && `channel: ${ch}`].filter(Boolean).join(", ") || "All credits";
    await logExport(tx, current.ctx, { title: "Credit history", format, filters, rows: rows.length });
    return { rows, filters };
  });
  const columns: ExportColumn<CreditLedgerEntry>[] = [
    { label: "When", value: (r) => formatDateTime(r.createdAt, tz) },
    { label: "Channel", value: (r) => (r.channel === "sms" ? "SMS" : "WhatsApp") },
    { label: "Credits", value: (r) => r.amount },
    { label: "Note", value: (r) => r.note },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Credit history", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
