// What the Transport pages and their exports read: one loader per list, so
// the screen and the file always agree (P8: the export honours the filters).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { OPEN_LINK } from "../students/guardian-access";
import { dateWhere, momentWhere, type DayRange } from "../periods";
import { holdsSeat, monthlyFee, routeSeats } from "./places";
import { studentCards } from "./people";
import { appStates, serviceDue } from "./fleet";
import { plannedMinOf } from "./trips";
import { routeStudents } from "./messages";
import { expiryTone } from "./words";

/* ---------- Routes ---------- */

export async function routesView(tx: Tx, today: Date, q = "") {
  const routes = await tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" }, include: { vehicle: true, stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } });
  const seats = await routeSeats(tx, today, routes.map((r) => r.id));
  const crewIds = [...new Set(routes.flatMap((r) => [r.driverId, r.attendantId]).filter((x): x is string => Boolean(x)))];
  const crew = await tx.driver.findMany({ where: { id: { in: crewIds } }, select: { id: true, name: true, phone: true, licenceExpiry: true } });
  const name = (id: string | null) => crew.find((c) => c.id === id) ?? null;
  const rows = routes.map((r) => {
    const fees = r.stops.map((s) => s.feeTwoWayPaise ?? r.feeTwoWayPaise).filter((x): x is bigint => x != null);
    const used = seats.get(r.id)?.used ?? 0;
    return {
      route: r, vehicle: r.vehicle, driver: name(r.driverId), attendant: name(r.attendantId), stops: r.stops, used, capacity: r.vehicle?.capacity ?? null,
      feeMin: fees.length ? fees.reduce((a, b) => (b < a ? b : a)) : null, feeMax: fees.length ? fees.reduce((a, b) => (b > a ? b : a)) : null,
      firstPickup: r.stops.length ? Math.min(...r.stops.map((s) => s.pickupMin)) : null,
    };
  });
  const t = q.trim().toLowerCase();
  const shown = t ? rows.filter((x) => [x.route.name, `route ${x.route.number}`, x.driver?.name ?? "", x.vehicle?.number ?? "", x.vehicle?.label ?? "", ...x.stops.map((s) => s.name)].join(" ").toLowerCase().includes(t)) : rows;
  const archived = await tx.route.findMany({ where: { archivedAt: { not: null } }, orderBy: { archivedAt: "desc" }, take: 20 });
  return { rows: shown, all: rows, archived };
}

export type RouteRow = Awaited<ReturnType<typeof routesView>>["rows"][number];

/** One route: its stops in order with the students at each. */
export async function routeDetail(tx: Tx, routeId: string, today: Date) {
  const route = await tx.route.findFirst({ where: { id: routeId }, include: { vehicle: true, stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } });
  if (!route) return null;
  const places = await tx.transportAssignment.findMany({ where: { routeId, ...holdsSeat(today) }, select: { id: true, studentId: true, stopId: true, type: true, fromDate: true } });
  const cards = await studentCards(tx, places.map((p) => p.studentId));
  const live = places.filter((p) => cards.get(p.studentId)?.studying);
  const crew = await tx.driver.findMany({ where: { id: { in: [route.driverId, route.attendantId].filter((x): x is string => Boolean(x)) } } });
  return {
    route, vehicle: route.vehicle, stops: route.stops,
    driver: crew.find((c) => c.id === route.driverId) ?? null, attendant: crew.find((c) => c.id === route.attendantId) ?? null,
    students: live.map((p) => ({ ...p, card: cards.get(p.studentId)! })).sort((a, b) => a.card.classSort - b.card.classSort || a.card.name.localeCompare(b.card.name)),
    used: new Set(live.map((p) => p.studentId)).size,
  };
}

/* ---------- Vehicles, people, papers, vendors ---------- */

export async function fleetView(tx: Tx, today: Date, soonDays: number) {
  const [vehicles, routes, drivers, vendors] = await Promise.all([
    tx.vehicle.findMany({ where: { archivedAt: null }, orderBy: [{ label: "asc" }, { number: "asc" }], include: { documents: { where: { replacedAt: null }, orderBy: { expiresOn: "asc" } }, vendor: { select: { id: true, name: true } } } }),
    tx.route.findMany({ where: { archivedAt: null }, select: { id: true, number: true, name: true, vehicleId: true, driverId: true, attendantId: true } }),
    tx.driver.findMany({ where: { archivedAt: null }, orderBy: [{ role: "asc" }, { name: "asc" }], include: { vendor: { select: { id: true, name: true } }, devices: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } } } }),
    tx.transportVendor.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const states = await appStates(tx, drivers);
  const routeOf = (vehicleId: string) => routes.find((r) => r.vehicleId === vehicleId) ?? null;
  const crewRoute = (driverId: string) => routes.find((r) => r.driverId === driverId || r.attendantId === driverId) ?? null;
  const vRows = vehicles.map((v) => {
    const route = routeOf(v.id);
    const driver = route?.driverId ? drivers.find((d) => d.id === route.driverId) ?? null : null;
    const tones = v.documents.map((d) => expiryTone(d.expiresOn, today, soonDays));
    return { v, route, driver, papers: v.documents, paperTone: tones.includes("bad") ? "bad" as const : tones.includes("warn") ? "warn" as const : v.documents.length ? "ok" as const : "neutral" as const, service: serviceDue(v, today) };
  });
  const pRows = drivers.map((d) => {
    const route = crewRoute(d.id);
    const vehicle = route?.vehicleId ? vehicles.find((v) => v.id === route.vehicleId) ?? null : null;
    return { d, route, vehicle, app: states.get(d.id) ?? { state: "None" as const, username: null } };
  });
  return { vehicles: vRows, people: pRows, vendors, routes };
}

/** Papers and licences ending in the dates (and anything already expired while the dates reach today). */
export async function papersDue(tx: Tx, today: Date, range: { from: Date; to: Date } | null) {
  const until = range?.to ?? new Date(today.getTime() + 45 * 86_400_000);
  const withExpired = !range || range.to >= today;
  const [docs, drivers] = await Promise.all([
    tx.vehicleDocument.findMany({ where: { replacedAt: null, vehicle: { archivedAt: null }, OR: [{ expiresOn: { gte: range?.from ?? today, lte: until } }, ...(withExpired ? [{ expiresOn: { lt: today } }] : [])] }, include: { vehicle: { select: { id: true, label: true, number: true } } }, orderBy: { expiresOn: "asc" } }),
    tx.driver.findMany({ where: { archivedAt: null, status: "ACTIVE", role: "DRIVER", OR: [{ licenceExpiry: { gte: range?.from ?? today, lte: until } }, ...(withExpired ? [{ licenceExpiry: { lt: today } }] : [])] }, orderBy: { licenceExpiry: "asc" } }),
  ]);
  const rows = [
    ...docs.map((d) => ({ id: d.id, kind: d.kind as string, what: "paper" as const, vehicleId: d.vehicleId, driverId: null as string | null, who: d.vehicle, name: null as string | null, expiresOn: d.expiresOn })),
    ...drivers.map((d) => ({ id: d.id, kind: "LICENCE", what: "licence" as const, vehicleId: null as string | null, driverId: d.id, who: null, name: d.name, expiresOn: d.licenceExpiry! })),
  ].sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime());
  return rows;
}

export async function costsView(tx: Tx, range: DayRange | null, kind: "all" | "FUEL" | "REPAIR", vehicleId: string | null) {
  const when = range ? { date: dateWhere(range) } : {};
  const veh = vehicleId ? { vehicleId } : {};
  const [fuel, repairs] = await Promise.all([
    kind === "REPAIR" ? Promise.resolve([]) : tx.fuelLog.findMany({ where: { ...when, ...veh }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 }),
    kind === "FUEL" ? Promise.resolve([]) : tx.maintenanceLog.findMany({ where: { ...when, ...veh }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 }),
  ]);
  const vehicles = await tx.vehicle.findMany({ where: { id: { in: [...new Set([...fuel, ...repairs].map((x) => x.vehicleId))] } }, select: { id: true, label: true, number: true } });
  const rows = [
    ...fuel.map((f) => ({ id: f.id, kind: "FUEL" as const, date: f.date, vehicleId: f.vehicleId, what: [f.litres != null ? `${Number(f.litres)} L` : null, f.note].filter(Boolean).join(" · ") || "Fuel", amountPaise: f.amountPaise, odometerKm: f.odometerKm, billFileId: f.billFileId, cancelledAt: f.cancelledAt, cancelReason: f.cancelReason, createdAt: f.createdAt })),
    ...repairs.map((m) => ({ id: m.id, kind: m.kind as "REPAIR" | "SERVICE", date: m.date, vehicleId: m.vehicleId, what: m.what, amountPaise: m.amountPaise, odometerKm: m.odometerKm, billFileId: m.billFileId, cancelledAt: m.cancelledAt, cancelReason: m.cancelReason, createdAt: m.createdAt })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  return { rows, vehicles };
}

/* ---------- Student Transport ---------- */

export type PlaceFilter = { routeId: string | null; show: "all" | "one-way" | "no-fee" | "future"; q: string; range: DayRange | null };

/** Students with a place on a bus now or from a later date, with whether the transport fee is on their fees. */
export async function placesView(tx: Tx, today: Date, f: PlaceFilter) {
  const where: Prisma.TransportAssignmentWhereInput = { ...holdsSeat(today), ...(f.routeId ? { routeId: f.routeId } : {}), ...(f.range ? { fromDate: dateWhere(f.range) } : {}) };
  const places = await tx.transportAssignment.findMany({ where, orderBy: { fromDate: "desc" }, take: 3000 });
  const cards = await studentCards(tx, places.map((p) => p.studentId));
  const [routes, stops, charges] = await Promise.all([
    tx.route.findMany({ where: { id: { in: [...new Set(places.map((p) => p.routeId))] } }, select: { id: true, number: true, name: true } }),
    tx.stop.findMany({ where: { id: { in: [...new Set(places.map((p) => p.stopId))] } }, select: { id: true, name: true, pickupMin: true, dropMin: true } }),
    tx.transportFeeCharge.groupBy({ by: ["assignmentId"], where: { assignmentId: { in: places.map((p) => p.id) }, removedAt: null }, _count: { _all: true } }),
  ]);
  // A fee row from Fee Structure (kind transport) also counts as having the fee.
  const heads = await tx.feeHead.findMany({ where: { kind: "transport" }, select: { id: true } });
  const structureFee = heads.length ? new Set((await tx.studentFeeDue.findMany({ where: { feeHeadId: { in: heads.map((h) => h.id) }, studentId: { in: places.map((p) => p.studentId) }, state: "OPEN" }, select: { studentId: true } })).map((d) => d.studentId)) : new Set<string>();
  const t = f.q.trim().toLowerCase();
  // A place carried over to the next year starts the day after this year's place ends:
  // the student is listed once, on the place in use today, unless later places are asked for.
  const inUse = new Set(places.filter((p) => p.fromDate <= today).map((p) => p.studentId));
  const nextOf = new Map(places.filter((p) => p.fromDate > today && inUse.has(p.studentId)).map((p) => [p.studentId, p]));
  const rows = places
    .filter((p) => f.show === "future" || p.fromDate <= today || !inUse.has(p.studentId))
    .filter((p) => cards.get(p.studentId)?.studying)
    .map((p) => ({ p, card: cards.get(p.studentId)!, route: routes.find((r) => r.id === p.routeId)!, stop: stops.find((s) => s.id === p.stopId)!, feeAdded: charges.some((c) => c.assignmentId === p.id) || structureFee.has(p.studentId), future: p.fromDate > today, next: p.fromDate <= today ? nextOf.get(p.studentId) ?? null : null }))
    .filter((r) => (f.show === "one-way" ? r.p.type !== "TWO_WAY" : f.show === "no-fee" ? !r.feeAdded : f.show === "future" ? r.future : true))
    .filter((r) => !t || [r.card.name, r.card.admissionNo, r.stop?.name ?? "", r.card.cls].join(" ").toLowerCase().includes(t))
    .sort((a, b) => a.route.number - b.route.number || a.card.classSort - b.card.classSort || a.card.name.localeCompare(b.card.name));
  return rows;
}

export type PlaceRow = Awaited<ReturnType<typeof placesView>>[number];

/* ---------- Trips ---------- */

/** Trips of a day or dates, with stops reached, missed and boarding counts. */
export async function tripsView(tx: Tx, where: Prisma.TripWhereInput) {
  const trips = await tx.trip.findMany({ where, orderBy: [{ date: "desc" }, { kind: "asc" }, { plannedStartMin: "asc" }], take: 600 });
  const ids = trips.map((t) => t.id);
  const [routes, events, boarding, vehicles, crew] = await Promise.all([
    tx.route.findMany({ where: { id: { in: [...new Set(trips.map((t) => t.routeId))] } }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } }),
    tx.tripStopEvent.findMany({ where: { tripId: { in: ids } } }),
    tx.boardingEvent.groupBy({ by: ["tripId", "status"], where: { tripId: { in: ids } }, _count: { _all: true } }),
    tx.vehicle.findMany({ where: { id: { in: [...new Set(trips.map((t) => t.vehicleId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, label: true, number: true } }),
    tx.driver.findMany({ where: { id: { in: [...new Set(trips.flatMap((t) => [t.driverId, t.attendantId]).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true, phone: true, licenceExpiry: true } }),
  ]);
  return trips.map((t) => {
    const route = routes.find((r) => r.id === t.routeId)!;
    const ev = events.filter((e) => e.tripId === t.id);
    const count = (s: string) => boarding.find((b) => b.tripId === t.id && b.status === s)?._count._all ?? 0;
    const late = ev.filter((e) => e.status === "REACHED" && e.plannedMin != null).map((e) => e);
    return {
      t, route, vehicle: vehicles.find((v) => v.id === t.vehicleId) ?? null, driver: crew.find((c) => c.id === t.driverId) ?? null, attendant: crew.find((c) => c.id === t.attendantId) ?? null,
      reached: ev.filter((e) => e.status === "REACHED").length, missed: ev.filter((e) => e.status === "MISSED").length, stops: route.stops.length,
      boarded: count("BOARDED") + count("DROPPED"), notBoarded: count("NOT_BOARDED"), dropped: count("DROPPED"), events: ev, lateEvents: late,
    };
  });
}

export type TripRow = Awaited<ReturnType<typeof tripsView>>[number];

const CLOCKS = new Map<string, Intl.DateTimeFormat>();

/** Minutes late at a stop, from the reached time and the planned time (school's zone). */
export function minutesLate(at: Date, plannedMin: number | null, tz: string) {
  if (plannedMin == null) return null;
  // One formatter per time zone: making one for every stop of every trip is slow.
  let f = CLOCKS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    CLOCKS.set(tz, f);
  }
  const parts = f.formatToParts(at);
  const m = Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
  return m - plannedMin;
}

/** How late a trip ran: the most minutes late at any stop reached. */
export function tripLate(row: Pick<TripRow, "events">, tz: string) {
  let worst = 0;
  for (const e of row.events) {
    if (e.status !== "REACHED") continue;
    const l = minutesLate(e.at, e.plannedMin, tz);
    if (l != null && l > worst) worst = l;
  }
  return worst;
}

/** Alerts in the dates (or today), newest first. */
export async function alertsView(tx: Tx, range: DayRange, tz: string, kind: string | null) {
  return tx.transportAlert.findMany({ where: { at: momentWhere(range, tz), ...(kind ? { kind } : {}) }, orderBy: { at: "desc" }, take: 500 });
}

/* ---------- Live Tracking ---------- */

/** Every trip of one kind today with where the bus is, its next stop and the arrival time there. */
export async function liveView(tx: Tx, today: Date, kind: "MORNING" | "EVENING") {
  const rows = await tripsView(tx, { date: today, kind, status: { not: "CANCELLED" } });
  return rows.map((r) => {
    const ordered = kind === "MORNING" ? r.route.stops : [...r.route.stops].reverse();
    const done = new Set(r.events.map((e) => e.stopId));
    const next = ordered.find((s) => !done.has(s.id)) ?? null;
    return { ...r, ordered, next, plannedAt: (stopId: string) => { const s = r.route.stops.find((x) => x.id === stopId)!; return plannedMinOf(s, kind, r.route, r.route.stops); } };
  });
}

/** Parents (each student's main parent) of the students on each route today: the number a route message goes to. */
export async function routeParents(tx: Tx, today: Date) {
  const routes = await tx.route.findMany({ where: { archivedAt: null }, select: { id: true, number: true, name: true }, orderBy: { number: "asc" } });
  const out: { id: string; number: number; name: string; label: string; students: number; parents: number }[] = [];
  for (const r of routes) {
    const students = await routeStudents(tx, r.id, today);
    const links = students.length ? await tx.studentGuardian.findMany({ where: { studentId: { in: students }, ...OPEN_LINK }, select: { studentId: true, guardianId: true, isPrimary: true } }) : [];
    const chosen = new Set<string>();
    for (const s of students) {
      const mine = links.filter((l) => l.studentId === s);
      const main = mine.find((l) => l.isPrimary) ?? mine[0];
      if (main) chosen.add(main.guardianId);
    }
    out.push({ id: r.id, number: r.number, name: r.name, label: `Route ${r.number} · ${r.name}`, students: students.length, parents: chosen.size });
  }
  return out;
}

/** The monthly fee for display on the stop list. */
export const stopFee = monthlyFee;
