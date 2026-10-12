// Date filters used across School OS: Today, Yesterday, Last 2, 3, 7 or 30
// days, this or last week, month, quarter, year, the financial year
// (April to March), or any From and To dates. The choice lives in the page
// address (P2) as `period`, `from` and `to`. No database here, so the
// browser uses the same list and labels.

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "2d", label: "Last 2 days" },
  { key: "3d", label: "Last 3 days" },
  { key: "7d", label: "Last 7 days" },
  { key: "week", label: "This week" },
  { key: "lastweek", label: "Last week" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "lastyear", label: "Last year" },
  { key: "fy", label: "This financial year" },
  { key: "lastfy", label: "Last financial year" },
  { key: "custom", label: "Pick dates" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

/** A chosen period as inclusive "YYYY-MM-DD" days in the school's zone. */
export type DayRange = { period: PeriodKey; from: string; to: string; label: string };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const isDay = (v: string | null | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(new Date(`${v}T00:00:00Z`)) === v);

/** Today in the school's zone, at 00:00 UTC. */
export function todayFor(timeZone: string, now = new Date()) {
  return new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone }).format(now)}T00:00:00Z`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Oct 2026", or "5 – 12 Oct 2026" for a range. */
export function rangeWords(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  const d = (x: Date, year = true) => `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}${year ? ` ${x.getUTCFullYear()}` : ""}`;
  if (from === to) return d(a);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()} – ${d(b)}` : `${d(a, false)} – ${d(b)}`;
  }
  return `${d(a)} – ${d(b)}`;
}

/**
 * The days a period covers. `weekStart` follows the school's Settings
 * (Monday by default). Pick dates with From after To are swapped; a custom
 * period with no dates falls back to `fallback`.
 */
export function periodRange(
  raw: { period?: string | null; from?: string | null; to?: string | null },
  opts: { timeZone: string; now?: Date; weekStart?: "monday" | "sunday"; fallback?: PeriodKey | null },
): DayRange | null {
  const today = todayFor(opts.timeZone, opts.now);
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  let key = (PERIODS.some((p) => p.key === raw.period) ? raw.period : null) as PeriodKey | null;
  if (!key && (isDay(raw.from) || isDay(raw.to))) key = "custom";
  if (!key) key = opts.fallback ?? null;
  if (!key) return null;

  const back = (n: number) => new Date(today.getTime() - n * DAY);
  const weekday = (today.getUTCDay() + 7 - (opts.weekStart === "sunday" ? 0 : 1)) % 7;
  const fyStartYear = m >= 3 ? y : y - 1;
  let from: Date, to: Date;
  switch (key) {
    case "today": from = to = today; break;
    case "yesterday": from = to = back(1); break;
    case "2d": from = back(1); to = today; break;
    case "3d": from = back(2); to = today; break;
    case "7d": from = back(6); to = today; break;
    case "30d": from = back(29); to = today; break;
    case "week": from = back(weekday); to = today; break;
    case "lastweek": from = back(weekday + 7); to = back(weekday + 1); break;
    case "month": from = utcDay(y, m, 1); to = today; break;
    case "lastmonth": from = utcDay(y, m - 1, 1); to = utcDay(y, m, 0); break;
    case "quarter": from = utcDay(y, m - (m % 3), 1); to = today; break;
    case "year": from = utcDay(y, 0, 1); to = today; break;
    case "lastyear": from = utcDay(y - 1, 0, 1); to = utcDay(y - 1, 11, 31); break;
    case "fy": from = utcDay(fyStartYear, 3, 1); to = today; break;
    case "lastfy": from = utcDay(fyStartYear - 1, 3, 1); to = utcDay(fyStartYear, 2, 31); break;
    case "custom": {
      const a = isDay(raw.from) ? raw.from : null, b = isDay(raw.to) ? raw.to : null;
      if (!a && !b) return opts.fallback ? periodRange({ period: opts.fallback }, opts) : null;
      const f = a ?? b!, t = b ?? a!;
      [from, to] = f <= t ? [new Date(`${f}T00:00:00Z`), new Date(`${t}T00:00:00Z`)] : [new Date(`${t}T00:00:00Z`), new Date(`${f}T00:00:00Z`)];
      break;
    }
  }
  const label = key === "custom" ? rangeWords(iso(from), iso(to)) : PERIODS.find((p) => p.key === key)!.label;
  return { period: key, from: iso(from), to: iso(to), label };
}

/** For a date-only column (@db.Date): { gte, lte }. */
export function dateWhere(r: DayRange) {
  return { gte: new Date(`${r.from}T00:00:00Z`), lte: new Date(`${r.to}T00:00:00Z`) };
}

function offsetMinutes(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.round((Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at.getTime()) / 60_000);
}

/** The moment a school day starts, in UTC. */
export function dayStartUtc(day: string, timeZone: string) {
  const naive = new Date(`${day}T00:00:00Z`).getTime();
  const first = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  return new Date(naive - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/** For a date-and-time column: from the first moment of `from` up to (not including) the day after `to`, in the school's zone. */
export function momentWhere(r: DayRange, timeZone: string) {
  const next = iso(new Date(new Date(`${r.to}T00:00:00Z`).getTime() + DAY));
  return { gte: dayStartUtc(r.from, timeZone), lt: dayStartUtc(next, timeZone) };
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** The date filter from a page's search params (see PeriodFilter), or null for all dates. */
export function periodFromSearch(sp: Raw, opts: { timeZone: string; weekStart?: "monday" | "sunday"; fallback?: PeriodKey | null; prefix?: string; now?: Date }) {
  const p = opts.prefix ?? "";
  return periodRange({ period: one(sp[`${p}period`]), from: one(sp[`${p}from`]), to: one(sp[`${p}to`]) }, opts);
}
