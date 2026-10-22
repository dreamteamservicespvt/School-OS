import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";
import { currentYear, yearsFor } from "@/lib/academic/years";
import { narrowToCampus, personCampusId } from "@/lib/campus";
import { getStudentSettings } from "@/lib/students/settings";
import { abilities } from "@/lib/students/access";
import { STATUS_LABEL } from "@/lib/students/labels";
import { LIST_FILTERS, mainGuardian, primaryPhone, sectionNames, studentListInclude, studentListWhere, type ListStudent } from "../_lib/queries";
import { EXPORT_FIELDS, fieldAllowed } from "../_lib/export-fields";

export const dynamic = "force-dynamic";

/** Student List export (P8): the chosen fields, with the list's filters, as Excel, CSV or PDF. */
export async function GET(req: Request) {
  let signedIn;
  try {
    ({ current: signedIn } = await requireAction("student-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export students.", { status: 403 });
    throw e;
  }
  // Only people who see every student may export the list (abilities().exportList).
  if (reachFor(signedIn.permissions, "student-management", "export") !== "all") return new Response("You do not have permission to export students.", { status: 403 });
  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const k of [...LIST_FILTERS, "q", "archived"]) { const v = url.searchParams.get(k); if (v) raw[k] = v; }
  const params = readListParams(raw, LIST_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  // A campus chosen on the Dashboard (?campus=) narrows the export as it narrows the list.
  const me = signedIn;
  const current = await withSchool(me.ctx, (tx) => narrowToCampus(tx, me, params.filters.campus));
  const tz = current.school.timeZone;

  const file = await withSchool(current.ctx, async (tx) => {
    const settings = await getStudentSettings(tx, current.ctx);
    const can = abilities(current, settings);
    // The list's students, each with their class in their own campus's current year; only their campus for a person limited to one.
    const year = await currentYear(tx, current.ctx, await personCampusId(tx, current.ctx, current));
    const yearIds = (await yearsFor(tx, current.ctx, current.campusId)).map((y) => y.id);
    const where = await studentListWhere(tx, current, params, yearIds, year?.startDate ?? null, settings);
    const students = await tx.student.findMany({ where, include: studentListInclude(yearIds), orderBy: { fullName: "asc" }, take: 10000 });
    const names = await sectionNames(tx, students.flatMap((s) => s.enrolments.map((e) => e.sectionId)));
    const chosen = new Set(url.searchParams.getAll("f"));
    const allowed = EXPORT_FIELDS.filter((f) => (!f.restricted || can.seeRestricted) && fieldAllowed(f.key, can) && (chosen.size ? chosen.has(f.key) : f.default));
    const value: Record<string, (s: ListStudent) => string | number | null> = {
      admissionNo: (s) => s.admissionNo,
      name: (s) => s.fullName,
      class: (s) => (s.enrolments[0] ? names.get(s.enrolments[0].sectionId)?.label ?? "" : ""),
      rollNo: (s) => s.enrolments[0]?.rollNo ?? null,
      dateOfBirth: (s) => (s.dateOfBirth ? formatDate(s.dateOfBirth, tz) : ""),
      gender: (s) => s.gender,
      guardian: (s) => mainGuardian(s)?.guardian.name ?? "",
      phone: (s) => primaryPhone(s),
      status: (s) => STATUS_LABEL[s.status],
      category: (s) => s.category,
      bloodGroup: (s) => s.bloodGroup,
      address: (s) => [s.address, s.city, s.state, s.pinCode].filter(Boolean).join(", "),
      joiningDate: (s) => (s.joiningDate ? formatDate(s.joiningDate, tz) : ""),
      apaarId: (s) => s.apaarId,
      pen: (s) => s.pen,
    };
    const columns: ExportColumn<ListStudent>[] = allowed.map((f) => ({ label: f.label, value: value[f.key] }));
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => (k === "ids" ? `${v.split(",").length} chosen students` : `${k}: ${k === "class" || k === "section" ? "chosen" : v}`))].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Student List", format, filters, rows: students.length });
    return { columns, students, filters };
  });
  // The file is made after the records are read, outside the database transaction.
  return exportResponse(await buildExport(format, file.columns, file.students, { title: "Student List", schoolName: current.school.name, filters: file.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
