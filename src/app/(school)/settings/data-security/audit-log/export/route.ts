// The filtered audit log as Excel, CSV or PDF. The export itself is written
// to the export log.
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { can, reachFor } from "@/lib/permissions";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { actionWords, auditWhere, describeDevice, filterWords, readAuditFilters } from "@/lib/data-security/audit-view";

export const dynamic = "force-dynamic";

/** At most this many lines in one file; narrow the filters for more. */
const MAX_ROWS = 20_000;

export async function GET(request: Request) {
  const current = await getCurrent();
  if (!current) return new Response("Sign in first.", { status: 401 });
  if (!can(current.permissions, "settings", "export")) return new Response("Your role does not allow exports. Ask your School Admin.", { status: 403 });
  const url = new URL(request.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const f = readAuditFilters(Object.fromEntries(url.searchParams));
  const tz = current.school.timeZone;
  const reach = reachFor(current.permissions, "settings", "view");
  try {
    const file = await withSchool(current.ctx, async (tx) => {
      const rows = await tx.auditLogEntry.findMany({ where: auditWhere(f, reach, current.user.id, tz), orderBy: { at: "desc" }, take: format === "pdf" ? 2000 : MAX_ROWS });
      const people = await tx.schoolAccess.findMany({ select: { userLogin: { select: { id: true, displayName: true } } } });
      const names = new Map(people.map((p) => [p.userLogin.id, p.userLogin.displayName]));
      const filters = filterWords(f, names);
      const out = await buildExport(format, [
        { label: "When", value: (r) => formatDateTime(r.at, tz) },
        { label: "Person", value: (r) => (r.userLoginId ? names.get(r.userLoginId) ?? r.userLoginId : r.actorNote ?? "School OS") },
        { label: "Action", value: (r) => actionWords(r.action) },
        { label: "Record type", value: (r) => r.recordType },
        { label: "Record ID", value: (r) => r.recordId },
        { label: "Before", value: (r) => (r.before === null ? "" : JSON.stringify(r.before)) },
        { label: "After", value: (r) => (r.after === null ? "" : JSON.stringify(r.after)) },
        { label: "Device", value: (r) => (r.device ? describeDevice(r.device) : "") },
        { label: "IP address", value: (r) => r.ipAddress },
      ], rows, { title: "Audit log", schoolName: current.school.name, filters, exportedBy: current.user.displayName, timeZone: tz });
      await logExport(tx, current.ctx, { title: "Audit log", format, filters, rows: rows.length });
      return out;
    }, { timeout: 60_000 });
    return exportResponse(file);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "audit-export", error: e instanceof Error ? e.message : String(e) }));
    return new Response("The export could not be made right now. Please try again in a minute.", { status: 503 });
  }
}
