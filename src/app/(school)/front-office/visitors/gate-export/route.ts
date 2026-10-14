// The gate log for the dates on screen. Gate Security keeps the gate log but
// may not export it (design rule); the school must have the gate log on.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatTime } from "@/lib/format";
import { momentWhere } from "@/lib/periods";
import { foFeaturesOn } from "@/lib/front-office/settings";
import { GATE_KIND_PREFIX } from "@/lib/front-office/words";
import { foExport, plain, rangeWords } from "../../_lib/export";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await foExport(req);
  if (x instanceof Response) return x;
  if (!x.can.exportGate) return plain("You do not have permission to export the gate log.", 403);
  const range = await x.range("today", "g");
  const result = await withSchool(x.current.ctx, async (tx) => {
    if (!(await foFeaturesOn(tx, x.current.ctx)).has("front-office-gate-log")) return null;
    const rows = await tx.gateEntry.findMany({ where: { archivedAt: null, at: momentWhere(range, x.tz) }, orderBy: { at: "asc" }, take: 20_000 });
    const logins = await tx.userLogin.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.recordedById).filter((s): s is string => Boolean(s)))] } }, select: { id: true, displayName: true } });
    await logExport(tx, x.current.ctx, { title: "Gate log", format: x.format, filters: rangeWords(range), rows: rows.length });
    return { rows, logins };
  });
  if (!result) return plain("The gate log is switched off for this school.", 404);
  type Row = (typeof result.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (r) => formatDate(r.at, x.tz) },
    { label: "Time", value: (r) => formatTime(r.at, x.tz) },
    { label: "In or out", value: (r) => (r.direction === "IN" ? "In" : "Out") },
    { label: "What", value: (r) => GATE_KIND_PREFIX[r.kind] || "Person" },
    { label: "Person or vehicle", value: (r) => r.who },
    { label: "Vehicle no.", value: (r) => r.vehicleNo ?? "" },
    { label: "Purpose", value: (r) => r.purpose ?? "" },
    { label: "Recorded by", value: (r) => result.logins.find((u) => u.id === r.recordedById)?.displayName ?? "" },
  ];
  return exportResponse(await buildExport(x.format, columns, result.rows, { title: "Gate log", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: rangeWords(range) }));
}
