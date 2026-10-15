"use client";

// Add or edit a route, add or edit a stop (12 §2 Routes & Stops forms), and
// the message to a route's parents, which is sent only after the person
// confirms the number of parents (12 §5).

import { useState } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { addRouteAction, addStopAction, editRouteAction, editStopAction, messageRouteAction } from "../actions";
import { LocationField, SegField } from "./fields";
import type { MapRoute } from "./map";
import type { LatLng } from "@/lib/transport/geo";

type Opt = { value: string; label: string };

export type RouteStart = { id: string; name: string; vehicleId: string; driverId: string; attendantId: string; feeMode: "stop" | "route"; feeTwoWay: string; feeOneWay: string; schoolArrival: string; eveningDepart: string } | null;

export function RouteSheet({ closeHref, start, vehicles, drivers, attendants }: { closeHref: string; start: RouteStart; vehicles: Opt[]; drivers: Opt[]; attendants: Opt[] }) {
  const t = useTyped("feeMode", start?.feeMode ?? "stop");
  const [mode, setMode] = useState(t.value || "stop");
  return (
    <SheetForm title={start ? `Edit ${start.name}` : "Add route"} sub={start ? "Changes to the fee apply to students given a stop from now on." : "Add stops after saving. Fees come from each stop, or one fee for the route."}
      closeHref={closeHref} action={start ? editRouteAction : addRouteAction} submitLabel={start ? "Save route" : "Add route"} pendingText="Saving…" hidden={start ? { routeId: start.id } : undefined}>
      <SText name="name" label="Route name" required start={start?.name} placeholder="Like Hafeezpet" help="Usually the farthest area" maxLength={60} autoComplete="off" />
      <div className="grid sm:grid-cols-2 gap-3">
        <SSelect name="vehicleId" label="Vehicle" start={start?.vehicleId ?? ""} options={[{ value: "", label: "Not yet" }, ...vehicles]} help="Vehicles already on a route are not shown" />
        <SSelect name="driverId" label="Driver" start={start?.driverId ?? ""} options={[{ value: "", label: "Not yet" }, ...drivers]} />
      </div>
      <SSelect name="attendantId" label="Attendant" start={start?.attendantId ?? ""} options={[{ value: "", label: "None" }, ...attendants]} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="schoolArrival" type="time" label="Reaches school" start={start?.schoolArrival} help="Morning" />
        <SText name="eveningDepart" type="time" label="Leaves school" start={start?.eveningDepart} help="Evening drop" />
      </div>
      <SegField name="feeMode" label="Transport fee" start={mode} onChange={setMode} options={[{ value: "stop", label: "Per stop" }, { value: "route", label: "One fee for the route" }]} help={mode === "stop" ? "Farther stops can cost more. Set the fee on each stop." : "Every stop on this route has the same fee a month."} />
      {mode === "route" && (
        <div className="grid grid-cols-2 gap-3">
          <SMoney name="feeTwoWay" label="Two-way a month" required start={start?.feeTwoWay} />
          <SMoney name="feeOneWay" label="One-way a month" start={start?.feeOneWay} help="Fee variant" />
        </div>
      )}
    </SheetForm>
  );
}

export type StopStart = { id: string; name: string; pickup: string; drop: string; lat: number | null; lng: number | null; feeTwoWay: string; feeOneWay: string } | null;

export function StopSheet({ closeHref, route, start, order, defaults, perRoute, sketch }: {
  closeHref: string;
  route: { id: string; number: number; name: string };
  start: StopStart;
  order: Opt[];
  defaults: { pickup: string; drop: string; feeTwoWay: string; feeOneWay: string };
  perRoute: boolean;
  sketch: { routes: MapRoute[]; school: (LatLng & { name: string }) | null } | null;
}) {
  return (
    <SheetForm title={start ? `Edit ${start.name}` : `Add stop to Route ${route.number}`} sub={start ? `Route ${route.number} · ${route.name}` : "The pickup time fills 5 minutes after the last stop"}
      closeHref={closeHref} action={start ? editStopAction : addStopAction} submitLabel={start ? "Save stop" : "Add stop"} pendingText="Saving…"
      hidden={start ? { stopId: start.id, routeId: route.id } : { routeId: route.id }}>
      <SText name="name" label="Stop name" required start={start?.name} placeholder="Like Hafeezpet Railway Station" maxLength={80} autoComplete="off" help="The name parents know" />
      {!start && <SSelect name="before" label="Order" required start="" options={order} />}
      <div className="grid grid-cols-2 gap-3">
        <SText name="pickup" type="time" label="Pickup time" required start={start?.pickup ?? defaults.pickup} help="Morning" />
        <SText name="drop" type="time" label="Drop time" start={start?.drop ?? defaults.drop} help="Evening" />
      </div>
      <LocationField start={{ lat: start?.lat ?? null, lng: start?.lng ?? null }} sketch={sketch} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="feeTwoWay" label="Fee two-way a month" required={!perRoute} start={start?.feeTwoWay ?? defaults.feeTwoWay} help={perRoute ? "Empty: the route's fee" : undefined} />
        <SMoney name="feeOneWay" label="Fee one-way" start={start?.feeOneWay ?? defaults.feeOneWay} help="Fee variant" />
      </div>
    </SheetForm>
  );
}

/**
 * A delay, emergency or typed message to the parents of one route. The
 * text is ready to read and change; the person ticks that they have checked
 * it, and the button says how many parents get it.
 */
export function RouteMessageSheet({ closeHref, routes, start }: {
  closeHref: string;
  routes: { id: string; label: string; parents: number }[];
  start: { routeId: string; kind: "delay" | "emergency" | "message"; text: string; alertId?: string | null; tripId?: string | null };
}) {
  const tRoute = useTyped("routeId", start.routeId);
  const tText = useTyped("text", start.text);
  const [routeId, setRouteId] = useState(tRoute.value || start.routeId);
  const [body, setBody] = useState(tText.value);
  const [sure, setSure] = useState(false);
  const r = routes.find((x) => x.id === routeId);
  const emergency = start.kind === "emergency";
  return (
    <SheetForm title={emergency ? "Emergency message to parents" : start.kind === "delay" ? "Delay message to parents" : "Message a route"}
      sub={r ? `${r.parents} parents of ${r.label} get this. A sent message cannot be taken back.` : "Pick the route"}
      closeHref={closeHref} action={messageRouteAction} submitVariant={emergency ? "danger" : "primary"} submitDisabled={!sure || !r || body.trim().length < 10}
      submitLabel={<><Send size={16} aria-hidden="true" />{r ? `Send to ${r.parents} parents` : "Send"}</>} pendingText="Sending…"
      hidden={{ kind: start.kind, confirmed: sure ? "yes" : "", ...(start.alertId ? { alertId: start.alertId } : {}), ...(start.tripId ? { tripId: start.tripId } : {}) }}>
      {emergency && (
        <div className="rounded-xl bg-bad/10 text-bad px-3.5 py-3 text-[13.5px] flex gap-2.5">
          <TriangleAlert size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
          <p>An emergency message reaches every parent of the route, even those who turned messages off. Send it only when you have spoken to the driver.</p>
        </div>
      )}
      <FieldShell label="Route" id="rm-route" required error={tRoute.error}>
        <select id="rm-route" name="routeId" value={routeId} onChange={(e) => setRouteId(e.target.value)} className={cx(inputCls(tRoute.error), "h-11")}>
          {routes.map((x) => <option key={x.id} value={x.id}>{x.label} · {x.parents} parents</option>)}
        </select>
      </FieldShell>
      <FieldShell label="Message" id="rm-text" required error={tText.error} help={`${body.length} of 600 characters`}>
        <textarea id="rm-text" name="text" rows={5} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} className={cx(inputCls(tText.error), "py-2.5 leading-relaxed")} />
      </FieldShell>
      <label className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-3 cursor-pointer">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1 size-4 accent-[rgb(var(--brand))]" />
        <span className="text-[14px]"><b className="font-semibold">{r ? `Send to ${r.parents} parents of ${r.label}?` : "Send this message?"}</b><span className="block text-[12.5px] text-ink3">I have read the message. It goes on WhatsApp, with SMS where WhatsApp fails.</span></span>
      </label>
    </SheetForm>
  );
}

/** A short note field used by the alert and cancel sheets. */
export function NoteField({ name = "note", label = "Note", required }: { name?: string; label?: string; required?: boolean }) {
  return <SArea name={name} label={label} required={required} rows={2} maxLength={200} />;
}
