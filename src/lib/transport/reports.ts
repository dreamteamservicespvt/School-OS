// Transport reports (12 §7): trips, timings, usage, costs, fee coverage and
// collection, papers and licences, and alerts. Each returns one Table, the
// same rows on Transport Reports, in Reports & Analytics and in every file.
import "server-only";

import type { Tx } from "../db";
import { dateWhere, momentWhere, type DayRange } from "../periods";
import type { Row, Table } from "../reports/types";
import { holdsSeat, routeSeats } from "./places";
import { studyingIds } from "./people";
import { minutesLate } from "./views";
import { ALERT_KINDS, expiryWords, paperLabel, showPlate, tripKind } from "./words";
import { clockAt } from "../front-office/time";

export type TrReportInput = { tx: Tx; range: DayRange | null; tz: string; today: Date; lateAfterMin: number };

const ZERO = BigInt(0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const sumRow = (rows: Row[], keys: string[], label: string, first: string): Row => {
  const out: Row = { [first]: label };
  for (const k of keys) {
    const vals = rows.map((r) => r[k]);
    out[k] = vals.some((v) => typeof v === "bigint") ? vals.reduce<bigint>((s, v) => s + (typeof v === "bigint" ? v : ZERO), ZERO) : vals.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
  }
  return out;
};

/** Trips: completed, cancelled, late starts and missed stops, by route. */
export async function tripsReport({ tx, range, tz, lateAfterMin }: TrReportInput): Promise<Table> {
  if (!range) return { columns: [], rows: [], empty: "Pick the dates." };
  const trips = await tx.trip.findMany({ where: { date: dateWhere(range) }, select: { id: true, routeId: true, kind: true, status: true, plannedStartMin: true, startedAt: true } });
  const [routes, missed] = await Promise.all([
    tx.route.findMany({ where: { id: { in: [...new Set(trips.map((t) => t.routeId))] } }, select: { id: true, number: true, name: true } }),
    tx.tripStopEvent.groupBy({ by: ["tripId"], where: { tripId: { in: trips.map((t) => t.id) }, status: "MISSED" }, _count: { _all: true } }),
  ]);
  const rows: Row[] = routes.sort((a, b) => a.number - b.number).flatMap((r) => (["MORNING", "EVENING"] as const).map((kind) => {
    const mine = trips.filter((t) => t.routeId === r.id && t.kind === kind);
    if (!mine.length) return null;
    const lateStarts = mine.filter((t) => t.startedAt && (minutesLate(t.startedAt, t.plannedStartMin, tz) ?? 0) > lateAfterMin).length;
    const done = mine.filter((t) => t.status === "COMPLETED").length;
    return {
      route: `Route ${r.number} · ${r.name}`, trip: tripKind(kind), planned: mine.length, completed: done, cancelled: mine.filter((t) => t.status === "CANCELLED").length,
      lateStarts, missedStops: mine.reduce((n, t) => n + (missed.find((m) => m.tripId === t.id)?._count._all ?? 0), 0), onTime: pct(done - lateStarts, done),
    } as Row;
  }).filter((x): x is Row => Boolean(x)));
  const keys = ["planned", "completed", "cancelled", "lateStarts", "missedStops"];
  return {
    columns: [{ key: "route", label: "Route" }, { key: "trip", label: "Trip" }, { key: "planned", label: "Trips", kind: "number" }, { key: "completed", label: "Completed", kind: "number" }, { key: "cancelled", label: "Cancelled", kind: "number" }, { key: "lateStarts", label: "Late starts", kind: "number" }, { key: "missedStops", label: "Missed stops", kind: "number" }, { key: "onTime", label: "Started on time", kind: "percent" }],
    rows, totals: rows.length ? { ...sumRow(rows, keys, "All routes", "route"), trip: null, onTime: null } : null,
    note: `A late start is more than ${lateAfterMin} minutes after the planned start.`,
  };
}

/** Timings: planned against actual arrival at each stop (the on-time record). */
export async function timingsReport({ tx, range, tz, lateAfterMin }: TrReportInput): Promise<Table> {
  if (!range) return { columns: [], rows: [], empty: "Pick the dates." };
  const events = await tx.tripStopEvent.findMany({ where: { status: "REACHED", at: momentWhere(range, tz) }, select: { stopId: true, at: true, plannedMin: true, tripId: true } });
  const stops = await tx.stop.findMany({ where: { id: { in: [...new Set(events.map((e) => e.stopId))] } }, select: { id: true, name: true, seq: true, routeId: true } });
  const routes = await tx.route.findMany({ where: { id: { in: [...new Set(stops.map((s) => s.routeId))] } }, select: { id: true, number: true } });
  const trips = await tx.trip.findMany({ where: { id: { in: [...new Set(events.map((e) => e.tripId))] } }, select: { id: true, kind: true } });
  const rows: Row[] = [];
  for (const s of stops.sort((a, b) => (routes.find((r) => r.id === a.routeId)?.number ?? 0) - (routes.find((r) => r.id === b.routeId)?.number ?? 0) || a.seq - b.seq)) {
    for (const kind of ["MORNING", "EVENING"]) {
      const lates = events.filter((e) => e.stopId === s.id && trips.find((t) => t.id === e.tripId)?.kind === kind).map((e) => minutesLate(e.at, e.plannedMin, tz)).filter((x): x is number => x != null);
      if (!lates.length) continue;
      const onTime = lates.filter((l) => l <= lateAfterMin).length;
      rows.push({ route: `Route ${routes.find((r) => r.id === s.routeId)?.number ?? ""}`, stop: s.name, trip: tripKind(kind), times: lates.length, onTime, avgLate: Math.round((lates.reduce((a, b) => a + b, 0) / lates.length) * 10) / 10, worst: Math.max(...lates), rate: pct(onTime, lates.length) });
    }
  }
  return {
    columns: [{ key: "route", label: "Route" }, { key: "stop", label: "Stop" }, { key: "trip", label: "Trip" }, { key: "times", label: "Times reached", kind: "number" }, { key: "onTime", label: "On time", kind: "number" }, { key: "avgLate", label: "Average minutes late", kind: "number" }, { key: "worst", label: "Most minutes late", kind: "number" }, { key: "rate", label: "On-time record", kind: "percent" }],
    rows, note: `On time: within ${lateAfterMin} minutes of the planned time. A negative number means early.`,
  };
}

/** Usage: students per route and stop, and seats used (as on today). */
export async function usageReport({ tx, today }: TrReportInput): Promise<Table> {
  const routes = await tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } }, vehicle: { select: { capacity: true, label: true, number: true } } } });
  const places = await tx.transportAssignment.findMany({ where: { ...holdsSeat(today), routeId: { in: routes.map((r) => r.id) } }, select: { studentId: true, stopId: true, routeId: true, type: true } });
  const live = await studyingIds(tx, places.map((p) => p.studentId));
  const seats = await routeSeats(tx, today, routes.map((r) => r.id));
  const rows: Row[] = [];
  for (const r of routes) {
    for (const s of r.stops) {
      const here = places.filter((p) => p.stopId === s.id && live.has(p.studentId));
      rows.push({ route: `Route ${r.number} · ${r.name}`, stop: s.name, students: here.length, oneWay: here.filter((p) => p.type !== "TWO_WAY").length, used: null, capacity: null, free: null });
    }
    const u = seats.get(r.id);
    rows.push({ route: `Route ${r.number} · ${r.name}`, stop: "All stops", students: u?.used ?? 0, oneWay: places.filter((p) => p.routeId === r.id && p.type !== "TWO_WAY" && live.has(p.studentId)).length, used: pct(u?.used ?? 0, r.vehicle?.capacity ?? 0), capacity: r.vehicle?.capacity ?? null, free: r.vehicle ? Math.max(0, r.vehicle.capacity - (u?.used ?? 0)) : null });
  }
  return {
    columns: [{ key: "route", label: "Route" }, { key: "stop", label: "Stop" }, { key: "students", label: "Students", kind: "number" }, { key: "oneWay", label: "One-way", kind: "number" }, { key: "capacity", label: "Seats", kind: "number" }, { key: "free", label: "Free seats", kind: "number" }, { key: "used", label: "Seats used", kind: "percent" }],
    rows, note: "As on today. Students starting later are counted from their start date.",
  };
}

/** Fuel and repair costs per vehicle and month, and cost per student. */
export async function costsReport({ tx, range, today }: TrReportInput): Promise<Table> {
  if (!range) return { columns: [], rows: [], empty: "Pick the dates." };
  const when = { date: dateWhere(range), cancelledAt: null };
  const [fuel, repairs, vehicles, routes] = await Promise.all([
    tx.fuelLog.findMany({ where: when, select: { vehicleId: true, date: true, amountPaise: true, litres: true } }),
    tx.maintenanceLog.findMany({ where: when, select: { vehicleId: true, date: true, amountPaise: true } }),
    tx.vehicle.findMany({ select: { id: true, label: true, number: true } }),
    tx.route.findMany({ where: { archivedAt: null }, select: { id: true, vehicleId: true } }),
  ]);
  const seats = await routeSeats(tx, today, routes.map((r) => r.id));
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const keys = [...new Set([...fuel, ...repairs].map((x) => `${x.vehicleId}|${month(x.date)}`))].sort();
  const rows: Row[] = keys.map((k) => {
    const [vid, m] = k.split("|");
    const v = vehicles.find((x) => x.id === vid);
    const f = fuel.filter((x) => x.vehicleId === vid && month(x.date) === m);
    const rp = repairs.filter((x) => x.vehicleId === vid && month(x.date) === m);
    const fuelP = f.reduce((s, x) => s + x.amountPaise, ZERO);
    const repP = rp.reduce((s, x) => s + x.amountPaise, ZERO);
    const route = routes.find((r) => r.vehicleId === vid);
    const students = route ? seats.get(route.id)?.used ?? 0 : 0;
    const [y, mo] = m.split("-").map(Number);
    return {
      vehicle: v ? `${v.label ?? "Vehicle"} · ${showPlate(v.number)}` : "", month: new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      litres: Math.round(f.reduce((s, x) => s + Number(x.litres ?? 0), 0) * 10) / 10, fuel: fuelP, repairs: repP, total: fuelP + repP, students, perStudent: students ? (fuelP + repP) / BigInt(students) : null,
    };
  });
  const t: Table = { columns: [{ key: "vehicle", label: "Vehicle" }, { key: "month", label: "Month" }, { key: "litres", label: "Litres", kind: "number" }, { key: "fuel", label: "Fuel", kind: "money" }, { key: "repairs", label: "Repairs and service", kind: "money" }, { key: "total", label: "Total", kind: "money" }, { key: "students", label: "Students now", kind: "number" }, { key: "perStudent", label: "Cost per student", kind: "money" }], rows };
  return { ...t, totals: rows.length ? { ...sumRow(rows, ["litres", "fuel", "repairs", "total"], "All vehicles", "vehicle"), month: null, students: null, perStudent: null } : null, note: "Cancelled entries are left out. The same costs are in Finance, Expenses." };
}

/** Transport fee coverage and collection by route, for the fee rows of the dates chosen. */
export async function feesReport({ tx, range, today }: TrReportInput): Promise<Table> {
  const routes = await tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } });
  const places = await tx.transportAssignment.findMany({ where: holdsSeat(today), select: { id: true, studentId: true, routeId: true } });
  const live = await studyingIds(tx, places.map((p) => p.studentId));
  const charges = await tx.transportFeeCharge.findMany({ where: { removedAt: null, ...(range ? { periodStart: { lte: new Date(`${range.to}T00:00:00Z`) }, periodEnd: { gte: new Date(`${range.from}T00:00:00Z`) } } : {}) }, select: { assignmentId: true, dueId: true, studentId: true } });
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: charges.map((c) => c.dueId) } }, select: { id: true, amountPaise: true, concessionPaise: true, adjustmentPaise: true, paidPaise: true, balancePaise: true } });
  const allPlaces = await tx.transportAssignment.findMany({ where: { id: { in: [...new Set(charges.map((c) => c.assignmentId))] } }, select: { id: true, routeId: true } });
  const rows: Row[] = routes.map((r) => {
    const onBus = places.filter((p) => p.routeId === r.id && live.has(p.studentId));
    const withFee = onBus.filter((p) => charges.some((c) => c.assignmentId === p.id)).length;
    const mine = charges.filter((c) => allPlaces.find((a) => a.id === c.assignmentId)?.routeId === r.id).map((c) => dues.find((d) => d.id === c.dueId)).filter((d): d is (typeof dues)[number] => Boolean(d));
    const billed = mine.reduce((s, d) => s + d.amountPaise - d.concessionPaise + d.adjustmentPaise, ZERO);
    const paid = mine.reduce((s, d) => s + d.paidPaise, ZERO);
    return { route: `Route ${r.number} · ${r.name}`, students: new Set(onBus.map((p) => p.studentId)).size, withFee, noFee: onBus.length - withFee, billed, paid, due: mine.reduce((s, d) => s + d.balancePaise, ZERO), rate: billed > ZERO ? Math.round(Number((paid * BigInt(1000)) / billed)) / 10 : null };
  });
  const keys = ["students", "withFee", "noFee", "billed", "paid", "due"];
  return {
    columns: [{ key: "route", label: "Route" }, { key: "students", label: "Students now", kind: "number" }, { key: "withFee", label: "With the fee", kind: "number" }, { key: "noFee", label: "No fee", kind: "number" }, { key: "billed", label: "Billed", kind: "money" }, { key: "paid", label: "Collected", kind: "money" }, { key: "due", label: "Still due", kind: "money" }, { key: "rate", label: "Collected %", kind: "percent" }],
    rows, totals: rows.length ? { ...sumRow(rows, keys, "All routes", "route"), rate: null } : null,
    note: range ? "Transport fee rows of the periods in the dates chosen. Fee records start at go-live, 1 April 2026." : "All transport fee rows. Fee records start at go-live, 1 April 2026.",
    links: [{ label: "Open Fee Management", href: "/fee-management" }],
  };
}

/** Papers and licences: expired, or ending in the dates chosen (default the next 60 days). */
export async function papersReport({ tx, range, today }: TrReportInput): Promise<Table> {
  const until = range ? new Date(`${range.to}T00:00:00Z`) : new Date(today.getTime() + 60 * 86_400_000);
  const [docs, drivers] = await Promise.all([
    tx.vehicleDocument.findMany({ where: { replacedAt: null, vehicle: { archivedAt: null }, expiresOn: { lte: until } }, include: { vehicle: { select: { label: true, number: true } } }, orderBy: { expiresOn: "asc" } }),
    tx.driver.findMany({ where: { archivedAt: null, status: "ACTIVE", role: "DRIVER", licenceExpiry: { lte: until } }, orderBy: { licenceExpiry: "asc" } }),
  ]);
  const rows: Row[] = [
    ...docs.map((d) => ({ what: paperLabel(d.kind), who: `${d.vehicle.label ?? "Vehicle"} · ${showPlate(d.vehicle.number)}`, number: d.number, expires: d.expiresOn, state: expiryWords(d.expiresOn, today) })),
    ...drivers.map((d) => ({ what: "Driving licence", who: d.name, number: d.licenceNo, expires: d.licenceExpiry!, state: expiryWords(d.licenceExpiry, today) })),
  ].sort((a, b) => (a.expires as Date).getTime() - (b.expires as Date).getTime());
  return { columns: [{ key: "what", label: "Paper" }, { key: "who", label: "Vehicle or driver" }, { key: "number", label: "Number" }, { key: "expires", label: "Expires", kind: "date" }, { key: "state", label: "State" }], rows, note: range ? null : "Expired, or ending in the next 60 days." };
}

/** Alerts history: over-speed, deviation, offline, emergency, breakdown, trip left running. */
export async function alertsReport({ tx, range, tz }: TrReportInput): Promise<Table> {
  if (!range) return { columns: [], rows: [], empty: "Pick the dates." };
  const alerts = await tx.transportAlert.findMany({ where: { at: momentWhere(range, tz) }, orderBy: { at: "desc" }, take: 3000 });
  const routes = await tx.route.findMany({ where: { id: { in: [...new Set(alerts.map((a) => a.routeId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, number: true } });
  return {
    columns: [{ key: "date", label: "Date", kind: "date" }, { key: "time", label: "Time" }, { key: "kind", label: "Alert" }, { key: "route", label: "Route" }, { key: "text", label: "What happened" }, { key: "speed", label: "Speed (km/h)", kind: "number" }, { key: "status", label: "Status" }, { key: "note", label: "Closed with" }],
    rows: alerts.map((a) => ({ date: a.at, time: clockAt(a.at, tz), kind: ALERT_KINDS[a.kind]?.label ?? a.kind, route: a.routeId ? `Route ${routes.find((r) => r.id === a.routeId)?.number ?? ""}` : "", text: a.text, speed: a.speedKmh != null ? Math.round(a.speedKmh) : null, status: a.status === "OPEN" ? "Open" : "Closed", note: a.closeNote })),
  };
}

export const TR_REPORTS = [
  { key: "tr-trips", name: "Trips", sub: "Completed, cancelled, late starts and missed stops, by route", dated: true, run: tripsReport },
  { key: "tr-timings", name: "On-time record", sub: "Planned against actual arrival at each stop", dated: true, run: timingsReport },
  { key: "tr-usage", name: "Students per route and stop", sub: "Students at each stop and seats used", dated: false, run: usageReport },
  { key: "tr-costs", name: "Fuel and repair costs", sub: "Per vehicle and month, with cost per student", dated: true, run: costsReport },
  { key: "tr-fees", name: "Transport fee by route", sub: "Students with and without the fee, billed and collected", dated: true, run: feesReport },
  { key: "tr-papers", name: "Papers and licences ending", sub: "Insurance, fitness, permit, pollution and driving licences", dated: false, run: papersReport },
  { key: "tr-alerts", name: "Alerts history", sub: "Over-speed, deviation, offline, emergency and breakdown", dated: true, run: alertsReport },
] as const;
export type TrReportKey = (typeof TR_REPORTS)[number]["key"];
