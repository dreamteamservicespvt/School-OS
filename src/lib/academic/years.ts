// The academic year a screen works in, and the rule that past years are
// read-only (04-data-model.md rule 19, 03-school-year-and-day.md).
import "server-only";

import type { Tx, SchoolContext } from "../db";

export class ClosedYearError extends Error {
  constructor(yearName?: string) {
    super(
      yearName
        ? `${yearName} is closed. Use Make a correction.`
        : "This academic year is closed, so its records can only be read. Ask the Principal for an authorised correction if something must change.",
    );
    this.name = "ClosedYearError";
  }
}

/**
 * The active academic year of the campus. With no campus: the newest active
 * year of any campus, which in a school whose campuses start the year on
 * different dates is only one of them; use yearsFor / currentYears for
 * lists, studentYear for a student, and the person's campus (src/lib/campus.ts
 * personCampusId) for a page's default.
 */
export async function currentYear(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  const where = { schoolId: ctx.schoolId, archivedAt: null, ...(campusId ? { campusId } : {}) };
  return (
    (await tx.academicYear.findFirst({ where: { ...where, status: "ACTIVE" }, orderBy: { startDate: "desc" } })) ??
    (await tx.academicYear.findFirst({ where, orderBy: { startDate: "desc" } }))
  );
}

/**
 * The current academic year of every campus (or of the chosen campuses), by
 * the same rule as currentYear: the newest active year, else the newest year.
 * A school with two campuses has two current years, one each.
 */
export async function currentYears(tx: Tx, ctx: SchoolContext, campusIds?: string[] | null) {
  const rows = await tx.academicYear.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, ...(campusIds?.length ? { campusId: { in: campusIds } } : {}) },
    orderBy: { startDate: "desc" },
  });
  // An archived campus's years stay out of "the current years".
  const live = new Set((await tx.campus.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true } })).map((c) => c.id));
  const byCampus = new Map<string, (typeof rows)[number]>();
  for (const y of rows) {
    if (!live.has(y.campusId)) continue;
    const have = byCampus.get(y.campusId);
    if (!have || (have.status !== "ACTIVE" && y.status === "ACTIVE")) byCampus.set(y.campusId, y);
  }
  return [...byCampus.values()];
}

/** The ids of every campus's current year: "this year" for students of any campus. */
export async function currentYearIds(tx: Tx, ctx: SchoolContext) {
  return (await currentYears(tx, ctx)).map((y) => y.id);
}

/**
 * The year chosen in the URL (?year=), if valid, else the current one.
 * `limit`: the campus the person is limited to (Current.campusId); a year of
 * another campus is never chosen for them. `campusId`: whose current year is
 * the default (the person's own campus, src/lib/campus.ts personCampusId).
 */
export async function chosenYear(tx: Tx, ctx: SchoolContext, yearId?: string | null, where: { limit?: string | null; campusId?: string | null } = {}) {
  if (yearId && /^[0-9a-f-]{36}$/i.test(yearId)) {
    const y = await tx.academicYear.findFirst({ where: { id: yearId, schoolId: ctx.schoolId, archivedAt: null, ...(where.limit ? { campusId: where.limit } : {}) } });
    if (y) return y;
  }
  return currentYear(tx, ctx, where.limit ?? where.campusId ?? null);
}

/** The current year of a student's own campus: the year their class, attendance and fees of "this year" belong to. */
export async function studentYear(tx: Tx, ctx: SchoolContext, studentId: string) {
  const s = await tx.student.findFirst({ where: { id: studentId, schoolId: ctx.schoolId }, select: { campusId: true } });
  return currentYear(tx, ctx, s?.campusId ?? null);
}

/**
 * Each student's own campus's current year, looked up once per campus: for
 * work on many students at once (bulk changes, imports).
 */
export function studentYearLookup(tx: Tx, ctx: SchoolContext) {
  const byCampus = new Map<string, ReturnType<typeof currentYear>>();
  return async (studentId: string) => {
    const s = await tx.student.findFirst({ where: { id: studentId, schoolId: ctx.schoolId }, select: { campusId: true } });
    if (!s) return null;
    if (!byCampus.has(s.campusId)) byCampus.set(s.campusId, currentYear(tx, ctx, s.campusId));
    return byCampus.get(s.campusId)!;
  };
}

/**
 * The current years a person works in, one per campus: only their campus's
 * when their access is limited to one campus, else every campus's.
 */
export async function yearsFor(tx: Tx, ctx: SchoolContext, limit: string | null | undefined) {
  return currentYears(tx, ctx, limit ? [limit] : null);
}

export async function isYearClosed(tx: Tx, academicYearId: string) {
  const y = await tx.academicYear.findUnique({ where: { id: academicYearId }, select: { status: true } });
  return y?.status === "CLOSED";
}

/** Throws ClosedYearError when the year is closed. Call before any change. */
export async function assertYearOpen(tx: Tx, academicYearId: string) {
  const y = await tx.academicYear.findUnique({ where: { id: academicYearId }, select: { status: true, name: true } });
  if (y?.status === "CLOSED") throw new ClosedYearError(y.name);
}

/**
 * Before a change in a year: closed years are read-only, except an
 * authorised correction with a reason (04 §5 "Closed year changed").
 * Returns the audit note to write with the change, if it is a correction.
 */
export async function assertYearWritable(tx: Tx, academicYearId: string, correction?: string | null): Promise<string | null> {
  const y = await tx.academicYear.findUnique({ where: { id: academicYearId }, select: { status: true, name: true } });
  if (!y) throw new ClosedYearError();
  if (y.status !== "CLOSED") return null;
  if (!correction) throw new ClosedYearError(y.name);
  return `Correction to closed year ${y.name}: ${correction}`;
}

/** The financial year holding a date (default April to March). */
export async function financialYearFor(tx: Tx, ctx: SchoolContext, date: Date) {
  return tx.financialYear.findFirst({
    where: { schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: date }, endDate: { gte: date } },
  });
}
