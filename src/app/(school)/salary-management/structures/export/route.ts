import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { salaryLevel } from "@/lib/salary/access";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** Salary structures in force today, with the filters on screen (P8). Full Salary Management only. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("salary-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export salary.", { status: 403 });
    throw e;
  }
  if (salaryLevel(current.permissions) !== "full") return new Response("Only salary staff can export salary structures.", { status: 403 });
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const q = g("q").trim().toLowerCase().slice(0, 80);
  const dept = UUID.test(g("dept")) ? g("dept") : null;
  const today = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, ...(dept ? { departmentId: dept } : {}) }, orderBy: { staffCode: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true } });
    const all = await tx.salaryStructure.findMany({ where: { archivedAt: null, staffId: { in: staff.map((s) => s.id) } }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
    const rows = staff.filter((s) => !q || [s.fullName, s.staffCode, s.designation].some((x) => x.toLowerCase().includes(q)))
      .map((s) => ({ s, c: all.find((v) => v.staffId === s.id && v.effectiveFrom <= today) ?? all.find((v) => v.staffId === s.id) ?? null }));
    const words = [q && `search "${q}"`, dept && "one department"].filter(Boolean).join(", ") || "All staff";
    await logExport(tx, current.ctx, { title: "Salary structures", format, filters: words, rows: rows.length });
    return { rows, words };
  });
  type R = (typeof data.rows)[number];
  const columns: ExportColumn<R>[] = [
    { label: "Staff ID", value: (r) => r.s.staffCode }, { label: "Staff member", value: (r) => r.s.fullName }, { label: "Designation", value: (r) => r.s.designation },
    { label: "Version", value: (r) => (r.c ? `v${r.c.version}` : "No structure") }, { label: "From", value: (r) => (r.c ? formatDate(r.c.effectiveFrom) : "") },
    { label: "Gross a month", value: (r) => (r.c ? formatRupees(r.c.grossPaise) : "") }, { label: "TDS a month", value: (r) => (r.c ? formatRupees(r.c.tdsPaise) : "") },
    { label: "PF", value: (r) => (r.c ? (r.c.pfApplies ? "Yes" : "No") : "") }, { label: "ESI", value: (r) => (r.c ? (r.c.esiApplies ? "Yes" : "No") : "") }, { label: "Reason", value: (r) => r.c?.reason ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Salary structures", schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: data.words }));
}
