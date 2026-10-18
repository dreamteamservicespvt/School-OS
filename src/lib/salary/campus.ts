// One campus in Salary Management (00-global.md §5, 05-roles.md, src/lib/campus.ts):
// a person whose School Access is limited to one campus (Current.campusId)
// works only on that campus's salary months (Payroll Run.campusId), and on
// the structures, advances, adjustments and slips of that campus's staff.
// Their own slips stay open to them on My Salary Slips. A limit of null is
// the whole school, where nothing changes.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { campusAllows, type CampusLimit } from "../campus";
import { MoneyProblem } from "../fees/problem";
import { getRun } from "./payroll";

/** The ids of the campus's staff (every status, so past slips and advances stay listed); null for the whole school. */
export async function campusStaffIds(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined): Promise<string[] | null> {
  if (!limit?.campusId) return null;
  const rows = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId: limit.campusId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** For rows that hold a staffId (structures, advances, adjustments): `{ staffId: { in } }`, or {} for the whole school. */
export async function staffOnCampus(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined): Promise<{ staffId?: { in: string[] } }> {
  const ids = await campusStaffIds(tx, ctx, limit);
  return ids ? { staffId: { in: ids } } : {};
}

/** Salary months of the person's campus: `{ campusId }`, or {} for the whole school. */
export function runsOnCampus(limit: CampusLimit | null | undefined): { campusId?: string } {
  return limit?.campusId ? { campusId: limit.campusId } : {};
}

/** A salary month of the person's campus. Another campus's month is "not found", like one that does not exist. */
export async function campusRun(tx: Tx, runId: string, limit: CampusLimit | null | undefined) {
  const run = await getRun(tx, runId);
  if (!campusAllows(limit, run.campusId)) throw new MoneyProblem("This salary month was not found.");
  return run;
}

/** Refuses staff of another campus with the words for a staff member not found. */
export async function assertStaffOnCampus(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined, staffIds: string | string[], field = "staffId") {
  if (!limit?.campusId) return;
  const ids = [...new Set(Array.isArray(staffIds) ? staffIds : [staffIds])];
  if (!ids.length) return;
  const n = await tx.staff.count({ where: { schoolId: ctx.schoolId, campusId: limit.campusId, id: { in: ids } } });
  if (n !== ids.length) throw new MoneyProblem(ids.length === 1 ? "This staff member was not found." : "Some of the chosen staff were not found. Reload the page and choose again.", field);
}

/** An advance or loan of a staff member of the person's campus; another is "not found". */
export async function assertAdvanceOnCampus(tx: Tx, ctx: SchoolContext, limit: CampusLimit | null | undefined, advanceId: string) {
  if (!limit?.campusId) return;
  const a = await tx.salaryAdvance.findFirst({ where: { id: advanceId }, select: { staffId: true } });
  const onCampus = a ? await tx.staff.count({ where: { schoolId: ctx.schoolId, campusId: limit.campusId, id: a.staffId } }) : 0;
  if (!onCampus) throw new MoneyProblem("This advance was not found.");
}
