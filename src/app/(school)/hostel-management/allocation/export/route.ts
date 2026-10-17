// The residents list with the filters on screen (who is shown, hostel,
// search, and the dates for checked-out students). Hostel fees due only for
// people with Fee Management; a warden's file holds their own hostel.
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { clockAt } from "@/lib/front-office/time";
import { hostelFeesDue, outNow, residents, type Resident } from "@/lib/hostel/allocation";
import { UUID_RE } from "@/lib/hostel/act";
import { RESIDENT_STATUS } from "@/lib/hostel/words";
import { hostelRoute, rangeWords } from "../../_lib/route";
import { studentIdsForFilter } from "@/lib/students/find";

export const dynamic = "force-dynamic";
const SHOWN: Record<string, string> = { "": "Everyone with a bed", arriving: "Not arrived", away: "Away now", out: "Checked out" };

export async function GET(req: Request) {
  const x = await hostelRoute(req, "allocation");
  if (x instanceof Response) return x;
  const show = x.get("show") in SHOWN ? x.get("show") : "";
  const q = x.get("q").trim();
  const range = show === "out" ? await x.range("acyear") : null;
  const r = await withSchool(x.current.ctx, async (tx) => {
    const all = await tx.hostel.findMany({ where: { archivedAt: null, ...(x.mine === null ? {} : { id: { in: x.mine } }) }, select: { id: true, name: true } });
    const one = UUID_RE.test(x.get("hostel")) ? all.find((h) => h.id === x.get("hostel")) : null;
    const ids = one ? [one.id] : all.map((h) => h.id);
    const away = [...(await outNow(tx)).keys()];
    const nameIds = q ? await studentIdsForFilter(tx, q) : null;
    const byView: Record<string, Prisma.BedAllocationWhereInput> = {
      "": { status: "ACTIVE" }, arriving: { status: "ACTIVE", checkedInAt: null }, away: { status: "ACTIVE", studentId: { in: away } },
      out: { status: "CHECKED_OUT", ...(range ? { endDate: dateWhere(range) } : {}) },
    };
    const rows = await residents(tx, x.current.ctx, { hostelId: { in: ids }, ...byView[show], ...(nameIds ? { AND: [{ studentId: { in: nameIds } }] } : {}) }, x.now, { take: 5000 });
    const dues = new Map<string, bigint>();
    if (x.v.seesFees) for (const a of rows) if (a.allocation.status === "ACTIVE") dues.set(a.student.id, await hostelFeesDue(tx, a.student.id, x.today));
    const filters = [SHOWN[show], one ? `Hostel: ${one.name}` : x.mine !== null ? `Hostel: ${all.map((h) => h.name).join(", ")}` : "", q ? `Search: ${q}` : "", show === "out" ? rangeWords(range) : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: "Hostel residents", format: x.format, filters, rows: rows.length });
    return { rows, dues, filters };
  }, { timeout: 60_000 });
  const columns: ExportColumn<Resident>[] = [
    { label: "Student", value: (a) => a.student.name }, { label: "Admission no.", value: (a) => a.student.admissionNo }, { label: "Class", value: (a) => a.student.classSection ?? "" },
    { label: "Hostel", value: (a) => a.hostelName }, { label: "Floor", value: (a) => a.floor }, { label: "Room", value: (a) => a.roomNo }, { label: "Bed", value: (a) => a.bedNo },
    { label: "From", value: (a) => formatDate(a.allocation.startDate, "UTC") },
    { label: "Checked in", value: (a) => (a.allocation.checkedInAt ? `${formatDate(a.allocation.checkedInAt, x.tz)} ${clockAt(a.allocation.checkedInAt, x.tz)}` : "") },
    { label: "Status", value: (a) => RESIDENT_STATUS[a.status].label },
    { label: "Checked out", value: (a) => (a.allocation.endDate && a.allocation.status === "CHECKED_OUT" ? formatDate(a.allocation.endDate, "UTC") : "") },
    { label: "Reason", value: (a) => a.allocation.endReason ?? "" },
    ...(x.v.seesFees ? [{ label: "Hostel fees due", value: (a: Resident) => { const d = r.dues.get(a.student.id); return d && d > BigInt(0) ? formatRupees(d) : ""; } }] : []),
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title: "Hostel residents", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
