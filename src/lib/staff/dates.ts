// Date-only helpers. Date-only fields are stored as midnight UTC (@db.Date).

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Today's date in the school's time zone, as a date-only value. */
export function todayIn(timeZone = "Asia/Kolkata", now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return day(parts);
}

export function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 1 = Monday ... 7 = Sunday, as on the Time Table. */
export function isoWeekday(d: Date): number {
  const w = d.getUTCDay();
  return w === 0 ? 7 : w;
}

export function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function monthEnd(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** "October 2026" */
export function monthLabel(d: Date) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
