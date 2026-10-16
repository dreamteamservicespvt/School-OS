// The call log for the dates, purpose and search on screen. Parents' numbers
// show only the last 4 digits for roles without "see parent phone numbers",
// in the export too.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatDate, formatTime } from "@/lib/format";
import { momentWhere } from "@/lib/periods";
import { callLogWhere } from "@/lib/front-office/calls";
import { CALL_STATUS, maskPhone, showPhone } from "@/lib/front-office/words";
import { foExport, plain, rangeWords } from "../../_lib/export";
import { foPageAllowed } from "@/lib/front-office/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await foExport(req);
  if (x instanceof Response) return x;
  if (!foPageAllowed(x.v, "enquiries")) return plain("You do not have permission to export the call log.", 403);
  const range = await x.range("today");
  const purpose = x.get("purpose") || "all";
  const q = x.get("q");
  const phones = x.can.parentPhones;
  const span = momentWhere(range, x.tz);
  const filters = [rangeWords(range), purpose !== "all" ? `Purpose: ${purpose}` : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
  const result = await withSchool(x.current.ctx, async (tx) => {
    const rows = await tx.callLogEntry.findMany({ where: callLogWhere({ from: span.gte, to: span.lt, purpose, q, phones }), orderBy: { at: "asc" }, take: 20_000 });
    const logins = await tx.userLogin.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.createdById, r.followUpLoginId]).filter((s): s is string => Boolean(s)))] } }, select: { id: true, displayName: true } });
    await logExport(tx, x.current.ctx, { title: "Call log", format: x.format, filters, rows: rows.length });
    return { rows, logins };
  });
  type Row = (typeof result.rows)[number];
  const who = (id: string | null) => result.logins.find((u) => u.id === id)?.displayName ?? "";
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (r) => formatDate(r.at, x.tz) },
    { label: "Time", value: (r) => formatTime(r.at, x.tz) },
    { label: "In or out", value: (r) => (r.direction === "IN" ? "Incoming" : "Outgoing") },
    { label: "Name", value: (r) => r.name },
    { label: "Who", value: (r) => r.who ?? "" },
    { label: "Phone", value: (r) => (r.isParent && !phones ? maskPhone(r.phone) : showPhone(r.phone)) },
    { label: "Purpose", value: (r) => r.purpose },
    { label: "Note", value: (r) => r.note ?? "" },
    { label: "Query", value: (r) => r.queryNo ?? "" },
    { label: "Follow-up", value: (r) => (r.status === "FOLLOW_UP" && r.followUpAt ? `${formatDate(r.followUpAt, x.tz)} ${formatTime(r.followUpAt, x.tz)}, ${who(r.followUpLoginId)}` : "") },
    { label: "Status", value: (r) => (CALL_STATUS[r.status] ?? CALL_STATUS.CLOSED).label },
    { label: "Logged by", value: (r) => who(r.createdById) },
  ];
  return exportResponse(await buildExport(x.format, columns, result.rows, { title: "Call log", schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
}
