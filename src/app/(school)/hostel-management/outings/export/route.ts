// Outing passes or the hostel visitor log with the filters on screen.
// Phone numbers are masked for people who only read the hostel; a warden's
// file holds their own hostel only.
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { momentWhere } from "@/lib/periods";
import { clockAt } from "@/lib/front-office/time";
import { maskPhone, showPhone } from "@/lib/front-office/words";
import { studentsInfo } from "@/lib/hostel/allocation";
import { minutesLate, outingWhere, passWhen, shownStatus } from "@/lib/hostel/outings";
import { OUTING_TYPE, PASS_STATUS, lateWords, type OutingType, type PassStatus } from "@/lib/hostel/words";
import { hostelRoute, rangeWords } from "../../_lib/route";
import { studentIdsForFilter } from "@/lib/students/find";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await hostelRoute(req, "outings");
  if (x instanceof Response) return x;
  const phone = (p: string | null) => (p ? (x.can.outings ? showPhone(p) : maskPhone(p)) : "");
  const q = x.get("q").trim();
  const scope = x.mine === null ? {} : { hostelId: { in: x.mine } };

  if (x.get("view") === "visitors") {
    const inside = x.get("inside") === "1";
    const range = inside ? null : await x.range("last7");
    const r = await withSchool(x.current.ctx, async (tx) => {
      const nameIds = q ? await studentIdsForFilter(tx, q) : [];
      const where: Prisma.VisitorEntryWhereInput = {
        archivedAt: null, meetStudentId: { not: null }, ...scope, ...(inside ? { timeOut: null } : range ? { timeIn: momentWhere(range, x.tz) } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { passNo: { contains: q, mode: "insensitive" } }, ...(nameIds.length ? [{ meetStudentId: { in: nameIds } }] : [])] } : {}),
      };
      const rows = await tx.visitorEntry.findMany({ where, orderBy: [{ timeIn: "desc" }, { id: "asc" }], take: 5000 });
      const [info, people] = await Promise.all([
        studentsInfo(tx, x.current.ctx, rows.map((v) => v.meetStudentId!)),
        tx.userLogin.findMany({ where: { id: { in: rows.map((v) => v.approvedById).filter((v): v is string => Boolean(v)) } }, select: { id: true, displayName: true } }),
      ]);
      const filters = [inside ? "Inside now" : rangeWords(range), q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
      await logExport(tx, x.current.ctx, { title: "Hostel visitor log", format: x.format, filters, rows: rows.length });
      return { rows, info, people: new Map(people.map((u) => [u.id, u.displayName])), filters };
    }, { timeout: 60_000 });
    type V = (typeof r.rows)[number];
    const columns: ExportColumn<V>[] = [
      { label: "Pass no.", value: (v) => v.passNo }, { label: "Date", value: (v) => formatDate(v.visitDate, "UTC") },
      { label: "Student met", value: (v) => r.info.get(v.meetStudentId!)?.name ?? "" }, { label: "Class", value: (v) => r.info.get(v.meetStudentId!)?.classSection ?? "" },
      { label: "Visitor", value: (v) => v.name }, { label: "Relation", value: (v) => v.relation ?? "" }, { label: "Phone", value: (v) => phone(v.phone) },
      { label: "In", value: (v) => clockAt(v.timeIn, x.tz) }, { label: "Out", value: (v) => (v.timeOut ? clockAt(v.timeOut, x.tz) : "Inside") },
      { label: "Allowed by", value: (v) => (v.allowedBy === "WARDEN" ? `Warden approved${v.approvedById ? ` (${r.people.get(v.approvedById) ?? ""})` : ""}` : "Authorised list") },
    ];
    return exportResponse(await buildExport(x.format, columns, r.rows, { title: "Hostel visitor log", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
  }

  const status = (["WAITING", "APPROVED", "OUT", "LATE", "RETURNED", "REJECTED", "CANCELLED"] as const).find((s) => s === x.get("status")) ?? null;
  const live = status === "WAITING" || status === "OUT" || status === "LATE" || status === "APPROVED";
  const range = live ? null : await x.range("last30");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const nameIds = q ? await studentIdsForFilter(tx, q) : [];
    const byStatus: Prisma.GatePassWhereInput = status === "LATE" ? { status: "OUT", toAt: { lt: x.now } } : status === "OUT" ? { status: "OUT", toAt: { gte: x.now } } : status ? { status } : {};
    const where = outingWhere({
      ...scope, ...byStatus, ...(range ? { fromAt: momentWhere(range, x.tz) } : {}),
      ...(q ? { OR: [{ passNo: { contains: q, mode: "insensitive" } }, { collectorName: { contains: q, mode: "insensitive" } }, ...(nameIds.length ? [{ studentId: { in: nameIds } }] : [])] } : {}),
    });
    const rows = await tx.gatePass.findMany({ where, orderBy: [{ fromAt: "desc" }, { id: "asc" }], take: 5000 });
    const info = await studentsInfo(tx, x.current.ctx, rows.map((p) => p.studentId));
    const filters = [status ? `Status: ${PASS_STATUS[status as PassStatus].label}` : "", live ? "" : rangeWords(range), q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Hostel outing passes", format: x.format, filters, rows: rows.length });
    return { rows, info, filters };
  }, { timeout: 60_000 });
  type G = (typeof r.rows)[number];
  const columns: ExportColumn<G>[] = [
    { label: "Pass no.", value: (p) => p.passNo }, { label: "Student", value: (p) => r.info.get(p.studentId)?.name ?? "" }, { label: "Class", value: (p) => r.info.get(p.studentId)?.classSection ?? "" },
    { label: "Type", value: (p) => OUTING_TYPE[(p.outingType ?? "OUTING") as OutingType].label },
    { label: "Going with", value: (p) => `${p.collectorName ?? ""}${p.collectorRelation ? ` (${p.collectorRelation})` : ""}` }, { label: "Phone", value: (p) => phone(p.collectorPhone) },
    { label: "From and to", value: (p) => passWhen(p, x.tz) }, { label: "Reason", value: (p) => p.reason },
    { label: "Status", value: (p) => PASS_STATUS[shownStatus(p, x.now)].label },
    { label: "Went out", value: (p) => (p.leftAt ? `${formatDate(p.leftAt, x.tz)} ${clockAt(p.leftAt, x.tz)}` : "") },
    { label: "Came back", value: (p) => (p.returnedAt ? `${formatDate(p.returnedAt, x.tz)} ${clockAt(p.returnedAt, x.tz)}` : "") },
    { label: "Late by", value: (p) => (p.status === "OUT" || p.status === "RETURNED") && minutesLate(p, x.now) > 0 ? lateWords(minutesLate(p, x.now)) : "" },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title: "Hostel outing passes", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
