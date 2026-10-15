// Who sees what in Transport Management (05-roles.md column 12, the approved
// prototype's config.js VIEW, OWN and DUTY):
//   Full (Transport In-charge): every page, and does the work.
//   Full but oversees (Principal: reads every page; School Admin: reads every
//   page and keeps Transport Settings), from src/lib/duty.ts.
//   View (Vice Principal): reads every page except Transport Settings.
//   Own (Driver): Trips only, today's own trips (and the driver app).
// Live Tracking shows only when the school has switched live tracking on.
// Pages a role may not use are hidden and their addresses refused on the
// server; the person alone decides this, with no database.
import type { ModuleKey } from "../modules";
import type { PermissionMap, Reach } from "../permissions";
import { oversees, pageMode, type DutyPerson, type PageMode } from "../duty";
import { LIVE_FEATURE, MODULE, PAGES, type PageKey } from "./words";

export type TrWho = DutyPerson & { permissions: PermissionMap; modulesOn: ReadonlySet<ModuleKey>; features: ReadonlySet<string> };

export type TrViewer = {
  see: Reach;
  change: Reach;
  level: "full" | "view" | "own" | "none";
  roleKeys: string[];
  on: boolean;
  live: boolean;
  pages: Record<PageKey, PageMode>;
};

export function trViewer(who: TrWho): TrViewer {
  const p = who.permissions[MODULE] ?? { see: "none", change: "none" };
  const level = p.change === "all" ? "full" : p.see === "all" ? "view" : p.see === "own" ? "own" : "none";
  const on = who.modulesOn.has(MODULE);
  const live = who.features.has(LIVE_FEATURE);
  const pages = Object.fromEntries(PAGES.map(({ key }) => {
    let mode: PageMode;
    if (!on || level === "none") mode = "hidden";
    else if (key === "live" && !live) mode = "hidden";
    else if (level === "own") mode = key === "trips" ? "view" : "hidden";
    else if (level === "view") mode = key === "settings" ? "hidden" : "view";
    else mode = pageMode(who, MODULE, key);
    return [key, mode];
  })) as Record<PageKey, PageMode>;
  return { see: p.see, change: p.change, level, roleKeys: who.roles.map((r) => r.key).filter((k): k is string => Boolean(k)), on, live, pages };
}

export type TrCan = ReturnType<typeof trCan>;

/** What the person may do, page by page. The server checks the same before each change. */
export function trCan(v: TrViewer, who: DutyPerson) {
  const work = (k: PageKey) => v.pages[k] === "full";
  const leader = oversees(who);
  return {
    /** Add and edit routes and stops, fees per stop. */
    routes: work("routes"),
    /** Vehicles, papers, drivers, vendors, fuel and repairs. */
    fleet: work("vehicles"),
    /** Give, change and stop students' transport; bus passes. */
    students: work("students"),
    /** Trip schedule, start, end, stops, boarding, change for one day. */
    trips: work("trips"),
    /** Close alerts, call drivers, message a route's parents. */
    live: work("live") || (v.pages.live === "hidden" && work("trips")),
    settings: work("settings"),
    /** The emergency message to a route's parents: the in-charge, and the Principal who is alerted with them (12 §2 Trips). */
    emergencyMessage: work("trips") || (v.level === "full" && who.roles.some((r) => r.key === "principal")),
    /** Leaders who read the pages remind the Transport In-charge instead. */
    remind: leader && v.level !== "none" && !work("trips"),
    /** Vendor bank details: Full level only. */
    vendorBank: v.level === "full",
    export: v.level === "full" || v.level === "view",
    reports: v.pages.reports !== "hidden",
  };
}

export const pageAllowed = (v: TrViewer, page: PageKey) => v.pages[page] !== "hidden";

/** The first page this person may open (the module's address goes there). */
export function firstPage(v: TrViewer): PageKey | null {
  return PAGES.find((p) => v.pages[p.key] !== "hidden")?.key ?? null;
}
