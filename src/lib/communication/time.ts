// Date and time typed in the school's time zone ("2026-10-10T07:30" from a
// datetime-local field) to a real moment, and back for showing in a field.

function offsetMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-10-10T07:30" in the school's zone, or null when blank or not a date. */
export function localToUtc(value: string | null | undefined, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(naive)) return null;
  const first = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  return new Date(naive - offsetMinutes(first, timeZone) * 60_000);
}

/** A moment as "2026-10-10T07:30" in the school's zone, for a datetime-local field. */
export function utcToLocal(at: Date, timeZone: string) {
  const shifted = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** Today's date in the school's zone as a Date at 00:00 UTC (for date-only fields). */
export function schoolToday(timeZone: string, now = new Date()) {
  return new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone }).format(now)}T00:00:00Z`);
}
