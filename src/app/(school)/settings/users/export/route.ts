// Users and roles report (Settings, section 7): the Users list with the
// filters on screen, as Excel, CSV or PDF. Written to the export log (P8).
import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { reachFor } from "@/lib/permissions";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { formatDateTime } from "@/lib/format";
import { readListParams } from "@/lib/list";
import { filterUsers, schoolUsers, sortUsers, type UserRow } from "@/lib/settings/user-list";
import { STATE_LABEL } from "@/lib/settings/users";

export async function GET(request: Request) {
  const current = await getCurrent();
  if (!current) return new Response("Please sign in again.", { status: 401 });
  if (reachFor(current.permissions, "settings", "export") === "none") return new Response("Your role does not allow exporting from Settings.", { status: 403 });
  const url = new URL(request.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const params = readListParams(Object.fromEntries(url.searchParams), ["status", "role", "twostep", "exceptions"]);
  const tz = current.school.timeZone;

  const { rows, filterWords } = await withSchool(current.ctx, async (tx) => {
    const all = await schoolUsers(tx, current.school.id);
    const rows = sortUsers(filterUsers(all, params.q, params.filters), params.sort, params.dir);
    const roleName = params.filters.role ? all.flatMap((r) => r.roles).find((x) => x.id === params.filters.role)?.name ?? null : null;
    const words = [
      params.q && `search "${params.q}"`,
      params.filters.status && `status ${STATE_LABEL[params.filters.status as keyof typeof STATE_LABEL] ?? params.filters.status}`,
      roleName && `role ${roleName}`,
      params.filters.twostep && `two-step login ${params.filters.twostep}`,
      params.filters.exceptions && "with exceptions",
    ].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Users and roles", format, filters: words, rows: rows.length });
    return { rows, filterWords: words };
  });

  const file = await buildExport<UserRow>(format, [
    { label: "Name", value: (r) => r.name },
    { label: "Username", value: (r) => r.username },
    { label: "Phone", value: (r) => r.phone },
    { label: "Email", value: (r) => r.email },
    { label: "Belongs to", value: (r) => r.belongsTo ?? "Not linked" },
    { label: "Roles", value: (r) => r.roles.map((x) => x.name).join(", ") },
    { label: "Scope", value: (r) => (r.campus ? `${r.scope}: ${r.campus}` : r.scope) },
    { label: "Exceptions", value: (r) => r.exceptions },
    { label: "Status", value: (r) => STATE_LABEL[r.state] },
    { label: "Last sign-in", value: (r) => (r.lastSignInAt ? formatDateTime(r.lastSignInAt, tz) : "Never") },
    { label: "Two-step login", value: (r) => (r.twoStep ? "On" : "Off") },
  ], rows, { title: "Users and roles", schoolName: current.school.name, filters: filterWords, exportedBy: current.user.displayName, timeZone: tz });
  return exportResponse(file);
}
