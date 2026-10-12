// What every Examination & Results page needs: the person, the year being
// viewed (?year=), the years to choose from, the person's exam scope and today.
import "server-only";

import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { chosenYear } from "@/lib/academic/years";
import { mainCampusId } from "@/lib/academic/settings";
import { todayIn } from "@/lib/academic/common";
import { examScope } from "@/lib/exams/scope";
import { ensureExamDefaults } from "@/lib/exams/settings";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type Raw = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function examPage(raw: Raw) {
  const current = await requirePage("examination-results");
  const today = todayIn(current.school.timeZone);
  const base = await withSchool(current.ctx, async (tx) => {
    await ensureExamDefaults(tx, current.ctx);
    const campusId = await mainCampusId(tx, current.ctx);
    const year = await chosenYear(tx, current.ctx, one(raw.year) || null);
    const years = await tx.academicYear.findMany({ where: { campusId, archivedAt: null }, orderBy: { startDate: "desc" } });
    const scope = await examScope(tx, current, year?.id ?? null);
    return { campusId, year, years, scope };
  });
  const closed = base.year?.status === "CLOSED";
  return {
    current, today, ...base, closed,
    /** Changes are allowed: the year exists and is not closed. */
    writable: Boolean(base.year) && !closed,
    yearQuery: base.year && base.year.status !== "ACTIVE" ? `year=${base.year.id}` : "",
  };
}

export type ExamPage = Awaited<ReturnType<typeof examPage>>;

/** Adds ?year= to a link when a year other than the active one is being viewed. */
export function withYear(href: string, page: Pick<ExamPage, "yearQuery">) {
  if (!page.yearQuery) return href;
  return href.includes("?") ? `${href}&${page.yearQuery}` : `${href}?${page.yearQuery}`;
}

/** The sections a person may choose on a page, with labels, in class order. */
export async function sectionOptions(page: ExamPage, opts: { classIds?: string[] } = {}) {
  if (!page.year) return [];
  const rows = await withSchool(page.current.ctx, (tx) => tx.section.findMany({
    where: { academicYearId: page.year!.id, archivedAt: null, ...(page.scope.sectionIds ? { id: { in: page.scope.sectionIds } } : {}), ...(opts.classIds ? { classId: { in: opts.classIds } } : {}) },
    include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  }));
  return rows.map((s) => ({ id: s.id, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, board: s.schoolClass.board }));
}
