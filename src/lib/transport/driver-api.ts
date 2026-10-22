// The driver API (12 §2 Driver app, D11; 08 §7): what the Android driver
// app and the /driver page call. A driver is known in one of two ways:
//   - the phone's own key from Vehicles & Drivers ("Set up a phone"), sent
//     as "Authorization: Bearer sosdrv_..." with the school in ?s=. Only the
//     key's hash is stored; a turned-off key stops at once.
//   - his signed-in session (a User Login that belongs to a Driver record),
//     for the /driver page in the phone's browser.
// Every call is rate-limited per key or login, needs Transport switched on
// for the school, and works only on the driver's own trips today.
import "server-only";

import type { Driver, DriverDevice } from "@prisma/client";
import { getCurrent, isPaused } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { OPEN_LINK } from "../students/guardian-access";
import { todayDate } from "../front-office/time";
import { hitLimit } from "../rate-limit";
import { hashKey } from "./fleet";
import { transportOn, transportSettings, type TrSettings } from "./settings";
import { driverOf, driverTrips, tripSheet } from "./trips";
import { clockOf, showPlate, tripKind } from "./words";

export const DRIVER_KEY_RE = /^sosdrv_[\w-]{20,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Requests per key or login per minute: a point batch every 30 seconds, plus taps, with room to send a queue after being offline. */
export const DRIVER_LIMIT_PER_MINUTE = 90;
/** Points in one batch: 12 hours offline at the 30-second interval would be 1,440, so the app sends the queue in parts. */
export const MAX_POINTS = 500;

/** The rate-limit counter of one phone key. */
export const driverKeyLimit = (keyHash: string) => `driver-key:${keyHash.slice(0, 32)}`;

export const reply = (status: number, body: object, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export type DriverCaller = {
  ctx: SchoolContext;
  driver: Driver;
  device: DriverDevice | null;
  tz: string;
  /** The User Login the driver signs in with (null for a hired driver with only a phone key). */
  userId: string | null;
  via: "key" | "session";
};

/** Who is calling, or the plain refusal to send back. */
export async function driverCaller(request: Request): Promise<{ problem: Response } | DriverCaller> {
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  if (key) {
    const schoolId = url.searchParams.get("s") ?? request.headers.get("x-school") ?? "";
    if (!UUID.test(schoolId) || !DRIVER_KEY_RE.test(key)) return { problem: reply(401, { problem: "Send the phone's key as 'Authorization: Bearer <key>' and the school in ?s=." }) };
    const keyHash = hashKey(key);
    const limit = await hitLimit(driverKeyLimit(keyHash), DRIVER_LIMIT_PER_MINUTE, 60);
    if (!limit.ok) return { problem: reply(429, { problem: "Too many requests from this phone. Send locations in batches." }, { "Retry-After": String(limit.retryAfterSeconds) }) };
    const ctx: SchoolContext = { schoolId, userId: null };
    const found = await withSchool(ctx, async (tx) => {
      const device = await tx.driverDevice.findFirst({ where: { keyHash, revokedAt: null } });
      if (!device) return null;
      const driver = await tx.driver.findFirst({ where: { id: device.driverId, archivedAt: null, status: "ACTIVE" } });
      const school = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true, status: true } });
      return { device, driver, on: await transportOn(tx, ctx), tz: school?.timeZone ?? "Asia/Kolkata", paused: school?.status === "SUSPENDED" || school?.status === "CLOSED" };
    });
    if (!found) return { problem: reply(401, { problem: "This phone's key is not valid. It may have been turned off; ask the Transport In-charge for a new one." }) };
    if (!found.driver) return { problem: reply(403, { problem: "This driver is not active. Ask the Transport In-charge." }) };
    if (!found.on || found.paused) return { problem: reply(403, { problem: "Transport is switched off for this school." }) };
    return { ctx: { schoolId, userId: found.driver.userLoginId }, driver: found.driver, device: found.device, tz: found.tz, userId: found.driver.userLoginId, via: "key" };
  }

  const current = await getCurrent();
  if (!current) return { problem: reply(401, { problem: "Sign in first, or send the phone's key." }) };
  // A signed-in browser may only call from this site (no other site can post with the person's cookie).
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if ((site && site !== "same-origin") || (origin && new URL(origin).host !== url.host)) return { problem: reply(403, { problem: "Refused: this request did not come from School OS." }) };
  }
  const limit = await hitLimit(`driver-login:${current.user.id}`, DRIVER_LIMIT_PER_MINUTE, 60);
  if (!limit.ok) return { problem: reply(429, { problem: "Too many requests. Wait a moment." }, { "Retry-After": String(limit.retryAfterSeconds) }) };
  if (!current.modulesOn.has("transport-management") || isPaused(current)) return { problem: reply(403, { problem: "Transport is switched off for this school." }) };
  const driver = await withSchool(current.ctx, (tx) => driverOf(tx, current.user.id));
  if (!driver) return { problem: reply(403, { problem: "This login does not belong to a driver. The driver app is for drivers and attendants." }) };
  return { ctx: current.ctx, driver, device: null, tz: current.school.timeZone, userId: current.user.id, via: "session" };
}

/** A trip id from the body, or null. */
export const tripIdOf = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
export const uuidOf = tripIdOf;

/** Today's trips for the driver, each with its stops and the students at each stop. */
export async function driverToday(tx: Tx, c: DriverCaller, now: Date) {
  const today = todayDate(c.tz, now);
  const settings: TrSettings = await transportSettings(tx, c.ctx);
  const trips = await driverTrips(tx, c.ctx, c.driver.id, today);
  const sheets = await Promise.all(trips.map((t) => tripSheet(tx, t)));
  // Parents' phones only when the school allows it (Transport Settings).
  const studentIds = sheets.flatMap((s) => s.stops.flatMap((x) => x.students.map((k) => k.id)));
  const phones = new Map<string, string>();
  if (settings.showParentPhones && studentIds.length) {
    const links = await tx.studentGuardian.findMany({ where: { studentId: { in: studentIds }, ...OPEN_LINK }, orderBy: { isPrimary: "desc" }, select: { studentId: true, guardian: { select: { phone: true } } } });
    for (const l of links) if (!phones.has(l.studentId)) phones.set(l.studentId, l.guardian.phone);
  }
  return {
    driver: { id: c.driver.id, name: c.driver.name, role: c.driver.role },
    date: today.toISOString().slice(0, 10),
    /** The school's time zone: the app shows times in it, whatever the phone is set to. */
    timeZone: c.tz,
    settings: { intervalSec: settings.locationIntervalSec, boardingRequired: settings.boardingRequired, stopGeofenceMeters: settings.stopGeofenceMeters },
    trips: sheets.map((s) => ({
      id: s.trip.id, kind: s.trip.kind, title: `Route ${s.route.number} · ${tripKind(s.trip.kind)}`, route: { number: s.route.number, name: s.route.name },
      status: s.trip.status, plannedStart: clockOf(s.trip.plannedStartMin), startedAt: s.trip.startedAt, endedAt: s.trip.endedAt,
      vehicle: s.vehicle ? { number: showPlate(s.vehicle.number), label: s.vehicle.label } : null,
      stops: s.stops.map((x) => ({
        id: x.id, name: x.name, planned: clockOf(x.planned), lat: x.lat, lng: x.lng, reached: x.reached ? { status: x.reached.status, at: x.reached.at } : null,
        students: x.students.map((k) => ({ id: k.id, name: k.name, status: k.status, phone: phones.get(k.id) ?? null })),
      })),
    })),
  };
}
