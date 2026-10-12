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
import { admissionOnly as isAdmissionOnly, feeViewer } from "@/lib/fees/access";
import { counterAllowed, feeFeaturesOn, feeSettings } from "@/lib/fees/settings";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";

export const MODULE = "fee-management" as const;
export const BASE = "/fee-management";

export const feePage = cache(async () => {
  const current = await requirePage(MODULE);
  const data = await withSchool(current.ctx, async (tx) => {
    await ensureFinanceDefaults(tx, current.ctx);
    const [viewer, settings, features, year, school] = await Promise.all([
      feeViewer(tx, current.ctx, current),
      feeSettings(tx, current.ctx),
      feeFeaturesOn(tx, current.ctx),
      currentYear(tx, current.ctx),
      tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true, gstin: true, timeZone: true } }),
    ]);
    return { viewer, settings, features, year, school };
  });
  const tz = data.school.timeZone;
  const can = {
    change: data.viewer.change === "all",
    counter: (perm: Parameters<typeof counterAllowed>[2]) => counterAllowed(data.settings, data.viewer.roleKeys, perm),
  };
  /** Admission Counsellor: only application and admission fee status (05-roles.md). */
  const admissionOnly = isAdmissionOnly(data.viewer);
  const reach: "all" | "view" | "own" = data.viewer.change === "all" ? "all" : data.viewer.see === "own" ? "own" : "view";
  return { current, ...data, tz, today: todayIn(tz), can, admissionOnly, reach };
});

/** Fee Management's pages, in the order of the approved design (mod-fees.jsx). */
export async function feeTabs() {
  const p = await feePage();
  if (p.admissionOnly) return [];
  if (p.viewer.see === "own") {
    return [
      { href: `${BASE}/ledger`, label: "Student Fee Ledger" },
      { href: `${BASE}/defaulters`, label: "Defaulters" },
    ];
  }
  return [
    { href: `${BASE}/dashboard`, label: "Fee Dashboard", also: [`${BASE}/payments`] },
    ...(p.can.change ? [{ href: BASE, label: "Collect Fee", exact: true, also: [`${BASE}/collect`] }] : []),
    { href: `${BASE}/ledger`, label: "Student Fee Ledger" },
    { href: `${BASE}/defaulters`, label: "Defaulters" },
    { href: `${BASE}/structure`, label: "Fee Structure" },
    { href: `${BASE}/concessions`, label: "Concessions & Refunds" },
    { href: `${BASE}/reports`, label: "Fee Reports" },
    ...(p.can.change ? [{ href: `${BASE}/settings`, label: "Fee Settings" }] : []),
  ];
}

/** Pages with fee details (ledgers): not for the Admission Counsellor, who sees admission fees on the Fee Dashboard. */
export async function feeDetailsPage() {
  const p = await feePage();
  if (p.admissionOnly) redirect(`${BASE}/dashboard`);
  return p;
}

/** Pages for people with full Fee Management (not the "own" class-teacher view). */
export async function feeStaffPage() {
  const p = await feeDetailsPage();
  if (p.viewer.see !== "all") redirect(`${BASE}/ledger`);
  return p;
}

/** Pages that change things: Fee Settings. View-only people go to the Fee Dashboard. */
export async function feeManagerPage() {
  const p = await feeStaffPage();
  if (!p.can.change) redirect(`${BASE}/dashboard`);
  return p;
}

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
export function feePeriod(sp: Record<string, string | string[] | undefined>, timeZone: string, fallback: PeriodKey | null = null, prefix = "") {
  const range = periodFromSearch(sp, { timeZone, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  if (!range) return { range: null, from: null, to: null, words: "on any date", keep };
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const l = range.label;
  const words = /^(today|yesterday)$/i.test(l) ? l.toLowerCase() : /^(last|this)\b/i.test(l) ? `in ${l.toLowerCase()}` : `in ${l}`;
  return { range, from, to, words, keep };
}
