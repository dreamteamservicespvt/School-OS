// What Attendance tells Student Management (05 §4 Sends): each student's %
// for the year, for the promotion suggestion, the Student List and Parent 360,
// and whether attendance is recorded for them in a year (which stops a
// promotion being undone). Listed in src/lib/students/fact-sources.ts.
// The % is the Attendance Register's own (./summary.ts): Sundays, holidays
// and days not marked are left out.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { can } from "../permissions";
import { todayIn } from "../staff/dates";
import type { ActivitySource, FactQuery, ListSource, PromotionSource } from "../students/hooks";
import { attendanceSummary } from "./summary";

/** Each student's % from the start of the year to today, in one read for all of them. */
async function yearPercents(tx: Tx, ctx: SchoolContext, q: FactQuery) {
  const out = new Map<string, number | null>();
  if (q.studentIds.length === 0) return out;
  const [year, school] = await Promise.all([
    tx.academicYear.findUnique({ where: { id: q.academicYearId }, select: { startDate: true, endDate: true } }),
    tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } }),
  ]);
  if (!year) return out;
  const sum = await attendanceSummary(tx, ctx, { studentIds: q.studentIds, from: year.startDate, to: year.endDate, today: todayIn(school?.timeZone) });
  for (const id of q.studentIds) out.set(id, sum.people.get(id)?.percent ?? null);
  return out;
}

export const promotionFacts: PromotionSource = async (tx, ctx, q) => {
  const pct = await yearPercents(tx, ctx, q);
  return new Map([...pct].map(([id, attendancePct]) => [id, { attendancePct }]));
};

/** The Attendance column: for people who may see students' attendance (not the Accountant). */
export const listFacts: ListSource = {
  covers: "attendance",
  allowed: (who) => can(who.permissions, "attendance-management", "view"),
  load: async (tx, who, q) => {
    const pct = await yearPercents(tx, who.ctx, q);
    return new Map([...pct].map(([id, attendancePct]) => [id, { attendancePct }]));
  },
};

export const yearActivity: ActivitySource = async (tx, _ctx, q) => {
  if (q.studentIds.length === 0) return null;
  const marked = await tx.attendanceMark.findMany({
    where: { studentId: { in: q.studentIds }, academicYearId: q.academicYearId, archivedAt: null },
    select: { studentId: true }, distinct: ["studentId"],
  });
  if (marked.length === 0) return null;
  return `attendance is marked for ${marked.length} ${marked.length === 1 ? "student" : "students"}`;
};
