// Every bed of one hostel: room, bed, free, taken (with the student) or
// blocked (with the reason). A warden exports their own hostel only.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { inScope } from "@/lib/hostel/scope";
import { roomGrid } from "@/lib/hostel/rooms";
import { studentsInfo } from "@/lib/hostel/allocation";
import { UUID_RE } from "@/lib/hostel/act";
import { hostelRoute, plain } from "../../_lib/route";

export const dynamic = "force-dynamic";

type Row = { floor: string; room: string; type: string; bed: number; state: string; student: string; admissionNo: string; cls: string; reason: string };

export async function GET(req: Request) {
  const x = await hostelRoute(req, "rooms");
  if (x instanceof Response) return x;
  const want = x.get("hostel");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const hostels = await tx.hostel.findMany({ where: { archivedAt: null, ...(x.mine === null ? {} : { id: { in: x.mine } }) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const hostel = (UUID_RE.test(want) ? hostels.find((h) => h.id === want) : null) ?? hostels[0];
    if (!hostel || !inScope(x.mine, hostel.id)) return null;
    const grid = await roomGrid(tx, [hostel.id]);
    const info = await studentsInfo(tx, x.current.ctx, grid.flatMap((rm) => rm.beds.map((b) => b.studentId).filter((s): s is string => Boolean(s))));
    const rows: Row[] = grid.flatMap((rm) => rm.beds.map((b) => {
      const s = b.studentId ? info.get(b.studentId) : null;
      return { floor: rm.floor, room: rm.roomNo, type: rm.roomType ?? "", bed: b.bedNo, state: b.state === "taken" ? "Taken" : b.state === "blocked" ? "Blocked" : "Free", student: s?.name ?? "", admissionNo: s?.admissionNo ?? "", cls: s?.classSection ?? "", reason: b.state === "blocked" ? b.blockedReason ?? "" : "" };
    }));
    const filters = `Hostel: ${hostel.name}`;
    await logExport(tx, x.current.ctx, { title: "Rooms and beds", format: x.format, filters, rows: rows.length });
    return { rows, filters };
  });
  if (!r) return plain("This hostel was not found.", 404);
  const columns: ExportColumn<Row>[] = [
    { label: "Floor", value: (b) => b.floor }, { label: "Room", value: (b) => b.room }, { label: "Room type", value: (b) => b.type }, { label: "Bed", value: (b) => b.bed },
    { label: "Bed is", value: (b) => b.state }, { label: "Student", value: (b) => b.student }, { label: "Admission no.", value: (b) => b.admissionNo }, { label: "Class", value: (b) => b.cls },
    { label: "Blocked because", value: (b) => b.reason },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title: "Rooms and beds", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
