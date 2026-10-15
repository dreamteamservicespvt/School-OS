// What every Events & Calendar page starts with: the signed-in person,
// checked on the server, their Events level (Full, Event Payments, Own or
// View) and what it lets them do, today in the school's time zone, the Events
// Settings and the date filter setup.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { evCan, evPageAllowed, evViewer, type EvPageKey } from "@/lib/events/access";
import { eventsSettings } from "@/lib/events/settings";
import { staffForUser } from "@/lib/people";
import { localNow } from "@/lib/events/jobs";
import { BASE } from "@/lib/events/words";

export { BASE };
export const MODULE = "events-calendar" as const;

export const evPage = cache(async () => {
  const current = await requirePage(MODULE);
  const v = evViewer(current);
  const can = evCan(v);
  const tz = current.school.timeZone;
  const { today, hour } = localNow(new Date(), tz);
  const [dates, data] = await Promise.all([
    periodSetup(current),
    withSchool(current.ctx, async (tx) => {
      const [settings, me, year, campuses] = await Promise.all([
        eventsSettings(tx, current.ctx),
        staffForUser(tx, current.ctx),
        tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: new Date(`${today}T00:00:00Z`) }, endDate: { gte: new Date(`${today}T00:00:00Z`) } } }),
        tx.campus.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      return { settings, me, year, campuses };
    }),
  ]);
  const may = (page: EvPageKey) => evPageAllowed(v, page);
  return { current, v, can, tz, today, hour, dates, ...data, may, accountant: v.level === "pay" };
});

export type EvPage = Awaited<ReturnType<typeof evPage>>;

/** The module's pages in the approved design's order (config.js), only those this person may open; the Accountant's "Events" reads "Event Payments". */
export async function evTabs() {
  const p = await evPage();
  return ([
    { key: "calendar", href: BASE, label: "School Calendar", exact: true },
    { key: "events", href: `${BASE}/events`, label: p.accountant ? "Event Payments" : "Events" },
    { key: "ptm", href: `${BASE}/ptm`, label: "PTM" },
    { key: "gallery", href: `${BASE}/gallery`, label: "Gallery" },
    { key: "settings", href: `${BASE}/settings`, label: "Events Settings" },
  ] as const).filter((t) => p.may(t.key)).map(({ href, label, ...t }) => ({ href, label, exact: "exact" in t ? t.exact : undefined }));
}

/** A page this person may open; anything else is the plain "no access" page. */
export async function evGuard(page: EvPageKey) {
  const p = await evPage();
  if (!p.may(page)) redirect(`/no-access?m=${MODULE}`);
  return p;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function qs(base: string, params: Record<string, string | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) if (val) u.set(k, val);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

/** Adds (or replaces) query values on an address that may already have some. */
export function addQ(href: string, params: Record<string, string | null | undefined>) {
  const [path, query = ""] = href.split("?");
  const u = new URLSearchParams(query);
  for (const [k, val] of Object.entries(params)) {
    if (val) u.set(k, val);
    else u.delete(k);
  }
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}

/** The shared date filter read on the server; `fallback` is what shows with no choice. */
export function evPeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  return { range, keep, label: range?.label ?? "All dates" };
}
