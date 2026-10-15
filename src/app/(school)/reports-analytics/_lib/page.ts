// What every Reports & Analytics page starts with: the signed-in person,
// checked on the server, what Reports & Analytics allows them (reportAccess),
// today in the school's time zone, the date filter setup and the campuses.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup } from "@/lib/period-setup";
import { currentYear } from "@/lib/academic/years";
import { todayFor } from "@/lib/periods";
import { DEFAULT_GO_LIVE } from "@/lib/finance/go-live";
import { ownSectionIds } from "@/lib/people";
import { BASE, MODULE, reportAccess, reportTabs, type PageKey } from "@/lib/reports/access";

export { BASE, MODULE };

export const repPage = cache(async () => {
  const current = await requirePage(MODULE);
  const a = reportAccess(current);
  const tz = current.school.timeZone;
  const today = todayFor(tz);
  const [dates, data] = await Promise.all([
    periodSetup(current),
    withSchool(current.ctx, async (tx) => {
      const [year, campuses, fin] = await Promise.all([
        currentYear(tx, current.ctx),
        tx.campus.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        tx.financeSetting.findFirst({ select: { goLiveDate: true } }),
      ]);
      // Own reach: the sections this person teaches this year, by name ("7 B").
      const ownIds = a.own && year ? await ownSectionIds(tx, current.ctx, year.id) : [];
      const own = ownIds.length
        ? (await tx.section.findMany({ where: { id: { in: ownIds } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } }))
          .sort((x, y) => x.schoolClass.sortOrder - y.schoolClass.sortOrder || x.name.localeCompare(y.name))
          .map((s) => ({ id: s.id, label: `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}` }))
        : [];
      return { year, campuses, own, goLive: fin?.goLiveDate ?? new Date(`${DEFAULT_GO_LIVE}T00:00:00Z`) };
    }),
  ]);
  return { current, a, tz, today, dates, ...data, tabs: reportTabs(a) };
});
export type RepPage = Awaited<ReturnType<typeof repPage>>;

/** A page this person may open; anything else is the plain "no access" page. */
export async function repGuard(page: PageKey) {
  const p = await repPage();
  if (!p.a.pages[page]) redirect(`/no-access?m=${MODULE}`);
  return p;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function qs(base: string, params: Record<string, string | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) if (val) u.set(k, val);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

/** The page's address with some values changed or removed. */
export function withQ(base: string, sp: Record<string, string | string[] | undefined>, change: Record<string, string | null | undefined>) {
  const keep: Record<string, string | null | undefined> = {};
  for (const [k, v] of Object.entries(sp)) keep[k] = one(v) || null;
  return qs(base, { ...keep, ...change });
}
