// What every Fee Management page starts with: the signed-in person, checked on
// the server, what they may see and do here, today in the school's time zone,
// the academic year and the Fee Settings.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { currentYear } from "@/lib/academic/years";
import { todayIn } from "@/lib/staff/dates";
import { admissionOnly as isAdmissionOnly, feeLevel, feePageAllowed, feeViewer, type FeePageKey } from "@/lib/fees/access";
import { counterAllowed, feeFeaturesOn, feeSettings } from "@/lib/fees/settings";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { pageMode } from "@/lib/duty";

export const MODULE = "fee-management" as const;
export const BASE = "/fee-management";

export const feePage = cache(async () => {
  const current = await requirePage(MODULE);
  const dates = await periodSetup(current);
  const data = await withSchool(current.ctx, async (tx) => {
    await ensureFinanceDefaults(tx, current.ctx);
    const [viewer, settings, features, year, school, money] = await Promise.all([
      feeViewer(tx, current.ctx, current),
      feeSettings(tx, current.ctx),
      feeFeaturesOn(tx, current.ctx),
      currentYear(tx, current.ctx),
      tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true, gstin: true, timeZone: true } }),
      tx.financeSetting.findUniqueOrThrow({ where: { schoolId: current.ctx.schoolId }, select: { goLiveDate: true } }),
    ]);
    /** First day of fee records in School OS (Finance Settings); earlier ones stay in the old software. */
    return { viewer, settings, features, year, school, goLive: money.goLiveDate };
  });
  const tz = data.school.timeZone;
  const can = {
    change: data.viewer.change === "all",
    counter: (perm: Parameters<typeof counterAllowed>[2]) => counterAllowed(data.settings, data.viewer.roleKeys, perm),
  };
  /** Admission Counsellor: only application and admission fee status (05-roles.md). */
  const admissionOnly = isAdmissionOnly(data.viewer);
  const reach: "all" | "view" | "own" = data.viewer.change === "all" ? "all" : data.viewer.see === "own" ? "own" : "view";
  const level = feeLevel(data.viewer);
  /** May this person open that Fee Management page? (hidden, not disabled, when not) */
  // Desk work by role (src/lib/duty.ts): the Principal and School Admin read the fee pages but never sit at
  // the counter. A hidden page leaves the tabs and goes to the Fee Dashboard; a "view" page has no doing-buttons.
  // What the server allows still follows 05-roles.md.
  const mode = (page: FeePageKey) => pageMode(current, MODULE, page);
  const may = (page: FeePageKey) => feePageAllowed(data.viewer, page) && mode(page) !== "hidden";
  /** Does this person do the work on that page (collect, verify, remind, apply), not only read it? */
  const does = (page: FeePageKey) => can.change && may(page) && mode(page) === "full";
  /** Sits at the fee counter: Collect Fee buttons and links. */
  const desk = does("collect");
  return { current, dates, ...data, tz, today: todayIn(tz), can, admissionOnly, reach, level, may, does, desk };
});

/** Fee Management's pages, in the order of the approved design (mod-fees.jsx), for this person's level. */
export async function feeTabs() {
  const p = await feePage();
  if (p.level === "admission") return [{ href: `${BASE}/dashboard`, label: "Admission Fees" }];
  const all: { key: FeePageKey; href: string; label: string; exact?: boolean; also?: string[] }[] = [
    { key: "dashboard", href: `${BASE}/dashboard`, label: "Fee Dashboard", also: [`${BASE}/payments`] },
    { key: "collect", href: BASE, label: "Collect Fee", exact: true, also: [`${BASE}/collect`] },
    { key: "ledger", href: `${BASE}/ledger`, label: "Student Fee Ledger" },
    { key: "defaulters", href: `${BASE}/defaulters`, label: "Defaulters" },
    { key: "structure", href: `${BASE}/structure`, label: "Fee Structure" },
    { key: "concessions", href: `${BASE}/concessions`, label: "Concessions & Refunds" },
    { key: "reports", href: `${BASE}/reports`, label: "Fee Reports" },
    { key: "settings", href: `${BASE}/settings`, label: "Fee Settings" },
  ];
  return all.filter((t) => p.may(t.key)).map(({ key, ...t }) => (void key, t));
}

/** A Fee Management page this person's level may open; anything else is a plain "no access" page. */
export async function feeGuard(page: FeePageKey) {
  const p = await feePage();
  if (!p.may(page)) redirect(feePageAllowed(p.viewer, page) && page !== "dashboard" ? `${BASE}/dashboard` : `/no-access?m=${MODULE}`);
  return p;
}

/** Fee Settings: full Fee Management only. */
export const feeManagerPage = () => feeGuard("settings");

export function qs(base: string, params: Record<string, string | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The shared date filter (PeriodFilter) read on the server: the chosen days as
 * dates (null = all dates), the words for it, and the params to keep in links.
 */
export function feePeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null = null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  if (!range) return { range: null, from: null, to: null, words: "on any date", keep };
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const l = range.label;
  const words = /^(today|yesterday)$/i.test(l) ? l.toLowerCase() : /^(last|this)\b/i.test(l) ? `in ${l.toLowerCase()}` : `in ${l}`;
  return { range, from, to, words, keep };
}
