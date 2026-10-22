// What every Front Office page starts with: the signed-in person, checked on
// the server, their Front Office level (Full, View, Office Staff or Gate
// Security) and what it lets them do, today in the school's time zone, the
// Front Office settings and the optional parts switched on.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { foCan, foPageAllowed, foViewer, type FoPageKey } from "@/lib/front-office/access";
import { foFeaturesOn, frontOfficeSettings, passEndMinute } from "@/lib/front-office/settings";
import { minuteNow, todayDate, todayIso } from "@/lib/front-office/time";
import { BASE, clockOf, passLine, type ClosedDay, type FrontOfficeFeature } from "@/lib/front-office/words";
import { isSchoolDay } from "@/lib/calendar/school-days";

export { BASE };
export const MODULE = "front-office" as const;

export const foPage = cache(async () => {
  const current = await requirePage(MODULE);
  const v = foViewer(current);
  const can = foCan(v);
  const tz = current.school.timeZone;
  const now = new Date();
  const todayStr = todayIso(tz, now);
  const today = todayDate(tz, now);
  const [dates, data] = await Promise.all([
    periodSetup(current),
    withSchool(current.ctx, async (tx) => {
      const [settings, features, day] = await Promise.all([frontOfficeSettings(tx, current.ctx), foFeaturesOn(tx, current.ctx), isSchoolDay(tx, current.ctx, today, { campusId: null })]);
      const passEnd = await passEndMinute(tx, current.ctx, settings, todayStr);
      // A holiday, Sunday or Saturday off at the main campus (the one school-day rule, QA FO-02, FO-03).
      const closedToday: ClosedDay | null = day.on ? null : { reason: day.reason, title: day.title };
      return { settings, features, passEnd, closedToday };
    }),
  ]);
  const has = (f: FrontOfficeFeature) => data.features.has(f);
  const may = (page: FoPageKey) => foPageAllowed(v, page) && (page !== "postal" || has("front-office-postal"));
  const minute = minuteNow(tz, now);
  return { current, v, can, tz, now, today, todayStr, minute, dates, ...data, passEndWords: clockOf(data.passEnd), passLine: passLine(data.passEnd, minute, data.closedToday), has, may };
});

export type FoPage = Awaited<ReturnType<typeof foPage>>;

/** Front Office's pages in the order of the approved design (mod-frontoffice.jsx); only those this person may open. */
export async function foTabs() {
  const p = await foPage();
  return ([
    { key: "desk", href: BASE, label: "Reception Desk", exact: true },
    { key: "visitors", href: `${BASE}/visitors`, label: "Visitors" },
    { key: "pickup", href: `${BASE}/pickup`, label: "Student Pickup" },
    { key: "enquiries", href: `${BASE}/enquiries`, label: "Enquiries & Calls" },
    { key: "appointments", href: `${BASE}/appointments`, label: "Appointments" },
    { key: "postal", href: `${BASE}/postal`, label: "Postal & Deliveries" },
  ] as const).filter((t) => p.may(t.key)).map(({ href, label, ...t }) => ({ href, label, exact: "exact" in t ? t.exact : undefined }));
}

/** A Front Office page this person may open; anything else is the plain "no access" page. */
export async function foGuard(page: FoPageKey) {
  const p = await foPage();
  if (!p.may(page)) {
    if (page === "postal" && foPageAllowed(p.v, "postal")) redirect(BASE);
    redirect(`/no-access?m=${MODULE}`);
  }
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
export function foPeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  return { range, keep, label: range?.label ?? "All dates" };
}
