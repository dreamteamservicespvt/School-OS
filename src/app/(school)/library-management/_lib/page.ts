// What every Library page starts with: the signed-in person, checked on the
// server (the module must be open to them and switched on), their page modes
// (src/lib/duty.ts) and what they may do, today in the school's time zone,
// the shared date filter's setup and the Library Settings.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { todayDate, todayIso } from "@/lib/front-office/time";
import { landingPage, libCan, libViewer, pageOpen, type LibPage } from "@/lib/library/access";
import { librarySettings } from "@/lib/library/settings";
import { BASE, MODULE } from "@/lib/library/words";

export { BASE, MODULE };

export const libPage = cache(async () => {
  const current = await requirePage(MODULE);
  const v = libViewer(current);
  const can = libCan(v);
  const tz = current.school.timeZone;
  const now = new Date();
  const [dates, settings] = await Promise.all([periodSetup(current), withSchool(current.ctx, (tx) => librarySettings(tx, current.ctx))]);
  return { current, v, can, tz, now, today: todayDate(tz, now), todayStr: todayIso(tz, now), dates, settings };
});

export type LibPageData = Awaited<ReturnType<typeof libPage>>;

const TABS: { key: LibPage; href: string; label: string; exact?: boolean }[] = [
  { key: "books", href: `${BASE}/books`, label: "Books" },
  { key: "issue", href: BASE, label: "Issue & Return", exact: true },
  { key: "members", href: `${BASE}/members`, label: "Members & Cards" },
  { key: "fines", href: `${BASE}/fines`, label: "Fines & Stock Check" },
  { key: "reports", href: `${BASE}/reports`, label: "Library Reports" },
  { key: "settings", href: `${BASE}/settings`, label: "Library Settings" },
];

/** The Library's pages in the approved design's order, only those this person may open. */
export async function libTabs() {
  const p = await libPage();
  return TABS.filter((t) => pageOpen(p.v, t.key)).map(({ href, label, exact }) => ({ href, label, exact }));
}

/**
 * A Library page this person may open. The module's own address
 * (/library-management) goes to the first page they use; a direct address of
 * any other page they cannot use goes to the plain "no access" page.
 */
export async function libGuard(page: LibPage) {
  const p = await libPage();
  if (!pageOpen(p.v, page)) {
    const land = landingPage(p.v);
    if (page === "issue" && land) redirect(TABS.find((t) => t.key === land)!.href);
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

/** The shared date filter read on the server; `fallback` is what shows with no choice. */
export function libPeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  return { range, keep, label: range?.label ?? "All dates" };
}
