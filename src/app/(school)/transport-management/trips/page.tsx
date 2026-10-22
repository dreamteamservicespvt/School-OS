import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CalendarDays, History, Moon, Pencil, Repeat, Smartphone, Sun, XCircle } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { driverOf, ensureTrips, plannedTrips, tripSheet } from "@/lib/transport/trips";
import { tripLate, tripsView, type TripRow } from "@/lib/transport/views";
import { TRIP_STATUS, clockOf, daysWords, hhmmOf, plural, showPlate, tripKind } from "@/lib/transport/words";
import { clockAt } from "@/lib/front-office/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { Banner, DataList, Empty, Stack, Stats } from "@/components/money/kit";
import { TrHead } from "../_components/head";
import { RouteBadge } from "../_components/bits";
import { ActButton } from "../_components/fields";
import { TripPanel } from "../_components/trip-panel";
import { CancelTripSheet, DaySheet, ScheduleSheet } from "../_components/trip-sheets";
import { startTripAction } from "../actions";
import { BASE, UUID, addQ, one, qs, trGuard, trPeriod, type SearchParams } from "../_lib/page";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Trips") };
}

const HREF = `${BASE}/trips`;

/** Trips (12 §2): today's trips, the trip schedule and trip history. A driver sees only their own trips today. */
export default async function TripsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("trips");
  const sp = await searchParams;
  const own = p.v.level === "own";
  const view = own ? "today" : one(sp.view) === "schedule" ? "schedule" : one(sp.view) === "history" ? "history" : "today";
  const period = trPeriod(sp, p.dates, "last7");
  const kindF = one(sp.kind) === "MORNING" || one(sp.kind) === "EVENING" ? one(sp.kind) : null;
  const statusF = Object.keys(TRIP_STATUS).includes(one(sp.status)) ? one(sp.status) : null;
  const routeF = UUID.test(one(sp.route)) ? one(sp.route) : null;
  const openTrip = UUID.test(one(sp.trip)) ? one(sp.trip) : null;
  const cancelId = UUID.test(one(sp.cancel)) ? one(sp.cancel) : null;
  const doing = one(sp.do);
  const can = p.can;

  const data = await withSchool(p.current.ctx, async (tx) => {
    const me = own ? await driverOf(tx, p.current.ctx.userId) : null;
    if (view === "today") await ensureTrips(tx, p.current.ctx, p.today);
    const mine = own ? (me ? { OR: [{ driverId: me.id }, { attendantId: me.id }] } : { id: "00000000-0000-0000-0000-000000000000" }) : {};
    const today = view === "today" ? await tripsView(tx, { date: p.today, ...mine }) : [];
    const history = view === "history" && period.range ? await tripsView(tx, { date: dateWhere(period.range), ...(kindF ? { kind: kindF } : {}), ...(statusF ? { status: statusF } : {}), ...(routeF ? { routeId: routeF } : {}) }) : [];
    const routes = await tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } } });
    const schedules = view === "schedule" || doing === "schedule" ? await tx.tripSchedule.findMany({ where: { archivedAt: null } }) : [];
    const plan = view === "schedule" || doing === "schedule" ? plannedTrips(routes, schedules) : [];
    const needCrew = view === "schedule" || doing === "schedule" || doing === "day";
    const [vehicles, crew] = needCrew ? await Promise.all([
      tx.vehicle.findMany({ where: { archivedAt: null, status: "ACTIVE" }, orderBy: [{ label: "asc" }, { number: "asc" }], select: { id: true, label: true, number: true, capacity: true } }),
      tx.driver.findMany({ where: { archivedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, licenceExpiry: true } }),
    ]) : [[], []];
    let sheet = null;
    if (openTrip) {
      const t = await tx.trip.findFirst({ where: { id: openTrip, ...mine } });
      if (t) {
        const s = await tripSheet(tx, t);
        const drv = t.driverId ? await tx.driver.findFirst({ where: { id: t.driverId }, select: { name: true } }) : null;
        sheet = { s, driver: drv?.name ?? null };
      }
    }
    return { me, today, history, routes, plan, vehicles, crew, sheet };
  });
  if (openTrip && !data.sheet) notFound();

  const here = (extra: Record<string, string | null>) => qs(HREF, { view: view === "today" ? null : view, ...(view === "history" ? { ...period.keep, kind: kindF, status: statusF, route: routeF } : {}), ...extra });
  const close = here({});
  const routeOpts = data.routes.map((r) => ({ value: r.id, label: `Route ${r.number} · ${r.name}` }));
  const vehicleOpts = data.vehicles.map((v) => ({ value: v.id, label: `${v.label ?? "Vehicle"} · ${showPlate(v.number)} · ${v.capacity} seats` }));
  const driverOpts = data.crew.filter((d) => d.role === "DRIVER" && (!d.licenceExpiry || d.licenceExpiry >= p.today)).map((d) => ({ value: d.id, label: d.name }));
  const attendantOpts = data.crew.filter((d) => d.role === "ATTENDANT").map((d) => ({ value: d.id, label: d.name }));
  const vName = (r: TripRow) => (r.vehicle ? r.vehicle.label ?? showPlate(r.vehicle.number) : "No vehicle");

  const tripCard = (r: TripRow) => {
    const late = tripLate(r, p.tz);
    const st = TRIP_STATUS[r.t.status];
    return (
      <li key={r.t.id} className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <RouteBadge n={r.route.number} tone={r.t.status === "STARTED" ? "brand" : r.t.status === "CANCELLED" ? "neutral" : r.t.status === "COMPLETED" ? "ok" : "neutral"} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[15px] truncate">{r.route.name}</p>
            <p className="text-[12.5px] text-ink3 truncate">{vName(r)} · {r.driver?.name ?? "no driver"}{r.t.changedForDay ? " · changed today" : ""}</p>
          </div>
          <Pill tone={st?.tone ?? "neutral"} dot>{st?.label}</Pill>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[12.5px]">
          <div><p className="text-ink3">Start</p><p className="font-semibold tnum">{r.t.startedAt ? clockAt(r.t.startedAt, p.tz) : clockOf(r.t.plannedStartMin)}</p></div>
          <div><p className="text-ink3">Stops</p><p className="font-semibold tnum">{r.reached} of {r.stops}{r.missed ? <span className="text-warn"> · {r.missed} missed</span> : null}</p></div>
          <div><p className="text-ink3">{r.t.kind === "MORNING" ? "Boarded" : "Dropped"}</p><p className="font-semibold tnum">{r.t.kind === "MORNING" ? r.boarded : r.dropped}{r.notBoarded ? <span className="text-bad"> · {r.notBoarded} not</span> : null}</p></div>
        </div>
        {late > 5 && r.t.status !== "SCHEDULED" && <p className="text-[12.5px] text-warn font-semibold">Up to {late} min late at a stop</p>}
        <div className="flex flex-wrap gap-2">
          <ButtonLink size="sm" href={addQ(close, { trip: r.t.id })} scroll={false}>{r.t.status === "STARTED" && can.trips ? "Run trip" : "Open"}</ButtonLink>
          {can.trips && r.t.status === "SCHEDULED" && <ActButton action={startTripAction} fields={{ tripId: r.t.id }} label="Start" pendingText="Starting…" />}
          {can.trips && r.t.status === "SCHEDULED" && <ButtonLink size="sm" variant="ghost" href={addQ(close, { cancel: r.t.id })} scroll={false}>Cancel</ButtonLink>}
        </div>
      </li>
    );
  };

  const morning = data.today.filter((r) => r.t.kind === "MORNING");
  const evening = data.today.filter((r) => r.t.kind === "EVENING");
  const running = data.today.filter((r) => r.t.status === "STARTED").length;

  return (
    <div>
      <TrHead page="trips" sub={own ? (data.me ? `Your trips today, ${data.me.name}` : "Your trips") : `Today, ${formatDate(p.today)}: ${plural(data.today.length, "trip")}${running ? ` · ${running} running` : ""}`}
        actions={can.trips ? <ButtonLink href={addQ(close, { do: "day" })} scroll={false} icon={Repeat}>Change for one day</ButtonLink> : undefined} />
      <Stack>
        {own && (
          <Banner tone="brand" icon={Smartphone} title="Run your trips from the driver app" action={<ButtonLink href="/driver" variant="primary" size="sm">Open the driver page</ButtonLink>}>
            Start trip, mark stops and students, and the Emergency button are in the driver app. The Android app sends the bus location with the screen off.
          </Banner>
        )}
        {own && !data.me && <Banner tone="warn" title="Your login is not linked to a driver yet">Ask the Transport In-charge to link it in Vehicles &amp; Drivers.</Banner>}
        {!own && (
          <SegLinks label="Show" value={view} options={[
            { value: "today", label: "Today", href: qs(HREF, {}) },
            { value: "schedule", label: "Schedule", href: qs(HREF, { view: "schedule" }) },
            { value: "history", label: "History", href: qs(HREF, { view: "history" }) },
          ]} />
        )}

        {view === "today" && (
          data.today.length === 0
            ? <Card><Empty icon={CalendarDays} title="No trips today" body={own ? "You have no trip today." : "No route runs today: a holiday, a day off in the schedule, or no route with stops yet."} action={can.trips ? <ButtonLink href={qs(HREF, { view: "schedule" })} variant="secondary">See the schedule</ButtonLink> : undefined} /></Card>
            : (
              <>
                {!own && <Stats items={[
                  { label: "Trips today", value: data.today.length, icon: CalendarDays },
                  { label: "Running", value: running, icon: Sun, tone: running ? "brand" : undefined },
                  { label: "Completed", value: data.today.filter((r) => r.t.status === "COMPLETED").length, icon: CalendarClock, tone: "ok" },
                  { label: "Cancelled", value: data.today.filter((r) => r.t.status === "CANCELLED").length, icon: XCircle },
                ]} />}
                {[["Morning pickup", morning, Sun], ["Evening drop", evening, Moon]].map(([label, list, Icon]) => (list as TripRow[]).length > 0 && (
                  <section key={label as string}>
                    <h2 className="flex items-center gap-2 font-display font-semibold text-[17px] mb-2.5">{(() => { const I = Icon as typeof Sun; return <I size={18} className="text-ink3" aria-hidden="true" />; })()}{label as string}</h2>
                    <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{(list as TripRow[]).map(tripCard)}</ul>
                  </section>
                ))}
              </>
            )
        )}

        {view === "schedule" && (
          <Card className="overflow-hidden">
            <CardHeader title="Trip schedule" description="Morning and evening trips of each route, by day. Trips are made each day from this; none on school holidays." icon={CalendarClock}
              action={can.trips ? <ButtonLink size="sm" href={addQ(close, { do: "schedule" })} scroll={false} icon={Pencil}>Set a trip</ButtonLink> : undefined} />
            <DataList rows={data.plan} rowKey={(r) => `${r.routeId}-${r.kind}`} minWidth={860} caption="Trip schedule"
              columns={[
                { key: "r", label: "Route", render: (r) => { const route = data.routes.find((x) => x.id === r.routeId)!; return <span className="flex items-center gap-2"><RouteBadge n={route.number} size={28} />{route.name}</span>; } },
                { key: "k", label: "Trip", render: (r) => tripKind(r.kind) },
                { key: "s", label: "Start", nowrap: true, render: (r) => <span className="tnum">{clockOf(r.startMin)}{!r.saved && <span className="block text-[12px] text-ink3">default</span>}</span> },
                { key: "d", label: "Days", render: (r) => daysWords(r.days) },
                { key: "v", label: "Vehicle", render: (r) => { const v = data.vehicles.find((x) => x.id === r.vehicleId); return v ? v.label ?? showPlate(v.number) : <span className="text-ink3">None</span>; } },
                { key: "dr", label: "Driver", render: (r) => data.crew.find((x) => x.id === r.driverId)?.name ?? <span className="text-ink3">None</span> },
                { key: "a", label: "", render: (r) => (can.trips ? <span className="flex gap-1"><ButtonLink size="sm" variant="ghost" href={addQ(close, { do: "schedule", route: r.routeId, kind: r.kind })} scroll={false}>Edit</ButtonLink><ButtonLink size="sm" variant="ghost" href={addQ(close, { do: "day", route: r.routeId, kind: r.kind })} scroll={false}>One day</ButtonLink></span> : null) },
              ]}
              phone={(r) => { const route = data.routes.find((x) => x.id === r.routeId)!; return { title: `Route ${route.number} · ${tripKind(r.kind)}`, icon: r.kind === "MORNING" ? Sun : Moon, sub: `${clockOf(r.startMin)} · ${daysWords(r.days)} · ${data.crew.find((x) => x.id === r.driverId)?.name ?? "no driver"}`, right: can.trips ? <Link href={addQ(close, { do: "schedule", route: r.routeId, kind: r.kind })} scroll={false} className="text-brand text-[13px] font-semibold relative z-[1]">Edit</Link> : undefined }; }}
              empty={<Empty icon={CalendarClock} title="No routes yet" body="Add routes and stops first. Each route gets a morning and an evening trip." />} />
          </Card>
        )}

        {view === "history" && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
              <PeriodFilter {...p.dates} fallback="last7" size="sm" />
              {can.export && <ExportButton href={qs(`${BASE}/export`, { list: "trips", ...period.keep, kind: kindF, status: statusF, route: routeF })} />}
            </div>
            <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
              <Chips value={kindF ?? "all"} label="Trip" options={[{ value: "all", label: "Both", href: here({ kind: null }) }, { value: "MORNING", label: "Morning pickup", href: here({ kind: "MORNING" }) }, { value: "EVENING", label: "Evening drop", href: here({ kind: "EVENING" }) }]} />
              <Chips value={statusF ?? "all"} label="Status" options={[{ value: "all", label: "Any status", href: here({ status: null }) }, ...Object.entries(TRIP_STATUS).map(([k, v]) => ({ value: k, label: v.label, href: here({ status: k }) }))]} />
              {data.routes.length > 1 && <Chips value={routeF ?? "all"} label="Route" options={[{ value: "all", label: "All routes", href: here({ route: null }) }, ...data.routes.map((r) => ({ value: r.id, label: `Route ${r.number}`, href: here({ route: r.id }) }))]} />}
            </div>
            <DataList rows={data.history} rowKey={(r) => r.t.id} minWidth={980} caption="Trip history" rowHref={(r) => here({ trip: r.t.id })}
              footer={`${plural(data.history.length, "trip")} · ${period.label}`}
              columns={[
                { key: "d", label: "Date", nowrap: true, render: (r) => formatDate(r.t.date) },
                { key: "r", label: "Route", render: (r) => <span className="flex items-center gap-2"><RouteBadge n={r.route.number} size={28} />{tripKind(r.t.kind)}</span> },
                { key: "v", label: "Vehicle and driver", render: (r) => <span>{vName(r)}<span className="block text-[12.5px] text-ink3">{r.driver?.name ?? "—"}</span></span> },
                { key: "st", label: "Status", render: (r) => <Pill tone={TRIP_STATUS[r.t.status]?.tone ?? "neutral"}>{TRIP_STATUS[r.t.status]?.label}</Pill> },
                { key: "se", label: "Start and end", nowrap: true, render: (r) => <span className="tnum">{r.t.startedAt ? clockAt(r.t.startedAt, p.tz) : "—"} to {r.t.endedAt ? clockAt(r.t.endedAt, p.tz) : "—"}</span> },
                { key: "sr", label: "Stops reached", render: (r) => <span className="tnum">{r.reached} of {r.stops}{r.missed ? <span className="text-warn"> · {r.missed} missed</span> : null}</span> },
                { key: "b", label: "Students", render: (r) => <span className="tnum">{r.boarded} boarded{r.notBoarded ? ` · ${r.notBoarded} not` : ""}</span> },
                { key: "l", label: "Late", align: "right", render: (r) => { const l = tripLate(r, p.tz); return l > 5 ? <span className="text-warn font-semibold">{l} min</span> : <span className="text-ink3">On time</span>; } },
              ]}
              phone={(r) => ({ title: `Route ${r.route.number} · ${tripKind(r.t.kind)}`, icon: r.t.kind === "MORNING" ? Sun : Moon, sub: `${formatDate(r.t.date)} · ${r.reached} of ${r.stops} stops · ${r.driver?.name ?? "no driver"}`, pills: <Pill tone={TRIP_STATUS[r.t.status]?.tone ?? "neutral"} className="!h-[22px] !text-[11.5px]">{TRIP_STATUS[r.t.status]?.label}</Pill> })}
              empty={<Empty icon={History} title="No trips" body={`No trip ${period.label.toLowerCase()} matches.`} />} />
          </Card>
        )}
      </Stack>

      {data.sheet && (
        <UrlSheet title={`Route ${data.sheet.s.route.number} · ${data.sheet.s.route.name}`} sub={`${tripKind(data.sheet.s.trip.kind)} · ${formatDate(data.sheet.s.trip.date)}`} closeHref={close} wide>
          <TripPanel sheet={data.sheet.s} tz={p.tz} canRun={can.trips && data.sheet.s.trip.date.getTime() === p.today.getTime()} driver={data.sheet.driver} />
        </UrlSheet>
      )}
      {can.trips && cancelId && (() => {
        const r = data.today.find((x) => x.t.id === cancelId && x.t.status === "SCHEDULED");
        return r ? <CancelTripSheet closeHref={close} trip={{ id: r.t.id, label: `Route ${r.route.number} · ${tripKind(r.t.kind)} · ${formatDate(r.t.date)}` }} /> : null;
      })()}
      {can.trips && doing === "schedule" && (() => {
        const rid = UUID.test(one(sp.route)) ? one(sp.route) : "";
        const kind = one(sp.kind) === "EVENING" ? "EVENING" : "MORNING";
        const pl = data.plan.find((x) => x.routeId === rid && x.kind === kind);
        const route = data.routes.find((r) => r.id === rid);
        return <ScheduleSheet closeHref={close} routes={routeOpts} vehicles={vehicleOpts} drivers={driverOpts} attendants={attendantOpts}
          start={{ routeId: rid, kind, start: hhmmOf(pl?.startMin ?? null), days: pl?.days ?? [1, 2, 3, 4, 5, 6], vehicleId: pl?.saved && pl.vehicleId !== route?.vehicleId ? pl.vehicleId ?? "" : "", driverId: pl?.saved && pl.driverId !== route?.driverId ? pl.driverId ?? "" : "", attendantId: pl?.saved && pl.attendantId !== route?.attendantId ? pl.attendantId ?? "" : "" }} />;
      })()}
      {can.trips && doing === "day" && <DaySheet closeHref={close} routes={routeOpts} vehicles={vehicleOpts} drivers={driverOpts} today={p.todayStr} start={{ routeId: UUID.test(one(sp.route)) ? one(sp.route) : "", kind: one(sp.kind), date: "" }} />}
    </div>
  );
}
