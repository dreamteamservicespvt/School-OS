// Transport Management words and small helpers with no database, so pages,
// sheets and the driver app can all use them (12-transport-management.md).

export const MODULE = "transport-management" as const;
export const BASE = "/transport-management";

/** The School Feature that switches live bus tracking on for a school (12 §2 Live Tracking: optional within the module). */
export const LIVE_FEATURE = "transport-live-tracking";

export type PageKey = "live" | "routes" | "vehicles" | "students" | "trips" | "reports" | "settings";
export const PAGES: { key: PageKey; name: string; href: string }[] = [
  { key: "live", name: "Live Tracking", href: BASE },
  { key: "routes", name: "Routes & Stops", href: `${BASE}/routes` },
  { key: "vehicles", name: "Vehicles & Drivers", href: `${BASE}/vehicles` },
  { key: "students", name: "Student Transport", href: `${BASE}/students` },
  { key: "trips", name: "Trips", href: `${BASE}/trips` },
  { key: "reports", name: "Transport Reports", href: `${BASE}/reports` },
  { key: "settings", name: "Transport Settings", href: `${BASE}/settings` },
];
export const pageName = (k: PageKey) => PAGES.find((p) => p.key === k)!.name;
export const pageHref = (k: PageKey) => PAGES.find((p) => p.key === k)!.href;

/* ---------- Times ---------- */

/** "7:42 AM" for minutes after midnight. */
export function clockOf(min: number | null | undefined) {
  if (min == null) return "";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/** "07:42" for an <input type="time">. */
export const hhmmOf = (min: number | null | undefined) => (min == null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

/** Minutes after midnight from "07:42" (or "7:42"); null when it is not a time. */
export function minutesOf(v: string) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return h * 60 + Number(m[2]);
}

export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** "Mon–Sat", "Mon, Wed, Fri". */
export function daysWords(days: readonly number[]) {
  const d = [...new Set(days)].filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b);
  if (d.length === 0) return "No days";
  if (d.length === 7) return "Every day";
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (run && d.length > 2) return `${DAY_SHORT[d[0]]}–${DAY_SHORT[d[d.length - 1]]}`;
  return d.map((x) => DAY_SHORT[x]).join(", ");
}

/* ---------- Records ---------- */

export const VEHICLE_TYPES = [
  { value: "BUS", label: "Bus" },
  { value: "VAN", label: "Van" },
  { value: "CAR", label: "Car" },
] as const;
export const vehicleType = (v: string) => VEHICLE_TYPES.find((t) => t.value === v)?.label ?? v;

export const VEHICLE_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "ok" },
  UNDER_REPAIR: { label: "Under repair", tone: "warn" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

/** Vehicle papers (12 §2 Papers), in the order of the papers table. */
export const PAPER_KINDS = [
  { value: "INSURANCE", label: "Insurance" },
  { value: "FITNESS", label: "Fitness" },
  { value: "PERMIT", label: "Permit" },
  { value: "POLLUTION", label: "PUC (pollution)" },
] as const;
export const paperLabel = (k: string) => PAPER_KINDS.find((p) => p.value === k)?.label ?? k;

export const DRIVER_ROLES = [
  { value: "DRIVER", label: "Driver" },
  { value: "ATTENDANT", label: "Attendant" },
] as const;
export const driverRole = (r: string) => (r === "ATTENDANT" ? "Attendant" : "Driver");

export const ASSIGN_TYPES = [
  { value: "TWO_WAY", label: "Two-way" },
  { value: "PICKUP_ONLY", label: "One-way: pickup only" },
  { value: "DROP_ONLY", label: "One-way: drop only" },
] as const;
export const assignType = (t: string) => (t === "TWO_WAY" ? "Two-way" : t === "PICKUP_ONLY" ? "Pickup only" : t === "DROP_ONLY" ? "Drop only" : t);
export const isOneWay = (t: string) => t === "PICKUP_ONLY" || t === "DROP_ONLY";

export const TRIP_KINDS = [
  { value: "MORNING", label: "Morning pickup" },
  { value: "EVENING", label: "Evening drop" },
] as const;
export const tripKind = (k: string) => (k === "EVENING" ? "Evening drop" : "Morning pickup");

export const TRIP_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" | "info" | "bad" | "brand" }> = {
  SCHEDULED: { label: "Scheduled", tone: "neutral" },
  STARTED: { label: "Started", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
};

export const ALERT_KINDS: Record<string, { label: string; tone: "warn" | "bad" | "neutral" }> = {
  OVER_SPEED: { label: "Over-speed", tone: "warn" },
  ROUTE_DEVIATION: { label: "Route deviation", tone: "warn" },
  OFFLINE: { label: "Vehicle offline", tone: "neutral" },
  EMERGENCY: { label: "Emergency button", tone: "bad" },
  BREAKDOWN: { label: "Breakdown", tone: "bad" },
  TRIP_LEFT_RUNNING: { label: "Trip left running", tone: "warn" },
};
export const alertLabel = (k: string) => ALERT_KINDS[k]?.label ?? k;

export const FEE_FREQUENCIES = [
  { value: "MONTHLY", label: "Every month", months: 1 },
  { value: "QUARTERLY", label: "Every 3 months", months: 3 },
  { value: "HALF_YEARLY", label: "Every 6 months", months: 6 },
  { value: "YEARLY", label: "Once a year", months: 12 },
] as const;

export const APPROVAL_CHOICES = [
  { value: "ALL", label: "Every change" },
  { value: "ROUTE", label: "Route only" },
  { value: "NONE", label: "None" },
] as const;

/* ---------- Live status of a bus ---------- */

export type LiveStatus = "Parked" | "Moving" | "Stopped" | "Offline" | "Not on a trip";
export const LIVE_TONE: Record<LiveStatus, "ok" | "warn" | "neutral" | "info" | "brand"> = {
  Parked: "info", Moving: "ok", Stopped: "warn", Offline: "neutral", "Not on a trip": "neutral",
};

/**
 * Parked (trip ended, at school), Moving, Stopped (speed under 3 km/h),
 * Offline (no point for the offline time) or Not on a trip. A location older
 * than the stale time is "stale": shown as "Last seen" and faded.
 */
export function liveStatus(t: { status: string; lastPointAt: Date | null; lastSpeedKmh: number | null } | null, now: Date, s: { staleAfterSec: number; offlineAfterMin: number }): { status: LiveStatus; stale: boolean } {
  if (!t || t.status === "SCHEDULED" || t.status === "CANCELLED") return { status: "Not on a trip", stale: false };
  if (t.status === "COMPLETED") return { status: "Parked", stale: false };
  if (!t.lastPointAt) return { status: "Offline", stale: true };
  const age = (now.getTime() - t.lastPointAt.getTime()) / 1000;
  if (age >= s.offlineAfterMin * 60) return { status: "Offline", stale: true };
  const stale = age >= s.staleAfterSec;
  return { status: (t.lastSpeedKmh ?? 0) >= 3 ? "Moving" : "Stopped", stale };
}

/* ---------- Vehicle numbers and money ---------- */

/** "KA01AB1234": capitals, no spaces. */
export const normalPlate = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Indian vehicle number: state, district, series, number (BH series too). */
export const plateLooksRight = (v: string) => /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(v) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(v);
/** "KA 01 AB 1234" for reading. */
export function showPlate(v: string) {
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/.exec(v);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ") : v;
}

/** What a vehicle is called on screens: "Bus 4 · TS 07 UB 2236", or just the number. */
export const vehicleName = (v: { label: string | null; number: string }) => (v.label ? `${v.label} · ${showPlate(v.number)}` : showPlate(v.number));

/** Days from one date to another (both 00:00 UTC dates). */
export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

/** Paper or licence state: expired, ending (within the reminder days) or valid. */
export function expiryTone(expires: Date | null, today: Date, soonDays = 30): "bad" | "warn" | "ok" | "neutral" {
  if (!expires) return "neutral";
  const d = daysBetween(today, expires);
  return d < 0 ? "bad" : d <= soonDays ? "warn" : "ok";
}
export function expiryWords(expires: Date | null, today: Date) {
  if (!expires) return "No date";
  const d = daysBetween(today, expires);
  if (d < 0) return `Expired ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return "Ends today";
  if (d <= 60) return `Ends in ${d} day${d === 1 ? "" : "s"}`;
  return "Valid";
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "₹1,800" for chips and short rows; a fee with paise keeps them ("₹600.50"), never rounded to a fee nobody charges. */
export function rupeesShort(p: bigint | number | null | undefined) {
  if (p == null) return "—";
  const paise = typeof p === "bigint" ? Number(p) : p;
  const n = paise / 100;
  return Number.isInteger(n) ? `₹${n.toLocaleString("en-IN")}` : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Paise as the rupees a person types in a money box ("1800" or "1800.50"). */
export function rupeesInput(p: bigint | null | undefined) {
  if (p == null) return "";
  const hundred = BigInt(100);
  return p % hundred === BigInt(0) ? String(p / hundred) : (Number(p) / 100).toFixed(2);
}

/**
 * What the screen says about a driver app invite. It is called sent only when a
 * message channel carried it: with WhatsApp, SMS and email all off nothing went.
 */
export function inviteWords(sentBy: string[], phone: string) {
  return sentBy.length
    ? `Driver app invite sent to ${phone} by ${sentBy.join(" and ")}`
    : "The driver app invite was not sent by WhatsApp, SMS or email. Send it again from Settings, Users & Permissions to copy the sign-in link for them";
}
