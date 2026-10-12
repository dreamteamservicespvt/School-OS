// Date filters used across School OS, the same on every page (kit.jsx
// DatePeriod): days, weeks and months, the school's terms and academic
// years, financial and calendar years, one chosen month, any From and To
// dates, and for pages that look ahead, the coming days. The choice lives
// in the page address (P2) as `period`, `from` and `to`. No database here, so
// the browser uses the same list and labels; term and academic year dates
// come in as a SchoolCalendar read on the server (lib/academic/calendar.ts).

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last2", label: "Last 2 days" },
  { key: "last3", label: "Last 3 days" },
  { key: "last7", label: "Last 7 days" },
  { key: "last15", label: "Last 15 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "thisweek", label: "This week" },
  { key: "lastweek", label: "Last week" },
  { key: "thismonth", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "last3m", label: "Last 3 months" },
  { key: "last6m", label: "Last 6 months" },
  { key: "quarter", label: "This quarter" },
  { key: "term", label: "This term" },
  { key: "nextterm", label: "Next term" },
  { key: "acyear", label: "This academic year" },
  { key: "lastacyear", label: "Last academic year" },
  { key: "finyear", label: "This financial year" },
  { key: "lastfinyear", label: "Last financial year" },
  { key: "calyear", label: "This calendar year" },
  { key: "lastcalyear", label: "Last calendar year" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "next7", label: "Next 7 days" },
  { key: "next30", label: "Next 30 days" },
  { key: "nextmonth", label: "Next month" },
  { key: "month", label: "One month" },
  { key: "custom", label: "Custom dates" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

/** Older words for the same periods, still read from saved links. */
const ALIASES: Record<string, PeriodKey> = {
  "2d": "last2", "3d": "last3", "7d": "last7", "15d": "last15", "30d": "last30",
  week: "thisweek", fy: "finyear", lastfy: "lastfinyear", year: "calyear", lastyear: "lastcalyear",
};

/** The chips in the "Pick dates" panel, in the approved design's groups. */
export const PERIOD_GROUPS: { title: string; keys: PeriodKey[] }[] = [
  { title: "Days", keys: ["today", "yesterday", "last2", "last3", "last7", "last15", "last30"] },
  { title: "Weeks and months", keys: ["thisweek", "lastweek", "thismonth", "lastmonth", "last3m", "last6m"] },
  { title: "School and money years", keys: ["term", "nextterm", "acyear", "lastacyear", "finyear", "lastfinyear", "calyear"] },
];
export const AHEAD_GROUP: { title: string; keys: PeriodKey[] } = { title: "Coming up", keys: ["tomorrow", "next7", "next30", "nextmonth"] };

/** A span of days with a name, e.g. a term or an academic year. */
export type Span = { name: string; from: string; to: string };
/** The school's own terms and academic years. Without them, term chips are hidden and an academic year runs June to March. */
export type SchoolCalendar = { year?: Span | null; lastYear?: Span | null; term?: Span | null; nextTerm?: Span | null };

/** A chosen period as inclusive "YYYY-MM-DD" days in the school's zone. */
export type DayRange = { period: PeriodKey; from: string; to: string; label: string; month?: string };

export type PeriodOptions = {
  timeZone: string; now?: Date; weekStart?: "monday" | "sunday";
  /** The period shown when none is chosen; null or absent means all dates. */
  fallback?: PeriodKey | string | null;
  calendar?: SchoolCalendar | null;
};

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
export const isDay = (v: string | null | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(new Date(`${v}T00:00:00Z`)) === v);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Today in the school's zone, at 00:00 UTC. */
export function todayFor(timeZone: string, now = new Date()) {
  return new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone }).format(now)}T00:00:00Z`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

/** Days from `from` to `to`, both included. */
export const dayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** "March 2026" for "2026-03". */
export const monthWords = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** The canonical key for a typed or saved period word, or null. */
export function periodKey(raw: string | null | undefined): PeriodKey | null {
  if (!raw) return null;
  if (ALIASES[raw]) return ALIASES[raw];
  return PERIODS.some((p) => p.key === raw) ? (raw as PeriodKey) : null;
}

/** The label for a period key, using the school's own term names. */
export function periodLabel(key: PeriodKey, calendar?: SchoolCalendar | null) {
  if (key === "nextterm" && calendar?.nextTerm) return calendar.nextTerm.name;
  return PERIODS.find((p) => p.key === key)!.label;
}

/** Whether a period can be worked out for this school (terms need the school's dates). */
export function periodAvailable(key: PeriodKey, calendar?: SchoolCalendar | null) {
  if (key === "term") return Boolean(calendar?.term);
  if (key === "nextterm") return Boolean(calendar?.nextTerm);
  return true;
}

/** The school's academic year around `today`: its own dates when known, else June to March. */
function academicYear(today: Date, calendar: SchoolCalendar | null | undefined, last: boolean): { from: Date; to: Date } {
  const own = last ? calendar?.lastYear : calendar?.year;
  if (own) return { from: new Date(`${own.from}T00:00:00Z`), to: new Date(`${own.to}T00:00:00Z`) };
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const start = (m >= 5 ? y : y - 1) - (last ? 1 : 0);
  return { from: utcDay(start, 5, 1), to: utcDay(start + 1, 2, 31) };
}

/**
 * The days a period covers. `weekStart` follows the school's Settings
 * (Monday by default). Custom dates typed backwards are swapped; a period
 * that cannot be worked out falls back to `fallback`, else null (all dates).
 * One month is `period=month&from=YYYY-MM`.
 */
export function periodRange(
  raw: { period?: string | null; from?: string | null; to?: string | null },
  opts: PeriodOptions,
): DayRange | null {
  const today = todayFor(opts.timeZone, opts.now);
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const fallback = () => (opts.fallback && opts.fallback !== raw.period ? periodRange({ period: opts.fallback }, { ...opts, fallback: null }) : null);
  let key = periodKey(raw.period);
  if (!key && raw.period && /^m-\d{4}-\d{2}$/.test(raw.period)) { key = "month"; raw = { from: raw.period.slice(2) }; }
  if (!key && (isDay(raw.from) || isDay(raw.to))) key = "custom";
  if (!key) return fallback();

  const back = (n: number) => new Date(today.getTime() - n * DAY);
  const weekday = (today.getUTCDay() + 7 - (opts.weekStart === "sunday" ? 0 : 1)) % 7;
  const fyStartYear = m >= 3 ? y : y - 1;
  const span = (s?: Span | null) => (s ? { from: new Date(`${s.from}T00:00:00Z`), to: new Date(`${s.to}T00:00:00Z`) } : null);
  let from: Date, to: Date;
  let month: string | undefined;
  switch (key) {
    case "today": from = to = today; break;
    case "yesterday": from = to = back(1); break;
    case "last2": from = back(1); to = today; break;
    case "last3": from = back(2); to = today; break;
    case "last7": from = back(6); to = today; break;
    case "last15": from = back(14); to = today; break;
    case "last30": from = back(29); to = today; break;
    case "thisweek": from = back(weekday); to = today; break;
    case "lastweek": from = back(weekday + 7); to = back(weekday + 1); break;
    case "thismonth": from = utcDay(y, m, 1); to = today; break;
    case "lastmonth": from = utcDay(y, m - 1, 1); to = utcDay(y, m, 0); break;
    case "last3m": from = utcDay(y, m - 2, 1); to = today; break;
    case "last6m": from = utcDay(y, m - 5, 1); to = today; break;
    case "quarter": from = utcDay(y, m - (m % 3), 1); to = today; break;
    case "term": case "nextterm": {
      const s = span(key === "term" ? opts.calendar?.term : opts.calendar?.nextTerm);
      if (!s) return fallback();
      ({ from, to } = s);
      break;
    }
    case "acyear": ({ from, to } = academicYear(today, opts.calendar, false)); break;
    case "lastacyear": ({ from, to } = academicYear(today, opts.calendar, true)); break;
    case "finyear": from = utcDay(fyStartYear, 3, 1); to = utcDay(fyStartYear + 1, 2, 31); break;
    case "lastfinyear": from = utcDay(fyStartYear - 1, 3, 1); to = utcDay(fyStartYear, 2, 31); break;
    case "calyear": from = utcDay(y, 0, 1); to = utcDay(y, 11, 31); break;
    case "lastcalyear": from = utcDay(y - 1, 0, 1); to = utcDay(y - 1, 11, 31); break;
    case "tomorrow": from = to = back(-1); break;
    case "next7": from = today; to = back(-6); break;
    case "next30": from = today; to = back(-29); break;
    case "nextmonth": from = utcDay(y, m + 1, 1); to = utcDay(y, m + 2, 0); break;
    case "month": {
      // A bare "month" is the older word for this month.
      if (!raw.from) return periodRange({ period: "thismonth" }, opts);
      const ym = raw.from.slice(0, 7);
      if (!MONTH_RE.test(ym)) return fallback();
      month = ym;
      from = new Date(`${ym}-01T00:00:00Z`);
      to = utcDay(from.getUTCFullYear(), from.getUTCMonth() + 1, 0);
      break;
    }
    case "custom": {
      const a = isDay(raw.from) ? raw.from : null, b = isDay(raw.to) ? raw.to : null;
      if (!a && !b) return fallback();
      const f = a ?? b!, t = b ?? a!;
      [from, to] = f <= t ? [new Date(`${f}T00:00:00Z`), new Date(`${t}T00:00:00Z`)] : [new Date(`${t}T00:00:00Z`), new Date(`${f}T00:00:00Z`)];
      break;
    }
  }
  const label = key === "custom" ? "Custom dates" : key === "month" ? monthWords(month!) : periodLabel(key, opts.calendar);
  return { period: key, from: iso(from), to: iso(to), label, ...(month ? { month } : {}) };
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
export function periodFromSearch(sp: Raw, opts: PeriodOptions & { prefix?: string }) {
  const p = opts.prefix ?? "";
  return periodRange({ period: one(sp[`${p}period`]), from: one(sp[`${p}from`]), to: one(sp[`${p}to`]) }, opts);
}
