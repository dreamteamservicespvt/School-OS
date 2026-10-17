// The hostel incident log with the type, search and dates on screen. A
// warden's file holds their own hostel's incidents only.
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { momentWhere } from "@/lib/periods";
import { clockAt } from "@/lib/front-office/time";
import { studentsInfo } from "@/lib/hostel/allocation";
import { INCIDENT_TYPE, type IncidentType } from "@/lib/hostel/words";
import { MAINT_STATUS } from "@/lib/inventory/words";
import { hostelRoute, rangeWords } from "../../_lib/route";
import { studentIdsForFilter } from "@/lib/students/find";

export const dynamic = "force-dynamic";

type Row = { no: string; at: Date; type: string; hostel: string; students: string; place: string; what: string; action: string; parent: string; behaviour: string; request: string; by: string };

export async function GET(req: Request) {
  const x = await hostelRoute(req, "rollcall");
  if (x instanceof Response) return x;
  const type = (["DISCIPLINE", "MEDICAL", "MAINTENANCE"] as const).find((t) => t === x.get("type")) ?? null;
  const q = x.get("q").trim();
  const range = await x.range("thismonth");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const nameIds = q ? await studentIdsForFilter(tx, q) : [];
    const where: Prisma.HostelIncidentWhereInput = {
      archivedAt: null, ...(x.mine === null ? {} : { hostelId: { in: x.mine } }), ...(range ? { at: momentWhere(range, x.tz) } : {}), ...(type ? { type } : {}),
      ...(q ? { OR: [{ incidentNo: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { place: { contains: q, mode: "insensitive" } }, ...(nameIds.length ? [{ studentIds: { hasSome: nameIds } }] : [])] } : {}),
    };
    const list = await tx.hostelIncident.findMany({ where, orderBy: [{ at: "desc" }, { id: "asc" }], take: 5000 });
    const [info, people, hostels] = await Promise.all([
      studentsInfo(tx, x.current.ctx, list.flatMap((i) => i.studentIds)),
      tx.userLogin.findMany({ where: { id: { in: list.map((i) => i.recordedById).filter((v): v is string => Boolean(v)) } }, select: { id: true, displayName: true } }),
      tx.hostel.findMany({ select: { id: true, name: true } }),
    ]);
    const requests = await tx.maintenanceRequest.findMany({ where: { id: { in: list.map((i) => i.maintenanceRequestId).filter((v): v is string => Boolean(v)) } }, select: { id: true, number: true, status: true } });
    const rows: Row[] = list.map((i) => ({
      no: i.incidentNo, at: i.at, type: INCIDENT_TYPE[i.type as IncidentType].label, hostel: hostels.find((h) => h.id === i.hostelId)?.name ?? "", students: i.studentIds.map((s) => info.get(s)?.name ?? "").filter(Boolean).join(", "),
      place: i.place ?? "", what: i.description, action: i.actionTaken ?? "", parent: i.parentMessagedAt ? "Yes" : "", behaviour: i.behaviourIncidentId ? "Yes" : "",
      request: ((q) => (q ? `${q.number} (${MAINT_STATUS[q.status as keyof typeof MAINT_STATUS].label})` : ""))(requests.find((m) => m.id === i.maintenanceRequestId)), by: people.find((u) => u.id === i.recordedById)?.displayName ?? "",
    }));
    const filters = [rangeWords(range), type ? `Type: ${INCIDENT_TYPE[type].label}` : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Hostel incident log", format: x.format, filters, rows: rows.length });
    return { rows, filters };
  }, { timeout: 60_000 });
  const columns: ExportColumn<Row>[] = [
    { label: "Incident no.", value: (i) => i.no }, { label: "Date", value: (i) => formatDate(i.at, x.tz) }, { label: "Time", value: (i) => clockAt(i.at, x.tz) },
    { label: "Type", value: (i) => i.type }, { label: "Hostel", value: (i) => i.hostel }, { label: "Student(s)", value: (i) => i.students }, { label: "Place", value: (i) => i.place },
    { label: "What happened", value: (i) => i.what }, { label: "Action taken", value: (i) => i.action }, { label: "Parent told", value: (i) => i.parent },
    { label: "In behaviour record", value: (i) => i.behaviour }, { label: "Maintenance request", value: (i) => i.request }, { label: "Recorded by", value: (i) => i.by },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title: "Hostel incident log", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
