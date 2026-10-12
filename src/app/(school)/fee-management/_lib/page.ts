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
import { feeViewer } from "@/lib/fees/access";
import { counterAllowed, feeFeaturesOn, feeSettings } from "@/lib/fees/settings";
import { ensureFinanceDefaults } from "@/lib/finance/settings";

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
  const keys = data.viewer.roleKeys;
  /** Admission Counsellor: only application and admission fee status (05-roles.md). */
  const admissionOnly = keys.includes("admission-counsellor") && !keys.some((k) => FULL_VIEW_ROLES.includes(k)) && data.viewer.change !== "all";
  const reach: "all" | "view" | "own" = data.viewer.change === "all" ? "all" : data.viewer.see === "own" ? "own" : "view";
  return { current, ...data, tz, today: todayIn(tz), can, admissionOnly, reach };
});

const FULL_VIEW_ROLES = ["principal", "school-admin", "accountant", "vice-principal"];

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
    { href: BASE, label: "Collect Fee", exact: true, also: [`${BASE}/collect`] },
    { href: `${BASE}/ledger`, label: "Student Fee Ledger" },
    { href: `${BASE}/defaulters`, label: "Defaulters" },
    { href: `${BASE}/structure`, label: "Fee Structure" },
    { href: `${BASE}/concessions`, label: "Concessions & Refunds" },
    { href: `${BASE}/reports`, label: "Fee Reports" },
    ...(p.can.change ? [{ href: `${BASE}/settings`, label: "Fee Settings" }] : []),
  ];
}

/** Pages for people with full Fee Management (not the "own" class-teacher view). */
export async function feeStaffPage() {
  const p = await feePage();
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
