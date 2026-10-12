// What Attendance tells Student Management (05 §4 Sends): each student's %
// for the promotion suggestion, and whether attendance is recorded for them in
// a year (which stops a promotion being undone). Imported by
// src/lib/students/promotion.ts.
import "server-only";

import { registerPromotionFacts, registerYearActivity, type PromotionFacts } from "../students/hooks";
import { attendanceSummary } from "./summary";

registerPromotionFacts(async (tx, ctx, q) => {
  const out = new Map<string, PromotionFacts>();
  const year = await tx.academicYear.findUnique({ where: { id: q.academicYearId }, select: { startDate: true, endDate: true } });
  if (!year || q.studentIds.length === 0) return out;
  const sum = await attendanceSummary(tx, ctx, { studentIds: q.studentIds, from: year.startDate, to: year.endDate, today: new Date() });
  for (const id of q.studentIds) {
    const p = sum.people.get(id)?.percent ?? null;
    out.set(id, { attendancePct: p });
  }
  return out;
});

registerYearActivity(async (tx, _ctx, q) => {
  if (q.studentIds.length === 0) return null;
  const marked = await tx.attendanceMark.findMany({
    where: { studentId: { in: q.studentIds }, academicYearId: q.academicYearId, archivedAt: null },
    select: { studentId: true }, distinct: ["studentId"],
  });
  if (marked.length === 0) return null;
  return `attendance is marked for ${marked.length} ${marked.length === 1 ? "student" : "students"} in that year`;
});
