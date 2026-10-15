import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Bus, Clock, History, MapPinned, Moon, Phone, Send, Siren, Sun, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { etas } from "@/lib/transport/geo";
import { ensureTrips } from "@/lib/transport/trips";
import { alertsView, liveView, routeParents } from "@/lib/transport/views";
import { breakdownText, delayText, emergencyText } from "@/lib/transport/messages";
import { ALERT_KINDS, LIVE_TONE, clockOf, liveStatus, plural, showPlate, tripKind } from "@/lib/transport/words";
import { clockAt } from "@/lib/front-office/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { UrlSheet } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { Empty, Stack, Stats } from "@/components/money/kit";
import { TrHead } from "./_components/head";
import { RouteBadge, telHref } from "./_components/bits";
import { ActButton } from "./_components/fields";
import { TransportMap, TripLine, type MapBus } from "./_components/map";
import { AutoRefresh, CloseAlertSheet, Playback } from "./_components/live";
import { RouteMessageSheet } from "./_components/route-sheets";
import { remindAction } from "./actions";
import { BASE, UUID, addQ, one, qs, trGuard, type SearchParams } from "./_lib/page";

export const metadata = { title: "Live Tracking" };

/**
 * Live Tracking (12 §2): every running bus on a sketch of the routes (no
 * paid map key), with trip cards: status, speed, next stop and arrival time,
 * and the last update. Locations exist only between Start trip and End trip.
 */
export default async function LivePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("live");
  const sp = await searchParams;
  const kind = one(sp.kind) === "EVENING" ? "EVENING" : one(sp.kind) === "MORNING" ? "MORNING" : p.minute < 12 * 60 ? "MORNING" : "EVENING";
  const routeSel = UUID.test(one(sp.route)) ? one(sp.route) : null;
  const replayId = UUID.test(one(sp.replay)) ? one(sp.replay) : null;
  const closeId = UUID.test(one(sp.close)) ? one(sp.close) : null;
  const msg = (["delay", "emergency", "message"] as const).find((k) => k === one(sp.msg)) ?? null;
  const doing = one(sp.do);
  const can = p.can;
  const s = p.settings;
  const today = { period: "today" as const, from: p.todayStr, to: p.todayStr, label: "Today" };

  const data = await withSchool(p.current.ctx, async (tx) => {
    await ensureTrips(tx, p.current.ctx, p.today);
    const [rows, alerts, school, routes] = await Promise.all([
      liveView(tx, p.today, kind),
      alertsView(tx, today, p.tz, null),
      tx.school.findUniqueOrThrow({ where: { id: p.current.ctx.schoolId }, select: { name: true, phone: true } }),
      tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } }),
    ]);
    const drivers = await tx.driver.findMany({ where: { id: { in: rows.map((r) => r.t.driverId).filter((x): x is string => Boolean(x)) } }, select: { id: true, licenceExpiry: true } });
    const parents = msg ? await routeParents(tx, p.today) : null;
    let replay = null;
    if (replayId) {
      const t = await tx.trip.findFirst({ where: { id: replayId } });
      if (t) {
        const pts = await tx.gpsPoint.findMany({ where: { tripId: t.id }, orderBy: { at: "asc" }, take: 5000, select: { at: true, lat: true, lng: true, speedKmh: true } });
        const r = routes.find((x) => x.id === t.routeId) ?? (await tx.route.findFirst({ where: { id: t.routeId }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } }));
        replay = { t, route: r!, pts };
      }
    }
    const pastTrips = doing === "replay" ? await tx.trip.findMany({
      where: { status: "COMPLETED", ...(UUID.test(one(sp.rv)) ? { vehicleId: one(sp.rv) } : {}), ...( /^\d{4}-\d{2}-\d{2}$/.test(one(sp.rd)) ? { date: new Date(`${one(sp.rd)}T00:00:00Z`) } : { date: { gte: new Date(p.today.getTime() - 7 * 86_400_000) } }) },
      orderBy: [{ date: "desc" }, { plannedStartMin: "desc" }], take: 40,
    }) : [];
    const vehicles = doing === "replay" ? await tx.vehicle.findMany({ where: { archivedAt: null }, orderBy: [{ label: "asc" }, { number: "asc" }], select: { id: true, label: true, number: true } }) : [];
    return { rows, alerts, school, routes, drivers, parents, replay, pastTrips, vehicles };
  });
  if (replayId && !data.replay) notFound();

  const HREF = qs(BASE, { kind: one(sp.kind) ? kind : null, route: routeSel });
  const schoolPoint = s.schoolLat != null && s.schoolLng != null ? { lat: s.schoolLat, lng: s.schoolLng, name: data.school.name } : null;
  const cards = data.rows.filter((r) => !routeSel || r.route.id === routeSel).map((r) => {
    const live = liveStatus(r.t, p.now, { staleAfterSec: s.staleAfterSec, offlineAfterMin: s.offlineAfterMin });
    const done = new Set(r.events.map((e) => e.stopId));
    const ahead = r.ordered.filter((x) => !done.has(x.id));
    const at = r.t.status === "STARTED" && r.t.lastLat != null && r.t.lastLng != null && !live.stale ? { lat: r.t.lastLat, lng: r.t.lastLng } : null;
    const times = r.t.status === "STARTED" ? etas({ nowMin: p.minute, at, speedKmh: r.t.lastSpeedKmh, stops: ahead.map((x) => ({ id: x.id, plannedMin: r.plannedAt(x.id), lat: x.lat, lng: x.lng })) }) : new Map<string, number>();
    const eta = r.next ? times.get(r.next.id) ?? null : null;
    const late = r.next && eta != null ? eta - r.plannedAt(r.next.id) : 0;
    const startLate = r.t.status === "SCHEDULED" && p.minute - r.t.plannedStartMin > s.lateAfterMin ? p.minute - r.t.plannedStartMin : 0;
    const licenceOut = r.t.driverId ? data.drivers.find((d) => d.id === r.t.driverId)?.licenceExpiry : null;
    return { r, live, eta, late: Math.max(late, startLate), ahead, times, licenceExpired: Boolean(licenceOut && licenceOut < p.today) };
  });
  const allCards = cards;
  const running = data.rows.filter((r) => r.t.status === "STARTED");
  const staleN = data.rows.filter((r) => r.t.status === "STARTED" && liveStatus(r.t, p.now, { staleAfterSec: s.staleAfterSec, offlineAfterMin: s.offlineAfterMin }).stale).length;
  const openAlerts = data.alerts.filter((a) => a.status === "OPEN");
  const onBoard = running.reduce((n, r) => n + r.boarded, 0);
  const buses: MapBus[] = data.rows.filter((r) => r.t.status === "STARTED" && r.t.lastLat != null && r.t.lastLng != null).map((r) => {
    const live = liveStatus(r.t, p.now, { staleAfterSec: s.staleAfterSec, offlineAfterMin: s.offlineAfterMin });
    const tone = live.status === "Moving" ? "ok" : live.status === "Stopped" ? "warn" : live.status === "Offline" ? "neutral" : "info";
    return { id: r.t.id, routeId: r.route.id, label: String(r.route.number), lat: r.t.lastLat!, lng: r.t.lastLng!, tone, stale: live.stale, moving: live.status === "Moving", title: `Route ${r.route.number}: ${live.status}${r.t.lastPointAt ? `, last update ${clockAt(r.t.lastPointAt, p.tz)}` : ""}`, href: qs(BASE, { kind: one(sp.kind) ? kind : null, route: r.route.id }) };
  });
  const mapRoutes = data.routes.map((r) => {
    const row = data.rows.find((x) => x.route.id === r.id);
    const done = new Set(row?.events.filter((e) => e.status === "REACHED").map((e) => e.stopId) ?? []);
    return { id: r.id, number: r.number, name: r.name, stops: r.stops.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lng: x.lng, reached: done.has(x.id), next: row?.next?.id === x.id && row.t.status === "STARTED" })) };
  });
  const sel = routeSel ? cards[0] ?? null : null;
  const busName = (r: (typeof data.rows)[number]) => r.vehicle?.label ?? `Bus ${r.route.number}`;
  const msgRow = msg && UUID.test(one(sp.route)) ? data.rows.find((r) => r.route.id === one(sp.route)) ?? null : null;
  const alertOf = UUID.test(one(sp.alert)) ? data.alerts.find((a) => a.id === one(sp.alert)) ?? null : null;
  const msgText = !msg ? "" : msg === "delay" && msgRow ? delayText(busName(msgRow), msgRow.route.number, msgRow.route.name, Math.max(5, cards.find((c) => c.r.t.id === msgRow.t.id)?.late ?? 10), data.school.name)
    : msg === "emergency" && msgRow ? (alertOf?.kind === "BREAKDOWN" ? breakdownText(busName(msgRow), msgRow.route.number, data.school.name) : emergencyText(busName(msgRow), msgRow.route.number, data.school.name, data.school.phone)) : "";

  return (
    <div>
      <TrHead page="live" href={HREF} sub={<AutoRefresh seconds={s.locationIntervalSec} at={clockAt(p.now, p.tz)} />}
        actions={<ButtonLink href={addQ(HREF, { do: "replay" })} scroll={false} icon={History}>Route history</ButtonLink>} />
      <Stack>
        {openAlerts.length > 0 && (
          <Card className="overflow-hidden border-bad/30">
            <CardHeader title={`${plural(openAlerts.length, "alert")} open`} description="Emergency and breakdown alerts reach the Transport In-charge and the Principal at once" icon={Siren} />
            <ul className="divide-y divide-line/70 border-t border-line">
              {openAlerts.map((a) => {
                const k = ALERT_KINDS[a.kind];
                const row = data.rows.find((r) => r.t.id === a.tripId);
                const bad = a.kind === "EMERGENCY" || a.kind === "BREAKDOWN";
                return (
                  <li key={a.id} className={cx("px-4 md:px-5 py-3 flex flex-col md:flex-row md:items-center gap-2.5", bad && "bg-bad/5")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 flex-wrap"><Pill tone={k?.tone ?? "neutral"} dot>{k?.label ?? a.kind}</Pill><span className="text-[12.5px] text-ink3 tnum">{clockAt(a.at, p.tz)}</span></p>
                      <p className="text-[14px] mt-1">{a.text}</p>
                      {a.lat != null && a.lng != null && <a href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=17/${a.lat}/${a.lng}`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-brand font-semibold hover:underline">See the place on a map</a>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row?.driver && <a href={telHref(row.driver.phone)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line text-[13.5px] font-semibold hover:bg-sunken"><Phone size={15} aria-hidden="true" />Call {row.driver.name.split(" ")[0]}</a>}
                      {bad && a.routeId && can.emergencyMessage && !a.messageId && <ButtonLink size="sm" variant="danger" href={addQ(HREF, { msg: "emergency", route: a.routeId, alert: a.id, trip: a.tripId })} scroll={false} icon={Send}>Message parents</ButtonLink>}
                      {can.live && <ButtonLink size="sm" variant="ghost" href={addQ(HREF, { close: a.id })} scroll={false}>Close</ButtonLink>}
                      {can.remind && <ActButton action={remindAction} fields={{ text: `Please look at the alert: ${a.text}`, link: BASE }} label="Remind in-charge" icon="Bell" pendingText="Sending…" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Stats items={[
          { label: "Buses running", value: `${running.length} of ${data.rows.length}`, icon: Bus, sub: tripKind(kind) },
          { label: "Not updating", value: staleN, icon: Clock, tone: staleN ? "warn" : undefined, sub: staleN ? "stale or offline" : "All live" },
          { label: "Students on board", value: onBoard, icon: Users },
          { label: "Alerts today", value: data.alerts.length, icon: AlertTriangle, tone: openAlerts.length ? "bad" : undefined, sub: openAlerts.length ? `${openAlerts.length} open` : "None open" },
        ]} />

        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <SegLinks label="Trip" value={kind} options={[
            { value: "MORNING", label: <span className="inline-flex items-center gap-1.5"><Sun size={15} aria-hidden="true" />Morning pickup</span>, href: qs(BASE, { kind: "MORNING", route: routeSel }) },
            { value: "EVENING", label: <span className="inline-flex items-center gap-1.5"><Moon size={15} aria-hidden="true" />Evening drop</span>, href: qs(BASE, { kind: "EVENING", route: routeSel }) },
          ]} />
          {data.routes.length > 1 && <Chips value={routeSel ?? "all"} label="Route" options={[{ value: "all", label: "All routes", href: qs(BASE, { kind: one(sp.kind) ? kind : null }) }, ...data.routes.map((r) => ({ value: r.id, label: `Route ${r.number}`, href: qs(BASE, { kind: one(sp.kind) ? kind : null, route: r.id }) }))]} />}
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_400px] gap-5 lg:gap-6 items-start [&>*]:min-w-0">
          <Card className="overflow-hidden">
            <CardHeader title={sel ? `Route ${sel.r.route.number} · ${sel.r.route.name}` : "All buses"} description="A sketch from the stop locations. Faded buses have an old location." icon={MapPinned}
              action={sel ? <ButtonLink size="sm" variant="ghost" href={qs(BASE, { kind: one(sp.kind) ? kind : null })}>Show all</ButtonLink> : undefined} />
            <div className="px-3 pb-3"><div className="rounded-xl overflow-hidden border border-line/70">
              <TransportMap routes={mapRoutes} school={schoolPoint} selected={routeSel} buses={buses} labelStops={Boolean(routeSel)} ariaLabel="Sketch of the bus routes with the running buses" />
            </div></div>
            {sel && (
              <div className="px-5 pb-5 flex flex-col gap-3">
                <TripLine stops={sel.r.ordered.map((x) => { const e = sel.r.events.find((ev) => ev.stopId === x.id); return { id: x.id, name: x.name, reached: e?.status === "REACHED", missed: e?.status === "MISSED" }; })}
                  bus={sel.r.t.status === "STARTED" ? (sel.ahead.length ? "between" : "end") : "none"} end={kind === "MORNING" ? "School" : "Last stop"} ariaLabel={`Progress of Route ${sel.r.route.number}`} />
                <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13.5px]">
                  {sel.r.ordered.map((x, i) => {
                    const e = sel.r.events.find((ev) => ev.stopId === x.id);
                    const eta = sel.times.get(x.id);
                    return (
                      <li key={x.id} className="flex items-center gap-2 min-w-0">
                        <span className={cx("w-5 h-5 rounded-full text-[10.5px] font-bold grid place-items-center shrink-0", e?.status === "REACHED" ? "bg-brand text-brandink" : e?.status === "MISSED" ? "bg-warn/20 text-warn" : sel.r.next?.id === x.id ? "ring-2 ring-brand text-brand" : "bg-sunken text-ink3")}>{i + 1}</span>
                        <span className="truncate flex-1">{x.name}</span>
                        <span className="tnum text-ink3 shrink-0">{e?.status === "REACHED" ? clockAt(e.at, p.tz) : e?.status === "MISSED" ? "missed" : eta != null ? `~${clockOf(eta)}` : clockOf(sel.r.plannedAt(x.id))}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </Card>

          <section aria-label="Trip cards" className="flex flex-col gap-3">
            {allCards.length === 0 && <Card><Empty icon={Bus} title={`No ${tripKind(kind).toLowerCase()} trips today`} body="A holiday, a day off in the schedule, or no route with stops yet." /></Card>}
            {allCards.map(({ r, live, eta, late, licenceExpired }) => (
              <Card key={r.t.id} className={cx("p-4 flex flex-col gap-2.5", routeSel === r.route.id && "ring-2 ring-brand/40")}>
                <Link href={qs(BASE, { kind: one(sp.kind) ? kind : null, route: routeSel === r.route.id ? null : r.route.id })} scroll={false} className="flex items-start gap-3 group">
                  <RouteBadge n={r.route.number} tone={live.status === "Moving" ? "ok" : live.status === "Stopped" ? "warn" : r.t.status === "STARTED" ? "neutral" : "neutral"} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[15px] truncate group-hover:underline">{r.route.name}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">{tripKind(r.t.kind)} · {r.vehicle ? showPlate(r.vehicle.number) : "no vehicle"}</span>
                  </span>
                  <Pill tone={LIVE_TONE[live.status]} dot>{live.status}</Pill>
                </Link>
                <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
                  <div><dt className="text-ink3">Started</dt><dd className="font-semibold tnum">{r.t.startedAt ? clockAt(r.t.startedAt, p.tz) : r.t.status === "CANCELLED" ? "Cancelled" : "Not started"}</dd></div>
                  <div><dt className="text-ink3">Speed</dt><dd className="font-semibold tnum">{r.t.status === "STARTED" && r.t.lastSpeedKmh != null && !live.stale ? `${Math.round(r.t.lastSpeedKmh)} km/h` : "—"}</dd></div>
                  <div><dt className="text-ink3">{r.t.status === "COMPLETED" ? "Ended" : "Next stop"}</dt><dd className="font-semibold truncate">{r.t.status === "COMPLETED" ? (r.t.endedAt ? clockAt(r.t.endedAt, p.tz) : "—") : r.next ? r.next.name : "—"}</dd></div>
                </dl>
                {r.t.status === "STARTED" && r.next && <p className="text-[13px]"><span className="text-ink3">Arrives about </span><b className="tnum">{eta != null ? clockOf(eta) : "—"}</b>{late > 2 ? <span className="text-warn font-semibold"> · {late} min late</span> : <span className="text-ok font-semibold"> · on time</span>}</p>}
                {r.t.status === "SCHEDULED" && late > 0 && <p className="text-[13px] text-warn font-semibold">Should have started at {clockOf(r.t.plannedStartMin)} ({late} min ago)</p>}
                {r.t.status === "STARTED" && <p className={cx("text-[12.5px]", live.stale ? "text-ink3 font-semibold" : "text-ink3")}>{r.t.lastPointAt ? `${live.stale ? "Last seen" : "Last update"} ${clockAt(r.t.lastPointAt, p.tz)}` : "No location yet. Is the driver app open?"}</p>}
                {licenceExpired && <p className="text-[12.5px] text-bad font-semibold">Licence of {r.driver?.name} has expired</p>}
                <div className="flex flex-wrap gap-2">
                  {r.driver && <a href={telHref(r.driver.phone)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-line text-[13px] font-semibold hover:bg-sunken"><Phone size={14} aria-hidden="true" />Call {r.driver.name.split(" ")[0]}</a>}
                  {can.live && late >= s.lateAfterMin && s.delaySuggestion && r.t.status !== "COMPLETED" && <ButtonLink size="sm" href={addQ(HREF, { msg: "delay", route: r.route.id, trip: r.t.id })} scroll={false} icon={Send}>Delay message</ButtonLink>}
                  {r.t.status !== "SCHEDULED" && <ButtonLink size="sm" variant="ghost" href={addQ(HREF, { replay: r.t.id })} scroll={false}>Path</ButtonLink>}
                </div>
              </Card>
            ))}
            {can.live && data.routes.length > 0 && <ButtonLink href={addQ(HREF, { msg: "message", route: routeSel ?? data.routes[0].id })} scroll={false} icon={Send} className="self-start">Message a route&rsquo;s parents</ButtonLink>}
          </section>
        </div>
      </Stack>

      {msg && data.parents && (msg !== "emergency" || can.emergencyMessage) && (msg === "emergency" || can.live) && (
        <RouteMessageSheet closeHref={HREF} routes={data.parents.map((x) => ({ id: x.id, label: x.label, parents: x.parents }))}
          start={{ routeId: UUID.test(one(sp.route)) ? one(sp.route) : data.parents[0]?.id ?? "", kind: msg, text: msgText, alertId: alertOf?.id ?? null, tripId: UUID.test(one(sp.trip)) ? one(sp.trip) : null }} />
      )}
      {closeId && can.live && (() => { const a = data.alerts.find((x) => x.id === closeId && x.status === "OPEN"); return a ? <CloseAlertSheet closeHref={HREF} alert={{ id: a.id, text: a.text }} /> : null; })()}
      {data.replay && (() => {
        const { t, route, pts } = data.replay;
        const mr = { id: route.id, number: route.number, name: route.name, stops: route.stops.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lng: x.lng })) };
        return (
          <UrlSheet title={`Route ${route.number} · ${tripKind(t.kind)}`} sub={`${formatDate(t.date)}${t.startedAt ? ` · ${clockAt(t.startedAt, p.tz)} to ${t.endedAt ? clockAt(t.endedAt, p.tz) : "running"}` : ""}`} closeHref={HREF} wide>
            <Playback route={mr} school={schoolPoint} points={pts.map((x) => ({ at: x.at.toISOString(), time: clockAt(x.at, p.tz), lat: x.lat, lng: x.lng, speed: x.speedKmh }))} />
          </UrlSheet>
        );
      })()}
      {doing === "replay" && (
        <UrlSheet title="Route history" sub="Pick a vehicle and a date, then play its path with times" closeHref={HREF} wide>
          <form method="get" action={BASE} className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end mb-4">
            <input type="hidden" name="do" value="replay" />
            {one(sp.kind) && <input type="hidden" name="kind" value={kind} />}
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink2">Vehicle
              <select name="rv" defaultValue={one(sp.rv)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px] font-normal text-ink">
                <option value="">Any vehicle</option>
                {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label ?? "Vehicle"} · {showPlate(v.number)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink2">Date
              <input type="date" name="rd" defaultValue={one(sp.rd)} max={p.todayStr} className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px] font-normal text-ink" />
            </label>
            <button type="submit" className="h-11 px-4 rounded-xl bg-brand text-brandink font-semibold">Show trips</button>
          </form>
          {data.pastTrips.length === 0 ? <p className="text-[14px] text-ink3">No completed trip {one(sp.rd) ? "on that date" : "in the last 7 days"}.</p> : (
            <ul className="flex flex-col divide-y divide-line/70">
              {data.pastTrips.map((t) => {
                const r = data.routes.find((x) => x.id === t.routeId);
                const v = data.vehicles.find((x) => x.id === t.vehicleId);
                return (
                  <li key={t.id}>
                    <Link href={qs(BASE, { kind: one(sp.kind) ? kind : null, replay: t.id })} scroll={false} className="flex items-center gap-3 py-2.5 hover:bg-sunken/50 rounded-lg px-2">
                      <RouteBadge n={r?.number ?? "?"} size={30} />
                      <span className="flex-1 min-w-0"><b className="font-semibold">{formatDate(t.date)} · {tripKind(t.kind)}</b><span className="block text-[12.5px] text-ink3 truncate">{r?.name}{v ? ` · ${v.label ?? showPlate(v.number)}` : ""}{t.startedAt ? ` · ${clockAt(t.startedAt, p.tz)}${t.endedAt ? ` to ${clockAt(t.endedAt, p.tz)}` : ""}` : ""}</span></span>
                      <span className="text-brand font-semibold text-[13px]">Play</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </UrlSheet>
      )}
    </div>
  );
}
