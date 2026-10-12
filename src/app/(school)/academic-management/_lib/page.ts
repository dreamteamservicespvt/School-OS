// What every Academic Management page needs: the person, the year being
// viewed (?year=), the years to choose from, the person's reach and today.
import "server-only";

import { redirect } from "next/navigation";
import { reachFor } from "@/lib/permissions";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { chosenYear } from "@/lib/academic/years";
import { academicScope } from "@/lib/academic/scope";
import { mainCampusId } from "@/lib/academic/settings";
import { todayIn } from "@/lib/academic/common";
import { correctionFor } from "./server";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * `notForOwn`: pages that people who only see their own classes (teachers) do not have.
 * They see Time Table and Syllabus only (05-roles.md; prototype config.js VIEW_BY_ROLE),
 * so the module's front page takes them to their own time table and the rest to No access.
 */
export async function academicPage(rawParams: Record<string, string | string[] | undefined>, opts: { notForOwn?: "home" | "no-access" } = {}) {
  const current = await requirePage("academic-management");
  if (opts.notForOwn && reachFor(current.permissions, "academic-management", "view") === "own") {
    redirect(opts.notForOwn === "home" ? "/academic-management/time-table/mine" : "/no-access?m=academic-management");
  }
  const today = todayIn(current.school.timeZone);
  const base = await withSchool(current.ctx, async (tx) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const year = await chosenYear(tx, current.ctx, one(rawParams.year) || null);
    const years = await tx.academicYear.findMany({ where: { schoolId: current.ctx.schoolId, campusId, archivedAt: null }, orderBy: { startDate: "desc" } });
    const scope = await academicScope(tx, current, year?.id ?? null);
    return { campusId, year, years, scope };
  });
  const correction = await correctionFor(current, base.year?.id);
  const closed = base.year?.status === "CLOSED";
  return {
    current, today, ...base, correction,
    /** The year can be changed now: open, or closed with a correction running. */
    writable: Boolean(base.year) && (!closed || Boolean(correction)),
    closed,
    yearQuery: base.year && base.year.status !== "ACTIVE" ? `year=${base.year.id}` : "",
  };
}

export type AcademicPage = Awaited<ReturnType<typeof academicPage>>;

/** Adds ?year= to a link when a year other than the active one is being viewed. */
export function withYear(href: string, page: Pick<AcademicPage, "yearQuery">) {
  if (!page.yearQuery) return href;
  return href.includes("?") ? `${href}&${page.yearQuery}` : `${href}?${page.yearQuery}`;
}
