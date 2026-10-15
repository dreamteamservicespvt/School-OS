// School Calendar exports: the calendar list for the dates, type, class and
// campus on screen (kind=calendar), or one year's holiday list (kind=holidays).
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { calendarItems, closesSchool, holidayList } from "@/lib/events/calendar";
import { ENTRY_TYPES, dayCount, isEntryType, isoOf, longDay } from "@/lib/events/words";
import { evExport, plain, rangeWords } from "../_lib/export";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const x = await evExport(req);
  if (x instanceof Response) return x;
  if (!x.v.level) return plain("You do not have permission to export the School Calendar.", 403);
  const campus = UUID.test(x.get("campus")) ? x.get("campus") : null;
  const school = x.current.school.name;
  const by = x.current.user.displayName;

  if (x.get("kind") === "holidays") {
    const yearId = x.get("year");
    if (!UUID.test(yearId)) return plain("Choose the year.", 400);
    const r = await withSchool(x.current.ctx, async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { id: yearId } });
      if (!year) return null;
      const rows = await holidayList(tx, x.current.ctx, yearId, campus);
      await logExport(tx, x.current.ctx, { title: `Holiday list ${year.name}`, format: x.format, filters: year.name, rows: rows.length });
      return { year, rows };
    });
    if (!r) return plain("This year was not found.", 404);
    type Row = (typeof r.rows)[number];
    const columns: ExportColumn<Row>[] = [
      { label: "Name", value: (h) => h.title },
      { label: "Type", value: (h) => (isEntryType(h.type) ? ENTRY_TYPES[h.type].label : h.type) },
      { label: "From", value: (h) => longDay(isoOf(h.startDate)) },
      { label: "To", value: (h) => longDay(isoOf(h.endDate)) },
      { label: "Days", value: (h) => String(dayCount(isoOf(h.startDate), isoOf(h.endDate))) },
      { label: "Attendance", value: (h) => (h.attendanceOn ? "Taken" : "Off") },
    ];
    return exportResponse(await buildExport(x.format, columns, r.rows, { title: `Holiday list ${r.year.name}`, schoolName: school, exportedBy: by, timeZone: x.tz, filters: r.year.name }));
  }

  const range = await x.range("acyear");
  const type = x.get("type");
  const classId = UUID.test(x.get("class")) ? x.get("class") : null;
  const filters = [rangeWords(range), type && isEntryType(type) ? `Type: ${ENTRY_TYPES[type].label}` : ""].filter(Boolean).join(" · ");
  const rows = await withSchool(x.current.ctx, async (tx) => {
    const all = await calendarItems(tx, x.current.ctx, range.from, range.to, { campusId: campus, classId });
    const out = all.filter((i) => !type || type === "all" || i.type === type || (type === "holiday" && i.type === "vacation"));
    await logExport(tx, x.current.ctx, { title: "School Calendar", format: x.format, filters, rows: out.length });
    return out;
  });
  type Row = (typeof rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "From", value: (i) => longDay(i.from) },
    { label: "To", value: (i) => (i.to === i.from ? "" : longDay(i.to)) },
    { label: "Name", value: (i) => i.title },
    { label: "Type", value: (i) => ENTRY_TYPES[i.type].label },
    { label: "Time", value: (i) => i.time ?? "" },
    { label: "Where", value: (i) => i.where ?? "" },
    { label: "Attendance", value: (i) => (closesSchool(i) ? "Off" : "Taken") },
    { label: "Details", value: (i) => i.details ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, rows, { title: "School Calendar", schoolName: school, exportedBy: by, timeZone: x.tz, filters }));
}
