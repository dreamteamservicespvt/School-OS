// Activity Log export (P8): exactly the lines the filters on screen show.
// The export itself becomes a line in the Activity Log.
import type { ConsoleActivityEntry } from "@prisma/client";
import { requireConsole } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { buildExport, exportResponse, type ExportFormat } from "@/lib/exports";
import { formatDate, formatTime } from "@/lib/format";
import { ACTIVITY_TYPES, logActivity, type ActivityType } from "@/lib/console/activity";
import { describeLogFilters, listLog, logChoices, readLogFilters } from "@/lib/console/activity-log";
import { CONSOLE_TZ } from "@/lib/console/list";

export async function GET(req: Request) {
  const c = await requireConsole();
  const url = new URL(req.url);
  const raw = url.searchParams.get("format");
  const format: ExportFormat = raw === "csv" || raw === "pdf" ? raw : "xlsx";
  const f = readLogFilters(Object.fromEntries(url.searchParams.entries()));
  const [data, choices] = await Promise.all([listLog(f, 20000), logChoices()]);
  const filters = describeLogFilters(f, choices);
  const file = await buildExport<ConsoleActivityEntry>(format, [
    { label: "Date", value: (r) => formatDate(r.at) },
    { label: "Time", value: (r) => formatTime(r.at) },
    { label: "Who", value: (r) => r.actorName },
    { label: "Role", value: (r) => r.actorRole ?? "" },
    { label: "Type", value: (r) => ACTIVITY_TYPES[r.type as ActivityType] ?? r.type },
    { label: "What happened", value: (r) => r.text },
    { label: "School", value: (r) => r.schoolName ?? "" },
    { label: "From", value: (r) => r.fromValue ?? "" },
    { label: "To", value: (r) => r.toValue ?? "" },
  ], data.rows, { title: "Activity Log", schoolName: "DREAM TEAM SERVICES", filters, exportedBy: c.user.name, timeZone: CONSOLE_TZ });
  await withConsole((tx) => logActivity(tx, c.actor, { type: "export", text: `exported the Activity Log (${data.rows.length} ${data.rows.length === 1 ? "line" : "lines"}, ${format.toUpperCase()}). Filters: ${filters}.` }));
  return exportResponse(file);
}
