// The visitor log for the dates, status and search on screen. Phone numbers
// are masked for Office Staff and Gate Security, as on the page.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatTime } from "@/lib/format";
import { visitorScope } from "@/lib/front-office/access";
import { visitorLogWhere, visitorSearch, visitorStatus } from "@/lib/front-office/visitors";
import { todayDate, todayIso } from "@/lib/front-office/time";
import { maskPhone, replyOf, showPhone } from "@/lib/front-office/words";
import { foExport, plain, rangeWords } from "../../_lib/export";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await foExport(req);
  if (x instanceof Response) return x;
  if (!x.can.export) return plain("You do not have permission to export the visitor log.", 403);
  const range = await x.range("today");
  const status = ["In", "Out", "Expired"].includes(x.get("status")) ? x.get("status") : "all";
  const q = x.get("q");
  const phones = x.can.visitorPhones;
  const now = new Date();
  const today = todayDate(x.tz, now);
  const isToday = range.from === todayIso(x.tz, now) && range.to === range.from;
  const result = await withSchool(x.current.ctx, async (tx) => {
    const search = await visitorSearch(tx, q, phones);
    const rows = await tx.visitorEntry.findMany({
      where: visitorLogWhere({ scope: visitorScope(x.v, today), from: new Date(`${range.from}T00:00:00Z`), to: new Date(`${range.to}T00:00:00Z`), withOpenExpired: isToday, status, search, now }),
      orderBy: { timeIn: "asc" }, take: 20_000,
    });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.meetStaffId).filter((s): s is string => Boolean(s)))] } }, select: { id: true, fullName: true } });
    const filters = [rangeWords(range), status !== "all" ? `Status: ${status}` : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Visitor log", format: x.format, filters, rows: rows.length });
    return { rows, staff, filters };
  });
  type Row = (typeof result.rows)[number];
  const met = (r: Row) => result.staff.find((s) => s.id === r.meetStaffId)?.fullName ?? "";
  const columns: ExportColumn<Row>[] = [
    { label: "Pass", value: (r) => r.passNo },
    { label: "Date", value: (r) => formatDate(r.visitDate, "UTC") },
    { label: "Visitor", value: (r) => r.name },
    { label: "Phone", value: (r) => (phones ? showPhone(r.phone) : maskPhone(r.phone)) },
    { label: "People", value: (r) => r.peopleCount },
    { label: "Purpose", value: (r) => r.purpose },
    { label: "Note", value: (r) => r.note ?? "" },
    { label: "To meet", value: (r) => met(r) },
    { label: "Reply", value: (r) => replyOf(r.staffReply)?.label ?? "" },
    { label: "Vehicle", value: (r) => r.vehicleNo ?? "" },
    { label: "ID proof", value: (r) => (r.idProofType ? `${r.idProofType}${r.idProofLast4 ? ` ending ${r.idProofLast4}` : ""}` : "") },
    { label: "Time in", value: (r) => formatTime(r.timeIn, x.tz) },
    { label: "Time out", value: (r) => (r.timeOut ? formatTime(r.timeOut, x.tz) : "") },
    { label: "Status", value: (r) => visitorStatus(r, now) },
  ];
  return exportResponse(await buildExport(x.format, columns, result.rows, { title: "Visitor log", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: result.filters }));
}
