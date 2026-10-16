// What every Inventory page starts with: the signed-in person, checked on the
// server (the module must be open to them and switched on), their page modes
// (src/lib/duty.ts) and what they may do, today in the school's time zone,
// the shared date filter's setup and the Inventory Settings.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { dateWhere, periodFromSearch, type DayRange, type PeriodKey } from "@/lib/periods";
import { todayDate, todayIso } from "@/lib/front-office/time";
import { invCan, invViewer, landingPage, pageOpen, type InvPage } from "@/lib/inventory/access";
import { inventorySettings } from "@/lib/inventory/settings";
import { BASE, MODULE } from "@/lib/inventory/words";

export { BASE, MODULE };

export const invPage = cache(async () => {
  const current = await requirePage(MODULE);
  const v = invViewer(current);
  const can = invCan(v);
  const tz = current.school.timeZone;
  const now = new Date();
  const [dates, settings] = await Promise.all([periodSetup(current), withSchool(current.ctx, (tx) => inventorySettings(tx, current.ctx))]);
  return { current, v, can, tz, now, today: todayDate(tz, now), todayStr: todayIso(tz, now), dates, settings };
});

export type InvPageData = Awaited<ReturnType<typeof invPage>>;

const TABS: { key: InvPage; href: string; label: string; exact?: boolean }[] = [
  { key: "items", href: `${BASE}/items`, label: "Items & Stock" },
  { key: "issue", href: BASE, label: "Issue Stock", exact: true },
  { key: "purchases", href: `${BASE}/purchases`, label: "Purchases & Vendors" },
  { key: "assets", href: `${BASE}/assets`, label: "Assets" },
  { key: "rooms", href: `${BASE}/rooms`, label: "Rooms, Labs & Maintenance" },
  { key: "reports", href: `${BASE}/reports`, label: "Inventory Reports" },
  { key: "settings", href: `${BASE}/settings`, label: "Inventory Settings" },
];

export const pageHref = (k: InvPage) => TABS.find((t) => t.key === k)!.href;

/** Inventory's pages in the blueprint's order, only those this person may open. */
export async function invTabs() {
  const p = await invPage();
  return TABS.filter((t) => pageOpen(p.v, t.key)).map(({ href, label, exact }) => ({ href, label, exact }));
}

/**
 * An Inventory page this person may open. The module's own address
 * (/inventory-management) goes to the first page they use; a direct address
 * of any other page they cannot use goes to the plain "no access" page.
 */
export async function invGuard(page: InvPage) {
  const p = await invPage();
  if (!pageOpen(p.v, page)) {
    const land = landingPage(p.v);
    if (page === "issue" && land) redirect(pageHref(land));
    redirect(`/no-access?m=${MODULE}`);
  }
  return { ...p, mode: p.v.pages[page] };
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOr = (v: string) => (UUID.test(v) ? v : "");

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
export function invPeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  return { range, keep, label: range?.label ?? "All dates" };
}

/** A date range as a Prisma filter on a @db.Date column. */
export const dayWhere = (range: DayRange | null) => (range ? dateWhere(range) : undefined);
