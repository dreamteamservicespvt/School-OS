// The academic year a screen works in, and the rule that past years are
// read-only (04-data-model.md rule 19, 03-school-year-and-day.md).
import "server-only";

import type { Tx, SchoolContext } from "../db";

export class ClosedYearError extends Error {
  constructor(yearName?: string) {
    super(
      yearName
        ? `${yearName} is closed, so its records can only be read. Use Make a correction if something must change.`
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
