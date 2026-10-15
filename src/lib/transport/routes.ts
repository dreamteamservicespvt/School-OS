// Routes & Stops (12 §2): routes with stops in order, pickup and drop times,
// stop locations and stop-wise (or route-wise) transport fees with one-way
// and two-way variants. A route with students cannot be archived.
import "server-only";

import type { Route, Stop } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { TransportProblem } from "./problem";
import { holdsSeat } from "./places";
import { clockOf } from "./words";

export type RouteInput = {
  name: string;
  vehicleId: string | null;
  driverId: string | null;
  attendantId: string | null;
  /** One fee for the whole route (a month); null when each stop has its own. */
  feeTwoWayPaise: bigint | null;
  feeOneWayPaise: bigint | null;
  schoolArrivalMin: number | null;
  eveningDepartMin: number | null;
};

async function checkCrew(tx: Tx, input: RouteInput, routeId: string | null) {
  if (input.vehicleId) {
    const v = await tx.vehicle.findFirst({ where: { id: input.vehicleId, archivedAt: null } });
    if (!v) throw new TransportProblem("Choose a vehicle from the list.", "vehicleId");
    if (v.status === "INACTIVE") throw new TransportProblem(`${v.label ?? v.number} is inactive. Make it active first, or choose another vehicle.`, "vehicleId");
    const other = await tx.route.findFirst({ where: { vehicleId: v.id, archivedAt: null, ...(routeId ? { id: { not: routeId } } : {}) } });
    if (other) throw new TransportProblem(`${v.label ?? v.number} already runs Route ${other.number} · ${other.name}. Choose a free vehicle.`, "vehicleId");
  }
  if (input.driverId) {
    const d = await tx.driver.findFirst({ where: { id: input.driverId, archivedAt: null, status: "ACTIVE" } });
    if (!d || d.role !== "DRIVER") throw new TransportProblem("Choose a driver from the list.", "driverId");
  }
  if (input.attendantId) {
    const d = await tx.driver.findFirst({ where: { id: input.attendantId, archivedAt: null, status: "ACTIVE" } });
    if (!d || d.role !== "ATTENDANT") throw new TransportProblem("Choose an attendant from the list.", "attendantId");
  }
  if (input.feeOneWayPaise != null && input.feeTwoWayPaise == null) throw new TransportProblem("Enter the two-way fee too.", "feeTwoWay");
}

export async function addRoute(tx: Tx, ctx: SchoolContext, input: RouteInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new TransportProblem("Give the route a name, usually the farthest area.", "name");
  if (await tx.route.findFirst({ where: { archivedAt: null, name: { equals: name, mode: "insensitive" } } })) throw new TransportProblem(`A route called ${name} already exists.`, "name");
  await checkCrew(tx, input, null);
  const top = await tx.route.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const route = await tx.route.create({ data: { schoolId: ctx.schoolId, number: (top?.number ?? 0) + 1, name, vehicleId: input.vehicleId, driverId: input.driverId, attendantId: input.attendantId, feeTwoWayPaise: input.feeTwoWayPaise, feeOneWayPaise: input.feeOneWayPaise, schoolArrivalMin: input.schoolArrivalMin, eveningDepartMin: input.eveningDepartMin, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Route", recordId: route.id, after: { number: route.number, name, fee: input.feeTwoWayPaise != null ? formatRupees(input.feeTwoWayPaise) : "per stop" } });
  return route;
}

export async function editRoute(tx: Tx, ctx: SchoolContext, routeId: string, input: RouteInput) {
  const before = await tx.route.findFirst({ where: { id: routeId, archivedAt: null } });
  if (!before) throw new TransportProblem("This route was not found.");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new TransportProblem("Give the route a name.", "name");
  if (await tx.route.findFirst({ where: { archivedAt: null, id: { not: routeId }, name: { equals: name, mode: "insensitive" } } })) throw new TransportProblem(`A route called ${name} already exists.`, "name");
  await checkCrew(tx, input, routeId);
  const after = await tx.route.update({ where: { id: routeId }, data: { name, vehicleId: input.vehicleId, driverId: input.driverId, attendantId: input.attendantId, feeTwoWayPaise: input.feeTwoWayPaise, feeOneWayPaise: input.feeOneWayPaise, schoolArrivalMin: input.schoolArrivalMin, eveningDepartMin: input.eveningDepartMin } });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Route", recordId: routeId, before: routeAudit(before), after: routeAudit(after) });
  return after;
}

const routeAudit = (r: Route) => ({ name: r.name, vehicleId: r.vehicleId, driverId: r.driverId, attendantId: r.attendantId, feeTwoWay: r.feeTwoWayPaise != null ? formatRupees(r.feeTwoWayPaise) : null, feeOneWay: r.feeOneWayPaise != null ? formatRupees(r.feeOneWayPaise) : null, arrives: clockOf(r.schoolArrivalMin), leaves: clockOf(r.eveningDepartMin) });

/** Archive a route with no students (12 §2). It keeps its history and drops out of lists and fees. */
export async function archiveRoute(tx: Tx, ctx: SchoolContext, routeId: string, today: Date) {
  const r = await tx.route.findFirst({ where: { id: routeId, archivedAt: null } });
  if (!r) throw new TransportProblem("This route was not found.");
  const students = await tx.transportAssignment.count({ where: { routeId, ...holdsSeat(today) } });
  if (students) throw new TransportProblem(`${students} student${students === 1 ? " still uses" : "s still use"} Route ${r.number}. Move them to another route in Student Transport first.`, undefined, { href: `/transport-management/students?route=${r.id}`, label: "Open Student Transport" });
  const running = await tx.trip.count({ where: { routeId, status: "STARTED" } });
  if (running) throw new TransportProblem("A trip on this route is running. End it first.");
  await tx.route.update({ where: { id: routeId }, data: { archivedAt: new Date(), vehicleId: null } });
  await tx.tripSchedule.updateMany({ where: { routeId, archivedAt: null }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Route", recordId: routeId, before: { name: r.name, vehicleId: r.vehicleId } });
  return r;
}

export async function restoreRoute(tx: Tx, ctx: SchoolContext, routeId: string) {
  const r = await tx.route.findFirst({ where: { id: routeId, archivedAt: { not: null } } });
  if (!r) throw new TransportProblem("This route is not archived.");
  if (await tx.route.findFirst({ where: { archivedAt: null, name: { equals: r.name, mode: "insensitive" } } })) throw new TransportProblem(`Another route is called ${r.name}. Rename it first.`);
  await tx.route.update({ where: { id: routeId }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Route", recordId: routeId, after: { name: r.name } });
  return r;
}

/* ---------- Stops ---------- */

export type StopInput = {
  name: string;
  /** "last", or the id of the stop it goes before. */
  before: string | null;
  pickupMin: number;
  dropMin: number | null;
  lat: number | null;
  lng: number | null;
  feeTwoWayPaise: bigint | null;
  feeOneWayPaise: bigint | null;
};

function checkStop(input: StopInput, route: Route) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new TransportProblem("Enter the stop name parents know.", "name");
  if ((input.lat == null) !== (input.lng == null)) throw new TransportProblem("Give both the latitude and the longitude, or neither.", "lat");
  if (input.lat != null && (Math.abs(input.lat) > 90 || Math.abs(input.lng!) > 180 || (input.lat === 0 && input.lng === 0))) throw new TransportProblem("That location is not right. Use your current location, or type it again.", "lat");
  if (input.feeTwoWayPaise == null && route.feeTwoWayPaise == null) throw new TransportProblem("Enter the two-way fee a month.", "feeTwoWay");
  if (input.feeTwoWayPaise != null && input.feeTwoWayPaise <= BigInt(0)) throw new TransportProblem("Enter the two-way fee a month.", "feeTwoWay");
  if (input.feeOneWayPaise != null && input.feeTwoWayPaise != null && input.feeOneWayPaise > input.feeTwoWayPaise) throw new TransportProblem("The one-way fee cannot be more than the two-way fee.", "feeOneWay");
  return name;
}

export async function addStop(tx: Tx, ctx: SchoolContext, routeId: string, input: StopInput) {
  const route = await tx.route.findFirst({ where: { id: routeId, archivedAt: null } });
  if (!route) throw new TransportProblem("Choose a route.", "routeId");
  const name = checkStop(input, route);
  const stops = await tx.stop.findMany({ where: { routeId, archivedAt: null }, orderBy: { seq: "asc" } });
  const same = stops.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
  if (same >= 0) throw new TransportProblem(`${name} is already stop ${same + 1} on this route.`, "name");
  let seq = stops.length + 1;
  if (input.before) {
    const at = stops.findIndex((s) => s.id === input.before);
    if (at < 0) throw new TransportProblem("Choose where the stop goes.", "before");
    seq = at + 1;
    for (const s of stops.slice(at).reverse()) await tx.stop.update({ where: { id: s.id }, data: { seq: s.seq + 1 } });
  }
  const stop = await tx.stop.create({ data: { schoolId: ctx.schoolId, routeId, name, seq, pickupMin: input.pickupMin, dropMin: input.dropMin, lat: input.lat, lng: input.lng, feeTwoWayPaise: input.feeTwoWayPaise, feeOneWayPaise: input.feeOneWayPaise } });
  await renumber(tx, routeId);
  await writeAudit(tx, ctx, { action: "created", recordType: "Stop", recordId: stop.id, after: { route: route.number, name, order: seq, pickup: clockOf(input.pickupMin), fee: input.feeTwoWayPaise != null ? formatRupees(input.feeTwoWayPaise) : "route fee" } });
  return stop;
}

export async function editStop(tx: Tx, ctx: SchoolContext, stopId: string, input: Omit<StopInput, "before">) {
  const before = await tx.stop.findFirst({ where: { id: stopId, archivedAt: null } });
  if (!before) throw new TransportProblem("This stop was not found.");
  const route = await tx.route.findFirstOrThrow({ where: { id: before.routeId } });
  const name = checkStop({ ...input, before: null }, route);
  if (await tx.stop.findFirst({ where: { routeId: route.id, archivedAt: null, id: { not: stopId }, name: { equals: name, mode: "insensitive" } } })) throw new TransportProblem(`${name} is already a stop on this route.`, "name");
  const after = await tx.stop.update({ where: { id: stopId }, data: { name, pickupMin: input.pickupMin, dropMin: input.dropMin, lat: input.lat, lng: input.lng, feeTwoWayPaise: input.feeTwoWayPaise, feeOneWayPaise: input.feeOneWayPaise } });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Stop", recordId: stopId, before: stopAudit(before), after: stopAudit(after) });
  return after;
}

const stopAudit = (s: Stop) => ({ name: s.name, pickup: clockOf(s.pickupMin), drop: clockOf(s.dropMin), place: s.lat != null ? `${s.lat.toFixed(5)}, ${s.lng?.toFixed(5)}` : null, feeTwoWay: s.feeTwoWayPaise != null ? formatRupees(s.feeTwoWayPaise) : null, feeOneWay: s.feeOneWayPaise != null ? formatRupees(s.feeOneWayPaise) : null });

/** Moves a stop one place up or down. Pickup times stay; the person checks them after. */
export async function moveStop(tx: Tx, ctx: SchoolContext, stopId: string, dir: -1 | 1) {
  const s = await tx.stop.findFirst({ where: { id: stopId, archivedAt: null } });
  if (!s) throw new TransportProblem("This stop was not found.");
  const stops = await tx.stop.findMany({ where: { routeId: s.routeId, archivedAt: null }, orderBy: { seq: "asc" } });
  const i = stops.findIndex((x) => x.id === stopId);
  const j = i + dir;
  if (j < 0 || j >= stops.length) return s;
  await tx.stop.update({ where: { id: stops[i].id }, data: { seq: j + 1 } });
  await tx.stop.update({ where: { id: stops[j].id }, data: { seq: i + 1 } });
  await writeAudit(tx, ctx, { action: "reordered", recordType: "Stop", recordId: stopId, before: { order: i + 1 }, after: { order: j + 1 } });
  return s;
}

/** A stop with students cannot be archived: move them first. */
export async function archiveStop(tx: Tx, ctx: SchoolContext, stopId: string, today: Date) {
  const s = await tx.stop.findFirst({ where: { id: stopId, archivedAt: null } });
  if (!s) throw new TransportProblem("This stop was not found.");
  const n = await tx.transportAssignment.count({ where: { stopId, ...holdsSeat(today) } });
  if (n) throw new TransportProblem(`${n} student${n === 1 ? " gets" : "s get"} on at ${s.name}. Change their stop in Student Transport first.`);
  await tx.stop.update({ where: { id: stopId }, data: { archivedAt: new Date() } });
  await renumber(tx, s.routeId);
  await writeAudit(tx, ctx, { action: "archived", recordType: "Stop", recordId: stopId, before: { name: s.name } });
}

async function renumber(tx: Tx, routeId: string) {
  const stops = await tx.stop.findMany({ where: { routeId, archivedAt: null }, orderBy: [{ seq: "asc" }, { createdAt: "asc" }] });
  for (const [i, s] of stops.entries()) if (s.seq !== i + 1) await tx.stop.update({ where: { id: s.id }, data: { seq: i + 1 } });
}

/**
 * Copy the route for the evening trip in reverse order (12 §2, inferred):
 * each stop's drop time is the evening start plus the time the stop is from
 * school in the morning, so the nearest stop is dropped first.
 */
export function eveningTimes(stops: Pick<Stop, "id" | "pickupMin">[], arrivalMin: number | null, departMin: number) {
  if (!stops.length) return new Map<string, number>();
  const arrive = arrivalMin ?? Math.max(...stops.map((s) => s.pickupMin)) + 10;
  return new Map(stops.map((s) => [s.id, departMin + Math.max(1, arrive - s.pickupMin)]));
}

export async function copyForEvening(tx: Tx, ctx: SchoolContext, routeId: string) {
  const route = await tx.route.findFirst({ where: { id: routeId, archivedAt: null } });
  if (!route) throw new TransportProblem("This route was not found.");
  const stops = await tx.stop.findMany({ where: { routeId, archivedAt: null }, orderBy: { seq: "asc" } });
  if (!stops.length) throw new TransportProblem("Add the morning stops first.");
  const depart = route.eveningDepartMin ?? 15 * 60 + 30;
  const times = eveningTimes(stops, route.schoolArrivalMin, depart);
  for (const s of stops) await tx.stop.update({ where: { id: s.id }, data: { dropMin: times.get(s.id)! } });
  if (route.eveningDepartMin == null) await tx.route.update({ where: { id: routeId }, data: { eveningDepartMin: depart } });
  await writeAudit(tx, ctx, { action: "evening-copied", recordType: "Route", recordId: routeId, after: { stops: stops.length, leaves: clockOf(depart) } });
  const first = [...stops].sort((a, b) => times.get(a.id)! - times.get(b.id)!)[0];
  return { stops: stops.length, first: first.name, firstAt: times.get(first.id)! };
}
