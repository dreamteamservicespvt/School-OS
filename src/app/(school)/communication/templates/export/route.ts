import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { categoryLabel, languageLabel } from "@/lib/messaging/templates";
import { ruleTemplateIds, TEMPLATE_FILTERS, templateWhere, usedBy, WHATSAPP_STATUS_LABEL } from "@/lib/communication/templates-admin";

export const dynamic = "force-dynamic";

/** Message Templates list (P8): one row per template language. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("communication", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export templates.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), TEMPLATE_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const data = await withSchool(current.ctx, async (tx) => {
    const templates = await tx.template.findMany({ where: templateWhere(current.ctx, params), orderBy: [{ category: "asc" }, { name: "asc" }], include: { versions: { where: { isCurrent: true }, orderBy: { language: "asc" } } }, take: 5000 });
    const firstIds = await ruleTemplateIds(tx, current.ctx);
    const rows = templates.flatMap((t) => t.versions.map((v) => ({ t, v, used: usedBy(t, firstIds, t.id).join(", ") })));
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ") || "All templates";
    await logExport(tx, current.ctx, { title: "Message Templates", format, filters, rows: rows.length });
    return { rows, filters };
  });
  type Row = (typeof data.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Name", value: (r) => r.t.name },
    { label: "Category", value: (r) => categoryLabel(r.t.category) },
    { label: "Channel", value: (r) => CHANNEL_LABEL[r.t.channel as Channel] ?? r.t.channel },
    { label: "Language", value: (r) => languageLabel(r.v.language) },
    { label: "Version", value: (r) => r.v.version },
    { label: "WhatsApp status", value: (r) => (r.t.channel === "whatsapp" ? WHATSAPP_STATUS_LABEL[r.v.whatsappStatus ?? "NOT_SUBMITTED"] : "") },
    { label: "DLT template ID", value: (r) => (r.t.channel === "sms" ? r.v.dltTemplateId ?? "Missing" : "") },
    { label: "Used by", value: (r) => r.used },
    { label: "Text", value: (r) => r.v.body },
    { label: "Changed", value: (r) => formatDate(r.v.createdAt, current.school.timeZone) },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Message Templates", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: current.school.timeZone }));
}
