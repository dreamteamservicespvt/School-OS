// The events list for the dates, status and search on screen. The Accountant
// (Event Payments) gets only events with a fee, with the money columns.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { eventMoney, eventStatus } from "@/lib/events/events";
import { EVENT_STATUS, isoOf, longDay, timeSpan } from "@/lib/events/words";
import { evPageAllowed } from "@/lib/events/access";
import { evExport, plain, rangeWords } from "../../_lib/export";

export const dynamic = "force-dynamic";
const ZERO = BigInt(0);

export async function GET(req: Request) {
  const x = await evExport(req);
  if (x instanceof Response) return x;
  if (!evPageAllowed(x.v, "events")) return plain("You do not have permission to export events.", 403);
  const acc = x.v.level === "pay";
  const range = await x.range("acyear");
  const f = x.get("f");
  const q = x.get("q").trim().toLowerCase().slice(0, 60);
  const title = acc ? "Event payments" : "Events";
  const filters = [rangeWords(range), f === "up" ? "Coming up" : f === "done" ? "Done" : f === "cancel" ? "Cancelled" : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
  const r = await withSchool(x.current.ctx, async (tx) => {
    const all = await tx.event.findMany({ where: { archivedAt: null, date: dateWhere(range), ...(acc ? { feePaise: { gt: ZERO } } : {}) }, orderBy: [{ date: "asc" }, { startMin: "asc" }], take: 5000 });
    const rows = all.filter((e) => {
      const st = eventStatus(e, x.today);
      if (q && !`${e.name} ${e.type} ${e.venue ?? ""} ${e.audienceLabel}`.toLowerCase().includes(q)) return false;
      return f === "up" ? ["PLANNED", "OPEN"].includes(st) : f === "done" ? st === "DONE" : f === "cancel" ? st === "CANCELLED" : true;
    });
    const regs = rows.length ? await tx.eventRegistration.groupBy({ by: ["eventId"], where: { eventId: { in: rows.map((e) => e.id) }, withdrawnAt: null }, _count: { _all: true } }) : [];
    const money = await eventMoney(tx, rows.filter((e) => e.feePaise));
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: rows.length });
    return { rows, regs: new Map(regs.map((g) => [g.eventId, g._count._all])), money };
  });
  type Row = (typeof r.rows)[number];
  const m = (e: Row) => r.money.get(e.id);
  const columns: ExportColumn<Row>[] = [
    { label: "Number", value: (e) => e.number },
    { label: "Event", value: (e) => e.name },
    { label: "Type", value: (e) => e.type },
    { label: "Date", value: (e) => longDay(isoOf(e.date)) },
    { label: "Time", value: (e) => timeSpan(e.startMin, e.endMin) },
    ...(acc ? [] : [{ label: "Venue", value: (e: Row) => e.venue ?? "" }]),
    { label: "Audience", value: (e) => e.audienceLabel },
    { label: "Registered", value: (e) => (e.registrationOn ? String(r.regs.get(e.id) ?? 0) : "") },
    { label: "Fee per student", value: (e) => (e.feePaise ? formatRupees(e.feePaise) : "") },
    { label: "Collected", value: (e) => (m(e) ? formatRupees(m(e)!.collected) : "") },
    { label: "Due", value: (e) => (m(e) ? formatRupees(m(e)!.due) : "") },
    { label: "Refunded", value: (e) => (m(e) ? formatRupees(m(e)!.refunded) : "") },
    { label: "Status", value: (e) => EVENT_STATUS[eventStatus(e, x.today)].label },
  ];
  return exportResponse(await buildExport(x.format, columns, r.rows, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters }));
}
