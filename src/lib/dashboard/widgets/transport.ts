// Transport Management on the Dashboard (01 §2 "Transport (optional):
// vehicles, routes, drivers; live fleet status and transport alerts; Manage
// Transport shortcut"; 01 §3 "Transport issues": "Bus KA01AB1234 offline 20
// minutes"; 12 §4 Sends "01 Dashboard"). Shown only when Transport is built
// and switched on for the school, to people who see the whole of Transport
// (the Principal, School Admin, Vice Principal and Transport In-charge). A
// driver has no Dashboard: his home is /driver.
import "server-only";

import { trCan, trViewer } from "../../transport/access";
import { liveStatus, BASE, showPlate, tripKind, vehicleName } from "../../transport/words";
import { transportSettings } from "../../transport/settings";
import { feeCoverage, onBusOn } from "../../transport/places";
import { minutesLate } from "../../transport/views";
import { addDays, n, plural, someNames } from "../common";
import type { DashContext, ListRow, Viewer, Widget } from "../types";

const HOMES = ["leader", "transport"] as const;

function tr(c: DashContext) {
  return c.memo("transport-viewer", async () => {
    const v = trViewer(c.viewer);
    return { v, can: trCan(v, c.viewer), settings: await transportSettings(c.tx, c.viewer.ctx) };
  });
}

/** The whole of Transport (not a driver's own trips). */
const seesAll = (v: Viewer) => v.permissions["transport-management"]?.see === "all";
const liveHref = (v: ReturnType<typeof trViewer>) => (v.pages.live !== "hidden" ? BASE : `${BASE}/trips`);

/** Today's trips, the one running now first. */
async function todayTrips(c: DashContext) {
  return c.memo("transport-trips-today", () => c.tx.trip.findMany({ where: { date: c.today, status: { not: "CANCELLED" } }, orderBy: [{ kind: "asc" }, { plannedStartMin: "asc" }] }));
}

/** "Buses on the road": trips running now, of today's. */
const onRoad: Widget<"band"> = {
  id: "transport.on-road",
  module: "transport-management",
  kind: "band",
  homes: HOMES,
  allowed: seesAll,
  async load(c) {
    const { v } = await tr(c);
    const trips = await todayTrips(c);
    if (!trips.length) {
      const students = await c.tx.transportAssignment.count({ where: onBusOn(c.today) });
      return { id: "transport.on-road", label: "Buses on the road", big: "0", foot: students ? `${plural(students, "student")} use the buses` : "No trips today", href: `${BASE}/trips` };
    }
    const running = trips.filter((t) => t.status === "STARTED").length;
    const done = trips.filter((t) => t.status === "COMPLETED").length;
    return { id: "transport.on-road", label: "Buses on the road", big: n(running), of: `/ ${n(trips.length)}`, foot: `${plural(done, "trip")} completed today`, href: liveHref(v), ring: Math.round(((running + done) / trips.length) * 100) };
  },
};

/** Open transport alerts: offline, late, over speed, off route, emergency, breakdown. */
const openAlerts: Widget<"attention"> = {
  id: "transport.alerts",
  module: "transport-management",
  kind: "attention",
  homes: HOMES,
  allowed: seesAll,
  async load(c) {
    const { v } = await tr(c);
    const rows = await c.tx.transportAlert.findMany({ where: { status: "OPEN", at: { gte: addDays(c.today, -1) } }, orderBy: { at: "desc" }, take: 30 });
    if (!rows.length) return null;
    const urgent = rows.filter((r) => r.kind === "EMERGENCY" || r.kind === "BREAKDOWN");
    const top = urgent[0] ?? rows[0];
    return {
      id: "transport.alerts", tone: urgent.length ? "bad" : "warn", icon: "TriangleAlert",
      title: rows.length === 1 ? top.text : `${plural(rows.length, "transport alert")} open`,
      detail: rows.length === 1 ? "Check the bus and close the alert when it is sorted." : `${someNames(rows.slice(0, 2).map((r) => r.text))}${rows.length > 2 ? ` and ${n(rows.length - 2)} more` : ""}`,
      action: "Open", href: liveHref(v), value: rows.map((r) => r.id).sort().join(",").slice(0, 120),
    };
  },
};

/** Bus papers and driver licences expired or due within the reminder days (A15). */
const papersDue: Widget<"attention"> = {
  id: "transport.papers",
  module: "transport-management",
  kind: "attention",
  homes: HOMES,
  allowed: seesAll,
  async load(c) {
    const { settings } = await tr(c);
    const until = addDays(c.today, settings.expiryReminderDays);
    const [papers, licences] = await Promise.all([
      c.tx.vehicleDocument.findMany({ where: { replacedAt: null, expiresOn: { lte: until }, vehicle: { archivedAt: null } }, include: { vehicle: { select: { number: true, label: true } } }, orderBy: { expiresOn: "asc" } }),
      c.tx.driver.findMany({ where: { archivedAt: null, status: "ACTIVE", role: "DRIVER", licenceExpiry: { lte: until } }, select: { name: true, licenceExpiry: true }, orderBy: { licenceExpiry: "asc" } }),
    ]);
    const total = papers.length + licences.length;
    if (!total) return null;
    const expired = papers.filter((p) => p.expiresOn < c.today).length + licences.filter((l) => l.licenceExpiry! < c.today).length;
    const names = [...licences.map((l) => `Licence of ${l.name}`), ...papers.map((p) => `${showPlate(p.vehicle.number)} ${p.kind.toLowerCase()}`)];
    return {
      id: "transport.papers", tone: expired ? "bad" : "warn", icon: "FileWarning",
      title: expired ? `${plural(expired, "transport paper")} expired` : `${plural(total, "transport paper")} due in ${settings.expiryReminderDays} days`,
      detail: `${someNames(names)}${names.length > 2 ? ` and ${n(names.length - 2)} more` : ""}. Upload the renewed papers.`,
      action: "Review", href: `${BASE}/vehicles?view=papers`, value: `${total}:${expired}`,
    };
  },
};

/** Students on a bus with no transport fee (12 §2 Fix fee coverage). */
const noFee: Widget<"attention"> = {
  id: "transport.no-fee",
  module: "transport-management",
  kind: "attention",
  homes: HOMES,
  allowed: seesAll,
  async load(c) {
    const cov = await feeCoverage(c.tx, c.today);
    if (!cov.noFee.length) return null;
    return {
      id: "transport.no-fee", tone: "warn", icon: "CreditCard",
      title: `${plural(cov.noFee.length, "student")} on a bus with no transport fee`,
      detail: "Add the stop's fee so it is collected with their other fees.",
      action: "Fix", href: `${BASE}/students?show=no-fee`, value: String(cov.noFee.length),
    };
  },
};

/** The fleet now: vehicles, routes and drivers, each of today's trips with its state; Manage Transport. */
const fleetPanel: Widget<"panel"> = {
  id: "transport.fleet",
  module: "transport-management",
  kind: "panel",
  homes: HOMES,
  allowed: seesAll,
  async load(c) {
    const { v, settings } = await tr(c);
    const [vehicles, routes, drivers, trips] = await Promise.all([
      c.tx.vehicle.count({ where: { archivedAt: null } }),
      c.tx.route.count({ where: { archivedAt: null } }),
      c.tx.driver.count({ where: { archivedAt: null, status: "ACTIVE", role: "DRIVER" } }),
      todayTrips(c),
    ]);
    if (!vehicles && !routes) return null;
    // Now's trips: the morning ones until all of them end, then the evening ones.
    const morningLeft = trips.some((t) => t.kind === "MORNING" && t.status !== "COMPLETED");
    const shown = trips.filter((t) => (morningLeft ? t.kind === "MORNING" : t.kind === "EVENING")).slice(0, 6);
    const [rts, vhs, evs] = await Promise.all([
      c.tx.route.findMany({ where: { id: { in: shown.map((t) => t.routeId) } }, select: { id: true, number: true, name: true } }),
      c.tx.vehicle.findMany({ where: { id: { in: shown.map((t) => t.vehicleId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true, label: true } }),
      c.tx.tripStopEvent.findMany({ where: { tripId: { in: shown.map((t) => t.id) }, status: "REACHED" }, select: { tripId: true, at: true, plannedMin: true } }),
    ]);
    const rows: ListRow[] = shown.map((t) => {
      const r = rts.find((x) => x.id === t.routeId);
      const veh = vhs.find((x) => x.id === t.vehicleId);
      const late = Math.max(0, ...evs.filter((e) => e.tripId === t.id).map((e) => minutesLate(e.at, e.plannedMin, c.tz) ?? 0));
      const live = liveStatus(t, c.now, settings);
      const right = t.status === "SCHEDULED" ? "Not started" : t.status === "COMPLETED" ? "Completed" : live.status === "Offline" ? "Offline" : late >= settings.lateAfterMin ? `Late ${late} min` : "On time";
      const tone = right === "Offline" ? "bad" : right.startsWith("Late") ? "warn" : t.status === "STARTED" ? "ok" : "neutral";
      return { id: t.id, title: r ? `Route ${r.number} · ${r.name}` : "Route", sub: `${tripKind(t.kind)}${veh ? ` · ${vehicleName(veh)}` : ""}`, right, rightTone: tone, href: v.pages.trips !== "hidden" ? `${BASE}/trips?trip=${t.id}` : undefined };
    });
    return {
      slot: "side",
      panel: {
        kind: "list", title: "Transport", sub: `${plural(vehicles, "vehicle")} · ${plural(routes, "route")} · ${plural(drivers, "driver")}`, icon: "Users",
        rows, href: liveHref(v), linkLabel: "Manage Transport", empty: trips.length ? "All of today's trips are done." : "No trips today.",
      },
    };
  },
};

export const TRANSPORT_WIDGETS: readonly Widget[] = [onRoad, openAlerts, papersDue, noFee, fleetPanel];
