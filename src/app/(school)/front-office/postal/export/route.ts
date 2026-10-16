// The postal register for the dates, status and search on screen.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatTime } from "@/lib/format";
import { momentWhere } from "@/lib/periods";
import { foFeaturesOn } from "@/lib/front-office/settings";
import { POSTAL_STATUS_KEYS, postalWhere } from "@/lib/front-office/postal";
import { POSTAL_STATUS } from "@/lib/front-office/words";
import { foExport, plain, rangeWords } from "../../_lib/export";
import { foPageAllowed } from "@/lib/front-office/access";

export const dynamic = "force-dynamic";
const TYPE_WORDS: Record<string, string> = { LETTER: "Letter", COURIER: "Courier", PARCEL: "Parcel" };

export async function GET(req: Request) {
  const x = await foExport(req);
  if (x instanceof Response) return x;
  if (!foPageAllowed(x.v, "postal")) return plain("You do not have permission to export the postal register.", 403);
  const range = await x.range("last30");
  const status = POSTAL_STATUS_KEYS.includes(x.get("status")) ? x.get("status") : "all";
  const q = x.get("q");
  const span = momentWhere(range, x.tz);
  const filters = [rangeWords(range), status !== "all" ? `Status: ${POSTAL_STATUS[status]?.label ?? status}` : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
  const rows = await withSchool(x.current.ctx, async (tx) => {
    if (!(await foFeaturesOn(tx, x.current.ctx)).has("front-office-postal")) return null;
    const list = await tx.postalEntry.findMany({ where: postalWhere({ from: span.gte, to: span.lt, status, q, atDeskAlways: true }), orderBy: { at: "asc" }, take: 20_000 });
    await logExport(tx, x.current.ctx, { title: "Postal register", format: x.format, filters, rows: list.length });
    return list;
  });
  if (!rows) return plain("Postal & Deliveries is switched off for this school.", 404);
  type Row = (typeof rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Entry", value: (r) => r.entryNo },
    { label: "Date", value: (r) => formatDate(r.at, x.tz) },
    { label: "Time", value: (r) => formatTime(r.at, x.tz) },
    { label: "Received or sent", value: (r) => (r.direction === "RECEIVED" ? "Received" : "Sent") },
    { label: "Type", value: (r) => TYPE_WORDS[r.itemType] ?? r.itemType },
    { label: "From or to", value: (r) => r.party },
    { label: "For", value: (r) => r.forText },
    { label: "Courier", value: (r) => r.courier ?? "" },
    { label: "Tracking number", value: (r) => r.trackingNo ?? "" },
    { label: "Status", value: (r) => (POSTAL_STATUS[r.status] ?? POSTAL_STATUS.SENT).label },
    { label: "Collected by", value: (r) => (r.handedToName ? `${r.handedToName}${r.handedAt ? `, ${formatDate(r.handedAt, x.tz)} ${formatTime(r.handedAt, x.tz)}` : ""}` : "") },
  ];
  return exportResponse(await buildExport(x.format, columns, rows, { title: "Postal register", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
}
