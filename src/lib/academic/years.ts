// The academic year a screen works in, and the rule that past years are
// read-only (04-data-model.md rule 19, 03-school-year-and-day.md).
import "server-only";

import type { Enrolment } from "@prisma/client";
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

/** The active academic year of the campus (or of the school's main campus). */
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
  const byCampus = new Map<string, (typeof rows)[number]>();
  for (const y of rows) {
    const have = byCampus.get(y.campusId);
    if (!have || (have.status !== "ACTIVE" && y.status === "ACTIVE")) byCampus.set(y.campusId, y);
  }
  return [...byCampus.values()];
}

/** The year chosen in the URL (?year=), if valid, else the current one. */
export async function chosenYear(tx: Tx, ctx: SchoolContext, yearId?: string | null) {
  if (yearId && /^[0-9a-f-]{36}$/i.test(yearId)) {
    const y = await tx.academicYear.findFirst({ where: { id: yearId, schoolId: ctx.schoolId, archivedAt: null } });
    if (y) return y;
  }
  return currentYear(tx, ctx);
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

/**
 * Of one student's enrolments, the one that is their class this year: the
 * enrolment in an active academic year, else the one in the newest year.
 * Never "the enrolment made last": promotion, imports and undo can add last
 * year's enrolment after this year's (MONEY-01).
 */
export function pickCurrentEnrolment<E extends { academicYearId: string; createdAt: Date }>(
  list: E[],
  years: Map<string, { status: string; startDate: Date }>,
): E | null {
  let best: E | null = null;
  const rank = (e: E) => {
    const y = years.get(e.academicYearId);
    return [y?.status === "ACTIVE" ? 1 : 0, y?.startDate.getTime() ?? 0, e.createdAt.getTime()];
  };
  for (const e of list) {
    if (!best) { best = e; continue; }
    const a = rank(e), b = rank(best);
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) best = e;
  }
  return best;
}

/** Each student's enrolment this year (see pickCurrentEnrolment), by student id. */
export async function currentEnrolments(tx: Tx, studentIds: string[]): Promise<Map<string, Enrolment>> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return new Map();
  const rows = await tx.enrolment.findMany({ where: { studentId: { in: ids }, archivedAt: null } });
  const years = await tx.academicYear.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.academicYearId))] } }, select: { id: true, status: true, startDate: true } });
  const yearMap = new Map(years.map((y) => [y.id, y]));
  const byStudent = new Map<string, Enrolment[]>();
  for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  const out = new Map<string, Enrolment>();
  for (const [id, list] of byStudent) {
    const e = pickCurrentEnrolment(list, yearMap);
    if (e) out.set(id, e);
  }
  return out;
}

/** One student's enrolment this year, or null when they are in no class. */
export async function currentEnrolment(tx: Tx, studentId: string) {
  return (await currentEnrolments(tx, [studentId])).get(studentId) ?? null;
}
