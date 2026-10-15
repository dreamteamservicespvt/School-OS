// Transport Management demo (Sunrise only; Transport stays off for Green
// Valley, as for every school until it is switched on). Sunrise switches
// Transport and live tracking on, with: a vendor, three buses and a van with
// their papers (one expiring soon, one expired), drivers and attendants (one
// licence near expiry), four routes in Kukatpally and around with stop-wise
// fees, the trip schedule, about seventy students with their stops and the
// transport fee on their fees from go-live (1 Apr 2026), two students with
// no fee yet (the coverage check), the last two weeks of trips with stop
// times, boarding and the bus's path, today's buses on the road (one moving,
// one at a stop, one offline with an open alert), fuel and repairs sent to
// Finance, and a "driver" login for the driver page. Times follow the moment
// the demo is seeded.
import sharp from "sharp";
import { prisma, withSchool, type SchoolContext, type Tx } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { isHoliday } from "../../src/lib/academic/calendar";
import { weekday } from "../../src/lib/academic/common";
import { STUDYING } from "../../src/lib/students/labels";
import { addDriver, addVehicle, recordCost, saveVendor } from "../../src/lib/transport/fleet";
import { addRoute, addStop } from "../../src/lib/transport/routes";
import { assignStudents, onBusOn } from "../../src/lib/transport/places";
import { ensureTrips, plannedMinOf, saveSchedule } from "../../src/lib/transport/trips";
import { saveSettings } from "../../src/lib/transport/settings";
import { showPlate } from "../../src/lib/transport/words";
import type { SeedSchool } from "./types";

const OFFSET = 330 * 60_000; // Asia/Kolkata
const DAY = 86_400_000;
const todayIso = (days = 0) => new Date(Date.now() + OFFSET + days * DAY).toISOString().slice(0, 10);
const dateOf = (days: number) => new Date(`${todayIso(days)}T00:00:00Z`);
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** A school-time minute of a day as an instant. */
const instant = (day: Date, minute: number) => new Date(day.getTime() + minute * 60_000 - OFFSET);
const nowMinute = () => { const n = new Date(Date.now() + OFFSET); return n.getUTCHours() * 60 + n.getUTCMinutes(); };
const paise = (rupees: number) => BigInt(rupees * 100);

/** A steady pseudo-random series, so the demo looks the same each time. */
function seeded(start: number) {
  let x = start;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

const SCHOOL = { lat: 17.4849, lng: 78.4138 };

/** A photo of a bill (Finance asks for the bill above ₹2,000). */
async function billFile(shop: string, what: string, rupees: number, n: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="420" height="300" fill="#fbfaf6"/>
<text x="24" y="44" font-family="sans-serif" font-size="20" font-weight="bold" fill="#222">${shop}</text>
<text x="24" y="74" font-family="sans-serif" font-size="13" fill="#555">Bill no. ${1200 + n} · Kukatpally, Hyderabad</text>
<line x1="24" y1="92" x2="396" y2="92" stroke="#ccc"/>
<text x="24" y="130" font-family="sans-serif" font-size="15" fill="#222">${what}</text>
<text x="24" y="190" font-family="sans-serif" font-size="22" font-weight="bold" fill="#222">Total Rs. ${rupees.toLocaleString("en-IN")}</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toBuffer();
  return new File([new Uint8Array(buf)], `bill-${1200 + n}.jpg`, { type: "image/jpeg" });
}

type StopPlan = { name: string; min: number; lat: number; lng: number; fee: number; one?: number };
type RoutePlan = { name: string; vehicle: number; driver: number; attendant: number | null; arrival: number; depart: number; routeFee?: [number, number]; stops: StopPlan[]; students: number };

const ROUTES: RoutePlan[] = [
  {
    name: "KPHB Colony", vehicle: 0, driver: 0, attendant: 0, arrival: 8 * 60 + 25, depart: 15 * 60 + 30, students: 22,
    stops: [
      { name: "KPHB Phase 9", min: 7 * 60 + 15, lat: 17.4980, lng: 78.3870, fee: 1800, one: 1100 },
      { name: "JNTU Gate", min: 7 * 60 + 24, lat: 17.4935, lng: 78.3915, fee: 1700, one: 1000 },
      { name: "Vasanth Nagar", min: 7 * 60 + 33, lat: 17.4905, lng: 78.3985, fee: 1600, one: 1000 },
      { name: "Kukatpally Housing Board", min: 7 * 60 + 42, lat: 17.4878, lng: 78.4040, fee: 1500, one: 900 },
      { name: "Kukatpally Y Junction", min: 7 * 60 + 52, lat: 17.4860, lng: 78.4095, fee: 1400, one: 900 },
    ],
  },
  {
    name: "Miyapur and Chandanagar", vehicle: 1, driver: 1, attendant: 1, arrival: 8 * 60 + 25, depart: 15 * 60 + 30, students: 20,
    stops: [
      { name: "Miyapur Metro", min: 7 * 60 + 5, lat: 17.4968, lng: 78.3576, fee: 2000, one: 1200 },
      { name: "Madinaguda", min: 7 * 60 + 15, lat: 17.4930, lng: 78.3680, fee: 1900, one: 1150 },
      { name: "Hafeezpet", min: 7 * 60 + 27, lat: 17.4810, lng: 78.3750, fee: 1800, one: 1100 },
      { name: "Allwyn Colony", min: 7 * 60 + 40, lat: 17.4880, lng: 78.3910, fee: 1700, one: 1000 },
      { name: "Moosapet", min: 7 * 60 + 55, lat: 17.4720, lng: 78.4240, fee: 1500, one: 900 },
    ],
  },
  {
    name: "Ameerpet and SR Nagar", vehicle: 2, driver: 2, attendant: null, arrival: 8 * 60 + 25, depart: 15 * 60 + 40, students: 16,
    stops: [
      { name: "Ameerpet Metro", min: 7 * 60 + 20, lat: 17.4375, lng: 78.4482, fee: 1900, one: 1150 },
      { name: "SR Nagar", min: 7 * 60 + 30, lat: 17.4432, lng: 78.4430, fee: 1800, one: 1100 },
      { name: "Erragadda", min: 7 * 60 + 42, lat: 17.4570, lng: 78.4320, fee: 1700, one: 1000 },
      { name: "Bharat Nagar", min: 7 * 60 + 55, lat: 17.4660, lng: 78.4280, fee: 1500, one: 900 },
    ],
  },
  {
    name: "Balanagar", vehicle: 3, driver: 3, attendant: null, arrival: 8 * 60 + 20, depart: 15 * 60 + 35, routeFee: [1500, 1000], students: 10,
    stops: [
      { name: "Balanagar Main Road", min: 7 * 60 + 35, lat: 17.4700, lng: 78.4460, fee: 0 },
      { name: "Fatehnagar", min: 7 * 60 + 45, lat: 17.4630, lng: 78.4560, fee: 0 },
      { name: "Shanthi Nagar", min: 7 * 60 + 58, lat: 17.4780, lng: 78.4300, fee: 0 },
    ],
  },
];

async function ensureDesignation(tx: Tx, schoolId: string, name: string) {
  if (!(await tx.designation.findFirst({ where: { name, archivedAt: null } }))) await tx.designation.create({ data: { schoolId, name, staffType: "Non-teaching", sortOrder: 90 } });
}

/** Points along a line through the stops, every 30 seconds, from one instant to another. */
function pathPoints(line: { lat: number; lng: number }[], from: Date, to: Date, upTo = 1, rnd = seeded(7)) {
  const steps = Math.max(2, Math.floor((to.getTime() - from.getTime()) / 30_000));
  const segs = line.length - 1;
  const out: { at: Date; lat: number; lng: number; speedKmh: number; heading: number; accuracyM: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * upTo * segs;
    const k = Math.min(segs - 1, Math.floor(f));
    const t = f - k;
    const a = line[k];
    const b = line[k + 1];
    const atStop = t < 0.06 || t > 0.94;
    out.push({
      at: new Date(from.getTime() + i * 30_000), lat: a.lat + (b.lat - a.lat) * t + (rnd() - 0.5) * 0.0002, lng: a.lng + (b.lng - a.lng) * t + (rnd() - 0.5) * 0.0002,
      speedKmh: atStop ? Math.round(rnd() * 4) : Math.round(18 + rnd() * 20), heading: Math.round(Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI + 360) % 360, accuracyM: Math.round(5 + rnd() * 10),
    });
  }
  return out;
}

export async function seedTransport(school: SeedSchool) {
  if (!school.full) return;
  const { schoolId } = school;
  const sys: SchoolContext = { schoolId, userId: null };
  const inCharge = school.users.transport ?? school.users.principal;
  const ctx: SchoolContext = { schoolId, userId: inCharge };
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env first.");
  const rnd = seeded(42);

  const made = await withSchool(sys, async (tx) => {
    // Transport on for this school, and live tracking (each its own switch).
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId, moduleKey: "transport-management" } }, create: { schoolId, moduleKey: "transport-management", isOn: true }, update: { isOn: true } });
    await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId, featureKey: "transport-live-tracking" } }, create: { schoolId, featureKey: "transport-live-tracking", isOn: true }, update: { isOn: true } });
    await tx.transportSetting.upsert({ where: { schoolId }, create: { schoolId }, update: {} });
    await saveSettings(tx, ctx, { schoolLat: SCHOOL.lat, schoolLng: SCHOOL.lng, noFeeMonths: [5], changeApproval: "ROUTE" });
    await ensureDesignation(tx, schoolId, "Driver");
    await ensureDesignation(tx, schoolId, "Attendant");

    const vendor = await saveVendor(tx, ctx, null, { name: "Sri Balaji Travels", contactName: "K. Srinivas", phone: "9849022114", email: null, address: "Plot 14, IDPL Colony, Balanagar, Hyderabad", gstin: "36ABCPS1234K1Z5", bankName: null, bankAccountNo: null, ifsc: null, monthlyChargePaise: paise(48000), contractEnd: d("2027-03-31") });

    const today = dateOf(0);
    const vehicles = [];
    const fleet = [
      { number: "TS07UB2236", label: "Bus 1", type: "BUS", model: "Tata Starbus Ultra", capacity: 40, ownership: "OWNED", odo: 48_200, papers: { INSURANCE: 210, FITNESS: 160, PERMIT: 300, POLLUTION: 90 } },
      { number: "TS08EK4417", label: "Bus 2", type: "BUS", model: "Ashok Leyland Lynx", capacity: 42, ownership: "OWNED", odo: 61_750, papers: { INSURANCE: 18, FITNESS: 140, PERMIT: 260, POLLUTION: 45 } },
      { number: "TS09FA7781", label: "Bus 3", type: "BUS", model: "Eicher Skyline Pro", capacity: 32, ownership: "HIRED", odo: 83_400, papers: { INSURANCE: 120, FITNESS: 75, PERMIT: 190, POLLUTION: 60 } },
      { number: "TS10GB1290", label: "Van 1", type: "VAN", model: "Force Traveller", capacity: 16, ownership: "OWNED", odo: 37_900, papers: { INSURANCE: 230, FITNESS: 200, PERMIT: 280, POLLUTION: -4 } },
    ];
    for (const f of fleet) {
      const v = await addVehicle(tx, ctx, { number: f.number, label: f.label, type: f.type, model: f.model, capacity: f.capacity, ownership: f.ownership, vendorId: f.ownership === "HIRED" ? vendor.id : null, status: "ACTIVE", gpsDeviceId: null, odometerKm: f.odo, serviceEveryKm: 10_000, serviceEveryDays: 180 },
        Object.entries(f.papers).map(([kind, days]) => ({ kind, expiresOn: new Date(today.getTime() + days * DAY) })));
      await tx.vehicle.update({ where: { id: v.id }, data: { lastServiceOn: d("2026-07-10"), lastServiceKm: f.odo - 7_200 } });
      vehicles.push(v);
    }

    const people = [
      { name: "Ramesh Goud", phone: "9701100101", role: "DRIVER", employment: "STAFF", licenceNo: "TS0720190012345", licenceExpiry: d("2029-02-14") },
      { name: "Venkat Reddy", phone: "9701100102", role: "DRIVER", employment: "STAFF", licenceNo: "TS0820150054321", licenceExpiry: new Date(today.getTime() + 24 * DAY) },
      { name: "Srinu Naik", phone: "9701100103", role: "DRIVER", employment: "HIRED", licenceNo: "TS0920170067890", licenceExpiry: d("2028-08-30") },
      { name: "Mallesh Yadav", phone: "9701100104", role: "DRIVER", employment: "STAFF", licenceNo: "TS1020180024680", licenceExpiry: d("2030-01-05") },
      { name: "Lakshmi Bai", phone: "9701100111", role: "ATTENDANT", employment: "STAFF", licenceNo: null, licenceExpiry: null },
      { name: "Saroja Devi", phone: "9701100112", role: "ATTENDANT", employment: "STAFF", licenceNo: null, licenceExpiry: null },
    ];
    const crew = [];
    for (const p of people) {
      const r = await addDriver(tx, ctx, { ...p, vendorId: p.employment === "HIRED" ? vendor.id : null, invite: false });
      crew.push(r.driver);
    }
    const drivers = crew.filter((c) => c.role === "DRIVER");
    const attendants = crew.filter((c) => c.role === "ATTENDANT");

    // Routes, stops and the trip schedule.
    const routes = [];
    for (const r of ROUTES) {
      const route = await addRoute(tx, ctx, {
        name: r.name, vehicleId: vehicles[r.vehicle].id, driverId: drivers[r.driver].id, attendantId: r.attendant != null ? attendants[r.attendant].id : null,
        feeTwoWayPaise: r.routeFee ? paise(r.routeFee[0]) : null, feeOneWayPaise: r.routeFee ? paise(r.routeFee[1]) : null, schoolArrivalMin: r.arrival, eveningDepartMin: r.depart,
      });
      for (const s of r.stops) {
        await addStop(tx, ctx, route.id, { name: s.name, before: null, pickupMin: s.min, dropMin: null, lat: s.lat, lng: s.lng, feeTwoWayPaise: s.fee ? paise(s.fee) : null, feeOneWayPaise: s.one ? paise(s.one) : null });
      }
      for (const kind of ["MORNING", "EVENING"] as const) {
        await saveSchedule(tx, ctx, { routeId: route.id, kind, vehicleId: null, driverId: null, attendantId: null, startMin: kind === "MORNING" ? r.stops[0].min - 10 : r.depart, days: [1, 2, 3, 4, 5, 6] });
      }
      routes.push({ plan: r, route });
    }
    return { vehicles, drivers, attendants, routes, vendorId: vendor.id };
  }, { timeout: 120_000 });

  // A login for the driver page: Ramesh Goud, a staff driver, with the Driver role.
  const hash = await hashPassword(password);
  const driverLogin = (await prisma.userLogin.findUnique({ where: { username: "driver" } }))?.id
    ?? (await prisma.userLogin.create({ data: { username: "driver", displayName: "Ramesh Goud", phone: "9701100101", status: "ACTIVE", passwordHash: hash, passwordChangedAt: new Date() } })).id;
  school.users.driver = driverLogin;
  await withSchool(sys, async (tx) => {
    await tx.role.updateMany({ where: { key: "driver" }, data: { isEnabled: true } });
    const role = await tx.role.findFirstOrThrow({ where: { key: "driver" } });
    if (!(await tx.schoolAccess.findFirst({ where: { userLoginId: driverLogin } }))) {
      await tx.schoolAccess.create({ data: { schoolId, userLoginId: driverLogin, roles: { create: [{ roleId: role.id, schoolId }] } } });
    }
    const ramesh = made.drivers[0];
    await tx.driver.update({ where: { id: ramesh.id }, data: { userLoginId: driverLogin } });
    if (ramesh.staffId) await tx.staff.update({ where: { id: ramesh.staffId }, data: { userLoginId: driverLogin } });
  });

  // Students on the buses from go-live (1 Apr 2026), with the fee on their fees (A12).
  await withSchool(sys, async (tx) => {
    const students = await tx.student.findMany({ where: { archivedAt: null, status: { in: [...STUDYING] } }, orderBy: { admissionNo: "asc" }, select: { id: true } });
    let i = 0;
    const take = (n: number) => { const out = students.slice(i, i + n).map((s) => s.id); i += n; return out; };
    for (const r of made.routes) {
      const stops = await tx.stop.findMany({ where: { routeId: r.route.id, archivedAt: null }, orderBy: { seq: "asc" } });
      const ids = take(r.plan.students);
      // Spread over the stops; a few one-way; most from go-live, some joined later.
      for (let k = 0; k < ids.length; k++) {
        const stop = stops[k % stops.length];
        const type = k % 11 === 5 ? "PICKUP_ONLY" : k % 13 === 7 ? "DROP_ONLY" : "TWO_WAY";
        const from = k % 7 === 3 ? d("2026-06-15") : d("2026-04-01");
        await assignStudents(tx, ctx, { studentIds: [ids[k]], routeId: r.route.id, stopId: stop.id, type, fromDate: from, reason: null }, dateOf(0));
      }
    }
    // Two students on a bus whose fee was never added (the coverage check finds them).
    const late = take(2);
    const r0 = made.routes[0];
    const s0 = await tx.stop.findFirstOrThrow({ where: { routeId: r0.route.id, archivedAt: null }, orderBy: { seq: "desc" } });
    const year = await tx.academicYear.findFirstOrThrow({ where: { id: school.yearId } });
    for (const sid of late) {
      await tx.transportAssignment.create({ data: { schoolId, studentId: sid, academicYearId: year.id, routeId: r0.route.id, stopId: s0.id, type: "TWO_WAY", fromDate: d("2026-09-01"), status: "ACTIVE", monthlyFeePaise: s0.feeTwoWayPaise ?? paise(1400), createdById: ctx.userId } });
    }
    // One student starting next week (a future place holds a seat).
    const next = take(1);
    const r1 = made.routes[1];
    const s1 = await tx.stop.findFirstOrThrow({ where: { routeId: r1.route.id, archivedAt: null }, orderBy: { seq: "asc" } });
    await assignStudents(tx, ctx, { studentIds: next, routeId: r1.route.id, stopId: s1.id, type: "TWO_WAY", fromDate: dateOf(6), reason: "New admission" }, dateOf(0));
  }, { timeout: 300_000 });

  // The last two weeks of trips, and today's.
  await withSchool(sys, async (tx) => {
    const routes = await tx.route.findMany({ where: { archivedAt: null }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } } }, orderBy: { number: "asc" } });
    const lineOf = (stops: { lat: number | null; lng: number | null }[], kind: string) => {
      const placed = stops.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
      return kind === "MORNING" ? [...placed, SCHOOL] : [SCHOOL, ...placed.reverse()];
    };
    const riders = async (routeId: string, kind: string, day: Date) => tx.transportAssignment.findMany({
      where: { routeId, ...onBusOn(day), type: { in: kind === "MORNING" ? ["TWO_WAY", "PICKUP_ONLY"] : ["TWO_WAY", "DROP_ONLY"] } }, select: { studentId: true, stopId: true },
    });

    /** A finished trip: started on time or a little late, every stop reached, boarding marked, path kept for the last three days. */
    async function completeTrip(t: { id: string; kind: string; plannedStartMin: number; date: Date; routeId: string }, withPath: boolean) {
      const route = routes.find((r) => r.id === t.routeId)!;
      const ordered = t.kind === "MORNING" ? route.stops : [...route.stops].reverse();
      const late = rnd() < 0.15 ? 8 + Math.round(rnd() * 8) : Math.round(rnd() * 4);
      const startedAt = instant(t.date, t.plannedStartMin + Math.min(late, 3));
      const events = ordered.map((s) => {
        const planned = plannedMinOf(s, t.kind, route, route.stops);
        return { schoolId, tripId: t.id, stopId: s.id, status: "REACHED", at: instant(t.date, planned + late - 1 + Math.round(rnd() * 3)), source: rnd() < 0.7 ? "GEOFENCE" : "APP", plannedMin: planned };
      });
      const endedAt = new Date(events[events.length - 1].at.getTime() + (t.kind === "MORNING" ? 18 : 6) * 60_000);
      await tx.tripStopEvent.createMany({ data: events });
      const rs = await riders(route.id, t.kind, t.date);
      await tx.boardingEvent.createMany({
        data: rs.map((r) => {
          const ev = events.find((e) => e.stopId === r.stopId)!;
          const absent = rnd() < 0.06;
          return { schoolId, tripId: t.id, studentId: r.studentId, stopId: r.stopId, status: absent ? "NOT_BOARDED" : "DROPPED", at: t.kind === "MORNING" && !absent ? endedAt : ev.at, createdById: null };
        }),
      });
      let points: ReturnType<typeof pathPoints> = [];
      if (withPath) {
        points = pathPoints(lineOf(route.stops, t.kind), startedAt, new Date(endedAt.getTime() - 60_000), 1, rnd);
        await tx.gpsPoint.createMany({ data: points.map((p) => ({ schoolId, tripId: t.id, ...p })) });
      }
      const last = points[points.length - 1];
      await tx.trip.update({ where: { id: t.id }, data: { status: "COMPLETED", startedAt, endedAt, startedById: null, endedById: null, pointsAccepted: points.length, ...(last ? { lastLat: last.lat, lastLng: last.lng, lastSpeedKmh: 0, lastPointAt: last.at } : {}) } });
    }

    for (let back = 14; back >= 1; back--) {
      const day = dateOf(-back);
      if (weekday(day) === 7 || (await isHoliday(tx, ctx, day))) continue;
      await ensureTrips(tx, ctx, day);
      const trips = await tx.trip.findMany({ where: { date: day, status: "SCHEDULED" } });
      for (const t of trips) await completeTrip(t, back <= 3);
    }

    // Today: the trips of the part of the day now on the road; the earlier ones done.
    const today = dateOf(0);
    if (weekday(today) === 7 || (await isHoliday(tx, ctx, today))) return;
    await ensureTrips(tx, ctx, today);
    const nowMin = nowMinute();
    const kindNow = nowMin < 12 * 60 ? "MORNING" : "EVENING";
    const trips = await tx.trip.findMany({ where: { date: today }, orderBy: { plannedStartMin: "asc" } });
    for (const t of trips.filter((x) => x.kind === "MORNING" && kindNow === "EVENING")) await completeTrip(t, true);
    const now = Date.now();
    const running = trips.filter((x) => x.kind === kindNow);
    for (const [n, t] of running.entries()) {
      if (n === 3) break; // the last route has not started yet
      const route = routes.find((r) => r.id === t.routeId)!;
      const ordered = kindNow === "MORNING" ? route.stops : [...route.stops].reverse();
      const startedAt = new Date(now - 26 * 60_000);
      // Route 1 moving now, Route 2 waiting at a stop, Route 3 has gone quiet (offline).
      const lastAt = new Date(now - (n === 0 ? 15_000 : n === 1 ? 40_000 : 9 * 60_000));
      const share = n === 0 ? 0.55 : n === 1 ? 0.4 : 0.3;
      const points = pathPoints(lineOf(route.stops, t.kind), startedAt, lastAt, share, rnd);
      if (n === 1) points[points.length - 1].speedKmh = 0;
      await tx.gpsPoint.createMany({ data: points.map((p) => ({ schoolId, tripId: t.id, ...p })) });
      const passed = Math.max(1, Math.floor(share * ordered.length));
      const events = ordered.slice(0, passed).map((s, k) => {
        const planned = plannedMinOf(s, t.kind, route, route.stops);
        return { schoolId, tripId: t.id, stopId: s.id, status: "REACHED", at: new Date(startedAt.getTime() + (k + 1) * 6 * 60_000), source: "GEOFENCE", plannedMin: planned };
      });
      await tx.tripStopEvent.createMany({ data: events });
      const rs = (await riders(route.id, t.kind, today)).filter((r) => events.some((e) => e.stopId === r.stopId));
      await tx.boardingEvent.createMany({
        data: rs.map((r, k) => ({ schoolId, tripId: t.id, studentId: r.studentId, stopId: r.stopId, status: k === 2 ? "NOT_BOARDED" : kindNow === "MORNING" ? "BOARDED" : "DROPPED", at: events.find((e) => e.stopId === r.stopId)!.at, createdById: null })),
      });
      const last = points[points.length - 1];
      await tx.trip.update({ where: { id: t.id }, data: { status: "STARTED", startedAt, startedById: driverLogin, pointsAccepted: points.length, lastLat: last.lat, lastLng: last.lng, lastSpeedKmh: last.speedKmh, lastPointAt: last.at } });
      if (n === 2) {
        const v = made.vehicles[2];
        await tx.transportAlert.create({ data: { schoolId, tripId: t.id, routeId: route.id, vehicleId: v.id, kind: "OFFLINE", text: `Route ${route.number}: no location since ${new Date(lastAt.getTime() + OFFSET).toISOString().slice(11, 16)} (${showPlate(v.number)})`, lat: last.lat, lng: last.lng, at: new Date(lastAt.getTime() + 5 * 60_000), onceKey: `offline:${t.id}:${lastAt.getTime()}` } });
      }
    }
  }, { timeout: 300_000 });

  // Alerts from the past days, closed; fuel and repairs to Finance.
  await withSchool(sys, async (tx) => {
    const routes = await tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" } });
    const past = await tx.trip.findMany({ where: { status: "COMPLETED", date: { lt: dateOf(0) } }, orderBy: { date: "desc" }, take: 20 });
    const pick = (k: number) => past[k % Math.max(1, past.length)];
    if (past.length) {
      const a = pick(2);
      const r = routes.find((x) => x.id === a.routeId)!;
      await tx.transportAlert.create({ data: { schoolId, tripId: a.id, routeId: r.id, vehicleId: a.vehicleId, kind: "OVER_SPEED", text: `Route ${r.number}: 58 km/h, over the 50 km/h limit`, lat: 17.4870, lng: 78.4020, speedKmh: 58, at: new Date(a.startedAt!.getTime() + 12 * 60_000), status: "CLOSED", closedAt: new Date(a.startedAt!.getTime() + 30 * 60_000), closedById: inCharge, closeNote: "Spoke to the driver", onceKey: `speed:${a.id}:seed` } });
      const b = pick(7);
      const rb = routes.find((x) => x.id === b.routeId)!;
      await tx.transportAlert.create({ data: { schoolId, tripId: b.id, routeId: rb.id, vehicleId: b.vehicleId, kind: "ROUTE_DEVIATION", text: `Route ${rb.number}: about 420 m off the route`, lat: 17.4790, lng: 78.3990, at: new Date(b.startedAt!.getTime() + 18 * 60_000), status: "CLOSED", closedAt: new Date(b.startedAt!.getTime() + 25 * 60_000), closedById: inCharge, closeNote: "Road works at Allwyn Colony, took the service road", onceKey: `deviation:${b.id}:seed` } });
    }
    const today = dateOf(0);
    const v = made.vehicles;
    const costs: { v: number; kind: "FUEL" | "REPAIR" | "SERVICE"; days: number; amount: number; litres?: number; odo: number; what?: string }[] = [
      { v: 0, kind: "FUEL", days: -27, amount: 9_450, litres: 105, odo: 46_900 },
      { v: 1, kind: "FUEL", days: -25, amount: 10_080, litres: 112, odo: 60_300 },
      { v: 2, kind: "FUEL", days: -22, amount: 8_640, litres: 96, odo: 82_200 },
      { v: 3, kind: "FUEL", days: -20, amount: 4_320, litres: 48, odo: 37_100 },
      { v: 0, kind: "FUEL", days: -12, amount: 9_720, litres: 108, odo: 47_650 },
      { v: 1, kind: "FUEL", days: -10, amount: 9_900, litres: 110, odo: 61_100 },
      { v: 2, kind: "FUEL", days: -8, amount: 8_910, litres: 99, odo: 82_900 },
      { v: 3, kind: "FUEL", days: -6, amount: 4_410, litres: 49, odo: 37_600 },
      { v: 0, kind: "FUEL", days: -2, amount: 9_540, litres: 106, odo: 48_150 },
      { v: 1, kind: "REPAIR", days: -15, amount: 6_800, odo: 60_800, what: "Brake pads and clutch plate" },
      { v: 3, kind: "SERVICE", days: -18, amount: 5_250, odo: 37_300, what: "Regular service: oil, filters, wheel alignment" },
      { v: 2, kind: "REPAIR", days: -4, amount: 3_200, odo: 83_250, what: "Rear door hinge and seat repair" },
    ];
    for (const [n, c] of costs.entries()) {
      const date = new Date(today.getTime() + c.days * DAY);
      if (date < d("2026-04-01")) continue; // finance records start at go-live
      const bill = await billFile(c.kind === "FUEL" ? "Sai Ram Fuel Station" : "Lakshmi Auto Works", c.what ?? `Diesel ${c.litres} L`, c.amount, n);
      await recordCost(tx, ctx, { vehicleId: v[c.v].id, kind: c.kind, date, amountPaise: paise(c.amount), litres: c.litres ?? null, odometerKm: c.odo, what: c.what ?? null, bill }, today);
    }
  }, { timeout: 120_000 });

  console.log("  Transport demo: sign in as 'driver' (Ramesh Goud, Driver) to try the driver page at /driver");
}
