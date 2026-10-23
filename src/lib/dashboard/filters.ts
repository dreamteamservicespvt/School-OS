// The Dashboard's filters (01-dashboard.md §2 Controls; gap list G36): a
// campus, within the person's own limit; dates (one day, default today, or a
// range from–to); an academic year (default the current one; a past year is
// read-only, Done when 8); and a class (default all in scope). Every card is
// worked out for them (compose.ts narrows the person to the campus, moves
// "today" to the last day chosen and the year to the one chosen), and every
// card's link carries the same filters, so the list it opens shows the records
// counted: ?campus= on every link, the dates in each list's own date filter,
// ?year= on the lists that read a year and ?class= on the Student List.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { campusChoices, personCampusId, type CampusLimit } from "../campus";
import { currentYear } from "../academic/years";

export type DashFilters = {
  /** A campus chosen by a person who sees more than one; null for all they see. */
  campusId: string | null;
  /** The last day of the dates chosen, when not today; null for today. */
  date: Date | null;
  /** The first day, when a range of days is chosen (from–to); null for one day. */
  from?: Date | null;
  /** A year other than the current one (its numbers, its days); null for the current year. */
  yearId?: string | null;
  /** The year chosen is over: the Dashboard shows the read-only strip (P18). */
  pastYear?: { id: string; name: string } | null;
  /** One class (its students); null for every class in scope. */
  classId?: string | null;
};

export const NO_FILTERS: DashFilters = { campusId: null, date: null, from: null, yearId: null, pastYear: null, classId: null };

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const dayOf = (raw: string) => {
  if (!DAY.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export type DashChoices = {
  campuses: { id: string; name: string }[];
  years: { id: string; name: string; current: boolean }[];
  classes: { id: string; name: string }[];
};

/**
 * The filters in the page address, kept only when allowed: a campus the
 * person may see (only when they see more than one); dates from a year back up
 * to today (`date` alone, or `from` and `to`); a year of the campus (a past one
 * ends the dates at its last day); a class of the campus.
 */
export async function readDashFilters(tx: Tx, ctx: SchoolContext, who: CampusLimit, sp: Record<string, string | string[] | undefined>, today: Date): Promise<{ filters: DashFilters } & DashChoices> {
  const campuses = await campusChoices(tx, ctx, who);
  const c = first(sp.campus);
  const campusId = campuses.length > 1 && UUID.test(c) && campuses.some((x) => x.id === c) ? c : null;

  // The year: of the campus chosen, else the person's own.
  const yearCampus = await personCampusId(tx, ctx, campusId ? { ...who, campusId } : who);
  const [cur, yearRows, classRows] = await Promise.all([
    yearCampus ? currentYear(tx, ctx, yearCampus) : null,
    yearCampus ? tx.academicYear.findMany({ where: { campusId: yearCampus, archivedAt: null, status: { not: "UPCOMING" } }, orderBy: { startDate: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, status: true } }) : [],
    tx.schoolClass.findMany({ where: { archivedAt: null, ...(campusId ?? who.campusId ? { campusId: campusId ?? who.campusId! } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const y = first(sp.year);
  const picked = UUID.test(y) && y !== cur?.id ? yearRows.find((r) => r.id === y) ?? null : null;
  const past = picked && (picked.status === "CLOSED" || picked.endDate < today) ? picked : null;

  // The dates: `to` (or the older `date`), never after today nor after a past year's last day; `from` up to a year before it.
  const last = past && past.endDate < today ? past.endDate : today;
  const askedTo = dayOf(first(sp.to)) ?? dayOf(first(sp.date));
  const to = askedTo && askedTo <= last && askedTo.getTime() >= today.getTime() - 400 * DAY_MS ? askedTo : last;
  const askedFrom = dayOf(first(sp.from));
  const from = askedFrom && askedFrom < to && askedFrom.getTime() >= to.getTime() - 366 * DAY_MS ? askedFrom : null;

  const k = first(sp.class);
  const classId = UUID.test(k) && classRows.some((x) => x.id === k) ? k : null;
  return {
    filters: { campusId, date: to.getTime() === today.getTime() && !from ? null : to, from, yearId: picked?.id ?? null, pastYear: past ? { id: past.id, name: past.name } : null, classId },
    campuses,
    years: yearRows.map((r) => ({ id: r.id, name: r.name, current: r.id === cur?.id })),
    classes: classRows,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Lists whose date filter is read from period/from/to; the staff attendance list and Substitutions read ?date=. */
const RANGE_LISTS = ["/attendance-management/register", "/fee-management/dashboard", "/finance-management/day-book"];
const DAY_LISTS = ["/attendance-management/staff", "/academic-management/substitutions"];
/** Lists that read ?year= (a year other than the current one). */
const YEAR_LISTS = [
  "/student-management", "/examination-results", "/academic-management",
  // Read with src/lib/academic/view-year.ts (gap list G36 follow-up).
  "/fee-management/dashboard", "/fee-management/ledger", "/fee-management/defaulters", "/fee-management/reports",
  "/attendance-management/register", "/attendance-management/reports",
  "/admission-management/enquiries", "/admission-management/applications",
  "/library-management/reports", "/staff-hr-management/leave",
];

const anyFilter = (f: DashFilters) => Boolean(f.campusId || f.date || f.from || f.yearId || f.classId);

/** A card's link with the Dashboard's filters carried over (internal links only). */
export function carryFilters(href: string, f: DashFilters): string {
  if (!href.startsWith("/") || href.startsWith("//") || !anyFilter(f)) return href;
  const url = new URL(href, "http://school.local");
  if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) return href;
  const p = url.searchParams;
  if (f.campusId) p.set("campus", f.campusId);
  if (f.date) {
    const to = iso(f.date);
    const from = f.from ? iso(f.from) : to;
    if (p.get("period") === "today" || (RANGE_LISTS.includes(url.pathname) && !p.has("period") && !p.has("from") && !p.has("section"))) {
      p.set("period", "custom");
      p.set("from", from);
      p.set("to", to);
    }
    if (f.date && DAY_LISTS.includes(url.pathname) && !p.has("date")) p.set("date", to);
  }
  if (f.yearId && YEAR_LISTS.some((x) => url.pathname === x || url.pathname.startsWith(`${x}/`)) && !p.has("year")) p.set("year", f.yearId);
  // One class: the Student List (the cards that count students by class); a link to one class or section keeps its own.
  if (f.classId && url.pathname === "/student-management" && !p.has("class") && !p.has("section")) p.set("class", f.classId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Every `href` in a Dashboard home with the filters carried over (plain objects and arrays only). */
export function carryAll<T>(value: T, f: DashFilters): T {
  if (!anyFilter(f)) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === "href" || k === "takeHref") && typeof x === "string" ? carryFilters(x, f) : walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
