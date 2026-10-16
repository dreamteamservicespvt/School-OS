// Trips (12 §2): the trip schedule, today's trips, start and end, stops
// reached, boarding, the bus location from the driver app, alerts, the
// emergency button and breakdowns. Locations are collected and kept only
// while a trip is running, from Start trip to End trip (decided 9 October 2026).
import "server-only";

import type { Prisma, Route, Stop, Trip, TripSchedule } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { isHoliday } from "../academic/calendar";
import { weekday } from "../academic/common";
import { loginsWithRole } from "../front-office/people";
import { clockAt, minuteNow } from "../front-office/time";
import { TransportProblem } from "./problem";
import { transportSettings, type TrSettings } from "./settings";
import { checkPoint, etas, metres, metresFromLine, type IncomingPoint, type LatLng } from "./geo";
import { arrivingMessage, dropMessage, pickupMessage, riders } from "./messages";
import { eveningTimes } from "./routes";
import { alertLabel, clockOf, tripKind } from "./words";

export const DEFAULT_EVENING = 15 * 60 + 30;
export const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

/* ---------- The schedule ---------- */

export type PlannedTrip = { routeId: string; kind: "MORNING" | "EVENING"; startMin: number; days: number[]; vehicleId: string | null; driverId: string | null; attendantId: string | null; saved: boolean; scheduleId: string | null };

/** The default start: 10 minutes before the first stop in the morning; when school gets over in the evening (12 §2 Trip schedule). */
export function defaultStart(route: Pick<Route, "eveningDepartMin">, stops: Pick<Stop, "pickupMin">[], kind: string) {
  if (kind === "EVENING") return route.eveningDepartMin ?? DEFAULT_EVENING;
  return stops.length ? Math.max(0, Math.min(...stops.map((s) => s.pickupMin)) - 10) : 7 * 60;
}

/** Each route's morning and evening trip: as set on the schedule, or the defaults with the route's own vehicle and driver. */
export function plannedTrips(routes: (Route & { stops: Stop[] })[], schedules: TripSchedule[]): PlannedTrip[] {
  const out: PlannedTrip[] = [];
  for (const r of routes) {
    for (const kind of ["MORNING", "EVENING"] as const) {
      const s = schedules.find((x) => x.routeId === r.id && x.kind === kind && !x.archivedAt);
      out.push(s
        ? { routeId: r.id, kind, startMin: s.startMin, days: s.days, vehicleId: s.vehicleId ?? r.vehicleId, driverId: s.driverId ?? r.driverId, attendantId: s.attendantId ?? r.attendantId, saved: true, scheduleId: s.id }
        : { routeId: r.id, kind, startMin: defaultStart(r, r.stops, kind), days: DEFAULT_DAYS, vehicleId: r.vehicleId, driverId: r.driverId, attendantId: r.attendantId, saved: false, scheduleId: null });
    }
  }
  return out;
}

export async function saveSchedule(tx: Tx, ctx: SchoolContext, input: { routeId: string; kind: string; vehicleId: string | null; driverId: string | null; attendantId: string | null; startMin: number; days: number[] }) {
  const route = await tx.route.findFirst({ where: { id: input.routeId, archivedAt: null } });
  if (!route) throw new TransportProblem("Choose a route.", "routeId");
  if (!["MORNING", "EVENING"].includes(input.kind)) throw new TransportProblem("Choose morning pickup or evening drop.", "kind");
  const days = [...new Set(input.days)].filter((d) => d >= 1 && d <= 7).sort();
  if (!days.length) throw new TransportProblem("Pick at least one day.", "days");
  if (input.vehicleId && !(await tx.vehicle.findFirst({ where: { id: input.vehicleId, archivedAt: null } }))) throw new TransportProblem("Choose the vehicle from the list.", "vehicleId");
  if (input.driverId) {
    const d = await tx.driver.findFirst({ where: { id: input.driverId, archivedAt: null, role: "DRIVER", status: "ACTIVE" } });
    if (!d) throw new TransportProblem("Choose the driver from the list.", "driverId");
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    if (d.licenceExpiry && d.licenceExpiry < today) throw new TransportProblem(`Licence of ${d.name} expired on ${formatDate(d.licenceExpiry)}. Choose a driver with a valid licence.`, "driverId");
  }
  if (input.attendantId && !(await tx.driver.findFirst({ where: { id: input.attendantId, archivedAt: null, role: "ATTENDANT", status: "ACTIVE" } }))) throw new TransportProblem("Choose the attendant from the list.", "attendantId");
  const existing = await tx.tripSchedule.findFirst({ where: { routeId: route.id, kind: input.kind, archivedAt: null } });
  const data = { vehicleId: input.vehicleId, driverId: input.driverId, attendantId: input.attendantId, startMin: input.startMin, days, updatedById: ctx.userId };
  const row = existing ? await tx.tripSchedule.update({ where: { id: existing.id }, data }) : await tx.tripSchedule.create({ data: { ...data, schoolId: ctx.schoolId, routeId: route.id, kind: input.kind } });
  // Trips not started yet today and later follow the new schedule.
  await tx.trip.updateMany({ where: { routeId: route.id, kind: input.kind, status: "SCHEDULED", changedForDay: false }, data: { plannedStartMin: input.startMin, vehicleId: data.vehicleId ?? route.vehicleId, driverId: data.driverId ?? route.driverId, attendantId: data.attendantId ?? route.attendantId } });
  await writeAudit(tx, ctx, { action: existing ? "updated" : "created", recordType: "Trip Schedule", recordId: row.id, before: existing ? { start: clockOf(existing.startMin), days: existing.days, vehicleId: existing.vehicleId, driverId: existing.driverId } : null, after: { route: route.number, trip: tripKind(input.kind), start: clockOf(input.startMin), days, vehicleId: input.vehicleId, driverId: input.driverId } });
  return { row, route };
}

/**
 * Makes today's trips from the schedule (idempotent): one per route, kind
 * and day, on the days chosen, and none on a school holiday (18, inferred).
 */
export async function ensureTrips(tx: Tx, ctx: SchoolContext, day: Date) {
  if (await isHoliday(tx, ctx, day)) return { made: 0, holiday: true };
  const routes = await tx.route.findMany({ where: { archivedAt: null }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } });
  if (!routes.length) return { made: 0, holiday: false };
  const schedules = await tx.tripSchedule.findMany({ where: { routeId: { in: routes.map((r) => r.id) }, archivedAt: null } });
  const wd = weekday(day);
  const plan = plannedTrips(routes, schedules).filter((p) => p.days.includes(wd) && routes.find((r) => r.id === p.routeId)!.stops.length > 0);
  if (!plan.length) return { made: 0, holiday: false };
  const made = await tx.trip.createMany({
    data: plan.map((p) => ({ schoolId: ctx.schoolId, routeId: p.routeId, kind: p.kind, date: day, vehicleId: p.vehicleId, driverId: p.driverId, attendantId: p.attendantId, plannedStartMin: p.startMin })),
    skipDuplicates: true,
  });
  return { made: made.count, holiday: false };
}

/** Assign a different vehicle or driver for one day (12 §2, inferred). The schedule stays the same. */
export async function changeForDay(tx: Tx, ctx: SchoolContext, input: { routeId: string; kind: string; date: Date; vehicleId: string | null; driverId: string | null; note: string | null }, today: Date) {
  if (input.date < today) throw new TransportProblem("Pick today or a later date.", "date");
  const route = await tx.route.findFirst({ where: { id: input.routeId, archivedAt: null }, include: { stops: { where: { archivedAt: null } } } });
  if (!route) throw new TransportProblem("Choose a route.", "routeId");
  if (!route.stops.length) throw new TransportProblem("This route has no stops yet.", "routeId");
  if (!input.vehicleId && !input.driverId) throw new TransportProblem("Choose the vehicle or the driver for that day.", "vehicleId");
  if (input.driverId) {
    const d = await tx.driver.findFirst({ where: { id: input.driverId, archivedAt: null, status: "ACTIVE", role: "DRIVER" } });
    if (!d) throw new TransportProblem("Choose the driver from the list.", "driverId");
    if (d.licenceExpiry && d.licenceExpiry < input.date) throw new TransportProblem(`Licence of ${d.name} expired on ${formatDate(d.licenceExpiry)}. Choose a driver with a valid licence.`, "driverId");
  }
  if (input.vehicleId) {
    const v = await tx.vehicle.findFirst({ where: { id: input.vehicleId, archivedAt: null } });
    if (!v || v.status !== "ACTIVE") throw new TransportProblem("Choose an active vehicle.", "vehicleId");
  }
  const schedules = await tx.tripSchedule.findMany({ where: { routeId: route.id, archivedAt: null } });
  const p = plannedTrips([route], schedules).find((x) => x.kind === input.kind);
  if (!p) throw new TransportProblem("Choose morning pickup or evening drop.", "kind");
  const trip = await tx.trip.upsert({
    where: { schoolId_routeId_kind_date: { schoolId: ctx.schoolId, routeId: route.id, kind: input.kind, date: input.date } },
    create: { schoolId: ctx.schoolId, routeId: route.id, kind: input.kind, date: input.date, plannedStartMin: p.startMin, vehicleId: input.vehicleId ?? p.vehicleId, driverId: input.driverId ?? p.driverId, attendantId: p.attendantId, changedForDay: true, changeNote: input.note },
    update: {},
  });
  if (trip.status !== "SCHEDULED") throw new TransportProblem(`This trip is already ${trip.status === "STARTED" ? "running" : trip.status.toLowerCase()}. Change it before it starts.`);
  const after = await tx.trip.update({ where: { id: trip.id }, data: { vehicleId: input.vehicleId ?? trip.vehicleId, driverId: input.driverId ?? trip.driverId, changedForDay: true, changeNote: input.note } });
  await writeAudit(tx, ctx, { action: "changed-for-day", recordType: "Trip", recordId: trip.id, before: { vehicleId: trip.vehicleId, driverId: trip.driverId }, after: { date: formatDate(input.date), vehicleId: after.vehicleId, driverId: after.driverId, note: input.note } });
  if (after.driverId && after.driverId !== trip.driverId) {
    const d = await tx.driver.findFirst({ where: { id: after.driverId }, select: { userLoginId: true } });
    if (d?.userLoginId) await notify(tx, ctx, { to: d.userLoginId, type: "transport-trip", text: `You drive Route ${route.number} ${tripKind(input.kind).toLowerCase()} on ${formatDate(input.date)}.`, link: "/driver" });
  }
  return { trip: after, route };
}

/* ---------- Running a trip ---------- */

type Who = { userId: string | null; source: "APP" | "STAFF" | "DEVICE" };

export async function startTrip(tx: Tx, ctx: SchoolContext, tripId: string, who: Who, now: Date) {
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t) throw new TransportProblem("This trip was not found.");
  if (t.status === "STARTED") return t;
  if (t.status !== "SCHEDULED") throw new TransportProblem(`This trip is ${t.status === "COMPLETED" ? "already completed" : "cancelled"}.`);
  if (t.vehicleId) {
    const other = await tx.trip.findFirst({ where: { vehicleId: t.vehicleId, status: "STARTED", id: { not: t.id } }, select: { routeId: true, kind: true } });
    if (other) {
      const r = await tx.route.findFirst({ where: { id: other.routeId }, select: { number: true } });
      throw new TransportProblem(`This bus is still on Route ${r?.number ?? ""} ${tripKind(other.kind).toLowerCase()}. End that trip first.`);
    }
  }
  const after = await tx.trip.update({ where: { id: t.id }, data: { status: "STARTED", startedAt: now, startedById: who.userId, lastPointAt: null, lastLat: null, lastLng: null, lastSpeedKmh: null } });
  await writeAudit(tx, ctx, { action: "trip-started", recordType: "Trip", recordId: t.id, after: { by: who.source, at: now.toISOString() } });
  return after;
}

/** End trip: the bus stops sending, stops not reached are marked missed, and in the morning the boarded students are dropped at school. */
export async function endTrip(tx: Tx, ctx: SchoolContext, tripId: string, who: Who, now: Date, tz: string) {
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t) throw new TransportProblem("This trip was not found.");
  if (t.status === "COMPLETED") return { trip: t, missed: 0 };
  if (t.status !== "STARTED") throw new TransportProblem("This trip has not started.");
  const stops = await tx.stop.findMany({ where: { routeId: t.routeId, archivedAt: null } });
  const done = await tx.tripStopEvent.findMany({ where: { tripId }, select: { stopId: true } });
  const missed = stops.filter((s) => !done.some((d) => d.stopId === s.id));
  if (missed.length) await tx.tripStopEvent.createMany({ data: missed.map((s) => ({ schoolId: ctx.schoolId, tripId, stopId: s.id, status: "MISSED", at: now, source: who.source === "STAFF" ? "STAFF" : "APP", plannedMin: t.kind === "MORNING" ? s.pickupMin : s.dropMin })), skipDuplicates: true });
  const after = await tx.trip.update({ where: { id: t.id }, data: { status: "COMPLETED", endedAt: now, endedById: who.userId } });
  if (t.kind === "MORNING") {
    const boarded = await tx.boardingEvent.findMany({ where: { tripId, status: "BOARDED" }, select: { studentId: true } });
    if (boarded.length) {
      await tx.boardingEvent.updateMany({ where: { tripId, status: "BOARDED" }, data: { status: "DROPPED", at: now } });
      await dropMessage(tx, ctx, t, boarded.map((b) => b.studentId), minuteNow(tz, now), null);
    }
  }
  await tx.transportAlert.updateMany({ where: { tripId, status: "OPEN", kind: { in: ["OFFLINE", "TRIP_LEFT_RUNNING"] } }, data: { status: "CLOSED", closedAt: now, closeNote: "Trip ended" } });
  await writeAudit(tx, ctx, { action: "trip-ended", recordType: "Trip", recordId: t.id, after: { by: who.source, at: now.toISOString(), missedStops: missed.length, points: t.pointsAccepted, rejected: t.pointsRejected } });
  return { trip: after, missed: missed.length };
}

export async function cancelTrip(tx: Tx, ctx: SchoolContext, tripId: string, reason: string) {
  if (reason.trim().length < 3) throw new TransportProblem("Give the reason.", "reason");
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t || t.status !== "SCHEDULED") throw new TransportProblem("Only a trip that has not started can be cancelled.");
  await tx.trip.update({ where: { id: tripId }, data: { status: "CANCELLED", cancelReason: reason.trim() } });
  await writeAudit(tx, ctx, { action: "trip-cancelled", recordType: "Trip", recordId: tripId, after: { reason: reason.trim() } });
}

/** Mark a stop reached (the driver's Reached button, the geofence, or the in-charge). */
export async function markStop(tx: Tx, ctx: SchoolContext, tripId: string, stopId: string, who: Who, at: Date, source: "APP" | "GEOFENCE" | "STAFF" = "APP") {
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t || t.status !== "STARTED") throw new TransportProblem("Start the trip first.");
  const s = await tx.stop.findFirst({ where: { id: stopId, routeId: t.routeId } });
  if (!s) throw new TransportProblem("This stop is not on the trip's route.");
  const existing = await tx.tripStopEvent.findFirst({ where: { tripId, stopId } });
  if (existing) return existing;
  const ev = await tx.tripStopEvent.create({ data: { schoolId: ctx.schoolId, tripId, stopId, status: "REACHED", at, source, plannedMin: t.kind === "MORNING" ? s.pickupMin : s.dropMin, createdById: who.userId } });
  return ev;
}

/** Boarded, not boarded (pickup) or dropped (12 §2 Driver app); a pickup or drop message goes to the parents when the rule is on. */
export async function markBoarding(tx: Tx, ctx: SchoolContext, tripId: string, studentId: string, status: string, who: Who, now: Date, tz: string) {
  if (!["BOARDED", "NOT_BOARDED", "DROPPED"].includes(status)) throw new TransportProblem("Choose boarded, not boarded or dropped.");
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t || t.status !== "STARTED") throw new TransportProblem("Start the trip first.");
  const place = (await riders(tx, t.routeId, t.kind, t.date)).find((r) => r.studentId === studentId);
  if (!place) throw new TransportProblem("This student is not on this trip.");
  const before = await tx.boardingEvent.findFirst({ where: { tripId, studentId } });
  const ev = await tx.boardingEvent.upsert({
    where: { tripId_studentId: { tripId, studentId } },
    create: { schoolId: ctx.schoolId, tripId, studentId, stopId: place.stopId, status, at: now, createdById: who.userId },
    update: { status, at: now, createdById: who.userId },
  });
  const stop = await tx.stop.findFirst({ where: { id: place.stopId }, select: { name: true } });
  const min = minuteNow(tz, now);
  if (status === "BOARDED" && before?.status !== "BOARDED" && t.kind === "MORNING") await pickupMessage(tx, ctx, t, studentId, min, stop?.name ?? null);
  if (status === "DROPPED" && before?.status !== "DROPPED") await dropMessage(tx, ctx, t, [studentId], min, t.kind === "EVENING" ? stop?.name ?? null : null);
  return ev;
}

/* ---------- Locations from the driver app or a GPS device ---------- */

export type IngestResult = { accepted: number; rejected: number; reached: string[]; alerts: string[] };

/** The route's line in trip order, with the school at the end (morning) or the start (evening). */
function tripLine(stops: Stop[], kind: string, s: TrSettings): LatLng[] {
  const placed = stops.filter((x) => x.lat != null && x.lng != null).map((x) => ({ lat: x.lat!, lng: x.lng! }));
  const school = s.schoolLat != null && s.schoolLng != null ? [{ lat: s.schoolLat, lng: s.schoolLng }] : [];
  return kind === "MORNING" ? [...placed, ...school] : [...school, ...[...placed].reverse()];
}

/**
 * Takes a batch of points from a running trip (12 §5 "Bad or out-of-order
 * GPS points"): each is checked against the last accepted point; bad ones
 * are counted, not used. Accepted points move the bus, mark stops reached
 * inside their geofence, send "bus arriving" once per stop and raise
 * over-speed and route-deviation alerts.
 */
export async function ingestPoints(tx: Tx, ctx: SchoolContext, tripId: string, points: IncomingPoint[], now: Date, tz: string, deviceId?: string | null): Promise<IngestResult> {
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t) throw new TransportProblem("This trip was not found.");
  // Locations only during an active trip: nothing is kept before Start trip or after End trip.
  if (t.status !== "STARTED" || !t.startedAt) throw new TransportProblem("This trip is not running, so no location is kept.");
  const s = await transportSettings(tx, ctx);
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  let last = t.lastPointAt && t.lastLat != null && t.lastLng != null ? { at: t.lastPointAt, lat: t.lastLat, lng: t.lastLng } : null;
  const good: IncomingPoint[] = [];
  let rejected = 0;
  for (const p of sorted) {
    const c = checkPoint(p, last, { now, tripStartedAt: t.startedAt });
    if (!c.ok) { rejected++; continue; }
    good.push(p);
    last = { at: p.at, lat: p.lat, lng: p.lng };
  }
  const out: IngestResult = { accepted: good.length, rejected, reached: [], alerts: [] };
  if (good.length) {
    await tx.gpsPoint.createMany({ data: good.map((p) => ({ schoolId: ctx.schoolId, tripId, at: p.at, lat: p.lat, lng: p.lng, speedKmh: p.speedKmh ?? null, heading: p.heading ?? null, accuracyM: p.accuracyM ?? null })) });
  }
  const lastGood = good[good.length - 1];
  await tx.trip.update({
    where: { id: tripId },
    data: {
      pointsAccepted: { increment: good.length }, pointsRejected: { increment: rejected },
      ...(lastGood ? { lastLat: lastGood.lat, lastLng: lastGood.lng, lastSpeedKmh: lastGood.speedKmh ?? null, lastPointAt: lastGood.at } : {}),
    },
  });
  if (deviceId) await tx.driverDevice.updateMany({ where: { id: deviceId }, data: { lastSeenAt: now, ...(rejected ? { rejectedPoints: { increment: rejected } } : {}) } });
  if (!good.length) return out;
  // A bus that sends again is no longer offline.
  await tx.transportAlert.updateMany({ where: { tripId, kind: "OFFLINE", status: "OPEN" }, data: { status: "CLOSED", closedAt: now, closeNote: "The bus is sending its location again" } });

  const stops = await tx.stop.findMany({ where: { routeId: t.routeId, archivedAt: null }, orderBy: { seq: "asc" } });
  const ordered = t.kind === "MORNING" ? stops : [...stops].reverse();
  const reached = new Set((await tx.tripStopEvent.findMany({ where: { tripId }, select: { stopId: true } })).map((e) => e.stopId));
  // Geofence: inside a stop's circle marks it reached.
  for (const p of good) {
    for (const st of ordered) {
      if (reached.has(st.id) || st.lat == null || st.lng == null) continue;
      if (metres(p, { lat: st.lat, lng: st.lng }) <= (st.geofenceMeters ?? s.stopGeofenceMeters)) {
        await markStop(tx, ctx, tripId, st.id, { userId: null, source: "DEVICE" }, p.at, "GEOFENCE");
        reached.add(st.id);
        out.reached.push(st.name);
      }
    }
  }
  const route = await tx.route.findFirstOrThrow({ where: { id: t.routeId } });
  // Over-speed: once per trip in each 10 minutes.
  const fast = good.find((p) => (p.speedKmh ?? 0) > s.overSpeedKmh);
  if (fast) {
    const a = await raiseAlert(tx, ctx, { trip: t, route, kind: "OVER_SPEED", text: `Route ${route.number}: ${Math.round(fast.speedKmh!)} km/h, over the ${s.overSpeedKmh} km/h limit`, lat: fast.lat, lng: fast.lng, speedKmh: fast.speedKmh ?? null, at: fast.at, onceKey: `speed:${tripId}:${Math.floor(fast.at.getTime() / 600_000)}` }, s);
    if (a) out.alerts.push(a.kind);
  }
  // Route deviation: farther than the set distance from the line through the stops.
  const line = tripLine(stops, t.kind, s);
  if (line.length >= 2) {
    const off = metresFromLine(lastGood, line);
    if (off > s.deviationMeters) {
      const a = await raiseAlert(tx, ctx, { trip: t, route, kind: "ROUTE_DEVIATION", text: `Route ${route.number}: about ${Math.round(off / 10) * 10} m off the route`, lat: lastGood.lat, lng: lastGood.lng, speedKmh: lastGood.speedKmh ?? null, at: lastGood.at, onceKey: `deviation:${tripId}:${Math.floor(lastGood.at.getTime() / 900_000)}` }, s);
      if (a) out.alerts.push(a.kind);
    }
  }
  // "Bus arriving": parents at the next stops, once per stop per trip.
  const nowMin = minuteNow(tz, now);
  const ahead = ordered.filter((x) => !reached.has(x.id));
  const times = etas({ nowMin, at: lastGood, speedKmh: lastGood.speedKmh ?? null, stops: ahead.slice(0, 3).map((x) => ({ id: x.id, plannedMin: plannedMinOf(x, t.kind, route, stops), lat: x.lat, lng: x.lng })) });
  for (const st of ahead.slice(0, 3)) {
    const eta = times.get(st.id);
    if (eta != null && eta - nowMin <= s.arrivingMinutes && st.lat != null) await arrivingMessage(tx, ctx, t, st, eta - nowMin);
  }
  return out;
}

/** A stop's planned time on a trip: pickup in the morning; the drop time (or the reverse copy) in the evening. */
export function plannedMinOf(st: Stop, kind: string, route: Pick<Route, "schoolArrivalMin" | "eveningDepartMin">, stops: Stop[]) {
  if (kind === "MORNING") return st.pickupMin;
  return st.dropMin ?? eveningTimes(stops, route.schoolArrivalMin, route.eveningDepartMin ?? DEFAULT_EVENING).get(st.id) ?? st.pickupMin;
}

/* ---------- Alerts ---------- */

type AlertInput = { trip: Trip | null; route: Route | null; kind: string; text: string; lat: number | null; lng: number | null; speedKmh: number | null; at: Date; onceKey: string; by?: string | null };

/** Who is told about an alert: the roles chosen in Transport Settings; the emergency button always tells the in-charge and the Principal. */
async function alertPeople(tx: Tx, ctx: SchoolContext, kind: string, s: TrSettings) {
  const keys = new Set(s.alertRoleKeys);
  if (kind === "EMERGENCY" || kind === "BREAKDOWN") { keys.add("transport-in-charge"); keys.add("principal"); }
  if (!keys.size) keys.add("transport-in-charge");
  const ids = new Set<string>();
  for (const k of keys) for (const id of await loginsWithRole(tx, ctx, k)) ids.add(id);
  return [...ids];
}

/** Records an alert once (its onceKey) and tells the people chosen in Transport Settings. */
export async function raiseAlert(tx: Tx, ctx: SchoolContext, a: AlertInput, s?: TrSettings) {
  const found = await tx.transportAlert.findFirst({ where: { onceKey: a.onceKey } });
  if (found) return null;
  const row = await tx.transportAlert.create({
    data: { schoolId: ctx.schoolId, tripId: a.trip?.id ?? null, routeId: a.route?.id ?? a.trip?.routeId ?? null, vehicleId: a.trip?.vehicleId ?? null, kind: a.kind, text: a.text, lat: a.lat, lng: a.lng, speedKmh: a.speedKmh, at: a.at, onceKey: a.onceKey, createdById: a.by ?? null },
  });
  const settings = s ?? (await transportSettings(tx, ctx));
  const where = a.lat != null && a.lng != null ? ` Location ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}.` : "";
  for (const to of await alertPeople(tx, ctx, a.kind, settings)) {
    await notify(tx, ctx, {
      to, type: a.kind === "EMERGENCY" ? "transport-emergency" : "transport-alert",
      text: `${alertLabel(a.kind)}: ${a.text}.${where}`,
      link: `/transport-management${a.kind === "EMERGENCY" || a.kind === "BREAKDOWN" ? "" : ""}?alert=${row.id}`,
      groupKey: a.kind === "EMERGENCY" ? undefined : `transport-alert:${a.kind}`,
      mergedText: (n) => `${n} ${alertLabel(a.kind).toLowerCase()} alerts`,
    });
  }
  await writeAudit(tx, ctx, { action: "alert", recordType: "Transport Alert", recordId: row.id, after: { kind: a.kind, text: a.text } });
  return row;
}

/**
 * The red Emergency button (12 §2): the Transport in-charge and the
 * Principal are alerted at once with the bus location. No message goes to
 * parents until a person confirms it (12 §5).
 */
export async function pressEmergency(tx: Tx, ctx: SchoolContext, tripId: string, input: { lat: number | null; lng: number | null; note: string | null; userId: string | null }, now: Date) {
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t) throw new TransportProblem("This trip was not found.");
  const route = await tx.route.findFirstOrThrow({ where: { id: t.routeId } });
  const vehicle = t.vehicleId ? await tx.vehicle.findFirst({ where: { id: t.vehicleId }, select: { label: true, number: true } }) : null;
  const lat = input.lat ?? t.lastLat;
  const lng = input.lng ?? t.lastLng;
  // One alert per press, at most one a minute (a second press in the same minute is the same emergency).
  return raiseAlert(tx, ctx, { trip: t, route, kind: "EMERGENCY", text: `${vehicle?.label ?? `Bus ${route.number}`} on Route ${route.number} pressed the emergency button${input.note ? `: ${input.note.slice(0, 200)}` : ""}`, lat, lng, speedKmh: t.lastSpeedKmh, at: now, onceKey: `emergency:${tripId}:${Math.floor(now.getTime() / 60_000)}`, by: input.userId });
}

/** Breakdown reporting (12 §2): reason and location; the in-charge is offered to message parents and send another vehicle. */
export async function reportBreakdown(tx: Tx, ctx: SchoolContext, tripId: string, input: { reason: string; lat: number | null; lng: number | null; userId: string | null }, now: Date) {
  if (input.reason.trim().length < 3) throw new TransportProblem("Say what happened.", "reason");
  const t = await tx.trip.findFirst({ where: { id: tripId } });
  if (!t) throw new TransportProblem("This trip was not found.");
  const route = await tx.route.findFirstOrThrow({ where: { id: t.routeId } });
  return raiseAlert(tx, ctx, { trip: t, route, kind: "BREAKDOWN", text: `Route ${route.number} broke down: ${input.reason.trim().slice(0, 200)}`, lat: input.lat ?? t.lastLat, lng: input.lng ?? t.lastLng, speedKmh: null, at: now, onceKey: `breakdown:${tripId}:${Math.floor(now.getTime() / 300_000)}`, by: input.userId });
}

export async function closeAlert(tx: Tx, ctx: SchoolContext, alertId: string, note: string | null) {
  const a = await tx.transportAlert.findFirst({ where: { id: alertId } });
  if (!a) throw new TransportProblem("This alert was not found.");
  if (a.status === "CLOSED") return a;
  const after = await tx.transportAlert.update({ where: { id: alertId }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, closeNote: note } });
  await writeAudit(tx, ctx, { action: "alert-closed", recordType: "Transport Alert", recordId: alertId, after: { note } });
  return after;
}

/** A leader who only watches reminds the Transport In-charge (prototype "Remind Transport In-charge"). */
export async function remindInCharge(tx: Tx, ctx: SchoolContext, text: string, link: string) {
  const people = await loginsWithRole(tx, ctx, "transport-in-charge");
  if (!people.length) throw new TransportProblem("Nobody has the Transport In-charge role. Give someone the role in Settings, Users & Permissions.");
  for (const to of people) await notify(tx, ctx, { to, type: "transport-alert", text, link });
  await writeAudit(tx, ctx, { action: "reminded", recordType: "Transport Alert", recordId: null, after: { text, people: people.length } });
  return people.length;
}

/**
 * Every few minutes (the worker): a running trip with no location for the
 * offline time is marked offline; one still running a set time after its
 * last planned stop alerts the in-charge (12 §5 Trip left running).
 */
export async function watchTrips(tx: Tx, ctx: SchoolContext, now: Date, tz: string) {
  const running = await tx.trip.findMany({ where: { status: "STARTED" } });
  if (!running.length) return { offline: 0, leftRunning: 0 };
  const s = await transportSettings(tx, ctx);
  let offline = 0;
  let leftRunning = 0;
  const nowMin = minuteNow(tz, now);
  for (const t of running) {
    const route = await tx.route.findFirst({ where: { id: t.routeId }, include: { stops: { where: { archivedAt: null } } } });
    if (!route) continue;
    const seen = t.lastPointAt ?? t.startedAt ?? now;
    if (now.getTime() - seen.getTime() >= s.offlineAfterMin * 60_000) {
      const a = await raiseAlert(tx, ctx, { trip: t, route, kind: "OFFLINE", text: `Route ${route.number}: no location since ${clockAt(seen, tz)}`, lat: t.lastLat, lng: t.lastLng, speedKmh: null, at: now, onceKey: `offline:${t.id}:${seen.getTime()}` }, s);
      if (a) offline++;
    }
    const lastPlanned = t.kind === "MORNING"
      ? route.schoolArrivalMin ?? Math.max(t.plannedStartMin, ...route.stops.map((x) => x.pickupMin)) + 10
      : Math.max(t.plannedStartMin, ...route.stops.map((x) => plannedMinOf(x, "EVENING", route, route.stops)));
    const today = t.date.toISOString().slice(0, 10) === new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    if (!today || nowMin >= lastPlanned + s.tripLeftRunningMin) {
      const a = await raiseAlert(tx, ctx, { trip: t, route, kind: "TRIP_LEFT_RUNNING", text: `Route ${route.number} ${tripKind(t.kind).toLowerCase()} still running`, lat: t.lastLat, lng: t.lastLng, speedKmh: null, at: now, onceKey: `left-running:${t.id}` }, s);
      if (a) leftRunning++;
    }
  }
  return { offline, leftRunning };
}

/* ---------- What a driver sees ---------- */

/** The Driver record of a login (a hired driver signs in with his own login and sees only his trips; Done when 10). */
export async function driverOf(tx: Tx, userLoginId: string) {
  return tx.driver.findFirst({ where: { userLoginId, archivedAt: null, status: "ACTIVE" } });
}

/** Today's trips for one driver or attendant: only theirs (12 §5 Starting the wrong trip). */
export async function driverTrips(tx: Tx, ctx: SchoolContext, driverId: string, day: Date) {
  await ensureTrips(tx, ctx, day);
  return tx.trip.findMany({ where: { date: day, status: { not: "CANCELLED" }, OR: [{ driverId }, { attendantId: driverId }] }, orderBy: [{ plannedStartMin: "asc" }] });
}

/** One of the driver's own trips today, or a plain refusal. */
export async function ownTrip(tx: Tx, driverId: string, tripId: string, day: Date) {
  const t = await tx.trip.findFirst({ where: { id: tripId, date: day, OR: [{ driverId }, { attendantId: driverId }] } });
  if (!t) throw new TransportProblem("This is not one of your trips today.");
  return t;
}

/** Everything the driver app shows for one trip: stops in order with students at each, reached and boarded. */
export async function tripSheet(tx: Tx, trip: Trip) {
  const [route, stops, events, boarding, vehicle] = await Promise.all([
    tx.route.findFirstOrThrow({ where: { id: trip.routeId } }),
    tx.stop.findMany({ where: { routeId: trip.routeId, archivedAt: null }, orderBy: { seq: "asc" } }),
    tx.tripStopEvent.findMany({ where: { tripId: trip.id } }),
    tx.boardingEvent.findMany({ where: { tripId: trip.id } }),
    trip.vehicleId ? tx.vehicle.findFirst({ where: { id: trip.vehicleId } }) : Promise.resolve(null),
  ]);
  const places = await riders(tx, trip.routeId, trip.kind, trip.date);
  const students = await tx.student.findMany({ where: { id: { in: places.map((p) => p.studentId) } }, select: { id: true, fullName: true } });
  const ordered = trip.kind === "MORNING" ? stops : [...stops].reverse();
  return {
    trip, route, vehicle,
    stops: ordered.map((s) => ({
      id: s.id, name: s.name, planned: plannedMinOf(s, trip.kind, route, stops), lat: s.lat, lng: s.lng,
      reached: events.find((e) => e.stopId === s.id) ?? null,
      students: places.filter((p) => p.stopId === s.id).map((p) => ({ id: p.studentId, name: students.find((x) => x.id === p.studentId)?.fullName ?? "", status: boarding.find((b) => b.studentId === p.studentId)?.status ?? null })),
    })),
  };
}

export type TripFilter = Prisma.TripWhereInput;
