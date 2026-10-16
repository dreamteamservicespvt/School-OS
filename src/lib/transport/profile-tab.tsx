// Transport Management's tab on the Student Profile (03 §2, "Transport",
// order 70; 12 §4 Sends "03 Student Management: Transport tab on the
// profile"): the student's route and stop now, pickup and drop times, the
// bus and driver, the monthly fee, earlier places this year and the last
// trips' boarding marks. Shown to those who see the whole of Transport (a
// driver sees only his own trips, never a profile). Registered through
// src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { formatDate, formatRupees } from "../format";
import { todayDate } from "../front-office/time";
import { registerProfileTab, type ProfileTabArgs, type SummaryItem } from "../students/profile-tabs";
import { trCan, trViewer } from "./access";
import { holdsSeat, onBusOn } from "./places";
import { assignType, BASE, clockOf, driverRole, MODULE, showPlate, tripKind } from "./words";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";

const BOARD: Record<string, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  BOARDED: { label: "Boarded", tone: "ok" }, DROPPED: { label: "Dropped", tone: "ok" }, NOT_BOARDED: { label: "Not boarded", tone: "warn" },
};

async function load({ current, studentId }: ProfileTabArgs) {
  const today = todayDate(current.school.timeZone);
  return withSchool(current.ctx, async (tx) => {
    const places = await tx.transportAssignment.findMany({ where: { studentId, status: { in: ["ACTIVE", "WAITING", "ENDED", "CANCELLED"] } }, orderBy: [{ fromDate: "desc" }, { createdAt: "desc" }], take: 20 });
    const now = places.find((p) => p.status === "ACTIVE" && p.change !== "STOP" && p.fromDate <= today && (!p.toDate || p.toDate >= today))
      ?? (await tx.transportAssignment.findFirst({ where: { studentId, ...holdsSeat(today) }, orderBy: { fromDate: "asc" } }));
    const waiting = places.find((p) => p.status === "WAITING") ?? null;
    const routeIds = [...new Set(places.map((p) => p.routeId))];
    const stopIds = [...new Set(places.map((p) => p.stopId))];
    const [routes, stops] = await Promise.all([
      tx.route.findMany({ where: { id: { in: routeIds } }, select: { id: true, number: true, name: true, vehicleId: true, driverId: true, attendantId: true, schoolArrivalMin: true, eveningDepartMin: true } }),
      tx.stop.findMany({ where: { id: { in: stopIds } }, select: { id: true, name: true, pickupMin: true, dropMin: true } }),
    ]);
    const route = now ? routes.find((r) => r.id === now.routeId) ?? null : null;
    const [vehicle, people, boarding, feeRows] = await Promise.all([
      route?.vehicleId ? tx.vehicle.findFirst({ where: { id: route.vehicleId }, select: { number: true, label: true } }) : null,
      route ? tx.driver.findMany({ where: { id: { in: [route.driverId, route.attendantId].filter((x): x is string => Boolean(x)) }, archivedAt: null }, select: { id: true, name: true, phone: true, role: true } }) : [],
      tx.boardingEvent.findMany({ where: { studentId }, orderBy: { at: "desc" }, take: 10 }),
      tx.transportFeeCharge.findMany({ where: { studentId, removedAt: null }, select: { amountPaise: true } }),
    ]);
    const trips = boarding.length ? await tx.trip.findMany({ where: { id: { in: boarding.map((b) => b.tripId) } }, select: { id: true, date: true, kind: true } }) : [];
    const onBusToday = now ? Boolean(await tx.transportAssignment.findFirst({ where: { id: now.id, ...onBusOn(today) }, select: { id: true } })) : false;
    return { today, places, now, waiting, routes, stops, route, vehicle, people, boarding, trips, onBusToday, feeTotal: feeRows.reduce((n, r) => n + r.amountPaise, BigInt(0)) };
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-line last:border-0">
      <dt className="text-[13px] text-ink2">{label}</dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  );
}

async function TransportTab(args: ProfileTabArgs) {
  const d = await load(args);
  const v = trViewer(args.current);
  const can = trCan(v, args.current);
  const placeHref = (q: Record<string, string>) => `${BASE}/students?${new URLSearchParams(q).toString()}`;
  const stopOf = (id: string) => d.stops.find((s) => s.id === id);
  const routeOf = (id: string) => d.routes.find((r) => r.id === id);
  const n = d.now;
  const stop = n ? stopOf(n.stopId) : undefined;
  const assign = can.students && !n && !d.waiting ? `${BASE}/students?do=assign&student=${args.studentId}` : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Bus and stop" description={n ? (d.onBusToday ? "Uses the school bus" : `Starts on ${formatDate(n.fromDate)}`) : "Not using the school bus"}
          action={n && d.route ? <Link className="text-sm font-medium text-brand-text hover:underline" href={`${BASE}/routes/${d.route.id}`}>Open route</Link> : undefined} />
        <CardBody>
          {!n ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-ink2 text-sm">{d.waiting ? "A transport change is waiting for approval." : "This student does not use the school bus."}</p>
              {assign && <Link className="text-sm font-medium text-brand-text hover:underline" href={assign}>Give a bus stop</Link>}
            </div>
          ) : (
            <dl>
              <Row label="Route">{d.route ? `Route ${d.route.number} · ${d.route.name}` : "—"}</Row>
              <Row label="Stop">{stop?.name ?? "—"}</Row>
              <Row label="Uses">{assignType(n.type)}</Row>
              {n.type !== "DROP_ONLY" && <Row label="Pickup">{clockOf(stop?.pickupMin)}</Row>}
              {n.type !== "PICKUP_ONLY" && <Row label="Drop">{stop?.dropMin != null ? clockOf(stop.dropMin) : "Evening drop"}</Row>}
              <Row label="Vehicle">{d.vehicle ? `${d.vehicle.label ? `${d.vehicle.label} · ` : ""}${showPlate(d.vehicle.number)}` : "Not given yet"}</Row>
              {d.people.map((p) => <Row key={p.id} label={driverRole(p.role)}>{p.name} · <a className="text-brand-text hover:underline" href={`tel:${p.phone}`}>{p.phone}</a></Row>)}
              <Row label="From">{formatDate(n.fromDate)}{n.toDate ? ` to ${formatDate(n.toDate)}` : ""}</Row>
              <Row label="Fee a month">{formatRupees(n.monthlyFeePaise)}</Row>
              {n.busPassNo && <Row label="Bus pass">{n.busPassNo}</Row>}
              <Row label="Transport fee added">{formatRupees(d.feeTotal)}</Row>
            </dl>
          )}
          {n && can.students && (
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-medium">
              <Link className="text-brand-text hover:underline" href={placeHref({ do: "change", ids: n.id })}>Change stop</Link>
              <Link className="text-brand-text hover:underline" href={placeHref({ do: "stop", ids: n.id })}>Stop transport</Link>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Last trips" description="Boarding marked on the bus" />
        <CardBody>
          {d.boarding.length === 0 ? <p className="text-ink2 text-sm">No boarding marked yet.</p> : (
            <ul className="divide-y divide-line">
              {d.boarding.map((b) => {
                const t = d.trips.find((x) => x.id === b.tripId);
                const s = BOARD[b.status] ?? { label: b.status, tone: "neutral" as const };
                return (
                  <li key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm">{t ? `${formatDate(t.date)} · ${tripKind(t.kind)}` : formatDate(b.at)}</span>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {d.places.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="Transport history" description="Each place on a bus, newest first" />
          <CardBody>
            <ul className="divide-y divide-line">
              {d.places.map((p) => {
                const r = routeOf(p.routeId);
                const s = stopOf(p.stopId);
                const state = p.status === "WAITING" ? { label: "Waiting for approval", tone: "warn" as const }
                  : p.status === "CANCELLED" ? { label: "Cancelled", tone: "neutral" as const }
                  : p.change === "STOP" || (p.toDate && p.toDate < d.today) ? { label: "Ended", tone: "neutral" as const }
                  : p.fromDate > d.today ? { label: "Starts later", tone: "info" as const } : { label: "Now", tone: "ok" as const };
                return (
                  <li key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r ? `Route ${r.number} · ${r.name}` : "Route"}{s ? ` · ${s.name}` : ""}</p>
                      <p className="text-[12.5px] text-ink2">{assignType(p.type)} · {formatDate(p.fromDate)}{p.toDate ? ` to ${formatDate(p.toDate)}` : ""} · {formatRupees(p.monthlyFeePaise)} a month{p.endReason ? ` · ${p.endReason}` : p.reason ? ` · ${p.reason}` : ""}</p>
                    </div>
                    <Pill tone={state.tone}>{state.label}</Pill>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

async function summary({ current, studentId }: ProfileTabArgs): Promise<SummaryItem[]> {
  const today = todayDate(current.school.timeZone);
  return withSchool(current.ctx, async (tx) => {
    const p = await tx.transportAssignment.findFirst({ where: { studentId, ...holdsSeat(today) }, orderBy: { fromDate: "asc" } });
    if (!p) return [];
    const [route, stop] = await Promise.all([
      tx.route.findFirst({ where: { id: p.routeId }, select: { number: true } }),
      tx.stop.findFirst({ where: { id: p.stopId }, select: { name: true, pickupMin: true } }),
    ]);
    return [{ label: "Transport", value: route ? `Route ${route.number}` : "Bus", sub: stop ? `${stop.name}${p.type !== "DROP_ONLY" ? ` · ${clockOf(stop.pickupMin)}` : ""}` : assignType(p.type), tone: "neutral" }];
  });
}

registerProfileTab({
  key: "transport",
  label: "Transport",
  module: MODULE,
  order: 70,
  // The whole of Transport (Full or View); a driver's "own" reach is his trips, not students' profiles.
  allowed: (current) => current.permissions[MODULE]?.see === "all",
  load: async (args) => <TransportTab {...args} />,
  summary,
  headerActions: async ({ current, studentId }) => {
    const can = trCan(trViewer(current), current);
    if (!can.students) return [];
    const today = todayDate(current.school.timeZone);
    const has = await withSchool(current.ctx, (tx) => tx.transportAssignment.findFirst({ where: { studentId, OR: [holdsSeat(today), { status: "WAITING" }] }, select: { id: true } }));
    return has ? [] : [{ label: "Give a bus stop", href: `${BASE}/students?do=assign&student=${studentId}` }];
  },
});
