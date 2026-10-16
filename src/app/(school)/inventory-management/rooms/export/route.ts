// Maintenance requests for the filters and dates on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { MAINT_STATUS, PRIORITY } from "@/lib/inventory/words";
import { invRoute, rangeWords } from "../../_lib/route";
import { maintList, readMaintFilter } from "../../_lib/lists";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await invRoute(req, "rooms");
  if (x instanceof Response) return x;
  const range = await x.range(null);
  const f = readMaintFilter(x.get, range);
  const out = await withSchool(x.current.ctx, async (tx) => {
    const list = await maintList(tx, f, x.tz);
    const room = f.room ? (await tx.room.findFirst({ where: { id: f.room }, select: { name: true } }))?.name : "";
    const status = f.status === "open" ? "Open and in progress" : f.status ? MAINT_STATUS[f.status as "OPEN"].label : "";
    const filters = [range ? `Raised: ${rangeWords(range)}` : "", status ? `Status: ${status}` : "", f.priority ? `Priority: ${PRIORITY[f.priority as "LOW"].label}` : "", room ? `Place: ${room}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Maintenance requests", format: x.format, filters, rows: list.rows.length });
    return { ...list, filters };
  }, { timeout: 60_000 });
  type R = (typeof out.rows)[number];
  const columns: ExportColumn<R>[] = [
    { label: "Number", value: (r) => r.number },
    { label: "Raised", value: (r) => formatDateTime(r.raisedAt, x.tz) },
    { label: "Raised by", value: (r) => out.who.get(r.raisedById ?? "") ?? "" },
    { label: "Place", value: (r) => out.rooms.get(r.roomId) ?? "" },
    { label: "Asset", value: (r) => (r.assetId ? `${out.assets.get(r.assetId)?.tag ?? ""} ${out.assets.get(r.assetId)?.name ?? ""}`.trim() : "") },
    { label: "Problem", value: (r) => r.problem },
    { label: "Priority", value: (r) => PRIORITY[r.priority].label },
    { label: "Technician", value: (r) => (r.technicianStaffId ? out.techs.get(r.technicianStaffId) ?? "" : r.technicianName ?? "") },
    { label: "Status", value: (r) => MAINT_STATUS[r.status].label },
    { label: "Done on", value: (r) => (r.doneOn ? formatDate(r.doneOn, "UTC") : "") },
    { label: "Cost", value: (r) => (r.costPaise !== null ? formatRupees(r.costPaise) : "") },
  ];
  return exportResponse(await buildExport(x.format, columns, out.rows, { title: "Maintenance requests", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: out.filters }));
}
