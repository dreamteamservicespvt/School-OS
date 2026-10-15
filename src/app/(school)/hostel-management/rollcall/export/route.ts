// The roll call history of one hostel for the dates on screen: each morning
// and night roll call with present, absent (named) and away. A warden
// exports their own hostel only.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { clockAt } from "@/lib/front-office/time";
import { studentsInfo } from "@/lib/hostel/allocation";
import { inScope } from "@/lib/hostel/scope";
import { UUID_RE } from "@/lib/hostel/act";
import { SESSION, type RollSession } from "@/lib/hostel/words";
import { hostelRoute, plain, rangeWords } from "../../_lib/route";

export const dynamic = "force-dynamic";

type Row = { date: Date; session: string; present: number; absent: number; away: number; names: string; by: string; at: Date };

export async function GET(req: Request) {
  const x = await hostelRoute(req, "rollcall");
  if (x instanceof Response) return x;
  const hostelId = x.get("hostel");
  if (!UUID_RE.test(hostelId) || !inScope(x.mine, hostelId)) return plain("Choose one of your hostels.", 404);
  const range = await x.range("last7", "h");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const hostel = await tx.hostel.findFirst({ where: { id: hostelId } });
    if (!hostel) return null;
    const calls = await tx.rollCall.findMany({ where: { hostelId, ...(range ? { date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) } } : {}) }, orderBy: [{ date: "desc" }, { session: "desc" }], include: { marks: { where: { mark: "ABSENT" }, select: { studentId: true } } } });
    const [info, people] = await Promise.all([
      studentsInfo(tx, x.current.ctx, calls.flatMap((c) => c.marks.map((m) => m.studentId))),
      tx.userLogin.findMany({ where: { id: { in: calls.map((c) => c.takenById).filter((v): v is string => Boolean(v)) } }, select: { id: true, displayName: true } }),
    ]);
    const rows: Row[] = calls.map((c) => ({ date: c.date, session: SESSION[c.session as RollSession], present: c.presentCount, absent: c.absentCount, away: c.awayCount, names: c.marks.map((m) => info.get(m.studentId)?.name ?? "").filter(Boolean).join(", "), by: people.find((u) => u.id === c.takenById)?.displayName ?? "", at: c.takenAt }));
    const filters = `Hostel: ${hostel.name} · ${rangeWords(range)}`;
    await logExport(tx, x.current.ctx, { title: "Hostel roll calls", format: x.format, filters, rows: rows.length });
    return { rows, filters };
  });
  if (!r) return plain("This hostel was not found.", 404);
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (c) => formatDate(c.date, "UTC") }, { label: "Session", value: (c) => c.session }, { label: "Present", value: (c) => c.present },
    { label: "Absent", value: (c) => c.absent }, { label: "Away on a pass", value: (c) => c.away }, { label: "Absent students", value: (c) => c.names },
    { label: "Taken by", value: (c) => c.by }, { label: "Saved at", value: (c) => clockAt(c.at, x.tz) },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title: "Hostel roll calls", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
