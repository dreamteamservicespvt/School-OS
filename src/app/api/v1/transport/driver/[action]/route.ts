// The driver API (12 §2 Driver app; D11). The Android driver app and the
// /driver page use it; see src/lib/transport/driver-api.ts for who may call.
//
//   GET  /api/v1/transport/driver/trips?s=<school>          today's own trips, stops and students
//   POST /api/v1/transport/driver/start      { tripId }
//   POST /api/v1/transport/driver/points     { tripId, points: [{ at, lat, lng, speed?, heading?, accuracy? }] }
//   POST /api/v1/transport/driver/reached    { tripId, stopId, at? }
//   POST /api/v1/transport/driver/boarding   { tripId, studentId, status: BOARDED | NOT_BOARDED | DROPPED }
//   POST /api/v1/transport/driver/end        { tripId }
//   POST /api/v1/transport/driver/emergency  { tripId, lat?, lng?, note? }
//   POST /api/v1/transport/driver/breakdown  { tripId, reason, lat?, lng? }
//
// Points are taken only while the trip is running (Start trip to End trip),
// in batches, so a phone that was offline sends its queue when it is back.
// Each point is checked (12 §5): bad, old, out-of-order or impossible ones
// are counted and not used.
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { todayDate } from "@/lib/front-office/time";
import { TransportProblem } from "@/lib/transport/problem";
import { driverCaller, driverToday, MAX_POINTS, reply, tripIdOf, uuidOf, type DriverCaller } from "@/lib/transport/driver-api";
import { endTrip, ingestPoints, markBoarding, markStop, ownTrip, pressEmergency, reportBreakdown, startTrip } from "@/lib/transport/trips";
import type { IncomingPoint } from "@/lib/transport/geo";

export const dynamic = "force-dynamic";

const ACTIONS = ["start", "points", "reached", "boarding", "end", "emergency", "breakdown"] as const;
type Act = (typeof ACTIONS)[number];
type Params = { params: Promise<{ action: string }> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const when = (v: unknown, fallback: Date) => {
  if (typeof v !== "string" && typeof v !== "number") return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

export async function GET(request: Request, { params }: Params) {
  const { action } = await params;
  if (action !== "trips") return reply(404, { problem: "Use GET /trips, or POST start, points, reached, boarding, end, emergency or breakdown." });
  const c = await driverCaller(request);
  if ("problem" in c) return c.problem;
  const now = new Date();
  const data = await withSchool(c.ctx, async (tx) => {
    if (c.device) await tx.driverDevice.update({ where: { id: c.device.id }, data: { lastSeenAt: now } });
    return driverToday(tx, c, now);
  });
  return reply(200, { ok: true, serverTime: now.toISOString(), ...data });
}

export async function POST(request: Request, { params }: Params) {
  const { action } = await params;
  if (!ACTIONS.includes(action as Act)) return reply(404, { problem: "Unknown action. Use start, points, reached, boarding, end, emergency or breakdown." });
  const c = await driverCaller(request);
  if ("problem" in c) return c.problem;
  const raw = await request.text();
  if (raw.length > 400_000) return reply(413, { problem: `Too large. Send at most ${MAX_POINTS} points at a time.` });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || "{}");
    body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return reply(400, { problem: "The body must be JSON." });
  }
  const tripId = tripIdOf(body.tripId);
  if (!tripId) return reply(400, { problem: "Send the trip's id as tripId." });
  const now = new Date();
  try {
    const out = await withSchool(c.ctx, (tx) => run(tx, c, action as Act, tripId, body, now), { timeout: 60_000 });
    return reply(200, { ok: true, ...out });
  } catch (e) {
    if (e instanceof TransportProblem) return reply(409, { problem: e.message });
    throw e;
  }
}

async function run(tx: Parameters<Parameters<typeof withSchool>[1]>[0], c: DriverCaller, action: Act, tripId: string, body: Record<string, unknown>, now: Date) {
  // Only the driver's (or attendant's) own trips today.
  const trip = await ownTrip(tx, c.driver.id, tripId, todayDate(c.tz, now));
  const who = { userId: c.userId, source: "APP" as const };
  if (c.device) await tx.driverDevice.update({ where: { id: c.device.id }, data: { lastSeenAt: now } });

  switch (action) {
    case "start": {
      if (c.driver.role !== "DRIVER") throw new TransportProblem("Only the driver starts the trip.");
      if (c.driver.licenceExpiry && c.driver.licenceExpiry < todayDate(c.tz, now)) throw new TransportProblem("Your licence has expired. Ask the Transport In-charge.");
      const t = await startTrip(tx, c.ctx, trip.id, who, now);
      return { status: t.status, startedAt: t.startedAt };
    }
    case "points": {
      if (!Array.isArray(body.points)) throw new TransportProblem("Send the locations as a 'points' list.");
      if (body.points.length > MAX_POINTS) throw new TransportProblem(`Send at most ${MAX_POINTS} points at a time.`);
      if (trip.status === "COMPLETED") return { accepted: 0, rejected: body.points.length, ended: true };
      const points: IncomingPoint[] = body.points.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null).map((p) => ({
        at: when(p.at ?? p.time, new Date(NaN)), lat: num(p.lat) ?? NaN, lng: num(p.lng ?? p.lon) ?? NaN,
        speedKmh: num(p.speed ?? p.speedKmh), heading: num(p.heading), accuracyM: num(p.accuracy ?? p.accuracyM),
      }));
      const r = await ingestPoints(tx, c.ctx, trip.id, points, now, c.tz, c.device?.id ?? null);
      return { accepted: r.accepted, rejected: r.rejected + (body.points.length - points.length), reached: r.reached };
    }
    case "reached": {
      const stopId = uuidOf(body.stopId);
      if (!stopId) throw new TransportProblem("Send the stop's id as stopId.");
      const at = when(body.at, now);
      const ev = await markStop(tx, c.ctx, trip.id, stopId, who, at > now ? now : at, "APP");
      return { stopId, at: ev.at };
    }
    case "boarding": {
      const studentId = uuidOf(body.studentId);
      if (!studentId) throw new TransportProblem("Send the student's id as studentId.");
      const ev = await markBoarding(tx, c.ctx, trip.id, studentId, String(body.status ?? ""), who, now, c.tz);
      return { studentId, status: ev.status };
    }
    case "end": {
      if (c.driver.role !== "DRIVER") throw new TransportProblem("Only the driver ends the trip.");
      const r = await endTrip(tx, c.ctx, trip.id, who, now, c.tz);
      return { status: r.trip.status, missedStops: r.missed };
    }
    case "emergency": {
      const a = await pressEmergency(tx, c.ctx, trip.id, { lat: num(body.lat), lng: num(body.lng), note: typeof body.note === "string" ? body.note.slice(0, 200) : null, userId: c.userId }, now);
      await writeAudit(tx, c.ctx, { action: "emergency-pressed", recordType: "Trip", recordId: trip.id, after: { driver: c.driver.name, via: c.via } });
      return { alerted: true, alertId: a?.id ?? null };
    }
    case "breakdown": {
      const a = await reportBreakdown(tx, c.ctx, trip.id, { reason: typeof body.reason === "string" ? body.reason : "", lat: num(body.lat), lng: num(body.lng), userId: c.userId }, now);
      return { alerted: true, alertId: a?.id ?? null };
    }
  }
}
