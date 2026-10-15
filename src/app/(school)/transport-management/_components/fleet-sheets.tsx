"use client";

// Vehicles & Drivers forms (12 §2): add or edit a vehicle (with its papers and
// optional route), renew a paper, add or edit a driver or attendant, add a
// vendor, record fuel or a repair, cancel an entry, and set up a phone for the
// Android driver app (its key shown once).

import { useActionState, useState } from "react";
import { Copy, KeyRound, Smartphone } from "lucide-react";
import { SheetForm, UrlSheet, useCloseSheet, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { DRIVER_ROLES, PAPER_KINDS, VEHICLE_TYPES } from "@/lib/transport/words";
import { cancelCostAction, issueKeyAction, recordCostAction, saveVehicleAction, saveVendorAction, savePaperAction, addDriverAction, editDriverAction } from "../actions";
import { SegField } from "./fields";

type Opt = { value: string; label: string };

/** A file to upload with the form (bill photo, paper scan). Picked again after a failed check. */
export function SFile({ name, label, help, accept = "image/jpeg,image/png,image/webp,application/pdf" }: { name: string; label: string; help?: string; accept?: string }) {
  const t = useTyped(name, null);
  const id = `file-${name}`;
  return (
    <FieldShell label={label} id={id} help={help} error={t.error}>
      <input id={id} name={name} type="file" accept={accept} className={cx(inputCls(t.error), "h-auto py-2 text-[14px] file:mr-3 file:rounded-lg file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:font-semibold file:text-ink")} />
    </FieldShell>
  );
}

/* ---------- Vehicle ---------- */

export type VehicleStart = {
  id: string; number: string; label: string; type: string; model: string; capacity: string; ownership: string; vendorId: string; status: string;
  gpsDeviceId: string; odometerKm: string; serviceEveryKm: string; serviceEveryDays: string; routeId: string;
} | null;

export function VehicleSheet({ closeHref, start, vendors, routes, drivers, gps }: { closeHref: string; start: VehicleStart; vendors: Opt[]; routes: Opt[] | null; drivers: Opt[]; gps: string | null }) {
  const [own, setOwn] = useState(start?.ownership ?? "OWNED");
  return (
    <SheetForm title={start ? `Edit ${start.label || start.number}` : "Add vehicle"} sub={start ? "Changes show on its route and trips from now on" : "Papers with their expiry dates get reminders before they end"}
      closeHref={closeHref} action={saveVehicleAction} submitLabel={start ? "Save vehicle" : "Add vehicle"} pendingText="Saving…" hidden={start ? { vehicleId: start.id } : undefined} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <SText name="number" label="Vehicle number" required start={start?.number} placeholder="TS 07 UB 2236" autoComplete="off" className="[&_input]:uppercase" help="As on the registration" />
        <SText name="label" label="Short name" start={start?.label} placeholder="Bus 4" maxLength={30} help="What the school calls it" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SegField name="type" label="Type" required start={start?.type ?? "BUS"} options={VEHICLE_TYPES} />
        <SText name="capacity" label="Capacity (seats)" required inputMode="numeric" start={start?.capacity} placeholder="40" />
      </div>
      <SText name="model" label="Make and model" start={start?.model} placeholder="Tata Starbus" maxLength={60} />
      <SegField name="ownership" label="Owned or hired" required start={own} onChange={setOwn} options={[{ value: "OWNED", label: "Owned" }, { value: "HIRED", label: "Hired" }]} />
      {own === "HIRED" && (
        vendors.length
          ? <SSelect name="vendorId" label="Vendor" required start={start?.vendorId ?? ""} placeholder="Choose the vendor" options={vendors} help="The company the vehicle is hired from" />
          : <Alert tone="warning">Add the vendor first, in the Vendors view, then come back.</Alert>
      )}
      {start && <SegField name="status" label="Status" required start={start.status} options={[{ value: "ACTIVE", label: "Active" }, { value: "UNDER_REPAIR", label: "Under repair" }, { value: "INACTIVE", label: "Inactive" }]} />}
      {routes && (
        <div className="grid sm:grid-cols-2 gap-3">
          <SSelect name="routeId" label="Route" start={start?.routeId ?? ""} options={[{ value: "", label: "Not on a route" }, ...routes]} help="Routes with no vehicle" />
          <SSelect name="driverId" label="Driver" start="" options={[{ value: "", label: "Keep the route's driver" }, ...drivers]} />
        </div>
      )}
      <SText name="gpsDeviceId" label="GPS device" start={start?.gpsDeviceId} placeholder={gps ? `Device ID from ${gps}` : "Device ID, if the bus has a tracker"} maxLength={40} help={gps ? undefined : "Leave empty when the driver app sends the location"} />
      {!start && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink2 mb-1">Paper expiry dates <span className="font-normal text-ink3">(strongly suggested; reminders need them)</span></legend>
          <div className="grid grid-cols-2 gap-3">
            {PAPER_KINDS.map((k) => <SDate key={k.value} name={`paper_${k.value}`} label={k.label} />)}
          </div>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-ink2 mb-1">Maintenance schedule</legend>
        <div className="grid grid-cols-3 gap-3">
          <SText name="odometerKm" label="Odometer now (km)" inputMode="numeric" start={start?.odometerKm} />
          <SText name="serviceEveryKm" label="Service every (km)" inputMode="numeric" start={start?.serviceEveryKm} placeholder="10000" />
          <SText name="serviceEveryDays" label="or every (days)" inputMode="numeric" start={start?.serviceEveryDays} placeholder="90" />
        </div>
      </fieldset>
    </SheetForm>
  );
}

/** Upload a renewed paper with its new expiry; the old one stays on record. */
export function PaperSheet({ closeHref, vehicles, start }: { closeHref: string; vehicles: Opt[]; start: { vehicleId: string; kind: string } }) {
  return (
    <SheetForm title="Upload paper" sub="The renewed paper replaces the old one, which stays on record" closeHref={closeHref} action={savePaperAction} submitLabel="Save paper" pendingText="Uploading…">
      <SSelect name="vehicleId" label="Vehicle" required start={start.vehicleId} placeholder="Choose the vehicle" options={vehicles} />
      <SSelect name="kind" label="Paper" required start={start.kind || "INSURANCE"} options={PAPER_KINDS} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="paperNo" label="Certificate number" maxLength={40} autoComplete="off" />
        <SDate name="expiresOn" label="New expiry date" required />
      </div>
      <SFile name="file" label="Scan or photo" help="PDF or photo, up to 10 MB" />
    </SheetForm>
  );
}

/* ---------- Driver or attendant ---------- */

export type DriverStart = { id: string; name: string; phone: string; role: string; employment: string; vendorId: string; licenceNo: string; licenceExpiry: string } | null;

export function DriverSheet({ closeHref, start, vendors }: { closeHref: string; start: DriverStart; vendors: Opt[] }) {
  const [role, setRole] = useState(start?.role ?? "DRIVER");
  const [emp, setEmp] = useState(start?.employment ?? "STAFF");
  return (
    <SheetForm title={start ? `Edit ${start.name}` : "Add driver or attendant"} sub={start ? "Changes show on routes and trips from now on" : "A staff driver is also added to Staff & HR, for attendance and salary"}
      closeHref={closeHref} action={start ? editDriverAction : addDriverAction} submitLabel={start ? "Save" : role === "DRIVER" ? "Add driver" : "Add attendant"} pendingText="Saving…" hidden={start ? { driverId: start.id } : undefined}>
      <SegField name="role" label="Role" required start={role} onChange={setRole} options={DRIVER_ROLES} />
      <SText name="name" label="Full name" required start={start?.name} maxLength={80} autoComplete="off" />
      <SText name="phone" label="Mobile number" required start={start?.phone} inputMode="tel" placeholder="98765 43210" help="Checked against staff, so one person is never added twice" />
      <SegField name="employment" label="Staff or hired" required start={emp} onChange={setEmp} options={[{ value: "STAFF", label: "On the staff" }, { value: "HIRED", label: "Hired" }]} />
      {emp === "HIRED" && <SSelect name="vendorId" label="Vendor" start={start?.vendorId ?? ""} options={[{ value: "", label: "Not from a vendor" }, ...vendors]} />}
      {role === "DRIVER" && (
        <div className="grid grid-cols-2 gap-3">
          <SText name="licenceNo" label="Licence number" required start={start?.licenceNo} maxLength={30} autoComplete="off" className="[&_input]:uppercase" />
          <SDate name="licenceExpiry" label="Licence expiry" required start={start?.licenceExpiry} />
        </div>
      )}
      {!start && <SSwitch name="invite" title="Send the driver app invite" sub="A login of their own, sent to this phone" start />}
    </SheetForm>
  );
}

/* ---------- Vendor ---------- */

export type VendorStart = { id: string; name: string; contactName: string; phone: string; email: string; address: string; gstin: string; bankName: string; ifsc: string; bankLast4: string | null; monthlyCharge: string; contractEnd: string } | null;

export function VendorSheet({ closeHref, start, bank }: { closeHref: string; start: VendorStart; bank: boolean }) {
  return (
    <SheetForm title={start ? `Edit ${start.name}` : "Add vendor"} sub="A company the school hires buses or drivers from" closeHref={closeHref} action={saveVendorAction}
      submitLabel={start ? "Save vendor" : "Add vendor"} pendingText="Saving…" hidden={start ? { vendorId: start.id } : undefined} wide>
      <SText name="name" label="Company name" required start={start?.name} maxLength={80} />
      <div className="grid sm:grid-cols-2 gap-3">
        <SText name="contactName" label="Contact person" start={start?.contactName} maxLength={60} />
        <SText name="phone" label="Phone" start={start?.phone} inputMode="tel" />
        <SText name="email" label="Email" type="email" start={start?.email} maxLength={120} />
        <SText name="gstin" label="GSTIN" start={start?.gstin} maxLength={15} className="[&_input]:uppercase" />
      </div>
      <SArea name="address" label="Address" start={start?.address} maxLength={300} />
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="monthlyCharge" label="Charge a month" start={start?.monthlyCharge} />
        <SDate name="contractEnd" label="Contract ends" start={start?.contractEnd} />
      </div>
      {bank && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink2 mb-1">Bank details</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            <SText name="bankName" label="Bank" start={start?.bankName} maxLength={60} />
            <SText name="bankAccountNo" label="Account number" inputMode="numeric" autoComplete="off" placeholder={start?.bankLast4 ? `Ends ${start.bankLast4}` : undefined} help={start?.bankLast4 ? "Empty keeps the saved number" : undefined} />
            <SText name="ifsc" label="IFSC" start={start?.ifsc} maxLength={11} className="[&_input]:uppercase" />
          </div>
        </fieldset>
      )}
    </SheetForm>
  );
}

/* ---------- Fuel and repairs ---------- */

export function CostSheet({ closeHref, vehicles, start }: { closeHref: string; vehicles: Opt[]; start: { vehicleId: string; kind: string; date: string } }) {
  const [kind, setKind] = useState(start.kind || "FUEL");
  return (
    <SheetForm title={kind === "FUEL" ? "Record fuel" : kind === "SERVICE" ? "Record a service" : "Record a repair"} sub="It goes to Finance, Expenses, with the bill" closeHref={closeHref} action={recordCostAction}
      submitLabel="Record" pendingText="Recording…">
      <SegField name="kind" label="What" required start={kind} onChange={setKind} options={[{ value: "FUEL", label: "Fuel" }, { value: "REPAIR", label: "Repair" }, { value: "SERVICE", label: "Service" }]} help={kind === "SERVICE" ? "A service resets the maintenance schedule" : undefined} />
      <SSelect name="vehicleId" label="Vehicle" required start={start.vehicleId} placeholder="Choose the vehicle" options={vehicles} />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={start.date} max={start.date} />
        <SMoney name="amount" label="Amount" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {kind === "FUEL" && <SText name="litres" label="Litres" inputMode="decimal" />}
        <SText name="odometerKm" label="Odometer (km)" inputMode="numeric" />
      </div>
      <SText name="what" label={kind === "FUEL" ? "Pump" : "What was done"} required={kind !== "FUEL"} maxLength={200} placeholder={kind === "FUEL" ? "Indian Oil, Miyapur" : "Brake pads changed"} />
      <SFile name="bill" label="Bill photo" help="PDF or photo, up to 10 MB" />
    </SheetForm>
  );
}

export function CancelCostSheet({ closeHref, entry }: { closeHref: string; entry: { id: string; kind: "fuel" | "repair"; what: string } }) {
  return (
    <SheetForm title="Cancel entry" sub={entry.what} closeHref={closeHref} action={cancelCostAction} submitLabel="Cancel entry" submitVariant="danger" pendingText="Cancelling…" hidden={{ costId: entry.id, kind: entry.kind }}>
      <p className="text-[14px] text-ink2">The entry and its expense in Finance are cancelled. Both stay on record with the reason.</p>
      <SArea name="reason" label="Reason" required rows={2} maxLength={200} placeholder="Entered twice" />
    </SheetForm>
  );
}

/* ---------- Phone key for the Android driver app ---------- */

type KeyState = FormState<{ key: string; name: string; driver: string }>;

export function KeySheet({ closeHref, driver }: { closeHref: string; driver: { id: string; name: string } }) {
  const [state, run, pending] = useActionState<KeyState, FormData>(issueKeyAction, null);
  const made = state?.ok ? state.data : null;
  return (
    <UrlSheet title={made ? "Phone key" : `Set up ${driver.name}'s phone`} sub={made ? `${made.name} · ${made.driver}` : "For the Android driver app, which sends the location with the screen off"} closeHref={closeHref}>
      {made ? <ShowKey value={made.key} /> : (
        <form action={run} className="flex flex-col gap-4">
          <input type="hidden" name="driverId" value={driver.id} />
          <FieldShell label="Phone name" id="key-name" help="So you can tell phones apart later">
            <input id="key-name" name="name" maxLength={60} placeholder={`${driver.name}'s phone`} className={cx(inputCls(), "h-11")} />
          </FieldShell>
          <ol className="text-[13.5px] text-ink2 list-decimal pl-5 flex flex-col gap-1">
            <li>Install the School OS Driver app on the phone.</li>
            <li>Make the key here. It is shown only once.</li>
            <li>Type the school address and the key into the app.</li>
          </ol>
          {state && !state.ok && <Alert tone="danger">{state.message}</Alert>}
          <div className="flex justify-end gap-2 border-t border-line pt-3.5">
            <Button type="submit" variant="primary" icon={KeyRound} loading={pending} loadingText="Making the key…">Make the key</Button>
          </div>
        </form>
      )}
    </UrlSheet>
  );
}

function ShowKey({ value }: { value: string }) {
  const close = useCloseSheet();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-sunken px-3 py-2.5 font-mono text-[14px]" aria-label="Phone key">{value}</code>
        <Button icon={Copy} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied("yes"); } catch { setCopied("no"); } }}>{copied === "yes" ? "Copied" : "Copy"}</Button>
      </div>
      <p className="text-[13.5px] text-ink2 flex gap-2" aria-live="polite"><Smartphone size={17} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" />
        {copied === "no" ? "This browser did not allow copying. Select the key and copy it by hand." : "Type it into the driver app now. It is shown only this once; School OS keeps only a scrambled copy. Lost it? Turn this key off and make a new one."}
      </p>
      <div className="flex justify-end border-t border-line pt-3.5"><Button variant="primary" onClick={close}>I have entered it</Button></div>
    </div>
  );
}
