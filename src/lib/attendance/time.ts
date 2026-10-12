// Clock times in the school's time zone. Settings hold times as "HH:MM"
// (24-hour) and show them in 12-hour time; dates are date-only (midnight UTC).
import { isoDay } from "../staff/dates";

export const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOf(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "11:00" -> "11:00 AM", "13:40" -> "1:40 PM" */
export function time12(hhmm: string): string {
  const m = HHMM.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Offset of the time zone from UTC at an instant, in minutes (India: +330). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The real instant of a clock time on a school date, e.g. 11:00 AM on 06-10-2026 in India. */
export function instantAt(date: Date, hhmm: string, timeZone: string): Date {
  const naive = new Date(`${isoDay(date)}T00:00:00Z`).getTime() + minutesOf(hhmm) * 60000;
  const offset = zoneOffsetMinutes(timeZone, new Date(naive));
  return new Date(naive - offset * 60000);
}

/** The school date (date-only) of an instant. */
export function schoolDateOf(at: Date, timeZone: string): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return new Date(`${s}T00:00:00Z`);
}

/** Minutes after midnight of an instant on the school's clock. */
export function clockMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** "HH:MM" of an instant on the school's clock, for time inputs. */
export function clockHHMM(at: Date, timeZone: string): string {
  const m = clockMinutes(at, timeZone);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Distance in metres between two points on Earth (haversine). */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "1 hour 20 minutes", "45 minutes" */
export function minutesText(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  const parts = [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m || !h ? `${m} minute${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ");
}
