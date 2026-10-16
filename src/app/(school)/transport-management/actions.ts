"use server";

// Every change made on the Transport pages. Each one checks the person's role
// on the server (requireAction, Transport switched on, and the page rules in
// src/lib/transport/access.ts), runs inside the school's walls and writes the
// audit log in the same transaction.

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { formatRupees, formatDate } from "@/lib/format";
import { schoolsFor } from "@/lib/auth/access";
import { requireCurrent } from "@/lib/current";
import { bool, clock, date, file, id, ids, inTransport, int, maybe, money, need, num, optionalId, problemState, str, text, trAction, TransportProblem } from "@/lib/transport/act";
import { addRoute, addStop, archiveRoute, archiveStop, copyForEvening, editRoute, editStop, moveStop, putVehicleOnRoute, restoreRoute, type RouteInput } from "@/lib/transport/routes";
import { addDriver, addVehicle, appStates, archiveDriver, archiveVehicle, archiveVendor, cancelCost, editDriver, editVehicle, issueDriverKey, recordCost, revokeDriverKey, savePaper, saveVendor, sendAppInvite, setAppLogin, type VehicleInput } from "@/lib/transport/fleet";
import { addMissingFee, assignStudents, changePlace, stopPlace, keptWords } from "@/lib/transport/places";
import { carryOver, endAtYearEnd } from "@/lib/transport/carry";
import { cancelTrip, changeForDay, closeAlert, endTrip, markBoarding, markStop, remindInCharge, saveSchedule, startTrip } from "@/lib/transport/trips";
import { messageRoute } from "@/lib/transport/messages";
import { saveSettings, setLiveTracking } from "@/lib/transport/settings";
import { BASE, clockOf, paperLabel, plural, showPlate, tripKind } from "@/lib/transport/words";

type S = FormState<unknown>;
const say = (message: string, detail?: string | null) => (detail ? `${message}. ${detail}` : message);

const phoneOf = (fd: FormData, key: string) => str(fd, key).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");

/* ---------- Routes & Stops ---------- */

function routeInput(fd: FormData): RouteInput {
  const perRoute = str(fd, "feeMode") === "route";
  return {
    name: text(fd, "name", "Route name", { min: 2, max: 60 }),
    vehicleId: optionalId(fd, "vehicleId"),
    driverId: optionalId(fd, "driverId"),
    attendantId: optionalId(fd, "attendantId"),
    feeTwoWayPaise: perRoute ? money(fd, "feeTwoWay", "Two-way fee") : null,
    feeOneWayPaise: perRoute ? money(fd, "feeOneWay", "One-way fee", false) : null,
    schoolArrivalMin: clock(fd, "schoolArrival", "Arrival at school", false),
    eveningDepartMin: clock(fd, "eveningDepart", "Evening start", false),
  };
}

export async function addRouteAction(_: S, fd: FormData): Promise<S> {
  let newId = "";
  const r = await trAction("create", fd, async (w) => {
    need(w.can.routes, "add routes");
    const route = await addRoute(w.tx, w.ctx, routeInput(fd));
    newId = route.id;
    return route;
  }, (route) => (say(`Route ${route.number} · ${route.name} added`, "Now add its stops in order.")));
  if (r?.ok && newId) redirect(`${BASE}/routes/${newId}?do=stop`);
  return r;
}

export async function editRouteAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.routes, "change routes");
    return editRoute(w.tx, w.ctx, id(fd, "routeId", "route"), routeInput(fd));
  }, (route) => `Route ${route.number} · ${route.name} saved`);
}

export async function archiveRouteAction(_: S, fd: FormData): Promise<S> {
  const r = await trAction("archive", fd, async (w) => {
    need(w.can.routes, "archive routes");
    return archiveRoute(w.tx, w.ctx, id(fd, "routeId", "route"), w.today);
  }, (route) => (say(`Route ${route.number} · ${route.name} archived`, "It is kept with its history and can be restored.")));
  if (r?.ok) redirect(`${BASE}/routes`);
  return r;
}

export async function restoreRouteAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.routes, "restore routes");
    return restoreRoute(w.tx, w.ctx, id(fd, "routeId", "route"));
  }, (route) => `Route ${route.number} · ${route.name} restored`);
}

function stopInput(fd: FormData, perRoute: boolean) {
  const lat = num(fd, "lat", "Latitude", -90, 90);
  const lng = num(fd, "lng", "Longitude", -180, 180);
  return {
    name: text(fd, "name", "Stop name", { min: 2, max: 80 }),
    before: optionalId(fd, "before"),
    pickupMin: clock(fd, "pickup", "Pickup time")!,
    dropMin: clock(fd, "drop", "Drop time", false),
    lat, lng,
    feeTwoWayPaise: money(fd, "feeTwoWay", "Two-way fee", !perRoute),
    feeOneWayPaise: money(fd, "feeOneWay", "One-way fee", false),
  };
}

export async function addStopAction(_: S, fd: FormData): Promise<S> {
  return trAction("create", fd, async (w) => {
    need(w.can.routes, "add stops");
    const route = await w.tx.route.findFirst({ where: { id: id(fd, "routeId", "route"), archivedAt: null } });
    if (!route) throw new TransportProblem("Choose a route.", "routeId");
    const stop = await addStop(w.tx, w.ctx, route.id, stopInput(fd, route.feeTwoWayPaise != null));
    return { stop, route };
  }, ({ stop, route }) => (say(`${stop.name} added as stop ${stop.seq} on Route ${route.number}`, `Pickup ${clockOf(stop.pickupMin)}${stop.feeTwoWayPaise != null ? ` · ${formatRupees(stop.feeTwoWayPaise)} a month two-way` : ""}`)));
}

export async function editStopAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.routes, "change stops");
    const stopId = id(fd, "stopId", "stop");
    const s = await w.tx.stop.findFirst({ where: { id: stopId, archivedAt: null }, include: { route: true } });
    if (!s) throw new TransportProblem("This stop was not found.");
    const { before: _b, ...input } = stopInput(fd, s.route.feeTwoWayPaise != null);
    void _b;
    return editStop(w.tx, w.ctx, stopId, input);
  }, (stop) => `${stop.name} saved`);
}

export async function moveStopAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.routes, "reorder stops");
    const dir = str(fd, "dir") === "up" ? "up" : "down";
    return { ...(await moveStop(w.tx, w.ctx, id(fd, "stopId", "stop"), dir === "up" ? -1 : 1)), dir };
  }, (r) => (say(`${r.name} moved ${r.dir}`, "Pickup times stay as they were. Check them after reordering.")));
}

export async function archiveStopAction(_: S, fd: FormData): Promise<S> {
  return trAction("archive", fd, async (w) => {
    need(w.can.routes, "remove stops");
    return archiveStop(w.tx, w.ctx, id(fd, "stopId", "stop"), w.today);
  }, (s) => `${s.name} removed from the route`);
}

export async function copyEveningAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.routes, "set evening drop times");
    return copyForEvening(w.tx, w.ctx, id(fd, "routeId", "route"));
  }, (r) => (say("Evening drop copied in reverse order", `${plural(r.stops, "stop")}, first drop ${r.first} at ${clockOf(r.firstAt)}`)));
}

/* ---------- Vehicles, papers, vendors ---------- */

function vehicleInput(fd: FormData): VehicleInput {
  return {
    number: text(fd, "number", "Vehicle number", { min: 4, max: 20 }),
    label: maybe(fd, "label", "Short name", 30),
    type: str(fd, "type") || "BUS",
    model: maybe(fd, "model", "Make and model", 60),
    capacity: int(fd, "capacity", "Capacity (seats)", { min: 1, max: 100 })!,
    ownership: str(fd, "ownership") || "OWNED",
    vendorId: optionalId(fd, "vendorId"),
    status: str(fd, "status") || "ACTIVE",
    gpsDeviceId: maybe(fd, "gpsDeviceId", "GPS device", 40),
    odometerKm: int(fd, "odometerKm", "Odometer", { min: 0, max: 5_000_000, required: false }),
    serviceEveryKm: int(fd, "serviceEveryKm", "Service every (km)", { min: 500, max: 100_000, required: false }),
    serviceEveryDays: int(fd, "serviceEveryDays", "Service every (days)", { min: 7, max: 730, required: false }),
  };
}

export async function saveVehicleAction(_: S, fd: FormData): Promise<S> {
  const vehicleId = optionalId(fd, "vehicleId");
  return trAction(vehicleId ? "edit" : "create", fd, async (w) => {
    need(w.can.fleet, vehicleId ? "change vehicles" : "add vehicles");
    const input = vehicleInput(fd);
    // "Route and driver" (optional): sent only when the form shows the choice.
    const onRoute = fd.has("routeId") ? { routeId: optionalId(fd, "routeId"), driverId: optionalId(fd, "driverId") } : null;
    if (onRoute?.routeId) need(w.can.routes, "put vehicles on routes");
    let v;
    if (vehicleId) v = await editVehicle(w.tx, w.ctx, vehicleId, input, w.today);
    else {
      const papers = (["INSURANCE", "FITNESS", "PERMIT", "POLLUTION"] as const).flatMap((k) => {
        const d = date(fd, `paper_${k}`, `${paperLabel(k)} expiry`, false);
        return d ? [{ kind: k, expiresOn: d }] : [];
      });
      v = await addVehicle(w.tx, w.ctx, input, papers);
    }
    const route = onRoute && w.can.routes ? await putVehicleOnRoute(w.tx, w.ctx, v.id, onRoute.routeId, onRoute.driverId) : null;
    return { v, added: !vehicleId, route };
  }, ({ v, added, route }) => (added ? say(`${v.label ?? showPlate(v.number)} added`, route ? `Runs Route ${route.number} · ${route.name}.` : "Give it a route from Routes & Stops.") : `${v.label ?? showPlate(v.number)} saved`));
}

export async function archiveVehicleAction(_: S, fd: FormData): Promise<S> {
  return trAction("archive", fd, async (w) => {
    need(w.can.fleet, "archive vehicles");
    const vid = id(fd, "vehicleId", "vehicle");
    const v = await w.tx.vehicle.findFirst({ where: { id: vid } });
    await archiveVehicle(w.tx, w.ctx, vid);
    return v!;
  }, (v) => `${v.label ?? showPlate(v.number)} archived`);
}

export async function savePaperAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "upload vehicle papers");
    return savePaper(w.tx, w.ctx, { vehicleId: id(fd, "vehicleId", "vehicle"), kind: str(fd, "kind"), number: maybe(fd, "paperNo", "Certificate number", 40), expiresOn: date(fd, "expiresOn", "New expiry date")!, file: file(fd, "file") }, w.today);
  }, ({ doc, vehicle }) => (say(`${paperLabel(doc.kind)} saved for ${vehicle.label ?? showPlate(vehicle.number)}`, `Valid till ${formatDate(doc.expiresOn)}. Reminders go before it ends.`)));
}

export async function saveVendorAction(_: S, fd: FormData): Promise<S> {
  const vendorId = optionalId(fd, "vendorId");
  return trAction(vendorId ? "edit" : "create", fd, async (w) => {
    need(w.can.fleet, "add vendors");
    const acc = str(fd, "bankAccountNo").replace(/\s/g, "");
    return saveVendor(w.tx, w.ctx, vendorId, {
      name: text(fd, "name", "Company name", { min: 2, max: 80 }),
      contactName: maybe(fd, "contactName", "Contact person", 60),
      phone: phoneOf(fd, "phone") || null,
      email: maybe(fd, "email", "Email", 120),
      address: maybe(fd, "address", "Address", 300),
      gstin: maybe(fd, "gstin", "GSTIN", 15)?.toUpperCase() ?? null,
      bankName: w.can.vendorBank ? maybe(fd, "bankName", "Bank", 60) : null,
      bankAccountNo: w.can.vendorBank && acc ? acc : null,
      ifsc: w.can.vendorBank ? maybe(fd, "ifsc", "IFSC", 11)?.toUpperCase() ?? null : null,
      monthlyChargePaise: money(fd, "monthlyCharge", "Monthly charge", false),
      contractEnd: date(fd, "contractEnd", "Contract end", false),
    });
  }, (v) => `${v.name} saved`);
}

export async function archiveVendorAction(_: S, fd: FormData): Promise<S> {
  return trAction("archive", fd, async (w) => {
    need(w.can.fleet, "archive vendors");
    const vid = id(fd, "vendorId", "vendor");
    const v = await w.tx.transportVendor.findFirst({ where: { id: vid } });
    await archiveVendor(w.tx, w.ctx, vid);
    return v!;
  }, (v) => `${v.name} archived`);
}

/* ---------- Drivers and attendants ---------- */

function driverInput(fd: FormData) {
  return {
    name: text(fd, "name", "Full name", { min: 2, max: 80 }),
    phone: phoneOf(fd, "phone"),
    role: str(fd, "role") || "DRIVER",
    employment: str(fd, "employment") || "STAFF",
    vendorId: optionalId(fd, "vendorId"),
    licenceNo: maybe(fd, "licenceNo", "Licence number", 30),
    licenceExpiry: date(fd, "licenceExpiry", "Licence expiry", false),
  };
}

export async function addDriverAction(_: S, fd: FormData): Promise<S> {
  return trAction("create", fd, async (w) => {
    need(w.can.fleet, "add drivers");
    return addDriver(w.tx, w.ctx, { ...driverInput(fd), invite: bool(fd, "invite") });
  }, (r) => say(
    `${r.driver.name} added as ${r.driver.role === "DRIVER" ? "driver" : "attendant"}`,
    [r.staffNote, r.invite ? (r.invite.sent ? `Driver app invite sent to ${r.driver.phone}` : "The invite could not be sent now. Send it again from the list.") : r.usedStaffLogin ? "Signs in to the driver app with their staff login" : "No app invite sent"].filter(Boolean).join(" · "),
  ));
}

export async function editDriverAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "change drivers");
    return editDriver(w.tx, w.ctx, id(fd, "driverId", "driver"), driverInput(fd));
  }, (d) => `${d.name} saved`);
}

export async function sendInviteAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "send driver app invites");
    const d = await w.tx.driver.findFirst({ where: { id: id(fd, "driverId", "driver") } });
    const r = await sendAppInvite(w.tx, w.ctx, d!.id);
    return { d: d!, sent: r.sent };
  }, ({ d, sent }) => (sent ? say(`Driver app invite sent to ${d.phone}`, "A message with the app link and how to sign in.") : { message: say("The invite could not be sent now", "Check Communication, Message Settings, then send again."), tone: "danger" }));
}

/** Turning a login off signs the person out of every school; the other schools come from their access, outside the school's walls. */
export async function setAppLoginAction(_: S, fd: FormData): Promise<S> {
  const on = str(fd, "on") === "1";
  let others: string[] = [];
  try {
    const current = await requireCurrent();
    const driverId = id(fd, "driverId", "driver");
    const login = await inTransport("edit", async (w) => (await w.tx.driver.findFirst({ where: { id: driverId } }))?.userLoginId ?? null);
    if (login) others = (await schoolsFor(login)).map((s) => s.id).filter((x) => x !== current.ctx.schoolId);
  } catch (e) {
    return problemState(e, fd);
  }
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "turn driver app logins on or off");
    return setAppLogin(w.tx, w.ctx, id(fd, "driverId", "driver"), on, others);
  }, (d) => (on ? `${d.name} can sign in to the driver app again` : say(`${d.name} can no longer sign in to the driver app`, "Signed out at once. Their phone keys are turned off. Trip history stays.")));
}

export async function archiveDriverAction(_: S, fd: FormData): Promise<S> {
  let others: string[] = [];
  try {
    const current = await requireCurrent();
    const driverId = id(fd, "driverId", "driver");
    const login = await inTransport("archive", async (w) => (await w.tx.driver.findFirst({ where: { id: driverId } }))?.userLoginId ?? null);
    if (login) others = (await schoolsFor(login)).map((s) => s.id).filter((x) => x !== current.ctx.schoolId);
  } catch (e) {
    return problemState(e, fd);
  }
  return trAction("archive", fd, async (w) => {
    need(w.can.fleet, "remove drivers");
    const driverId = id(fd, "driverId", "driver");
    const d = await w.tx.driver.findFirst({ where: { id: driverId } });
    await archiveDriver(w.tx, w.ctx, driverId, others);
    return d!;
  }, (d) => (say(`${d.name} removed`, "Their trip history stays.")));
}

/** A key for one phone running the Android driver app; shown once, only its hash is kept. */
export async function issueKeyAction(_: S, fd: FormData): Promise<FormState<{ key: string; name: string; driver: string }>> {
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "set up driver phones");
    const driverId = id(fd, "driverId", "driver");
    const r = await issueDriverKey(w.tx, w.ctx, driverId, str(fd, "name"));
    const d = await w.tx.driver.findFirstOrThrow({ where: { id: driverId } });
    const states = await appStates(w.tx, [d]);
    if (states.get(d.id)?.state === "Disabled") throw new TransportProblem(`${d.name}'s app login is turned off. Turn it on first.`);
    return { key: r.key, name: r.device.name, driver: d.name };
  }, (r) => (say(`Key made for ${r.name}`, "Type it into the driver app now. It is shown only once.")), true);
}

export async function revokeKeyAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "turn off driver phones");
    await revokeDriverKey(w.tx, w.ctx, id(fd, "deviceId", "phone"));
    return null;
  }, () => (say("Phone key turned off", "That phone can no longer send locations or start trips.")));
}

/* ---------- Fuel and repairs ---------- */

export async function recordCostAction(_: S, fd: FormData): Promise<S> {
  return trAction("create", fd, async (w) => {
    need(w.can.fleet, "record fuel and repairs");
    const kind = str(fd, "kind");
    if (!["FUEL", "REPAIR", "SERVICE"].includes(kind)) throw new TransportProblem("Choose fuel, repair or service.", "kind");
    const litres = num(fd, "litres", "Litres", 0, 2000);
    return recordCost(w.tx, w.ctx, {
      vehicleId: id(fd, "vehicleId", "vehicle"), kind: kind as "FUEL" | "REPAIR" | "SERVICE", date: date(fd, "date", "Date")!,
      amountPaise: money(fd, "amount", "Amount")!, litres, odometerKm: int(fd, "odometerKm", "Odometer", { min: 0, max: 5_000_000, required: false }),
      what: maybe(fd, "what", kind === "FUEL" ? "Pump" : "What was done", 200), bill: file(fd, "bill"),
    }, w.today);
  }, (r) => (say(`${formatRupees(r.expense.amountPaise)} recorded for ${r.vehicle.label ?? showPlate(r.vehicle.number)}`, `Added to Finance, Expenses as ${r.expense.number}${r.outcome === "approved" ? "" : " · waiting for approval in Finance"}`)));
}

export async function cancelCostAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.fleet, "cancel fuel and repair entries");
    const kind = str(fd, "kind") === "fuel" ? "fuel" : "repair";
    await cancelCost(w.tx, w.ctx, kind, id(fd, "costId", "entry"), text(fd, "reason", "Reason", { min: 5, max: 200 }), w.today);
    return null;
  }, () => (say("Entry cancelled", "The expense in Finance is cancelled too. Both stay on record.")));
}

/* ---------- Student Transport ---------- */

export async function assignAction(_: S, fd: FormData): Promise<S> {
  return trAction("create", fd, async (w) => {
    need(w.can.students, "give students transport");
    const studentIds = ids(fd, "studentIds");
    if (!studentIds.length) throw new TransportProblem("Pick at least one student.", "studentIds");
    if (studentIds.length > 200) throw new TransportProblem("Pick up to 200 students at a time.", "studentIds");
    return assignStudents(w.tx, w.ctx, { studentIds, routeId: id(fd, "routeId", "route"), stopId: id(fd, "stopId", "stop"), type: str(fd, "type") || "TWO_WAY", fromDate: date(fd, "fromDate", "From date")!, reason: maybe(fd, "reason", "Note", 200) }, w.today);
  }, (r) => {
    const fee = r.placed.reduce((s, p) => s + p.fee.totalPaise, BigInt(0));
    const who = r.placed.length === 1 ? r.placed[0].name : `${r.placed.length} students`;
    return say(`${who}: Route ${r.route.number}, ${r.stop.name}`, `Transport fee ${formatRupees(r.monthlyPaise)} a month added to fees${fee > BigInt(0) ? ` (${formatRupees(fee)} this year)` : ""}.`);
  });
}

export async function changePlaceAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.students, "change students' transport");
    const assignmentIds = ids(fd, "assignmentIds");
    if (!assignmentIds.length) throw new TransportProblem("Pick at least one student.");
    const input = { routeId: id(fd, "routeId", "route"), stopId: id(fd, "stopId", "stop"), type: str(fd, "type") || "TWO_WAY", fromDate: date(fd, "fromDate", "From date")!, reason: text(fd, "reason", "Reason", { min: 3, max: 200 }) };
    let done = 0;
    let waiting = 0;
    let kept = "";
    for (const a of assignmentIds) {
      const r = await changePlace(w.tx, w.ctx, a, input, w.today);
      if (r.status === "done") { done++; kept += keptWords(r.removed); } else waiting++;
    }
    return { done, waiting, kept };
  }, (r) => (r.waiting && !r.done
    ? say(`${plural(r.waiting, "change")} sent for approval`, "Nothing changes until it is approved in Approvals.")
    : say(`Transport changed for ${plural(r.done, "student")}`, `The fee changes from the next period not yet charged.${r.waiting ? ` ${r.waiting} more waiting for approval.` : ""}${r.kept}`)));
}

export async function stopPlaceAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.students, "stop students' transport");
    const assignmentIds = ids(fd, "assignmentIds");
    if (!assignmentIds.length) throw new TransportProblem("Pick at least one student.");
    const input = { lastDate: date(fd, "lastDate", "Last day on the bus")!, reason: text(fd, "reason", "Reason", { min: 3, max: 200 }) };
    let done = 0;
    let waiting = 0;
    let removed = BigInt(0);
    let kept = "";
    for (const a of assignmentIds) {
      const r = await stopPlace(w.tx, w.ctx, a, input, w.today);
      if (r.status === "done") { done++; removed += r.removed.removedPaise; kept += keptWords(r.removed); } else waiting++;
    }
    return { done, waiting, removed, last: input.lastDate, kept };
  }, (r) => (r.waiting && !r.done
    ? say(`${plural(r.waiting, "request")} to stop transport sent for approval`, "Nothing changes until it is approved.")
    : say(`Transport stops for ${plural(r.done, "student")} after ${formatDate(r.last)}`, `${r.removed > BigInt(0) ? `${formatRupees(r.removed)} of fees still to come was removed.` : "No fee still to come had to be removed."}${r.waiting ? ` ${r.waiting} more waiting for approval.` : ""}${r.kept}`)));
}

/** A new academic year: carries the ticked bus places over (same route, stop and type; the new year's fees). */
export async function carryOverAction(_: S, fd: FormData): Promise<S> {
  return trAction("create", fd, async (w) => {
    need(w.can.students, "carry bus places over");
    return carryOver(w.tx, w.ctx, ids(fd, "placeIds"));
  }, (r) => say(`${plural(r.carried, "bus place")} carried over to ${r.year}, with new bus passes`, [
    r.feeRows ? `${formatRupees(r.feePaise)} of ${r.year} transport fees added (${plural(r.feeRows, "row")}).` : null,
    r.skipped.length ? `${plural(r.skipped.length, "place")} left as ${r.skipped.length === 1 ? "it was" : "they were"}: ${r.skipped.slice(0, 3).map((s) => `${s.name} (${s.why})`).join("; ")}${r.skipped.length > 3 ? "…" : ""}` : null,
  ].filter(Boolean).join(" ")));
}

/** Ends the ticked places at year end: students not coming back on the bus. */
export async function endAtYearEndAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.students, "end bus places");
    return endAtYearEnd(w.tx, w.ctx, ids(fd, "placeIds"));
  }, (r) => `${plural(r.ended, "bus place")} ended at year end. ${r.ended === 1 ? "It is" : "They are"} not carried over to ${r.year}.`);
}

export async function addFeeAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.students, "add transport fees");
    const list = ids(fd, "assignmentIds");
    if (!list.length) throw new TransportProblem("Pick at least one student.");
    let total = BigInt(0);
    let rows = 0;
    let had = 0;
    for (const a of list) {
      try {
        const r = await addMissingFee(w.tx, w.ctx, a, w.today);
        total += r.totalPaise;
        rows += r.added.length;
      } catch (e) {
        // In a bulk add, a student whose fee is already there is skipped (nothing was written for them).
        if (list.length > 1 && e instanceof TransportProblem) { had++; continue; }
        throw e;
      }
    }
    if (!rows) throw new TransportProblem(list.length > 1 ? "Every picked student already has the transport fee on their fees." : "This student already has the transport fee on their fees.");
    return { students: list.length - had, total, rows, had };
  }, (r) => (say(`Transport fee added for ${plural(r.students, "student")}`, `${plural(r.rows, "fee row")} in Fee Management, ${formatRupees(r.total)} in all.${r.had ? ` ${plural(r.had, "student")} already had it.` : ""}`)));
}

/* ---------- Trips ---------- */

export async function saveScheduleAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips, "set the trip schedule");
    const days = fd.getAll("days").map((d) => Number(d)).filter((d) => Number.isInteger(d));
    return saveSchedule(w.tx, w.ctx, { routeId: id(fd, "routeId", "route"), kind: str(fd, "kind"), vehicleId: optionalId(fd, "vehicleId"), driverId: optionalId(fd, "driverId"), attendantId: optionalId(fd, "attendantId"), startMin: clock(fd, "start", "Start time")!, days });
  }, ({ row, route }) => (say(`Route ${route.number} ${tripKind(row.kind).toLowerCase()} saved`, `Starts ${clockOf(row.startMin)}. Drivers see the change in their app.`)));
}

export async function changeForDayAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips, "change a trip for one day");
    return changeForDay(w.tx, w.ctx, { routeId: id(fd, "routeId", "route"), kind: str(fd, "kind"), date: date(fd, "date", "Date")!, vehicleId: optionalId(fd, "vehicleId"), driverId: optionalId(fd, "driverId"), note: maybe(fd, "note", "Note", 200) }, w.today);
  }, ({ trip, route }) => (say(`Route ${route.number} ${tripKind(trip.kind).toLowerCase()} changed for ${formatDate(trip.date)}`, "Only that day. The schedule stays the same.")));
}

export async function startTripAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips, "start trips");
    return startTrip(w.tx, w.ctx, id(fd, "tripId", "trip"), { userId: w.ctx.userId, source: "STAFF" }, w.now);
  }, () => (say("Trip started", "The bus shows on Live Tracking once the driver app sends its location.")));
}

export async function endTripAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips || w.can.live, "end trips");
    return endTrip(w.tx, w.ctx, id(fd, "tripId", "trip"), { userId: w.ctx.userId, source: "STAFF" }, w.now, w.tz);
  }, (r) => (say("Trip ended", `No more locations are kept for it.${r.missed ? ` ${plural(r.missed, "stop")} not reached marked missed.` : ""}`)));
}

export async function cancelTripAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips, "cancel trips");
    await cancelTrip(w.tx, w.ctx, id(fd, "tripId", "trip"), text(fd, "reason", "Reason", { min: 3, max: 200 }));
    return null;
  }, () => "Trip cancelled");
}

export async function markStopAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips, "mark stops reached");
    return markStop(w.tx, w.ctx, id(fd, "tripId", "trip"), id(fd, "stopId", "stop"), { userId: w.ctx.userId, source: "STAFF" }, w.now, "STAFF");
  }, () => "Stop marked reached");
}

export async function markBoardingAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.trips, "mark boarding");
    return markBoarding(w.tx, w.ctx, id(fd, "tripId", "trip"), id(fd, "studentId", "student"), str(fd, "status"), { userId: w.ctx.userId, source: "STAFF" }, w.now, w.tz);
  }, (e) => (e.status === "BOARDED" ? "Marked boarded" : e.status === "DROPPED" ? "Marked dropped" : "Marked not boarded"));
}

/* ---------- Live Tracking: alerts and messages to a route ---------- */

export async function closeAlertAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.live, "close alerts");
    return closeAlert(w.tx, w.ctx, id(fd, "alertId", "alert"), maybe(fd, "note", "Note", 200));
  }, () => "Alert closed");
}

/** The delay, emergency or typed message to a route's parents, sent only after the person confirmed it (12 §5). */
export async function messageRouteAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    const kind = (["delay", "emergency", "message"] as const).find((k) => k === str(fd, "kind")) ?? "message";
    need(kind === "emergency" ? w.can.emergencyMessage : w.can.live, kind === "emergency" ? "send the emergency message" : "message a route's parents");
    if (str(fd, "confirmed") !== "yes") throw new TransportProblem("Confirm the message before it is sent.");
    return messageRoute(w.tx, w.ctx, { routeId: id(fd, "routeId", "route"), text: str(fd, "text"), kind, alertId: optionalId(fd, "alertId"), tripId: optionalId(fd, "tripId") }, w.today);
  }, (r) => (r.repeated ? say("This message was already sent", "It was not sent twice.") : say(`Sent to ${plural(r.people, "parent")} of Route ${r.route.number}`, r.skipped.length ? `${r.skipped.reduce((s, g) => s + g.count, 0)} could not be reached. See Message History.` : "See Message History for delivery.")));
}

export async function remindAction(_: S, fd: FormData): Promise<S> {
  return trAction("view", fd, async (w) => {
    need(w.can.remind, "send reminders here");
    const link = str(fd, "link");
    return remindInCharge(w.tx, w.ctx, text(fd, "text", "Reminder", { min: 5, max: 300 }), link.startsWith(BASE) ? link : BASE);
  }, (n) => (say("Reminder sent to the Transport In-charge", n > 1 ? `${n} people have the role.` : undefined)));
}

/* ---------- Transport Settings ---------- */

const SETTING_NUMBERS = ["locationIntervalSec", "staleAfterSec", "offlineAfterMin", "overSpeedKmh", "deviationMeters", "schoolGeofenceMeters", "stopGeofenceMeters", "arrivingMinutes", "tripLeftRunningMin", "lateAfterMin", "feeDueDay", "expiryReminderDays"] as const;
const SETTING_SWITCHES = ["delaySuggestion", "boardingRequired", "showParentPhones"] as const;

export async function saveSettingsAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.settings, "change Transport Settings");
    const section = str(fd, "section");
    const input: Record<string, unknown> = {};
    for (const k of SETTING_NUMBERS) if (fd.has(k)) input[k] = (int(fd, k, "This", { min: -1_000_000, max: 1_000_000 }) ?? undefined) as number;
    if (fd.has("staleAfterMin")) input.staleAfterSec = (int(fd, "staleAfterMin", "Mark as old after", { min: 1, max: 10 }) ?? 2) * 60;
    for (const k of SETTING_SWITCHES) if (fd.has(`${k}__present`)) input[k] = bool(fd, k);
    if (fd.has("changeApproval")) input.changeApproval = str(fd, "changeApproval");
    if (fd.has("feeFrequency")) input.feeFrequency = str(fd, "feeFrequency");
    if (fd.has("noFeeMonths__present")) input.noFeeMonths = fd.getAll("noFeeMonths").map(Number).filter(Number.isInteger);
    if (fd.has("alertRoleKeys__present")) {
      const keys = fd.getAll("alertRoleKeys").map(String).filter((k) => /^[a-z0-9-]{2,40}$/.test(k));
      if (!keys.length) throw new TransportProblem("Pick at least one role to alert.", "alertRoleKeys");
      input.alertRoleKeys = keys;
    }
    if (fd.has("gpsProvider")) input.gpsProvider = maybe(fd, "gpsProvider", "GPS company", 60);
    if (fd.has("schoolLat") || fd.has("schoolLng")) {
      const lat = num(fd, "schoolLat", "Latitude", -90, 90);
      const lng = num(fd, "schoolLng", "Longitude", -180, 180);
      if ((lat == null) !== (lng == null)) throw new TransportProblem("Give both the latitude and the longitude, or neither.", "schoolLat");
      input.schoolLat = lat;
      input.schoolLng = lng;
    }
    const r = await saveSettings(w.tx, w.ctx, input);
    return { ...r, section };
  }, (r) => (r.changed.length ? say(`${r.section || "Transport Settings"} saved`, "Logged in the audit log.") : "Nothing was changed"));
}

export async function setLiveAction(_: S, fd: FormData): Promise<S> {
  return trAction("edit", fd, async (w) => {
    need(w.can.settings, "switch live tracking on or off");
    const on = str(fd, "on") === "1";
    await setLiveTracking(w.tx, w.ctx, on);
    return on;
  }, (on) => (on ? say("Live tracking is on", "Live Tracking shows the buses during trips.") : say("Live tracking is off", "Trips, stops and boarding still work. No map is shown.")));
}
