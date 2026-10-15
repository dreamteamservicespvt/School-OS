// The appointments of the day on screen (or a date range from the period
// filter), every staff member, with status.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { APPOINTMENT_STATUS, clockOf, maskPhone, showPhone } from "@/lib/front-office/words";
import { foExport, plain, rangeWords } from "../../_lib/export";
import { foPageAllowed } from "@/lib/front-office/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await foExport(req);
  if (x instanceof Response) return x;
  if (!foPageAllowed(x.v, "appointments")) return plain("You do not have permission to export appointments.", 403);
  const day = x.get("day");
  const range = /^\d{4}-\d{2}-\d{2}$/.test(day) ? { period: "custom" as const, from: day, to: day, label: day } : await x.range("today");
  const words = rangeWords(range);
  const phones = x.can.visitorPhones;
  const result = await withSchool(x.current.ctx, async (tx) => {
    const rows = await tx.appointment.findMany({ where: { archivedAt: null, date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) } }, orderBy: [{ date: "asc" }, { startMin: "asc" }], take: 20_000 });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.staffId))] } }, select: { id: true, fullName: true } });
    await logExport(tx, x.current.ctx, { title: "Appointments", format: x.format, filters: words, rows: rows.length });
    return { rows, staff };
  });
  type Row = (typeof result.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (r) => formatDate(r.date, "UTC") },
    { label: "Time", value: (r) => clockOf(r.startMin) },
    { label: "Minutes", value: (r) => r.lengthMin },
    { label: "With", value: (r) => result.staff.find((s) => s.id === r.staffId)?.fullName ?? "" },
    { label: "Visitor", value: (r) => r.visitorName },
    { label: "Phone", value: (r) => (phones ? showPhone(r.visitorPhone) : maskPhone(r.visitorPhone)) },
    { label: "Purpose", value: (r) => r.purpose },
    { label: "Status", value: (r) => (APPOINTMENT_STATUS[r.status] ?? APPOINTMENT_STATUS.BOOKED).label },
  ];
  return exportResponse(await buildExport(x.format, columns, result.rows, { title: "Appointments", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: words }));
}
