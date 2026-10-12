// What every Finance Management page starts with: the signed-in person,
// checked on the server, what they may do here, today in the school's time
// zone, the financial year holding today, Finance Settings and the optional
// parts switched on for this school.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { reachFor } from "@/lib/permissions";
import { periodSetup, type PeriodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { todayIn } from "@/lib/staff/dates";
import { financeFeaturesOn, financeSettings } from "@/lib/finance/settings";
import { financialYearOf, fyStartMonth } from "@/lib/finance/years";
import type { FinanceFeature } from "@/lib/finance/words";
import { financeLevel, financePageAllowed, hiddenPayHeads, type FinancePageKey } from "@/lib/finance/access";

export const MODULE = "finance-management" as const;
export const BASE = "/finance-management";

export const financePage = cache(async () => {
  const current = await requirePage(MODULE);
  const dates = await periodSetup(current);
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const data = await withSchool(current.ctx, async (tx) => {
    const [settings, features, fy, startMonth, school, payHeads] = await Promise.all([
      financeSettings(tx, current.ctx),
      financeFeaturesOn(tx, current.ctx),
      financialYearOf(tx, current.ctx, today),
      fyStartMonth(tx, current.ctx),
      tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true, gstin: true } }),
      hiddenPayHeads(tx, current.permissions),
    ]);
    return { settings, features, fy, startMonth, school, payHeads };
  });
  const p = current.permissions;
  const can = {
    create: reachFor(p, MODULE, "create") === "all",
    edit: reachFor(p, MODULE, "edit") === "all",
    approve: reachFor(p, MODULE, "approve") === "all",
    archive: reachFor(p, MODULE, "archive") === "all",
    export: reachFor(p, MODULE, "export") !== "none",
  };
  const has = (f: FinanceFeature) => data.features.has(f);
  const level = financeLevel(p);
  /** May this person open that Finance page? Pages they may not open are hidden, not disabled. */
  const may = (page: FinancePageKey) => financePageAllowed(p, page);
  /** First day of records in School OS (Finance Settings); earlier days stay in the old software. */
  const goLive = data.settings.goLiveDate;
  return { current, dates, tz, today, ...data, can, change: can.create || can.edit, has, level, may, goLive };
});

export type FinancePage = Awaited<ReturnType<typeof financePage>>;

/** Finance Management's pages, in the order of the approved design (mod-finance.jsx). Optional pages show only when switched on. */
export async function financeTabs() {
  const p = await financePage();
  return [
    { key: "day-book", href: `${BASE}/day-book`, label: "Day Book" },
    { key: "income", href: `${BASE}/income`, label: "Income" },
    { key: "expenses", href: `${BASE}/expenses`, label: "Expenses" },
    { key: "cash-bank", href: `${BASE}/cash-bank`, label: "Cash & Bank" },
    ...(p.has("finance-budget") ? [{ key: "budget", href: `${BASE}/budget`, label: "Budget" }] : []),
    ...(p.has("finance-accounts") ? [{ key: "accounts", href: `${BASE}/accounts`, label: "Accounts" }] : []),
    { key: "reports", href: `${BASE}/reports`, label: "Finance Reports" },
    { key: "settings", href: `${BASE}/settings`, label: "Finance Settings" },
  ].filter((t) => p.may(t.key as FinancePageKey)).map(({ key, ...t }) => (void key, t));
}

/** A Finance page this person may open; anything else is a plain "no access" page. */
export async function financeGuard(page: FinancePageKey) {
  const p = await financePage();
  if (!p.may(page)) redirect(`/no-access?m=${MODULE}`);
  return p;
}

const PAGE_OF: Partial<Record<FinanceFeature, FinancePageKey>> = { "finance-budget": "budget", "finance-accounts": "accounts" };

/** A page for one optional part: closed when the school has it off, and only for people who may open it. */
export async function financeFeaturePage(f: FinanceFeature) {
  const page = PAGE_OF[f];
  const p = page ? await financeGuard(page) : await financePage();
  if (!p.has(f)) redirect(`${BASE}/day-book`);
  return p;
}

/** Finance Settings: full Finance Management only. */
export const financeManagerPage = () => financeGuard("settings");

export function qs(base: string, params: Record<string, string | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The shared date filter read on the server, as dates; with no choice and no fallback, null. */
export function financePeriod(sp: Record<string, string | string[] | undefined>, dates: PeriodSetup, fallback: PeriodKey | null = null, prefix = "") {
  const range = periodFromSearch(sp, { ...dates, fallback, prefix });
  const keep: Record<string, string | null> = { [`${prefix}period`]: one(sp[`${prefix}period`]) || null, [`${prefix}from`]: one(sp[`${prefix}from`]) || null, [`${prefix}to`]: one(sp[`${prefix}to`]) || null };
  if (!range) return { range: null, from: null, to: null, label: "Any date", keep };
  return { range, from: new Date(`${range.from}T00:00:00Z`), to: new Date(`${range.to}T00:00:00Z`), label: range.label, keep };
}
