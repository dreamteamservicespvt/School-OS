// Who a signed-in person is in the school's records, and what "own" means
// for them (05-roles.md: "Own" = their own classes or their own records).
import "server-only";

import type { Tx, SchoolContext } from "./db";

/** The Staff record of the signed-in person, if they are staff. */
export async function staffForUser(tx: Tx, ctx: SchoolContext) {
  if (!ctx.userId) return null;
  return tx.staff.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: ctx.userId, archivedAt: null } });
}

/**
 * Sections a teacher may work with: those they are class teacher of, and
 * those in their Teacher Allocations, for one academic year.
 */
export async function ownSectionIds(tx: Tx, ctx: SchoolContext, academicYearId: string): Promise<string[]> {
  const staff = await staffForUser(tx, ctx);
  if (!staff) return [];
  const [asClassTeacher, allocations] = await Promise.all([
    tx.section.findMany({ where: { academicYearId, classTeacherId: staff.id, archivedAt: null }, select: { id: true } }),
    tx.teacherAllocation.findMany({ where: { academicYearId, staffId: staff.id, archivedAt: null }, select: { sectionId: true } }),
  ]);
  return [...new Set([...asClassTeacher.map((s) => s.id), ...allocations.map((a) => a.sectionId)])];
}

/** Sections where the person is the class teacher (attendance, remarks, leave). */
export async function classTeacherSectionIds(tx: Tx, ctx: SchoolContext, academicYearId: string): Promise<string[]> {
  const staff = await staffForUser(tx, ctx);
  if (!staff) return [];
  const rows = await tx.section.findMany({ where: { academicYearId, classTeacherId: staff.id, archivedAt: null }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** "Class 5 A" from a class name and section name. */
export function sectionLabel(className: string, sectionName: string) {
  return `${className} ${sectionName}`;
}
