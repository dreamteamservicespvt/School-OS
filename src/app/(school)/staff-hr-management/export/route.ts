// Staff List export (P8): Excel, CSV or PDF with the filters on screen. Only
// fields everyone with the list may see; restricted fields are never exported.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { readListParams } from "@/lib/list";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { viewerFor } from "@/lib/staff/access";
import { describeFilters, STAFF_FILTERS, staffOrder, staffWhere } from "@/lib/staff/list";
import { statusLabel } from "@/lib/staff/settings";

export async function GET(req: Request) {
  const { current } = await requireAction("staff-hr-management", "export");
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const params = readListParams(Object.fromEntries(url.searchParams.entries()), STAFF_FILTERS);
  const tz = current.school.timeZone;
  return withSchool(current.ctx, async (tx) => {
    const viewer = await viewerFor(tx, current.ctx, current);
    const rows = await tx.staff.findMany({ where: staffWhere(params, viewer), orderBy: staffOrder(params), take: 5000, include: { department: { select: { name: true } } } });
    const [departments, campuses] = await Promise.all([tx.department.findMany({ select: { id: true, name: true } }), tx.campus.findMany({ select: { id: true, name: true } })]);
    const filters = describeFilters(params, { departments: new Map(departments.map((d) => [d.id, d.name])), campuses: new Map(campuses.map((c) => [c.id, c.name])) });
    type Row = (typeof rows)[number];
    const file = await buildExport<Row>(format, [
      { label: "Staff ID", value: (r) => r.staffCode },
      { label: "Name", value: (r) => r.fullName },
      { label: "Designation", value: (r) => r.designation },
      { label: "Department", value: (r) => r.department?.name ?? "" },
      { label: "Phone", value: (r) => r.phone },
      { label: "Email", value: (r) => r.email ?? "" },
      { label: "Employment type", value: (r) => r.employmentType },
      { label: "Joining date", value: (r) => formatDate(r.joiningDate, tz) },
      { label: "Status", value: (r) => statusLabel(r.status) },
    ], rows, { title: "Staff List", schoolName: current.school.name, filters, exportedBy: current.user.displayName, timeZone: tz });
    await logExport(tx, current.ctx, { title: "Staff List", format, filters, rows: rows.length });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
