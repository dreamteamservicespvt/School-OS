"use client";

// Trips forms (12 §2): the trip schedule of a route (start time, days,
// vehicle and driver), a different vehicle or driver for one day, and
// cancelling a trip with a reason.

import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SSelect, SText } from "@/components/ui/sheet-fields";
import { cancelTripAction, changeForDayAction, saveScheduleAction } from "../actions";
import { SegField } from "./fields";

type Opt = { value: string; label: string };
const DAYS = [
  { value: "1", label: "Mon" }, { value: "2", label: "Tue" }, { value: "3", label: "Wed" }, { value: "4", label: "Thu" },
  { value: "5", label: "Fri" }, { value: "6", label: "Sat" }, { value: "7", label: "Sun" },
];

export function ScheduleSheet({ closeHref, routes, start, vehicles, drivers, attendants }: {
  closeHref: string; routes: Opt[]; vehicles: Opt[]; drivers: Opt[]; attendants: Opt[];
  start: { routeId: string; kind: string; start: string; days: number[]; vehicleId: string; driverId: string; attendantId: string };
}) {
  return (
    <SheetForm title="Trip schedule" sub="Trips not started yet follow the new schedule. The driver sees it in the app." closeHref={closeHref} action={saveScheduleAction} submitLabel="Save schedule" pendingText="Saving…">
      <SSelect name="routeId" label="Route" required start={start.routeId} placeholder="Choose the route" options={routes} />
      <SegField name="kind" label="Trip" required start={start.kind || "MORNING"} options={[{ value: "MORNING", label: "Morning pickup" }, { value: "EVENING", label: "Evening drop" }]} />
      <SText name="start" type="time" label="Start time" required start={start.start} help="Morning: 10 minutes before the first stop. Evening: when school gets over." />
      <SChips name="days" label="Days" required options={DAYS} start={start.days.map(String)} help="No trips on school holidays" />
      <div className="grid sm:grid-cols-2 gap-3">
        <SSelect name="vehicleId" label="Vehicle" start={start.vehicleId} options={[{ value: "", label: "The route's vehicle" }, ...vehicles]} />
        <SSelect name="driverId" label="Driver" start={start.driverId} options={[{ value: "", label: "The route's driver" }, ...drivers]} />
      </div>
      <SSelect name="attendantId" label="Attendant" start={start.attendantId} options={[{ value: "", label: "The route's attendant" }, ...attendants]} />
    </SheetForm>
  );
}

export function DaySheet({ closeHref, routes, start, vehicles, drivers, today }: {
  closeHref: string; routes: Opt[]; vehicles: Opt[]; drivers: Opt[]; today: string;
  start: { routeId: string; kind: string; date: string };
}) {
  return (
    <SheetForm title="Change for one day" sub="Another bus or driver for one trip, such as when a bus breaks down. The schedule stays the same." closeHref={closeHref} action={changeForDayAction} submitLabel="Save for that day" pendingText="Saving…">
      <SSelect name="routeId" label="Route" required start={start.routeId} placeholder="Choose the route" options={routes} />
      <SegField name="kind" label="Trip" required start={start.kind || "MORNING"} options={[{ value: "MORNING", label: "Morning pickup" }, { value: "EVENING", label: "Evening drop" }]} />
      <SDate name="date" label="Date" required start={start.date || today} min={today} />
      <div className="grid sm:grid-cols-2 gap-3">
        <SSelect name="vehicleId" label="Vehicle" start="" options={[{ value: "", label: "Same vehicle" }, ...vehicles]} />
        <SSelect name="driverId" label="Driver" start="" options={[{ value: "", label: "Same driver" }, ...drivers]} help="Only drivers with a valid licence" />
      </div>
      <SText name="note" label="Note" maxLength={200} placeholder="Bus 4 in for repair" />
    </SheetForm>
  );
}

export function CancelTripSheet({ closeHref, trip }: { closeHref: string; trip: { id: string; label: string } }) {
  return (
    <SheetForm title="Cancel trip" sub={trip.label} closeHref={closeHref} action={cancelTripAction} submitVariant="danger" submitLabel="Cancel trip" pendingText="Cancelling…" hidden={{ tripId: trip.id }}>
      <p className="text-[14px] text-ink2">The trip will not run. Message the route&rsquo;s parents from Live Tracking if they need to know.</p>
      <SArea name="reason" label="Reason" required rows={2} maxLength={200} placeholder="Holiday declared" />
    </SheetForm>
  );
}
