// Distances, GPS point checks, arrival times and the drawing of a map without
// any map service (12 §2 Live Tracking; 12 §5 "Bad or out-of-order GPS
// points"). No database, so the browser and the tests use it too.

export type LatLng = { lat: number; lng: number };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points (haversine). */
export function metres(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Metres from a point to the nearest part of a line through the given points. */
export function metresFromLine(p: LatLng, line: LatLng[]) {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return metres(p, line[0]);
  // Flat projection around the point: good enough for a few kilometres.
  const kx = Math.cos(rad(p.lat)) * R * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  const xy = (q: LatLng) => [(q.lng - p.lng) * kx, (q.lat - p.lat) * ky] as const;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = xy(line[i]);
    const [bx, by] = xy(line[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    best = Math.min(best, Math.hypot(cx, cy));
  }
  return best;
}

/* ---------- GPS point checks ---------- */

export type IncomingPoint = { at: Date; lat: number; lng: number; speedKmh?: number | null; heading?: number | null; accuracyM?: number | null };
export type PointCheck = { ok: true } | { ok: false; why: "bad-number" | "too-old" | "future" | "out-of-order" | "jump" | "inaccurate" | "before-trip" };

/** Faster than this between two points is a jump no school bus makes. */
export const MAX_KMH = 120;
/** A point this much ahead of the server clock is refused (a phone clock set wrong). */
const FUTURE_MS = 2 * 60_000;
/** Points older than this are refused, even from a phone that was offline. */
const OLDEST_MS = 12 * 60 * 60_000;

/**
 * Checks one point against the last accepted one: real numbers, not from the
 * future, not too old, not before the trip started, after the last point,
 * and no impossible jump (more than MAX_KMH, ignoring jitter under 150 m).
 */
export function checkPoint(p: IncomingPoint, last: { at: Date; lat: number; lng: number } | null, ctx: { now: Date; tripStartedAt: Date }): PointCheck {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || (p.lat === 0 && p.lng === 0) || Number.isNaN(p.at.getTime())) return { ok: false, why: "bad-number" };
  if (p.accuracyM != null && p.accuracyM > 250) return { ok: false, why: "inaccurate" };
  if (p.speedKmh != null && (p.speedKmh < 0 || p.speedKmh > 160)) return { ok: false, why: "bad-number" };
  if (p.at.getTime() > ctx.now.getTime() + FUTURE_MS) return { ok: false, why: "future" };
  if (p.at.getTime() < ctx.now.getTime() - OLDEST_MS) return { ok: false, why: "too-old" };
  if (p.at.getTime() < ctx.tripStartedAt.getTime() - 60_000) return { ok: false, why: "before-trip" };
  if (last) {
    if (p.at.getTime() <= last.at.getTime()) return { ok: false, why: "out-of-order" };
    const d = metres(last, p);
    const hours = (p.at.getTime() - last.at.getTime()) / 3_600_000;
    if (d > 150 && d / 1000 / hours > MAX_KMH) return { ok: false, why: "jump" };
  }
  return { ok: true };
}

/* ---------- Arrival times ---------- */

/** City speed used when the bus is stopped or the speed is not known. */
export const CITY_KMH = 20;

/** Minutes for the bus to reach a point from where it is, at its speed (never slower than city speed for the guess). */
export function minutesTo(from: LatLng, to: LatLng, speedKmh: number | null) {
  const km = metres(from, to) / 1000;
  const v = Math.max(CITY_KMH, speedKmh ?? 0);
  // Roads are not straight lines: 1.3 times the straight distance.
  return Math.round(((km * 1.3) / v) * 60);
}

/**
 * Arrival time (minutes after midnight) at each remaining stop. Uses the
 * bus's distance to the next stop, then the planned gaps between the
 * stops after it. Stops with no location keep their planned time plus the
 * current delay.
 */
export function etas(opts: { nowMin: number; at: LatLng | null; speedKmh: number | null; stops: { id: string; plannedMin: number; lat: number | null; lng: number | null }[] }) {
  const out = new Map<string, number>();
  const [next, ...rest] = opts.stops;
  if (!next) return out;
  let first: number;
  if (opts.at && next.lat != null && next.lng != null) first = opts.nowMin + minutesTo(opts.at, { lat: next.lat, lng: next.lng }, opts.speedKmh);
  else first = Math.max(opts.nowMin, next.plannedMin);
  out.set(next.id, first);
  const delay = first - next.plannedMin;
  let prev = first;
  for (const s of rest) {
    const t = Math.max(prev + 1, s.plannedMin + Math.max(0, delay));
    out.set(s.id, t);
    prev = t;
  }
  return out;
}

/* ---------- Drawing the map (no outside map service) ---------- */

export type Box = { w: number; h: number; pad: number };

/**
 * Turns places into x, y on a drawing of the given size, keeping their shape
 * (a degree of longitude is shorter than a degree of latitude away from the
 * equator). North is up.
 */
export function projector(points: LatLng[], box: Box = { w: 640, h: 380, pad: 28 }) {
  const ok = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (ok.length === 0) return null;
  const minLat = Math.min(...ok.map((p) => p.lat));
  const maxLat = Math.max(...ok.map((p) => p.lat));
  const minLng = Math.min(...ok.map((p) => p.lng));
  const maxLng = Math.max(...ok.map((p) => p.lng));
  const k = Math.cos(rad((minLat + maxLat) / 2));
  const spanX = Math.max((maxLng - minLng) * k, 0.002);
  const spanY = Math.max(maxLat - minLat, 0.002);
  const scale = Math.min((box.w - 2 * box.pad) / spanX, (box.h - 2 * box.pad) / spanY);
  const offX = (box.w - spanX * scale) / 2;
  const offY = (box.h - spanY * scale) / 2;
  const to = (p: LatLng) => ({ x: Math.round((offX + (p.lng - minLng) * k * scale) * 10) / 10, y: Math.round((box.h - offY - (p.lat - minLat) * scale) * 10) / 10 });
  /** The place under a point of the drawing (tapping the sketch to set a stop's location). */
  const back = (x: number, y: number): LatLng => ({ lat: Math.round((minLat + (box.h - offY - y) / scale) * 1e6) / 1e6, lng: Math.round((minLng + (x - offX) / (k * scale)) * 1e6) / 1e6 });
  return Object.assign(to, { back });
}

/** An SVG path through the points. */
export const pathOf = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
