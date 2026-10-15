import { Archive, Bus, MapPinned, Plus, Route as RouteIcon, SearchX, Undo2 } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { routesView } from "@/lib/transport/views";
import { clockOf, rupeesShort, showPlate, plural } from "@/lib/transport/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { Chips } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { UrlSearch } from "@/components/money/url-filters";
import { DataList, Empty, Progress, Stack, Toolbar } from "@/components/money/kit";
import { TrHead } from "../_components/head";
import { RouteBadge } from "../_components/bits";
import { TransportMap } from "../_components/map";
import { ActButton } from "../_components/fields";
import { RouteSheet } from "../_components/route-sheets";
import { restoreRouteAction } from "../actions";
import { BASE, addQ, one, qs, trGuard, type SearchParams } from "../_lib/page";
import { crewOptions } from "../_lib/options";

export const metadata = { title: "Routes & Stops" };

const HREF = `${BASE}/routes`;

/** Routes & Stops (12 §2): every route with its vehicle, driver, stops, students and seats used, and the fee a month. */
export default async function RoutesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("routes");
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 60);
  const show = one(sp.show) === "full" ? "full" : "all";
  const data = await withSchool(p.current.ctx, async (tx) => {
    const view = await routesView(tx, p.today, q);
    const school = await tx.school.findUniqueOrThrow({ where: { id: p.current.ctx.schoolId }, select: { name: true } });
    const options = p.can.routes && one(sp.do) === "route" ? await crewOptions(tx, null) : null;
    return { ...view, school, options };
  });
  const nearlyFull = (r: (typeof data.rows)[number]) => r.capacity != null && r.capacity - r.used <= 3;
  const rows = show === "full" ? data.rows.filter(nearlyFull) : data.rows;
  const stops = data.all.reduce((s, r) => s + r.stops.length, 0);
  const students = data.all.reduce((s, r) => s + r.used, 0);
  const here = (extra: Record<string, string | null>) => qs(HREF, { q: q || null, show: show === "all" ? null : show, ...extra });
  const sheetHref = here({});
  const school = p.settings.schoolLat != null && p.settings.schoolLng != null ? { lat: p.settings.schoolLat, lng: p.settings.schoolLng, name: data.school.name } : null;
  const fee = (r: (typeof rows)[number]) => (r.feeMin == null ? "Not set" : r.feeMin === r.feeMax ? rupeesShort(r.feeMin) : `${rupeesShort(r.feeMin)}–${rupeesShort(r.feeMax)}`);

  return (
    <div>
      <TrHead page="routes" sub={data.all.length ? `${plural(data.all.length, "route")} · ${plural(stops, "stop")} · ${plural(students, "student")} · fee set per stop or per route` : "Routes with stops in order, pickup times and the transport fee"}
        actions={p.can.routes ? <ButtonLink href={addQ(sheetHref, { do: "route" })} scroll={false} variant="primary" icon={Plus}>Add route</ButtonLink> : undefined} />
      <Stack>
        <Card className="overflow-hidden">
          <Toolbar>
            <UrlSearch id="routes-q" placeholder="Route, stop, driver or bus number" />
            {p.can.export && <ExportButton href={qs(`${BASE}/export`, { list: "routes", q: q || null })} />}
          </Toolbar>
          <div className="px-3 pt-3 pb-1">
            <Chips value={show} label="Show routes" options={[
              { value: "all", label: "All routes", count: data.rows.length, href: here({ show: null }) },
              { value: "full", label: "Nearly full", count: data.rows.filter(nearlyFull).length, href: here({ show: "full" }) },
            ]} />
          </div>
          <DataList rows={rows} rowKey={(r) => r.route.id} minWidth={900} caption="Routes" rowHref={(r) => `${HREF}/${r.route.id}`}
            footer={`Showing ${rows.length} of ${plural(data.all.length, "route")}`}
            columns={[
              { key: "route", label: "Route", render: (r) => <div className="flex items-center gap-3"><RouteBadge n={r.route.number} tone={nearlyFull(r) ? "warn" : "brand"} /><div className="min-w-0"><p className="font-semibold leading-tight">{r.route.name}</p><p className="text-[12.5px] text-ink3 tnum">{r.firstPickup != null ? `Morning ${clockOf(r.firstPickup - 10)}` : "No stops yet"}{r.route.eveningDepartMin != null ? ` · Evening ${clockOf(r.route.eveningDepartMin)}` : ""}</p></div></div> },
              { key: "veh", label: "Vehicle", render: (r) => (r.vehicle ? <><p className="whitespace-nowrap">{r.vehicle.label ?? showPlate(r.vehicle.number)}</p><p className="text-[12px] text-ink3 font-mono whitespace-nowrap">{showPlate(r.vehicle.number)}</p></> : <span className="text-ink3">Not yet</span>) },
              { key: "drv", label: "Driver", render: (r) => <><p>{r.driver?.name ?? <span className="text-ink3">Not yet</span>}</p>{r.attendant && <p className="text-[12.5px] text-ink3">Attendant {r.attendant.name}</p>}</> },
              { key: "stops", label: "Stops", align: "right", render: (r) => r.stops.length },
              { key: "students", label: "Students", align: "right", render: (r) => r.used },
              { key: "seats", label: "Seats used", render: (r) => (r.capacity == null ? <span className="text-ink3 text-[13px]">No vehicle</span> : <div className="w-32"><div className="flex justify-between text-[12.5px] mb-1 tnum"><span className={cx("font-semibold", nearlyFull(r) && "text-warn")}>{r.used} of {r.capacity}</span><span className="text-ink3">{Math.max(0, r.capacity - r.used)} free</span></div><Progress value={Math.min(100, (r.used / r.capacity) * 100)} tone={nearlyFull(r) ? "warn" : "brand"} /></div>) },
              { key: "fee", label: "Fee a month", nowrap: true, render: (r) => <span className="tnum">{fee(r)}</span> },
            ]}
            phone={(r) => ({
              title: `Route ${r.route.number} · ${r.route.name}`, icon: Bus, iconTone: nearlyFull(r) ? "warn" : "brand",
              sub: [r.vehicle ? r.vehicle.label ?? showPlate(r.vehicle.number) : "No vehicle", r.driver?.name ?? "No driver", plural(r.stops.length, "stop")].join(" · "),
              pills: <>{r.capacity != null && <Pill tone={nearlyFull(r) ? "warn" : "neutral"} className="!h-[22px] !text-[11.5px]">{r.used} of {r.capacity} seats</Pill>}<Pill className="!h-[22px] !text-[11.5px]">{fee(r)}</Pill></>,
            })}
            empty={q || show !== "all"
              ? <Empty icon={SearchX} title="No route matches" body={q ? `Nothing matches “${q}”. Try a stop name.` : "No route is nearly full."} action={<ButtonLink href={HREF} variant="secondary">Clear filters</ButtonLink>} />
              : <Empty icon={RouteIcon} title="No routes yet" body="Add a route, then its stops in order with pickup times and the fee a month." action={p.can.routes ? <ButtonLink href={addQ(sheetHref, { do: "route" })} scroll={false} variant="secondary" icon={Plus}>Add route</ButtonLink> : undefined} />} />
        </Card>

        <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 [&>*]:min-w-0 items-start">
          <Card className="overflow-hidden">
            <CardHeader title="All routes" description="A sketch from the stops' locations. Numbers mark where each route starts." icon={MapPinned} />
            <div className="px-3 pb-3"><div className="rounded-xl overflow-hidden border border-line/70">
              <TransportMap routes={data.all.map((r) => ({ id: r.route.id, number: r.route.number, name: r.route.name, stops: r.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) }))} school={school} ariaLabel="Sketch of all bus routes" />
            </div></div>
          </Card>
          <Card>
            <CardHeader title="Archived routes" description="Kept with their history. They drop out of lists and fees." icon={Archive} />
            {data.archived.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No archived routes.</p> : (
              <ul className="px-2 pb-2">
                {data.archived.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                    <span className="w-10 h-10 rounded-xl bg-sunken text-ink3 grid place-items-center shrink-0"><RouteIcon size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">Route {r.number} · {r.name}</p><p className="text-[12.5px] text-ink3 truncate">Archived {formatDate(r.archivedAt!, p.tz)}</p></div>
                    {p.can.routes && <ActButton action={restoreRouteAction} fields={{ routeId: r.id }} label="Restore" icon={Undo2} variant="ghost" pendingText="Restoring…" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Stack>
      {one(sp.do) === "route" && p.can.routes && data.options && <RouteSheet closeHref={sheetHref} start={null} {...data.options} />}
    </div>
  );
}
