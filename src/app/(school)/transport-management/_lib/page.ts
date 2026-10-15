// What every Transport page starts with: the signed-in person checked on the
// server (requirePage refuses a role with no Transport reach and a school
// with Transport off), their Transport level and what it lets them do, today
// in the school's time zone, the date filter setup and Transport Settings.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { firstPage, trCan, trViewer } from "@/lib/transport/access";
import { transportSettings } from "@/lib/transport/settings";
import { minuteNow, todayDate, todayIso } from "@/lib/front-office/time";
import { BASE, MODULE, PAGES, pageHref, type PageKey } from "@/lib/transport/words";

export { BASE, MODULE };

export const trPage = cache(async () => {
  const current = await requirePage(MODULE);
  const v = trViewer(current);
  const can = trCan(v, current);
  const tz = current.school.timeZone;
  const now = new Date();
  const todayStr = todayIso(tz, now);
  const today = todayDate(tz, now);
  const [dates, settings] = await Promise.all([periodSetup(current), withSchool(current.ctx, (tx) => transportSettings(tx, current.ctx))]);
  return { current, v, can, tz, now, today, todayStr, minute: minuteNow(tz, now), dates, settings };
});

export type TrPage = Awaited<ReturnType<typeof trPage>>;

/** Transport's pages as tabs, only those this person may open (hidden, never disabled). */
export async function trTabs() {
  const p = await trPage();
  return PAGES.filter((t) => p.v.pages[t.key] !== "hidden").map((t) => ({ href: t.href, label: t.name, exact: t.key === "live" ? true : undefined }));
}

/** A Transport page this person may open; anything else is the plain "no access" page. */
export async function trGuard(page: PageKey) {
  const p = await trPage();
  if (p.v.pages[page] === "hidden") {
    const first = firstPage(p.v);
    if (page === "live" && first) redirect(pageHref(first));
    redirect(`/no-access?m=${MODULE}`);
  }
  return { ...p, mode: p.v.pages[page] };
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

/** A chosen range as 00:00 UTC dates, for @db.Date columns. */
export const rangeDates = (r: { from: string; to: string } | null) => (r ? { from: new Date(`${r.from}T00:00:00Z`), to: new Date(`${r.to}T00:00:00Z`) } : null);

/** The shared date filter read on the server; `fallback` is what shows with no choice. */
export function trPeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  return { range, keep, label: range?.label ?? "All dates" };
}
