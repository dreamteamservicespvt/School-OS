import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";
import { childrenByGuardian, LINK_FILTERS, linkListWhere } from "@/lib/communication/parent-link-admin";
import { maskPhone } from "@/lib/parent-link/links";

export const dynamic = "force-dynamic";

/** Parent Links list (P8). Links themselves are never exported; only their status. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("communication", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export Parent Links.", { status: 403 });
    throw e;
  }
  if (reachFor(current.permissions, "communication", "create") !== "all") return new Response("Only the Principal and School Admin can export Parent Links.", { status: 403 });
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), LINK_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const now = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    const links = await tx.parentLink.findMany({ where: await linkListWhere(tx, current.ctx, params, now), orderBy: { createdAt: "desc" }, take: 10000, include: { devices: { where: { revokedAt: null, expiresAt: { gt: now } }, select: { id: true } } } });
    const guardians = await tx.guardian.findMany({ where: { id: { in: links.map((l) => l.guardianId) } }, select: { id: true, name: true, phone: true } });
    const kids = await childrenByGuardian(tx, current.ctx, links.map((l) => l.guardianId));
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ") || "All links";
    await logExport(tx, current.ctx, { title: "Parent Links", format, filters, rows: links.length });
    const g = new Map(guardians.map((x) => [x.id, x]));
    return { rows: links.map((l) => ({ l, g: g.get(l.guardianId), kids: kids.get(l.guardianId) ?? [] })), filters };
  });
  type Row = (typeof data.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Guardian", value: (r) => r.g?.name ?? "" },
    { label: "Mobile", value: (r) => maskPhone(r.g?.phone ?? "") },
    { label: "Children", value: (r) => r.kids.map((k) => `${k.name}${k.classLabel ? ` (${k.classLabel})` : ""}`).join(", ") },
    { label: "Status", value: (r) => (r.l.status === "ACTIVE" ? "Active" : "Revoked") },
    { label: "Created on", value: (r) => formatDate(r.l.createdAt, tz) },
    { label: "Last opened", value: (r) => (r.l.lastOpenedAt ? formatDateTime(r.l.lastOpenedAt, tz) : "Never") },
    { label: "Phones verified", value: (r) => r.l.devices.length },
    { label: "Revoke reason", value: (r) => r.l.revokeReason ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Parent Links", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
