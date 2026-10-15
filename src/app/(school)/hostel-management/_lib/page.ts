// What every Hostel page starts with: the signed-in person, checked on the
// server (the module must be open to them and switched on), their page modes
// (src/lib/duty.ts) and what they may do, their own hostels (a warden works in
// their own hostel only), today in the school's time zone, the shared date
// filter's setup and the Hostel Settings.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { minuteNow, todayDate, todayIso } from "@/lib/front-office/time";
import { hostelCan, hostelViewer, landingPage, pageOpen, type HostelPage } from "@/lib/hostel/access";
import { myHostelIds } from "@/lib/hostel/scope";
import { hostelSettings } from "@/lib/hostel/settings";
import { BASE, MODULE } from "@/lib/hostel/words";

export { BASE, MODULE };

export const hostelPage = cache(async () => {
  const current = await requirePage(MODULE);
  const v = hostelViewer(current);
  const can = hostelCan(v);
  const tz = current.school.timeZone;
  const now = new Date();
  const [dates, data] = await Promise.all([
    periodSetup(current),
    withSchool(current.ctx, async (tx) => {
      const [settings, mine, hostels] = await Promise.all([
        hostelSettings(tx, current.ctx),
        myHostelIds(tx, current.ctx, v),
        tx.hostel.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, gender: true, floors: true } }),
      ]);
      return { settings, mine, hostels };
    }),
  ]);
  const myHostels = data.mine === null ? data.hostels : data.hostels.filter((h) => data.mine!.includes(h.id));
  return { current, v, can, tz, now, today: todayDate(tz, now), todayStr: todayIso(tz, now), minute: minuteNow(tz, now), dates, ...data, myHostels };
});

export type HostelPageData = Awaited<ReturnType<typeof hostelPage>>;

const TABS: { key: HostelPage; href: string; label: string; exact?: boolean }[] = [
  { key: "rooms", href: `${BASE}/rooms`, label: "Rooms & Beds" },
  { key: "allocation", href: `${BASE}/allocation`, label: "Allocation" },
  { key: "rollcall", href: BASE, label: "Roll Call & Incidents", exact: true },
  { key: "outings", href: `${BASE}/outings`, label: "Outing & Visitors" },
  { key: "mess", href: `${BASE}/mess`, label: "Mess" },
  { key: "reports", href: `${BASE}/reports`, label: "Hostel Reports" },
  { key: "settings", href: `${BASE}/settings`, label: "Hostel Settings" },
];

/** The hostel's pages in the spec's order, only those this person may open. */
export async function hostelTabs() {
  const p = await hostelPage();
  return TABS.filter((t) => pageOpen(p.v, t.key)).map(({ href, label, exact }) => ({ href, label, exact }));
}

/**
 * A Hostel page this person may open. The module's own address goes to the
 * first page they use; a direct address of any other page they cannot use
 * goes to the plain "no access" page.
 */
export async function hostelGuard(page: HostelPage) {
  const p = await hostelPage();
  if (!pageOpen(p.v, page)) {
    const land = landingPage(p.v);
    if (page === "rollcall" && land) redirect(TABS.find((t) => t.key === land)!.href);
    redirect(`/no-access?m=${MODULE}`);
  }
  return { ...p, mode: p.v.pages[page] };
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type Raw = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idParam = (v: string | string[] | undefined) => (UUID.test(one(v)) ? one(v) : null);

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

/** The current address's query (to keep filters when a sheet opens or closes). */
export function keepQ(sp: Raw, drop: string[] = []) {
  const u = new URLSearchParams();
  for (const [k, val] of Object.entries(sp)) {
    if (drop.includes(k)) continue;
    const x = one(val);
    if (x) u.set(k, x);
  }
  return Object.fromEntries(u.entries());
}

/** The shared date filter read on the server; `fallback` is what shows with no choice. */
export function hostelPeriod(sp: Raw, dates: PeriodSetup, fallback: PeriodKey | null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  return { range, keep, label: range?.label ?? "All dates" };
}

/** The hostel chosen on a page: from the address when it is the person's, else their first. */
export function chosenHostel(p: HostelPageData, raw: string | string[] | undefined) {
  const want = one(raw);
  return p.myHostels.find((h) => h.id === want) ?? p.myHostels[0] ?? null;
}
