// The members list for the type, class and search on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { librarySettings } from "@/lib/library/settings";
import { libRoute } from "../../_lib/route";
import { memberRows, readMembersFilter, type MemberRow } from "../../_lib/members";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "members");
  if (x instanceof Response) return x;
  const f = readMembersFilter(x.get);
  const title = f.tab === "staff" ? "Library members: staff" : f.tab === "blocked" ? "Library members: blocked" : "Library members: students";
  const r = await withSchool(x.current.ctx, async (tx) => {
    const s = await librarySettings(tx, x.current.ctx);
    const { rows } = await memberRows(tx, x.current.ctx, s, f, x.today, null);
    const sec = f.sec ? await tx.section.findFirst({ where: { id: f.sec }, select: { name: true, schoolClass: { select: { name: true } } } }) : null;
    const filters = [sec ? `Class: ${sec.schoolClass.name} ${sec.name}` : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return { rows, filters };
  }, { timeout: 60_000 });
  const columns: ExportColumn<MemberRow>[] = [
    { label: "Name", value: (m) => m.name },
    { label: "Type", value: (m) => (m.kind === "STAFF" ? "Staff" : "Student") },
    { label: "Class or department", value: (m) => m.group },
    { label: "Card no.", value: (m) => m.cardNo },
    { label: "Limit", value: (m) => m.limit },
    { label: "Limit changed because", value: (m) => m.limitChanged?.reason ?? "" },
    { label: "Books out", value: (m) => m.out },
    { label: "Overdue", value: (m) => m.overdue },
    { label: "Fines due", value: (m) => (m.finesPaise > BigInt(0) ? formatRupees(m.finesPaise) : "") },
    { label: "Status", value: (m) => (m.blocked ? "Blocked" : m.active ? "Active" : "Not active") },
    { label: "Blocked because", value: (m) => m.blocked?.reason ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
