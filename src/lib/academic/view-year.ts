// A year other than the current one, chosen on the Dashboard (?year=, gap
// list G36; 01-dashboard.md Done when 8), read the same way by every list a
// Dashboard card opens. Only a year of the person's campus is taken (the
// campus chosen with ?campus=, else their own: the years the Dashboard's
// filter offers); a year still to come, another campus's year or the current
// year itself leaves the list on the current year, its default. A year that is
// over is read-only: the list shows it as it stood at its last day, and
// nothing can be changed from there (P18).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { personCampusId, type CampusLimit } from "../campus";
import { currentYear } from "./years";

export type ViewYear = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  campusId: string;
  /** The year is over (closed, or its last day has passed): read-only, numbers as at its last day. */
  past: boolean;
  /** "Today" for this year: its last day when it is over, else today. */
  asOf: Date;
};

const UUID = /^[0-9a-f-]{36}$/i;
const first = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The year in the page address (?year=), when it is one the person may view
 * instead of the current one; null for the current year (the default).
 * `who`: the person, narrowed to the campus chosen in the address if any.
 */
export async function readViewYear(tx: Tx, ctx: SchoolContext, who: CampusLimit, raw: string | string[] | undefined | null, today: Date): Promise<ViewYear | null> {
  const id = first(raw);
  if (!UUID.test(id)) return null;
  const campusId = await personCampusId(tx, ctx, who);
  if (!campusId) return null;
  const y = await tx.academicYear.findFirst({ where: { id, schoolId: ctx.schoolId, campusId, archivedAt: null, status: { not: "UPCOMING" } } });
  if (!y) return null;
  if ((await currentYear(tx, ctx, campusId))?.id === y.id) return null;
  const past = y.status === "CLOSED" || y.endDate < today;
  return { id: y.id, name: y.name, startDate: y.startDate, endDate: y.endDate, status: y.status, campusId: y.campusId, past, asOf: past && y.endDate < today ? y.endDate : today };
}

/**
 * "Now" for counts of a moment (new this week, follow-ups late): noon (UTC) on
 * the year's last day when it is over, else the real now.
 */
export function viewNow(view: ViewYear | null, now: Date): Date {
  return view?.past ? new Date(view.asOf.getTime() + 12 * 3_600_000) : now;
}

/**
 * The page address with the year's own dates when none were chosen
 * (period=custom from its first day to its last, or to today while it runs):
 * a list of a year shows that year, as the Dashboard's link counted it.
 */
export function withYearDates<T extends Record<string, string | string[] | undefined>>(sp: T, view: ViewYear | null, prefix = ""): T {
  if (!view || sp[`${prefix}period`] || sp[`${prefix}from`] || sp[`${prefix}to`]) return sp;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { ...sp, [`${prefix}period`]: "custom", [`${prefix}from`]: iso(view.startDate), [`${prefix}to`]: iso(view.asOf < view.endDate ? view.asOf : view.endDate) };
}

/** The same page without ?year= (and without the page number): "Back to this year". */
export function backToThisYear(path: string, sp: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "year" || k === "page" || v === undefined) continue;
    out.set(k, Array.isArray(v) ? v[0] : v);
  }
  return out.size ? `${path}?${out}` : path;
}
