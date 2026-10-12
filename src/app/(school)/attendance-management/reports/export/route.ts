// Attendance Reports export (P8): the same table as on screen.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { todayIn } from "@/lib/staff/dates";
import { attendanceAccess } from "@/lib/attendance/access";
import { attendanceFeatures, attendanceSettings } from "@/lib/attendance/settings";
import { rangePeople, readReportInput, reportsFor, runReport, type ReportKey, type ReportRow } from "@/lib/attendance/reports";

export async function GET(req: Request) {
  const { current } = await requireAction("attendance-management", "export");
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  return withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
    const features = await attendanceFeatures(tx, current.ctx);
    const list = reportsFor(access, features as Set<string>);
    if (list.length === 0) return new Response("Your role has no attendance reports.", { status: 403 });
    const input = readReportInput((k) => url.searchParams.get(k), todayIn(tz), list.map((r) => r.key as ReportKey));
    if (input.report === "range" && !input.person) input.person = (await rangePeople(tx, access, input.sectionId))[0]?.value ?? null;
    const t = await runReport(tx, current.ctx, access, input);
    await logExport(tx, current.ctx, { title: t.title, format, filters: t.filters, rows: t.rows.length });
    const file = await buildExport<ReportRow>(format, t.columns.map((c) => ({ label: c.label, value: (r) => r[c.key] ?? "" })), t.rows, {
      title: t.title, filters: `${t.filters}${t.footer ? `. ${t.footer}` : ""}`, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz,
    });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
