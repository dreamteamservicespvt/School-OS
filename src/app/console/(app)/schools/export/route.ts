// Schools list export (P8): the filters on screen, counts only, never a
// student's name, a fee or a salary. Each export is a line in the Activity Log.
import { requireConsole } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { buildExport, exportResponse, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { logActivity } from "@/lib/console/activity";
import { CONSOLE_TZ, describeSchoolFilters, filterChoices, listSchools, readSchoolFilters, type SchoolRow } from "@/lib/console/list";

export async function GET(req: Request) {
  const c = await requireConsole();
  const url = new URL(req.url);
  const raw = url.searchParams.get("format");
  const format: ExportFormat = raw === "csv" || raw === "pdf" ? raw : "xlsx";
  const f = readSchoolFilters(Object.fromEntries(url.searchParams.entries()));
  const [data, choices] = await Promise.all([listSchools(f, new Date(), 5000), filterChoices()]);
  const filters = describeSchoolFilters(f, choices);
  const file = await buildExport<SchoolRow>(format, [
    { label: "School code", value: (r) => r.code },
    { label: "School", value: (r) => r.name },
    { label: "City", value: (r) => r.city },
    { label: "Board", value: (r) => r.board },
    { label: "Status", value: (r) => r.statusLabel },
    { label: "Status detail", value: (r) => r.statusSub },
    { label: "School Admin", value: (r) => r.adminName },
    { label: "Admin sign-in", value: (r) => r.admin.label },
    { label: "Setup steps done", value: (r) => `${r.setupDone} of ${r.setupTotal}` },
    { label: "Active students", value: (r) => r.students },
    { label: "Added on", value: (r) => formatDate(r.createdAt) },
    { label: "Added by", value: (r) => r.addedBy },
  ], data.rows, { title: "Schools", schoolName: "DREAM TEAM SERVICES", filters, exportedBy: c.user.name, timeZone: CONSOLE_TZ });
  await withConsole((tx) => logActivity(tx, c.actor, { type: "export", text: `exported the Schools list (${data.rows.length} ${data.rows.length === 1 ? "school" : "schools"}, ${format.toUpperCase()}). Filters: ${filters}.` }));
  return exportResponse(file);
}
