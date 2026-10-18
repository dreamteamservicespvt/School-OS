// One campus (00-global.md §5, 05-roles.md, 20-settings.md Users &
// Permissions): a person whose School Access has the scope "One campus" sees
// and changes only that campus's students, staff, fees, classes and the work
// in them. `campusId` on Current is set only for that scope; null means the
// whole school. Each record type keeps its own filter in one place (students
// and fees: src/lib/students/access.ts and src/lib/fees/access.ts; staff:
// src/lib/staff/access.ts); the helpers here are the shared pieces.
//
// A school with several campuses also has one current academic year per
// campus (04-data-model.md rule 19), so "the year" of a page is the person's
// own campus's year, and the year of a record is its campus's year.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "./db";

/** The campus a person is limited to, or null for the whole school (Current satisfies it). */
export type CampusLimit = { campusId?: string | null };

/** Not found, or not on this person's campus: the same words, so another campus's records stay unknown. */
export class OtherCampusError extends Error {
  constructor(what = "record") {
    super(`This ${what} was not found, or is on another campus.`);
    this.name = "OtherCampusError";
  }
}

/** Rows that carry their own campus (Student, Staff, Class, Academic Year...). */
export function inCampus(limit: CampusLimit | null | undefined): { campusId?: string } {
  return limit?.campusId ? { campusId: limit.campusId } : {};
}

/** Sections of the person's campus (through the section's class). */
export function sectionInCampus(limit: CampusLimit | null | undefined): Prisma.SectionWhereInput {
  return limit?.campusId ? { schoolClass: { campusId: limit.campusId } } : {};
}

/** Students of the person's campus, for records that hang off a student (payments, dues, marks...). */
export function studentInCampus(limit: CampusLimit | null | undefined): { student?: { campusId: string } } {
  return limit?.campusId ? { student: { campusId: limit.campusId } } : {};
}

/** May this person see a record on this campus? A record with no campus belongs to the whole school. */
export function campusAllows(limit: CampusLimit | null | undefined, campusId: string | null | undefined) {
  return !limit?.campusId || !campusId || campusId === limit.campusId;
}

/** Throws OtherCampusError unless campusAllows. */
export function assertCampus(limit: CampusLimit | null | undefined, campusId: string | null | undefined, what?: string) {
  if (!campusAllows(limit, campusId)) throw new OtherCampusError(what);
}

/** The campus of a section (through its class), or null when the section does not exist. */
export async function sectionCampusId(tx: Tx, sectionId: string): Promise<string | null> {
  const s = await tx.section.findFirst({ where: { id: sectionId }, select: { schoolClass: { select: { campusId: true } } } });
  return s?.schoolClass.campusId ?? null;
}

/** The section ids of the person's campus (every year unless years are given); null for the whole school. */
export async function campusSectionIds(tx: Tx, limit: CampusLimit | null | undefined, yearIds?: string[] | null): Promise<string[] | null> {
  if (!limit?.campusId) return null;
  const rows = await tx.section.findMany({
    where: { schoolClass: { campusId: limit.campusId }, ...(yearIds ? { academicYearId: { in: yearIds } } : {}) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Narrows a "null = every section" list to the person's campus. */
export async function narrowSections(tx: Tx, limit: CampusLimit | null | undefined, sectionIds: string[] | null): Promise<string[] | null> {
  if (!limit?.campusId) return sectionIds;
  const mine = await campusSectionIds(tx, limit);
  if (sectionIds === null) return mine;
  const allowed = new Set(mine ?? []);
  return sectionIds.filter((id) => allowed.has(id));
}

/** The school's main campus (or its oldest one). */
export async function mainCampus(tx: Tx, ctx: SchoolContext): Promise<string | null> {
  const c = (await tx.campus.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, isMain: true }, select: { id: true } }))
    ?? (await tx.campus.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  return c?.id ?? null;
}

/**
 * The person's own campus, for defaults (00-global.md: "the current active
 * year of the person's campus"): the campus their access is limited to, else
 * the campus of their own Staff record, else the school's main campus.
 */
export async function personCampusId(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined): Promise<string | null> {
  if (limit?.campusId) return limit.campusId;
  if (ctx.userId) {
    const me = await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: ctx.userId, archivedAt: null }, select: { campusId: true } });
    if (me) return me.campusId;
  }
  return mainCampus(tx, ctx);
}

/** The campuses a person may choose from: theirs alone when limited to one campus. */
export async function campusChoices(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined) {
  return tx.campus.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, ...(limit?.campusId ? { id: limit.campusId } : {}) },
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
}
