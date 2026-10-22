// What every Academic Management page needs: the person, the year being
// viewed (?year=), the years to choose from, the person's reach and today.
import "server-only";

import { redirect } from "next/navigation";
import { reachFor } from "@/lib/permissions";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { academicScope } from "@/lib/academic/scope";
import { campusYears, pageYear } from "@/lib/academic/page-campus";
import { todayIn } from "@/lib/academic/common";
import { correctionFor } from "./server";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * `notForOwn`: pages that people who only see their own classes (teachers) do not have.
 * They see Time Table and Syllabus only (05-roles.md; prototype config.js VIEW_BY_ROLE),
 * so the module's front page takes them to their own time table and the rest to No access.
 */
export async function academicPage(rawParams: Record<string, string | string[] | undefined>, opts: { notForOwn?: "home" | "no-access"; arrangers?: boolean } = {}) {
  const current = await requirePage("academic-management");
  // `arrangers`: Office Staff arrange substitutions with own reach (04 §1, src/lib/academic/scope.ts), so that page stays open to them.
  const arranger = opts.arrangers && reachFor(current.permissions, "academic-management", "edit") === "own" && current.roles.some((r) => r.key === "office-staff");
  if (opts.notForOwn && !arranger && reachFor(current.permissions, "academic-management", "view") === "own") {
    redirect(opts.notForOwn === "home" ? "/academic-management/time-table/mine" : "/no-access?m=academic-management");
  }
  const today = todayIn(current.school.timeZone);
  const asked = one(rawParams.year) || null;
  const base = await withSchool(current.ctx, async (tx) => {
    // The page's campus: the one the person is limited to, else the chosen year's, else their own (each campus has its own years).
    const { year, campusId } = await pageYear(tx, current.ctx, current, asked);
    const defaultYearId = asked ? (await pageYear(tx, current.ctx, current, null)).year?.id ?? null : year?.id ?? null;
    const years = await campusYears(tx, current.ctx, campusId);
    const scope = await academicScope(tx, current, year?.id ?? null);
    return { campusId, year, years, scope, defaultYearId };
  });
  const correction = await correctionFor(current, base.year?.id);
  const closed = base.year?.status === "CLOSED";
  return {
    current, today, ...base, correction,
    /** The year can be changed now: open, or closed with a correction running. */
    writable: Boolean(base.year) && (!closed || Boolean(correction)),
    closed,
    // A year other than the person's default one (not active, or another campus's) stays in links and exports.
    yearQuery: base.year && (base.year.status !== "ACTIVE" || base.year.id !== base.defaultYearId) ? `year=${base.year.id}` : "",
  };
}

export type AcademicPage = Awaited<ReturnType<typeof academicPage>>;

/** Adds ?year= to a link when a year other than the active one is being viewed. */
export function withYear(href: string, page: Pick<AcademicPage, "yearQuery">) {
  if (!page.yearQuery) return href;
  return href.includes("?") ? `${href}&${page.yearQuery}` : `${href}?${page.yearQuery}`;
}
