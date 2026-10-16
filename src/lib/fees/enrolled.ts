// The class fee plan for a student who joins a class: Add student, import,
// admission (A2) and promotion (A13), when "Apply the class fee plan" is on
// (03 §1, 06 "Linked modules"). Registers itself with Student Management when
// imported; src/lib/students/students.ts and promotion.ts import it.
// Nothing is assigned when the class has no published structure for the
// year, when the student already has fees for it, or when the year is closed:
// the student is still added, and Collect Fee shows "No fees assigned".
import "server-only";

import { onEnrolled } from "../students/hooks";
import { featureOn } from "./settings";
import { assignToStudent, hasFeePlan, structureForStudent } from "./structure";
import { MoneyProblem } from "./problem";

onEnrolled(async (tx, ctx, e) => {
  if (!e.applyFeePlan) return;
  if (await hasFeePlan(tx, e.studentId, e.academicYearId)) return;
  const student = await tx.student.findUnique({ where: { id: e.studentId }, select: { category: true } });
  const structure = await structureForStudent(tx, e.academicYearId, e.classId, student?.category ?? null, await featureOn(tx, ctx, "fee-category-fees"));
  if (!structure) return;
  try {
    await assignToStudent(tx, ctx, e.studentId, structure.id, null);
  } catch (err) {
    if (!(err instanceof MoneyProblem)) throw err;
  }
});
