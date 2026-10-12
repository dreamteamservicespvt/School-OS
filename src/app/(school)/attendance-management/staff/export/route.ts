// Staff Attendance export (P8): a day's list, a month's register, or the
// month's overtime. Staff with "own" reach export only their own month.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { formatDate, formatTime } from "@/lib/format";
import { day, eachDay, isoDay, monthEnd, monthLabel, monthStart, todayIn } from "@/lib/staff/dates";
import { attendanceAccess } from "@/lib/attendance/access";
import { attendanceSettings, METHOD_WORDS, statusList } from "@/lib/attendance/settings";
import { staffDay } from "@/lib/attendance/staff";
import { readMonth } from "@/lib/attendance/register";
import { schoolDays } from "@/lib/attendance/calendar";
import { attendanceSummary } from "@/lib/attendance/summary";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";

export async function GET(req: Request) {
  const { current } = await requireAction("attendance-management", "export");
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const meta = (title: string, filters: string) => ({ title, filters, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz });
  return withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
    if (access.staff === "none") return new Response("Your role cannot see staff attendance.", { status: 403 });
    const statuses = new Map((await statusList(tx, current.ctx, { includeArchived: true })).map((s) => [s.key, s]));
    const name = (k: string | null | undefined) => (k ? statuses.get(k)?.name ?? k : "Not marked");

    const monthParam = url.searchParams.get("month");
    if (url.searchParams.get("view") === "overtime") {
      if (access.staff !== "all") return new Response("Only HR, the School Admin or the Principal can export overtime.", { status: 403 });
      // The same dates as the Overtime list (This month when none is chosen).
      const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback: "thismonth" });
      const rows = await tx.overtimeEntry.findMany({ where: { archivedAt: null, ...(range ? { date: dateWhere(range) } : {}) }, orderBy: { date: "asc" } });
      const staff = new Map((await tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId) } }, select: { id: true, fullName: true, staffCode: true } })).map((s) => [s.id, s]));
      const words = range ? `Dates ${range.label}` : "All dates";
      const title = `Staff overtime${range ? ` ${range.label}` : ""}`;
      await logExport(tx, current.ctx, { title, format, filters: words, rows: rows.length });
      return exportResponse(await buildExport(format, [
        { label: "Date", value: (r: (typeof rows)[number]) => formatDate(r.date, "UTC") },
        { label: "Staff ID", value: (r) => staff.get(r.staffId)?.staffCode ?? "" },
        { label: "Name", value: (r) => staff.get(r.staffId)?.fullName ?? "" },
        { label: "Hours", value: (r) => Math.round((r.minutes / 60) * 100) / 100 },
        { label: "Note", value: (r) => r.note ?? "" },
      ], rows, meta(title, words)));
    }

    if (monthParam) {
      const m = readMonth(monthParam) ?? monthStart(today);
      const from = monthStart(m);
      const to = monthEnd(m);
      const staff = await tx.staff.findMany({
        where: { archivedAt: null, joiningDate: { lte: to }, ...(access.staff === "all" ? { status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } } : { id: access.staffId ?? "00000000-0000-0000-0000-000000000000" }) },
        orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true },
      });
      const [sum, days] = await Promise.all([
        attendanceSummary(tx, current.ctx, { staffIds: staff.map((s) => s.id), from, to, today, campusId: access.campusId }),
        schoolDays(tx, current.ctx, from, to, access.campusId),
      ]);
      type Row = (typeof staff)[number];
      const title = `Staff attendance ${monthLabel(from)}`;
      await logExport(tx, current.ctx, { title, format, filters: `Month ${monthLabel(from)}`, rows: staff.length });
      return exportResponse(await buildExport<Row>(format, [
        { label: "Staff ID", value: (r) => r.staffCode },
        { label: "Name", value: (r) => r.fullName },
        ...eachDay(from, to).map((d) => ({
          label: String(d.getUTCDate()),
          value: (r: Row) => (days.info(d).on ? statuses.get(sum.days.get(r.id)?.get(isoDay(d)) ?? "")?.letter ?? "" : "-"),
        })),
        { label: "Present", value: (r) => sum.people.get(r.id)?.present ?? 0 },
        { label: "Absent", value: (r) => sum.people.get(r.id)?.absent ?? 0 },
        { label: "Late", value: (r) => sum.people.get(r.id)?.late ?? 0 },
        { label: "Leave", value: (r) => sum.people.get(r.id)?.leave ?? 0 },
        { label: "Attendance %", value: (r) => sum.people.get(r.id)?.percent ?? "" },
      ], staff, meta(title, `Month ${monthLabel(from)}. ${sum.workingDays} working days; "-" is a holiday or Sunday.`)));
    }

    const v = url.searchParams.get("date");
    const date = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? day(v) : today;
    // The same search, department and status as the list on screen.
    const q = url.searchParams.get("q")?.slice(0, 80) || undefined;
    const department = url.searchParams.get("department") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const rows = await staffDay(tx, current.ctx, access, date, { q, departmentId: access.staff === "all" && department && /^[0-9a-f-]{36}$/.test(department) ? department : undefined, status });
    const title = `Staff attendance ${formatDate(date, "UTC")}`;
    const words = [`Date ${formatDate(date, "UTC")}`, q ? `Search "${q}"` : null, status ? `Status ${status}` : null].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title, format, filters: words, rows: rows.length });
    return exportResponse(await buildExport(format, [
      { label: "Staff ID", value: (r: (typeof rows)[number]) => r.staffCode },
      { label: "Name", value: (r) => r.name },
      { label: "Department", value: (r) => r.department ?? "" },
      { label: "Designation", value: (r) => r.designation },
      { label: "Shift", value: (r) => r.shift.shiftName ?? "School hours" },
      { label: "Status", value: (r) => (r.mark ? name(r.mark.statusKey) : r.onLeave ? "On leave" : "Not marked") },
      { label: "In", value: (r) => (r.mark?.inTime ? formatTime(r.mark.inTime, tz) : "") },
      { label: "Out", value: (r) => (r.mark?.outTime ? formatTime(r.mark.outTime, tz) : "") },
      { label: "Minutes late", value: (r) => r.mark?.lateMinutes ?? "" },
      { label: "Source", value: (r) => (r.mark ? METHOD_WORDS[r.mark.method] ?? r.mark.method : "") },
      { label: "Note", value: (r) => r.mark?.note ?? "" },
    ], rows, meta(title, words)));
  }, { timeout: 60_000 });
}
