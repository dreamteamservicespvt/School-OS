// School-time helpers for the desk: today's date, the minute of the day, and
// a local date and time as an instant, all in the school's time zone.

/** "YYYY-MM-DDTHH:MM" for an instant, in a time zone. */
export function localOf(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** A local "YYYY-MM-DD" and minute of the day, in a time zone, as an instant. */
export function instantOf(day: string, minute: number, timeZone: string) {
  const local = `${day}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const asUtc = new Date(`${local}:00Z`);
  const shown = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const utcShown = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (shown.getTime() - utcShown.getTime()));
}

/** Today in the school, as "YYYY-MM-DD". */
export const todayIso = (timeZone: string, now = new Date()) => localOf(now, timeZone).slice(0, 10);

/** Today in the school, as a date at 00:00 UTC (for @db.Date columns). */
export const todayDate = (timeZone: string, now = new Date()) => new Date(`${todayIso(timeZone, now)}T00:00:00Z`);

/** The minute of the day now, in the school. */
export function minuteNow(timeZone: string, now = new Date()) {
  const t = localOf(now, timeZone).slice(11);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** "10:44 AM" for an instant, in the school's zone. */
export function clockAt(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Fri, 9 Oct" for a date at 00:00 UTC. */
export const shortDay = (d: Date) => `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
/** "9 Oct". */
export const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;

/** How a moment reads on a list: "10:22 AM" today, "Yesterday", or "8 Oct, 2:40 PM". */
export function whenWords(d: Date, timeZone: string, now = new Date()) {
  const day = localOf(d, timeZone).slice(0, 10);
  const today = todayIso(timeZone, now);
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (day === today) return clockAt(d, timeZone);
  if (day === yesterday) return `Yesterday, ${clockAt(d, timeZone)}`;
  return `${dayMonth(new Date(`${day}T00:00:00Z`))}, ${clockAt(d, timeZone)}`;
}

export const addDaysIso = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
