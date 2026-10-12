// Student Leave export (P8): the same status, class, type, dates and search
// as the list on screen, and only the students this person may see.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { periodFromSearch } from "@/lib/periods";
import { attendanceAccess } from "@/lib/attendance/access";
import { attendanceSettings } from "@/lib/attendance/settings";
import { STUDENT_LEAVE_STATUS } from "@/lib/attendance/student-leave";
import { LEAVE_STATUSES, studentLeaveList } from "@/lib/attendance/student-leave-list";

export async function GET(req: Request) {
  const { current } = await requireAction("attendance-management", "export");
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const format = (["csv", "xlsx", "pdf"].includes(sp.format ?? "") ? sp.format : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const status = sp.status === "all" || (LEAVE_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "WAITING";
  const range = periodFromSearch(sp, { timeZone: tz });
  return withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
    if (access.studentLeave === "none") return new Response("You cannot see student leave.", { status: 403 });
    const list = await studentLeaveList(tx, current.ctx, access, { q: sp.q?.slice(0, 80), section: sp.section, type: sp.type, range, status, skip: 0, take: 5000 });
    type Row = (typeof list.rows)[number];
    const section = list.sections.find((s) => s.id === sp.section)?.name;
    const type = list.typeNames.get(sp.type ?? "") ?? list.types.find((t) => t.id === sp.type)?.name;
    const filters = [
      status === "all" ? "All statuses" : STUDENT_LEAVE_STATUS[status]?.label ?? status,
      section ? `Class ${section}` : null, type ? `Type ${type}` : null,
      range ? `Dates ${range.label}` : null, sp.q ? `Search "${sp.q.slice(0, 80)}"` : null,
    ].filter(Boolean).join(", ");
    const title = "Student Leave";
    await logExport(tx, current.ctx, { title, format, filters, rows: list.rows.length });
    const columns: ExportColumn<Row>[] = [
      { label: "Student", value: (r) => list.students.get(r.studentId!)?.fullName ?? "" },
      { label: "Admission no.", value: (r) => list.students.get(r.studentId!)?.admissionNo ?? "" },
      { label: "Class", value: (r) => list.classOf.get(r.studentId!) ?? "" },
      { label: "Leave type", value: (r) => list.typeNames.get(r.leaveTypeId) ?? "" },
      { label: "From", value: (r) => formatDate(r.fromDate, "UTC") },
      { label: "To", value: (r) => formatDate(r.toDate, "UTC") },
      { label: "School days", value: (r) => Number(r.days) },
      { label: "Reason", value: (r) => r.reason },
      { label: "Recorded by", value: (r) => list.users.get(r.recordedById ?? "") ?? "" },
      { label: "Status", value: (r) => STUDENT_LEAVE_STATUS[r.status]?.label ?? r.status },
      { label: "Decided by", value: (r) => (r.decidedById ? list.users.get(r.decidedById) ?? "" : "") },
      { label: "Decision note", value: (r) => r.decisionReason ?? "" },
    ];
    const file = await buildExport(format, columns, list.rows, { title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
