import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { todayIn } from "@/lib/staff/dates";
import { admissionOnly, feeViewer } from "@/lib/fees/access";
import { defaulters, type DefaulterRow } from "@/lib/fees/defaulters";
import { parseRupees, UUID_RE } from "@/lib/fees/act";

export const dynamic = "force-dynamic";

/**
 * The defaulters list with the filters on screen (P8). With calls=1 and chosen
 * ids it is the call list: oldest dues first, with phone numbers.
 */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("fee-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export the defaulters list.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { timeZone: tz });
  const calls = g("calls") === "1";
  const chosen = url.searchParams.getAll("id").filter((x) => UUID_RE.test(x));
  let above: bigint | null = null;
  try { above = parseRupees(g("above"), "Amount"); } catch { above = null; }
  const data = await withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (admissionOnly(viewer)) return null;
    const list = await defaulters(tx, current.ctx, viewer, today, {
      q: g("q").slice(0, 80) || null,
      classId: UUID_RE.test(g("class")) ? g("class") : null,
      ageing: /^\d+$/.test(g("age")) ? Number(g("age")) : null,
      amountAbove: above,
      reminded: g("rem") === "yes" || g("rem") === "no" ? (g("rem") as "yes" | "no") : null,
      oldestFrom: range ? new Date(`${range.from}T00:00:00Z`) : null,
      oldestTo: range ? new Date(`${range.to}T00:00:00Z`) : null,
    });
    const rows = calls && chosen.length ? list.rows.filter((r) => chosen.includes(r.studentId)) : list.rows;
    const title = calls ? "Fee call list" : "Defaulters";
    const filters = [range ? `oldest due ${formatDate(new Date(`${range.from}T00:00:00Z`))} to ${formatDate(new Date(`${range.to}T00:00:00Z`))}` : null, g("q") && `search "${g("q")}"`, calls && `${rows.length} chosen`].filter(Boolean).join(", ") || "All defaulters";
    await logExport(tx, current.ctx, { title, format, filters, rows: rows.length });
    return { rows, title, filters };
  });
  if (!data) return new Response("Your role sees only admission fee status.", { status: 403 });
  const columns: ExportColumn<DefaulterRow>[] = calls ? [
    { label: "Student", value: (r) => r.name },
    { label: "Class", value: (r) => r.classLabel },
    { label: "Parent", value: (r) => r.parentName ?? "" },
    { label: "Phone", value: (r) => (r.optedOut ? `${r.phone ?? ""} (opted out of messages)` : r.phone ?? "") },
    { label: "Overdue", value: (r) => formatRupees(r.overduePaise) },
    { label: "Days late", value: (r) => String(r.daysOverdue) },
    { label: "Promised by", value: (r) => (r.promisedOn ? formatDate(r.promisedOn) : "") },
    { label: "Call note", value: () => "" },
  ] : [
    { label: "Student", value: (r) => r.name },
    { label: "Admission no.", value: (r) => r.admissionNo },
    { label: "Class", value: (r) => r.classLabel },
    { label: "Parent", value: (r) => r.parentName ?? "" },
    { label: "Phone", value: (r) => r.phone ?? "" },
    { label: "Overdue", value: (r) => formatRupees(r.overduePaise) },
    { label: "Fee heads", value: (r) => r.heads },
    { label: "Oldest due", value: (r) => formatDate(r.oldestDue) },
    { label: "Days late", value: (r) => String(r.daysOverdue) },
    { label: "Reminders sent", value: (r) => String(r.reminders) },
    { label: "Last reminder", value: (r) => (r.lastReminder ? formatDateTime(r.lastReminder, tz) : "") },
    { label: "Promised by", value: (r) => (r.promisedOn ? formatDate(r.promisedOn) : "") },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: data.title, schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
