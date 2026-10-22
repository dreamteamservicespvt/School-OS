// What every Examination & Results page needs: the person, the year being
// viewed (?year=), the years to choose from, the person's exam scope and today.
import "server-only";

import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { campusYears, pageYear } from "@/lib/academic/page-campus";
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
    // The page's campus: the one the person is limited to, else the chosen year's, else their own (page-campus.ts).
    const asked = one(raw.year) || null;
    const { year, campusId } = await pageYear(tx, current.ctx, current, asked);
    const defaultYearId = asked ? (await pageYear(tx, current.ctx, current, null)).year?.id ?? null : year?.id ?? null;
    const years = await campusYears(tx, current.ctx, campusId);
    const scope = await examScope(tx, current, year?.id ?? null);
    return { campusId, year, years, scope, defaultYearId };
  });
  const closed = base.year?.status === "CLOSED";
  return {
    current, today, ...base, closed,
    /** Changes are allowed: the year exists and is not closed. */
    writable: Boolean(base.year) && !closed,
    // A year other than the person's default one (not active, or another campus's) stays in links and exports.
    yearQuery: base.year && (base.year.status !== "ACTIVE" || base.year.id !== base.defaultYearId) ? `year=${base.year.id}` : "",
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
