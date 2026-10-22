// The Dashboard's filters (01-dashboard.md §2 Controls; gap list G36): a
// campus, within the person's own limit, and a day (default today). Every
// card is worked out for them (compose.ts narrows the person to the campus and
// moves "today" to the day), and every card's link carries the same filters,
// so the list it opens shows the records counted: ?campus= on every link,
// and the day in each list's own date filter.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { campusChoices, type CampusLimit } from "../campus";

export type DashFilters = {
  /** A campus chosen by a person who sees more than one; null for all they see. */
  campusId: string | null;
  /** A past day chosen instead of today; null for today. */
  date: Date | null;
};

export const NO_FILTERS: DashFilters = { campusId: null, date: null };

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The filters in the page address, kept only when allowed: a campus the
 * person may see (only when they see more than one), and a day from a year
 * back up to yesterday (today is the default).
 */
export async function readDashFilters(tx: Tx, ctx: SchoolContext, who: CampusLimit, sp: Record<string, string | string[] | undefined>, today: Date) {
  const campuses = await campusChoices(tx, ctx, who);
  const c = first(sp.campus);
  const campusId = campuses.length > 1 && UUID.test(c) && campuses.some((x) => x.id === c) ? c : null;
  const d = first(sp.date);
  const asked = DAY.test(d) ? new Date(`${d}T00:00:00Z`) : null;
  const date = asked && !Number.isNaN(asked.getTime()) && asked < today && asked.getTime() >= today.getTime() - 366 * DAY_MS ? asked : null;
  return { filters: { campusId, date } satisfies DashFilters, campuses };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Lists whose date filter is read from period/from/to; the staff attendance list reads ?date=. */
const RANGE_LISTS = ["/attendance-management/register", "/fee-management/dashboard", "/finance-management/day-book"];

/** A card's link with the Dashboard's filters carried over (internal links only). */
export function carryFilters(href: string, f: DashFilters): string {
  if (!href.startsWith("/") || href.startsWith("//") || (!f.campusId && !f.date)) return href;
  const url = new URL(href, "http://school.local");
  if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) return href;
  if (f.campusId) url.searchParams.set("campus", f.campusId);
  if (f.date) {
    const day = iso(f.date);
    const p = url.searchParams;
    if (p.get("period") === "today" || (RANGE_LISTS.includes(url.pathname) && !p.has("period") && !p.has("from") && !p.has("section"))) {
      p.set("period", "custom");
      p.set("from", day);
      p.set("to", day);
    }
    if (url.pathname === "/attendance-management/staff" && !p.has("date")) p.set("date", day);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Every `href` in a Dashboard home with the filters carried over (plain objects and arrays only). */
export function carryAll<T>(value: T, f: DashFilters): T {
  if (!f.campusId && !f.date) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === "href" || k === "takeHref") && typeof x === "string" ? carryFilters(x, f) : walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
