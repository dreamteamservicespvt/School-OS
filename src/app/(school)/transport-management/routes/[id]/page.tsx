import { notFound } from "next/navigation";
import Link from "next/link";
import { Archive, ArrowDown, ArrowLeft, ArrowUpDown, ArrowUp, IndianRupee, ListOrdered, MapPin, MapPinned, Pencil, Plus, School, Send, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatRupees } from "@/lib/format";
import { routeDetail, routeParents } from "@/lib/transport/views";
import { eveningTimes } from "@/lib/transport/routes";
import { DEFAULT_EVENING } from "@/lib/transport/trips";
import { assignType, clockOf, hhmmOf, plural, rupeesInput, rupeesShort, showPlate } from "@/lib/transport/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { DL, Split, Stack, Col } from "@/components/money/kit";
import { TrHead } from "../../_components/head";
import { RouteBadge } from "../../_components/bits";
import { TransportMap } from "../../_components/map";
import { ActButton, ConfirmAct } from "../../_components/fields";
import { RouteMessageSheet, RouteSheet, StopSheet } from "../../_components/route-sheets";
import { archiveRouteAction, archiveStopAction, copyEveningAction, moveStopAction } from "../../actions";
import { BASE, UUID, addQ, one, trGuard, type SearchParams } from "../../_lib/page";
import { crewOptions } from "../../_lib/options";

export const metadata = { title: "Route" };

/** One route (12 §2 Routes & Stops): stops in order with times, location, fee and the students at each stop. */
export default async function RoutePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const p = await trGuard("routes");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const HREF = `${BASE}/routes/${id}`;
  const doing = one(sp.do);
  const editStopId = UUID.test(one(sp.stop)) ? one(sp.stop) : null;
  const data = await withSchool(p.current.ctx, async (tx) => {
    const d = await routeDetail(tx, id, p.today);
    if (!d) return null;
    const school = await tx.school.findUniqueOrThrow({ where: { id: p.current.ctx.schoolId }, select: { name: true } });
    const options = p.can.routes && doing === "edit" ? await crewOptions(tx, id) : null;
    const parents = p.can.live && doing === "message" ? await routeParents(tx, p.today) : null;
    return { ...d, school, options, parents };
  });
  if (!data) notFound();
  const r = data.route;
  const archived = Boolean(r.archivedAt);
  const canEdit = p.can.routes && !archived;
  const evening = eveningTimes(data.stops, r.schoolArrivalMin, r.eveningDepartMin ?? DEFAULT_EVENING);
  const dropOf = (s: (typeof data.stops)[number]) => s.dropMin ?? evening.get(s.id) ?? null;
  const at = (stopId: string) => data.students.filter((x) => x.stopId === stopId);
  const firstPickup = data.stops.length ? Math.min(...data.stops.map((s) => s.pickupMin)) : null;
  const perRoute = r.feeTwoWayPaise != null;
  const feeOf = (s: (typeof data.stops)[number]) => ({ two: s.feeTwoWayPaise ?? r.feeTwoWayPaise, one: s.feeOneWayPaise ?? r.feeOneWayPaise });
  const twoFees = data.stops.map((s) => feeOf(s).two).filter((x): x is bigint => x != null);
  const oneFees = data.stops.map((s) => feeOf(s).one).filter((x): x is bigint => x != null);
  const range = (xs: bigint[]) => (xs.length ? (xs.every((x) => x === xs[0]) ? rupeesShort(xs[0]) : `${rupeesShort(xs.reduce((a, b) => (b < a ? b : a)))}–${rupeesShort(xs.reduce((a, b) => (b > a ? b : a)))}`) : "Not set");
  const school = p.settings.schoolLat != null && p.settings.schoolLng != null ? { lat: p.settings.schoolLat, lng: p.settings.schoolLng, name: data.school.name } : null;
  const mapRoute = { id: r.id, number: r.number, name: r.name, stops: data.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) };
  const last = data.stops[data.stops.length - 1];
  const editing = editStopId ? data.stops.find((s) => s.id === editStopId) ?? null : null;
  const seatsTone = data.vehicle && data.vehicle.capacity - data.used <= 3 ? "warn" : "neutral";
  const canOpenStudents = p.current.menu.some((m) => m.key === "student-management");

  return (
    <div>
      <TrHead page="routes" href={HREF} sub={`Route ${r.number} · ${r.name}`} />
      <Link href={`${BASE}/routes`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
        <ArrowLeft size={17} aria-hidden="true" />Routes &amp; Stops<span className="text-ink3 font-normal">/ Route {r.number}</span>
      </Link>
      <Stack>
        <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <RouteBadge n={r.number} size={52} tone={archived ? "neutral" : "brand"} />
            <div className="min-w-0">
              <h2 className="font-display text-[22px] md:text-[26px] font-semibold tracking-tight leading-tight">{r.name}</h2>
              <p className="text-[13.5px] text-ink3 mt-0.5">
                {data.vehicle ? <>{data.vehicle.label ?? "Vehicle"} · <span className="font-mono text-[12.5px]">{showPlate(data.vehicle.number)}</span></> : "No vehicle yet"} · {data.driver?.name ?? "no driver yet"}{data.attendant ? ` · attendant ${data.attendant.name}` : ""}
              </p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {archived && <Pill tone="neutral">Archived</Pill>}
                {data.vehicle && <Pill tone={seatsTone}>{data.used} of {data.vehicle.capacity} seats</Pill>}
                <Pill tone="neutral">{plural(data.stops.length, "stop")}</Pill>
                {firstPickup != null && <Pill tone="neutral">Morning {clockOf(firstPickup - 10)}</Pill>}
                <Pill tone="neutral">Evening {clockOf(r.eveningDepartMin ?? DEFAULT_EVENING)}</Pill>
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <ButtonLink href={addQ(HREF, { do: "stop" })} scroll={false} variant="primary" icon={Plus} className="flex-1 lg:flex-none">Add stop</ButtonLink>
              <ButtonLink href={addQ(HREF, { do: "edit" })} scroll={false} variant="secondary" icon={Pencil}>Edit route</ButtonLink>
            </div>
          )}
        </Card>

        <Split side={380} className="[&>*]:min-w-0">
          <Card className="overflow-hidden">
            <CardHeader title="Stops in order" description={canEdit ? "Use the arrows to reorder. Open a stop to see its students." : "Open a stop to see its students"} icon={ListOrdered} />
            {data.stops.length === 0 ? (
              <div className="px-5 pb-6 text-[14px] text-ink3 flex flex-col items-start gap-3">
                <p>No stops yet. Add them in the order the bus reaches them in the morning.</p>
                {canEdit && <ButtonLink href={addQ(HREF, { do: "stop" })} scroll={false} variant="secondary" icon={Plus}>Add the first stop</ButtonLink>}
              </div>
            ) : (
              <>
                <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_80px_80px_110px_112px] gap-3 px-5 py-2 border-y border-line text-[12px] font-semibold text-ink3">
                  <span>#</span><span>Stop</span><span>Pickup</span><span>Drop</span><span className="text-right">Fee a month</span><span />
                </div>
                <ul className="divide-y divide-line/70 border-t border-line md:border-t-0">
                  {data.stops.map((s, i) => {
                    const kids = at(s.id);
                    const f = feeOf(s);
                    return (
                      <li key={s.id}>
                        <details className="group">
                          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_80px_80px_110px_112px] gap-3 items-center px-4 md:px-5 py-3 hover:bg-sunken/50 group-open:bg-brand/5">
                            <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span>
                            <span className="min-w-0">
                              <span className="font-semibold text-[14.5px] truncate flex items-center gap-1.5">{s.name}{s.lat == null && <MapPin size={13} className="text-warn shrink-0" aria-label="No location" />}</span>
                              <span className="block text-[12.5px] text-ink3 truncate">{plural(kids.length, "student")}<span className="md:hidden"> · {clockOf(s.pickupMin)}{dropOf(s) != null ? ` · drop ${clockOf(dropOf(s))}` : ""}</span>{s.lat == null ? " · no location" : ""}</span>
                            </span>
                            <span className="hidden md:block text-[14px] tnum">{clockOf(s.pickupMin)}</span>
                            <span className={cx("hidden md:block text-[14px] tnum", s.dropMin == null && "text-ink3")}>{dropOf(s) != null ? clockOf(dropOf(s)) : "—"}</span>
                            <span className="text-right">
                              <span className="block font-semibold tnum text-[14.5px]">{f.two != null ? rupeesShort(f.two) : "—"}</span>
                              <span className="block text-[12px] text-ink3 tnum">one-way {f.one != null ? rupeesShort(f.one) : rupeesShort(f.two)}</span>
                            </span>
                            <span className="hidden md:flex gap-0.5 justify-end">
                              {canEdit && <>
                                {i > 0 && <ActButton action={moveStopAction} fields={{ stopId: s.id, dir: "up" }} label={<span className="sr-only">Move {s.name} up</span>} icon={ArrowUp} variant="ghost" />}
                                {i < data.stops.length - 1 && <ActButton action={moveStopAction} fields={{ stopId: s.id, dir: "down" }} label={<span className="sr-only">Move {s.name} down</span>} icon={ArrowDown} variant="ghost" />}
                              </>}
                            </span>
                          </summary>
                          <div className="px-4 md:px-5 pb-3 pl-[56px] md:pl-[60px]">
                            {kids.length === 0 ? <p className="text-[13px] text-ink3">No student gets on here yet.</p> : (
                              <ul className="flex flex-col gap-1">
                                {kids.slice(0, 40).map((k) => (
                                  <li key={k.id} className="flex items-center gap-2.5 text-[13.5px]">
                                    <Avatar name={k.card.name} size={26} />
                                    {canOpenStudents ? <Link href={`/student-management/students/${k.studentId}?tab=transport`} className="font-semibold hover:underline truncate">{k.card.name}</Link> : <span className="font-semibold truncate">{k.card.name}</span>}
                                    <span className="text-ink3 shrink-0">{k.card.cls}</span>
                                    {k.type !== "TWO_WAY" && <Pill className="!h-5 !text-[11px]">{assignType(k.type)}</Pill>}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {kids.length > 40 && <p className="text-[12.5px] text-ink3 mt-1.5">and {kids.length - 40} more · full list in Student Transport</p>}
                            {canEdit && (
                              <div className="flex gap-2 mt-2.5 flex-wrap">
                                <ButtonLink href={addQ(HREF, { stop: s.id })} scroll={false} size="sm" variant="secondary" icon={Pencil}>Edit stop</ButtonLink>
                                <span className="md:hidden contents">
                                  {i > 0 && <ActButton action={moveStopAction} fields={{ stopId: s.id, dir: "up" }} label="Up" icon={ArrowUp} />}
                                  {i < data.stops.length - 1 && <ActButton action={moveStopAction} fields={{ stopId: s.id, dir: "down" }} label="Down" icon={ArrowDown} />}
                                </span>
                                <ConfirmAct action={archiveStopAction} fields={{ stopId: s.id }} trigger="Remove stop" triggerVariant="ghost" title={`Remove ${s.name} from Route ${r.number}?`} confirmLabel={`Remove ${s.name}`} danger>
                                  {kids.length ? `${plural(kids.length, "student")} get on here. Change their stop in Student Transport first.` : "The stop is kept in the history of past trips. The stops after it move up one place."}
                                </ConfirmAct>
                              </div>
                            )}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                  <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_80px_80px_110px_112px] gap-3 items-center px-4 md:px-5 py-3 bg-sunken/40">
                    <span className="w-7 h-7 rounded-full bg-brand text-brandink grid place-items-center"><School size={14} aria-hidden="true" /></span>
                    <div className="min-w-0"><p className="font-semibold text-[14.5px]">School</p><p className="text-[12.5px] text-ink3 md:hidden">Arrive {clockOf(r.schoolArrivalMin) || "—"} · leave {clockOf(r.eveningDepartMin ?? DEFAULT_EVENING)}</p></div>
                    <span className="hidden md:block text-[14px] tnum">{clockOf(r.schoolArrivalMin) || "—"}</span>
                    <span className="hidden md:block text-[14px] tnum">{clockOf(r.eveningDepartMin ?? DEFAULT_EVENING)}</span>
                    <span /><span className="hidden md:block" />
                  </li>
                </ul>
              </>
            )}
          </Card>

          <Col>
            <Card className="overflow-hidden">
              <CardHeader title="On the map" description="Stop locations are used for arrival times and ‘bus arriving’ messages" icon={MapPinned} />
              <div className="px-3 pb-3"><div className="rounded-xl overflow-hidden border border-line/70">
                <TransportMap routes={[mapRoute]} school={school} selected={r.id} labelStops ariaLabel={`Sketch of Route ${r.number}`} />
              </div></div>
            </Card>
            <Card>
              <CardHeader title="Transport fee" description="Added to each student's fees when they get a stop" icon={IndianRupee} />
              <div className="px-5 pb-5">
                <DL rows={[
                  ["Set", perRoute ? "One fee for the route" : "Per stop"],
                  ["Two-way a month", perRoute ? formatRupees(r.feeTwoWayPaise!) : range(twoFees)],
                  ["One-way a month", perRoute && r.feeOneWayPaise != null ? formatRupees(r.feeOneWayPaise) : oneFees.length ? range(oneFees) : "Same as two-way"],
                  ["Fee head", "Transport, in Fee Management"],
                ]} />
              </div>
            </Card>
            <Card>
              <CardHeader title="More" icon={Users} />
              <div className="px-5 pb-5 flex flex-col gap-2 items-start">
                {p.can.live && !archived && <ButtonLink href={addQ(HREF, { do: "message" })} scroll={false} variant="secondary" icon={Send}>Message this route&rsquo;s parents</ButtonLink>}
                {canEdit && data.stops.length > 0 && <ActButton action={copyEveningAction} fields={{ routeId: r.id }} label="Copy for evening drop (reverse order)" icon={ArrowUpDown} pendingText="Copying…" />}
                {canEdit && (
                  <ConfirmAct action={archiveRouteAction} fields={{ routeId: r.id }} trigger={<><Archive size={16} aria-hidden="true" />Archive route</>} triggerVariant="ghost" title={`Archive Route ${r.number} · ${r.name}?`} confirmLabel={`Archive Route ${r.number}`} danger>
                    {data.used ? `${plural(data.used, "student")} still use this route. Move them to another route in Student Transport first.` : "It drops out of lists and is kept with its history. You can restore it later."}
                  </ConfirmAct>
                )}
                {!canEdit && !p.can.live && <p className="text-[13.5px] text-ink3">The Transport In-charge changes routes and stops.</p>}
              </div>
            </Card>
          </Col>
        </Split>
      </Stack>

      {canEdit && doing === "edit" && data.options && (
        <RouteSheet closeHref={HREF} {...data.options} start={{ id: r.id, name: r.name, vehicleId: r.vehicleId ?? "", driverId: r.driverId ?? "", attendantId: r.attendantId ?? "", feeMode: perRoute ? "route" : "stop", feeTwoWay: rupeesInput(r.feeTwoWayPaise), feeOneWay: rupeesInput(r.feeOneWayPaise), schoolArrival: hhmmOf(r.schoolArrivalMin), eveningDepart: hhmmOf(r.eveningDepartMin) }} />
      )}
      {canEdit && (doing === "stop" || editing) && (
        <StopSheet closeHref={HREF} route={{ id: r.id, number: r.number, name: r.name }} perRoute={perRoute}
          start={editing ? { id: editing.id, name: editing.name, pickup: hhmmOf(editing.pickupMin), drop: hhmmOf(editing.dropMin), lat: editing.lat, lng: editing.lng, feeTwoWay: rupeesInput(editing.feeTwoWayPaise), feeOneWay: rupeesInput(editing.feeOneWayPaise) } : null}
          order={[{ value: "", label: `Last (${data.stops.length + 1})` }, ...data.stops.map((s) => ({ value: s.id, label: `Before ${s.name}` }))]}
          defaults={{ pickup: last ? hhmmOf(last.pickupMin + 5) : "07:15", drop: last && last.dropMin != null ? hhmmOf(Math.max(0, last.dropMin - 3)) : "", feeTwoWay: last ? rupeesInput(last.feeTwoWayPaise) : "", feeOneWay: last ? rupeesInput(last.feeOneWayPaise) : "" }}
          sketch={{ routes: [mapRoute], school }} />
      )}
      {p.can.live && doing === "message" && data.parents && (
        <RouteMessageSheet closeHref={HREF} routes={data.parents.map((x) => ({ id: x.id, label: x.label, parents: x.parents }))} start={{ routeId: r.id, kind: "message", text: "" }} />
      )}
    </div>
  );
}
