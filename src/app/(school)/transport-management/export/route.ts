// Transport exports (P8): each list as Excel, CSV or PDF with the same
// filters as on screen (search, route, dates). Export is checked on the
// server, with the person's Transport page rules; every export is logged.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { periodFromSearch, type DayRange, type PeriodKey } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { PermissionDeniedError } from "@/lib/permissions";
import { trPerson, TransportProblem, UUID_RE } from "@/lib/transport/act";
import { costsView, fleetView, placesView, routesView, tripLate, tripsView, type PlaceFilter } from "@/lib/transport/views";
import { TR_REPORTS } from "@/lib/transport/reports";
import { transportSettings } from "@/lib/transport/settings";
import { VEHICLE_STATUS, assignType, clockOf, driverRole, expiryWords, paperLabel, showPlate, tripKind, TRIP_STATUS, vehicleType, type PageKey } from "@/lib/transport/words";
import { clockAt, todayDate } from "@/lib/front-office/time";
import { dateWhere } from "@/lib/periods";
import type { Column, Row } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

const plain = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00Z`), "UTC");
const rangeWords = (r: DayRange) => (r.from === r.to ? day(r.from) : `${r.label}: ${day(r.from)} to ${day(r.to)}`);
const LIST_PAGE: Record<string, PageKey> = { routes: "routes", vehicles: "vehicles", drivers: "vehicles", costs: "vehicles", students: "students", trips: "trips", report: "reports" };

export async function GET(req: Request) {
  let who;
  try {
    who = await trPerson("export");
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to export from Transport Management.", 403);
    if (e instanceof TransportProblem) return plain(e.message, 403);
    throw e;
  }
  const url = new URL(req.url);
  const get = (k: string) => url.searchParams.get(k) ?? "";
  const list = get("list");
  const page = LIST_PAGE[list];
  if (!page) return plain("Choose what to export.", 400);
  if (!who.can.export || who.v.pages[page] === "hidden") return plain("You do not have permission to export this list.", 403);
  const format = (["csv", "xlsx", "pdf"].includes(get("format")) ? get("format") : "xlsx") as ExportFormat;
  const { current } = who;
  const tz = current.school.timeZone;
  const today = todayDate(tz);
  const dates = await periodSetup(current);
  const period = (fallback: PeriodKey | null) => periodFromSearch(Object.fromEntries(url.searchParams), { ...dates, fallback });
  const q = get("q").trim().slice(0, 60);
  const meta = (title: string, filters: string) => ({ title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters });

  const out = await withSchool(current.ctx, async (tx) => {
    const done = async <R,>(title: string, filters: string, columns: ExportColumn<R>[], rows: R[]) => {
      await logExport(tx, current.ctx, { title, format, filters: filters || "All", rows: rows.length });
      return buildExport(format, columns, rows, meta(title, filters));
    };

    if (list === "routes") {
      const v = await routesView(tx, today, q);
      type R = (typeof v.rows)[number];
      return done<R>("Routes", q ? `Search: ${q}` : "", [
        { label: "Route", value: (r) => `Route ${r.route.number}` }, { label: "Name", value: (r) => r.route.name },
        { label: "Vehicle", value: (r) => (r.vehicle ? `${r.vehicle.label ?? ""} ${showPlate(r.vehicle.number)}`.trim() : "") },
        { label: "Driver", value: (r) => r.driver?.name ?? "" }, { label: "Attendant", value: (r) => r.attendant?.name ?? "" },
        { label: "Stops", value: (r) => r.stops.length }, { label: "Students", value: (r) => r.used }, { label: "Seats", value: (r) => r.capacity ?? "" },
        { label: "First pickup", value: (r) => clockOf(r.firstPickup) }, { label: "Evening start", value: (r) => clockOf(r.route.eveningDepartMin) },
        { label: "Fee a month (lowest)", value: (r) => (r.feeMin != null ? formatRupees(r.feeMin) : "") }, { label: "Fee a month (highest)", value: (r) => (r.feeMax != null ? formatRupees(r.feeMax) : "") },
      ], v.rows);
    }

    if (list === "vehicles" || list === "drivers") {
      const s = await transportSettings(tx, current.ctx);
      const f = await fleetView(tx, today, s.expiryReminderDays);
      const t = q.toLowerCase();
      if (list === "vehicles") {
        const rows = f.vehicles.filter((r) => !t || [r.v.number, r.v.label ?? "", r.v.model ?? "", r.route?.name ?? "", r.driver?.name ?? ""].join(" ").toLowerCase().includes(t));
        type R = (typeof rows)[number];
        const paper = (k: string) => (r: R) => { const d = r.papers.find((x) => x.kind === k); return d ? formatDate(d.expiresOn) : ""; };
        return done<R>("Vehicles", q ? `Search: ${q}` : "", [
          { label: "Vehicle number", value: (r) => showPlate(r.v.number) }, { label: "Name", value: (r) => r.v.label ?? "" }, { label: "Type", value: (r) => vehicleType(r.v.type) },
          { label: "Make and model", value: (r) => r.v.model ?? "" }, { label: "Seats", value: (r) => r.v.capacity }, { label: "Owned or hired", value: (r) => (r.v.ownership === "HIRED" ? `Hired${r.v.vendor ? ` from ${r.v.vendor.name}` : ""}` : "Owned") },
          { label: "Route", value: (r) => (r.route ? `Route ${r.route.number} · ${r.route.name}` : "") }, { label: "Driver", value: (r) => r.driver?.name ?? "" },
          { label: "Status", value: (r) => VEHICLE_STATUS[r.v.status]?.label ?? r.v.status }, { label: "GPS device", value: (r) => r.v.gpsDeviceId ?? "" },
          ...["INSURANCE", "FITNESS", "PERMIT", "POLLUTION"].map((k) => ({ label: `${paperLabel(k)} till`, value: paper(k) })),
          { label: "Odometer (km)", value: (r) => r.v.odometerKm ?? "" },
        ], rows);
      }
      const rows = f.people.filter((r) => !t || [r.d.name, r.d.phone, r.d.licenceNo ?? ""].join(" ").toLowerCase().includes(t));
      type R = (typeof rows)[number];
      return done<R>("Drivers and attendants", q ? `Search: ${q}` : "", [
        { label: "Name", value: (r) => r.d.name }, { label: "Role", value: (r) => driverRole(r.d.role) }, { label: "Phone", value: (r) => r.d.phone },
        { label: "Staff or hired", value: (r) => (r.d.employment === "HIRED" ? `Hired${r.d.vendor ? ` from ${r.d.vendor.name}` : ""}` : "Staff") },
        { label: "Licence number", value: (r) => r.d.licenceNo ?? "" }, { label: "Licence expiry", value: (r) => (r.d.licenceExpiry ? formatDate(r.d.licenceExpiry) : "") },
        { label: "Licence", value: (r) => (r.d.role === "DRIVER" ? expiryWords(r.d.licenceExpiry, today) : "") },
        { label: "Route", value: (r) => (r.route ? `Route ${r.route.number}` : "") }, { label: "Driver app login", value: (r) => (r.app.state === "None" ? "No login" : r.app.state) },
        { label: "Status", value: (r) => (r.d.status === "ACTIVE" ? "Active" : "Inactive") },
      ], rows);
    }

    if (list === "costs") {
      const range = period("thismonth");
      const kind = get("kind") === "FUEL" ? "FUEL" : get("kind") === "REPAIR" ? "REPAIR" : "all";
      const vehicleId = UUID_RE.test(get("v")) ? get("v") : null;
      const c = await costsView(tx, range, kind, vehicleId);
      const vehicles = await tx.vehicle.findMany({ where: { id: { in: c.rows.map((r) => r.vehicleId) } }, select: { id: true, label: true, number: true } });
      const vName = (id: string) => { const v = vehicles.find((x) => x.id === id); return v ? `${v.label ?? ""} ${showPlate(v.number)}`.trim() : ""; };
      type R = (typeof c.rows)[number];
      const filters = [range ? rangeWords(range) : "All dates", kind !== "all" ? (kind === "FUEL" ? "Fuel" : "Repairs and service") : "", vehicleId ? vName(vehicleId) : ""].filter(Boolean).join(" · ");
      return done<R>("Fuel and repairs", filters, [
        { label: "Date", value: (r) => formatDate(r.date) }, { label: "Vehicle", value: (r) => vName(r.vehicleId) }, { label: "Kind", value: (r) => (r.kind === "FUEL" ? "Fuel" : r.kind === "SERVICE" ? "Service" : "Repair") },
        { label: "Details", value: (r) => r.what }, { label: "Odometer (km)", value: (r) => r.odometerKm ?? "" }, { label: "Amount", value: (r) => formatRupees(r.amountPaise) },
        { label: "Status", value: (r) => (r.cancelledAt ? `Cancelled: ${r.cancelReason ?? ""}` : "Recorded") },
      ], c.rows);
    }

    if (list === "students") {
      const range = period(null);
      const show = (["all", "one-way", "no-fee", "future"] as const).find((x) => x === get("show")) ?? "all";
      const routeId = UUID_RE.test(get("route")) ? get("route") : null;
      const rows = await placesView(tx, today, { routeId, show, q, range } satisfies PlaceFilter);
      type R = (typeof rows)[number];
      const filters = [range ? `Started ${rangeWords(range)}` : "", routeId && rows[0] ? `Route ${rows[0].route.number}` : "", show !== "all" ? ({ "one-way": "One-way", "no-fee": "No fee added", future: "Starting later" } as const)[show] : "", q ? `Search: ${q}` : ""].filter(Boolean).join(" · ");
      return done<R>("Students using transport", filters, [
        { label: "Student", value: (r) => r.card.name }, { label: "Admission number", value: (r) => r.card.admissionNo }, { label: "Class", value: (r) => r.card.cls },
        { label: "Route", value: (r) => `Route ${r.route.number} · ${r.route.name}` }, { label: "Stop", value: (r) => r.stop?.name ?? "" }, { label: "Pickup", value: (r) => clockOf(r.stop?.pickupMin) },
        { label: "Type", value: (r) => assignType(r.p.type) }, { label: "From", value: (r) => formatDate(r.p.fromDate) }, { label: "Till", value: (r) => (r.p.toDate ? formatDate(r.p.toDate) : "") },
        { label: "Fee a month", value: (r) => formatRupees(r.p.monthlyFeePaise) }, { label: "Fee added", value: (r) => (r.feeAdded ? "Yes" : "No") }, { label: "Bus pass", value: (r) => r.p.busPassNo ?? "" },
      ], rows);
    }

    if (list === "trips") {
      const range = period("last7")!;
      const kind = get("kind") === "MORNING" || get("kind") === "EVENING" ? get("kind") : null;
      const status = Object.keys(TRIP_STATUS).includes(get("status")) ? get("status") : null;
      const routeId = UUID_RE.test(get("route")) ? get("route") : null;
      const rows = await tripsView(tx, { date: dateWhere(range), ...(kind ? { kind } : {}), ...(status ? { status } : {}), ...(routeId ? { routeId } : {}) });
      type R = (typeof rows)[number];
      const filters = [rangeWords(range), kind ? tripKind(kind) : "", status ? TRIP_STATUS[status].label : "", routeId && rows[0] ? `Route ${rows[0].route.number}` : ""].filter(Boolean).join(" · ");
      return done<R>("Trip history", filters, [
        { label: "Date", value: (r) => formatDate(r.t.date) }, { label: "Route", value: (r) => `Route ${r.route.number} · ${r.route.name}` }, { label: "Trip", value: (r) => tripKind(r.t.kind) },
        { label: "Vehicle", value: (r) => (r.vehicle ? showPlate(r.vehicle.number) : "") }, { label: "Driver", value: (r) => r.driver?.name ?? "" }, { label: "Status", value: (r) => TRIP_STATUS[r.t.status]?.label ?? r.t.status },
        { label: "Planned start", value: (r) => clockOf(r.t.plannedStartMin) }, { label: "Started", value: (r) => (r.t.startedAt ? clockAt(r.t.startedAt, tz) : "") }, { label: "Ended", value: (r) => (r.t.endedAt ? clockAt(r.t.endedAt, tz) : "") },
        { label: "Stops reached", value: (r) => `${r.reached} of ${r.stops}` }, { label: "Stops missed", value: (r) => r.missed }, { label: "Boarded", value: (r) => r.boarded }, { label: "Not boarded", value: (r) => r.notBoarded },
        { label: "Most minutes late", value: (r) => tripLate(r, tz) }, { label: "Cancel reason", value: (r) => r.t.cancelReason ?? "" },
      ], rows);
    }

    // One Transport report, with its dates.
    const rep = TR_REPORTS.find((r) => r.key === get("r"));
    if (!rep) return null;
    if (rep.key === "tr-fees" && current.permissions["fee-management"]?.see !== "all") return "fees" as const;
    const s = await transportSettings(tx, current.ctx);
    const range = rep.dated ? period(rep.key === "tr-fees" ? "finyear" : "last30") : null;
    const table = await rep.run({ tx, range, tz, today, lateAfterMin: s.lateAfterMin });
    const cell = (c: Column, v: Row[string]) => (v == null ? "" : c.kind === "money" && typeof v === "bigint" ? formatRupees(v) : v instanceof Date ? formatDate(v) : c.kind === "percent" && typeof v === "number" ? `${v}%` : typeof v === "bigint" ? v.toString() : v);
    const rows = table.totals ? [...table.rows, table.totals] : table.rows;
    return done<Row>(rep.name, range ? rangeWords(range) : `As on ${formatDate(today)}`, table.columns.map((c) => ({ label: c.label, value: (r: Row) => cell(c, r[c.key] ?? null) })), rows);
  }, { timeout: 120_000 });
  if (out === null) return plain("This report was not found.", 404);
  if (out === "fees") return plain("Transport fee reports need Fee Management.", 403);
  return exportResponse(out);
}
