// Parent Link, Transport (12 §4 Sends "11 Communication": pickup, drop and
// "bus arriving" to parents; 11 owns the page). Read only (rule 31): the
// chosen child's route and stop with pickup and drop times, the bus number
// and the driver's phone, and today's trip: not started, on the way with
// the time it should reach the child's stop (only when the school has
// switched live tracking on), reached, and whether the child boarded or was
// dropped. Nothing about other children on the bus. Shown only when the
// school uses Transport and the child has a place on a bus. Imported by
// src/lib/parent-link/section-list.ts.
import "server-only";

import { Bus, Clock, MapPin, Phone } from "lucide-react";
import { registerSection, type GuardianView } from "../parent-link/sections";
import { todayDate, minuteNow, clockAt } from "../front-office/time";
import { etas } from "./geo";
import { holdsSeat } from "./places";
import { liveTrackingOn, transportOn, transportSettings } from "./settings";
import { plannedMinOf } from "./trips";
import { assignType, clockOf, liveStatus, showPlate, tripKind } from "./words";
import { formatDate } from "../format";

type TripLine = { kind: string; state: string; tone: "ok" | "warn" | "neutral" | "info"; detail: string | null };
type Data = {
  route: string;
  stop: string;
  type: string;
  pickup: string | null;
  drop: string | null;
  starts: string | null;
  bus: string | null;
  driver: { name: string; phone: string } | null;
  trips: TripLine[];
};

const TONE: Record<TripLine["tone"], string> = { ok: "text-ok", warn: "text-warn", neutral: "text-ink2", info: "text-info" };

function TransportSection({ data }: { data: Data; view: GuardianView }) {
  const row = "flex items-start gap-3 py-2.5 border-t border-line/70 first:border-0";
  return (
    <ul className="text-[14px]">
      <li className={row}>
        <Bus size={18} className="text-brand mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0"><b className="font-semibold block">{data.route}</b><span className="text-[13px] text-ink2">{data.bus ? `Bus ${data.bus} · ` : ""}{data.type}{data.starts ? ` · starts ${data.starts}` : ""}</span></span>
      </li>
      <li className={row}>
        <MapPin size={18} className="text-ok mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0"><b className="font-semibold block">{data.stop}</b><span className="text-[13px] text-ink2">{[data.pickup ? `Pickup ${data.pickup}` : null, data.drop ? `Drop ${data.drop}` : null].filter(Boolean).join(" · ")}</span></span>
      </li>
      {data.driver && (
        <li className={row}>
          <Phone size={18} className="text-info mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0"><b className="font-semibold block">Driver: {data.driver.name}</b><a href={`tel:${data.driver.phone}`} className="text-[13px] text-brand hover:underline">{data.driver.phone}</a></span>
        </li>
      )}
      {data.trips.map((t) => (
        <li key={t.kind} className={row}>
          <Clock size={18} className="text-ink2 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0"><b className="font-semibold block">Today, {t.kind.toLowerCase()}: <span className={TONE[t.tone]}>{t.state}</span></b>{t.detail && <span className="text-[13px] text-ink2">{t.detail}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

registerSection<Data>({
  key: "transport",
  label: "School bus",
  description: "The child's route, stop and times, the driver's phone, and today's bus",
  order: 45,
  load: async (tx, ctx, view) => {
    if (!(await transportOn(tx, ctx))) return null;
    const now = new Date();
    const today = todayDate(view.timeZone, now);
    const place = await tx.transportAssignment.findFirst({ where: { studentId: view.child.id, ...holdsSeat(today) }, orderBy: { fromDate: "asc" } });
    if (!place) return null;
    const [route, stop, settings, live] = await Promise.all([
      tx.route.findFirst({ where: { id: place.routeId } }),
      tx.stop.findFirst({ where: { id: place.stopId } }),
      transportSettings(tx, ctx),
      liveTrackingOn(tx, ctx),
    ]);
    if (!route || !stop) return null;
    const stops = await tx.stop.findMany({ where: { routeId: route.id, archivedAt: null }, orderBy: { seq: "asc" } });
    const started = place.fromDate <= today;
    const kinds = place.type === "PICKUP_ONLY" ? ["MORNING"] : place.type === "DROP_ONLY" ? ["EVENING"] : ["MORNING", "EVENING"];
    const trips = started ? await tx.trip.findMany({ where: { routeId: route.id, date: today, kind: { in: kinds } }, orderBy: { kind: "desc" } }) : [];
    const [vehicle, driver] = await Promise.all([
      (trips.find((t) => t.vehicleId)?.vehicleId ?? route.vehicleId) ? tx.vehicle.findFirst({ where: { id: (trips.find((t) => t.vehicleId)?.vehicleId ?? route.vehicleId)! }, select: { number: true } }) : null,
      (trips.find((t) => t.driverId)?.driverId ?? route.driverId) ? tx.driver.findFirst({ where: { id: (trips.find((t) => t.driverId)?.driverId ?? route.driverId)!, archivedAt: null }, select: { name: true, phone: true } }) : null,
    ]);
    const nowMin = minuteNow(view.timeZone, now);
    const lines: TripLine[] = [];
    for (const t of trips) {
      const kind = t.kind === "MORNING" ? "Morning" : "Evening";
      if (t.status === "CANCELLED") { lines.push({ kind, state: "No bus", tone: "warn", detail: t.cancelReason ? `The trip was cancelled: ${t.cancelReason}` : "The trip was cancelled." }); continue; }
      const [mine, reached] = await Promise.all([
        tx.boardingEvent.findFirst({ where: { tripId: t.id, studentId: view.child.id } }),
        tx.tripStopEvent.findFirst({ where: { tripId: t.id, stopId: stop.id } }),
      ]);
      const planned = plannedMinOf(stop, t.kind, route, stops);
      const mark = mine?.status === "BOARDED" ? `${view.child.firstName} boarded at ${clockAt(mine.at, view.timeZone)}.`
        : mine?.status === "DROPPED" ? `${view.child.firstName} was dropped at ${clockAt(mine.at, view.timeZone)}.`
        : mine?.status === "NOT_BOARDED" ? `${view.child.firstName} did not board.` : null;
      if (t.status === "SCHEDULED") { lines.push({ kind, state: "Not started yet", tone: "neutral", detail: `Planned at your stop: ${clockOf(planned)}.` }); continue; }
      if (t.status === "COMPLETED") { lines.push({ kind, state: "Trip over", tone: "ok", detail: mark ?? (reached ? `Reached your stop at ${clockAt(reached.at, view.timeZone)}.` : null) }); continue; }
      // On the way.
      if (reached) { lines.push({ kind, state: reached.status === "MISSED" ? "Stop missed" : "Reached your stop", tone: reached.status === "MISSED" ? "warn" : "ok", detail: mark ?? `At ${clockAt(reached.at, view.timeZone)}.` }); continue; }
      let detail = mark ?? `Planned at your stop: ${clockOf(planned)}.`;
      if (live && !mark) {
        const s = liveStatus(t, now, settings);
        if (s.status === "Offline" || !t.lastLat || !t.lastLng) detail = `Planned at your stop: ${clockOf(planned)}. Bus location not available now${t.lastPointAt ? ` (last seen ${clockAt(t.lastPointAt, view.timeZone)})` : ""}.`;
        else {
          const done = new Set((await tx.tripStopEvent.findMany({ where: { tripId: t.id }, select: { stopId: true } })).map((e) => e.stopId));
          const ordered = (t.kind === "MORNING" ? stops : [...stops].reverse()).filter((x) => !done.has(x.id));
          const eta = etas({ nowMin, at: { lat: t.lastLat, lng: t.lastLng }, speedKmh: t.lastSpeedKmh, stops: ordered.map((x) => ({ id: x.id, plannedMin: plannedMinOf(x, t.kind, route, stops), lat: x.lat, lng: x.lng })) }).get(stop.id);
          detail = eta != null ? `Expected at your stop about ${clockOf(eta)} (planned ${clockOf(planned)}). Updated ${clockAt(t.lastPointAt!, view.timeZone)}.` : detail;
        }
      }
      lines.push({ kind, state: "On the way", tone: "info", detail });
    }
    return {
      route: `Route ${route.number} · ${route.name}`,
      stop: stop.name,
      type: assignType(place.type),
      pickup: place.type !== "DROP_ONLY" ? clockOf(stop.pickupMin) : null,
      drop: place.type !== "PICKUP_ONLY" ? (stop.dropMin != null ? clockOf(stop.dropMin) : clockOf(plannedMinOf(stop, "EVENING", route, stops))) : null,
      starts: started ? null : formatDate(place.fromDate),
      bus: vehicle ? showPlate(vehicle.number) : null,
      driver,
      trips: lines.map((l) => ({ ...l, kind: tripKind(l.kind === "Morning" ? "MORNING" : "EVENING") })),
    };
  },
  Render: TransportSection,
});
