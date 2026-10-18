// The campus a page, an export or an action works on, in a school with more
// than one campus. Each campus has its own academic years (04-data-model.md
// rule 19), and a person whose access is "One campus" (05-roles.md) works
// only in theirs. Used by Academic Management and Examination & Results.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { personCampusId, type CampusLimit } from "../campus";
import { chosenYear } from "./years";
import { mainCampusId } from "./settings";
import { AcademicRuleError } from "./common";

/**
 * The year a page shows (?year=, else the default) and the campus it works
 * on: the campus the person is limited to; else the campus of the chosen
 * year; else the person's own campus (their Staff record's, else the main
 * campus). A ?year= of another campus is ignored for a campus-limited person.
 */
export async function pageYear(tx: Tx, ctx: SchoolContext, limit: CampusLimit, yearId?: string | null) {
  const own = await personCampusId(tx, ctx, limit);
  const year = await chosenYear(tx, ctx, yearId ?? null, { limit: limit.campusId ?? null, campusId: own });
  const campusId = year?.campusId ?? own ?? (await mainCampusId(tx, ctx));
  return { year, campusId };
}

/** A campus's academic years, newest first (the year picker). */
export async function campusYears(tx: Tx, ctx: SchoolContext, campusId: string) {
  return tx.academicYear.findMany({ where: { schoolId: ctx.schoolId, campusId, archivedAt: null }, orderBy: { startDate: "desc" } });
}

/**
 * Every academic year (any status) of the campus a person is limited to, for
 * records that carry only a year (an Exam); null for the whole school.
 */
export async function campusYearIds(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined): Promise<string[] | null> {
  if (!limit?.campusId) return null;
  const rows = await tx.academicYear.findMany({ where: { schoolId: ctx.schoolId, campusId: limit.campusId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * The campus an action works on: the campus of the year it is given (the
 * page's year), else the campus the person is limited to, else their own
 * campus. A year of another campus than the person's is refused with the
 * not-found words, so another campus's records stay unknown.
 */
export async function actionCampusId(tx: Tx, ctx: SchoolContext, limit: CampusLimit, yearId?: string | null): Promise<string> {
  if (yearId) {
    const y = await tx.academicYear.findFirst({ where: { id: yearId, schoolId: ctx.schoolId }, select: { campusId: true } });
    if (y) {
      if (limit.campusId && y.campusId !== limit.campusId) throw new AcademicRuleError("This academic year was not found.");
      return y.campusId;
    }
  }
  return (await personCampusId(tx, ctx, limit)) ?? (await mainCampusId(tx, ctx));
}
