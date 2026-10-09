// Timed work for student records. Each run is safe to repeat.
// - Admitted students become Active on their admission date (03 §2 status table).
// - Promoted students become Active when the new year starts.
// - Leaving students change status on their last date (A14).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineSchedule } from "../jobs";
import { applyStatus } from "./students";
import { completeDueLeaving } from "./leaving";

export async function rollStudentStatuses(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  let changed = 0;
  const admitted = await tx.student.findMany({ where: { status: "ADMITTED", archivedAt: null, joiningDate: { lte: today } }, select: { id: true, joiningDate: true } });
  for (const s of admitted) {
    await applyStatus(tx, ctx, s.id, "ACTIVE", s.joiningDate ?? today, "Admission date reached", "auto");
    changed++;
  }
  const started = await tx.academicYear.findMany({ where: { archivedAt: null, startDate: { lte: today }, status: { not: "CLOSED" } }, select: { id: true } });
  const promoted = await tx.student.findMany({
    where: { status: "PROMOTED", archivedAt: null, enrolments: { some: { archivedAt: null, status: "STUDYING", academicYearId: { in: started.map((y) => y.id) } } } },
    select: { id: true },
  });
  for (const s of promoted) {
    await applyStatus(tx, ctx, s.id, "ACTIVE", today, "New academic year started", "auto");
    changed++;
  }
  changed += await completeDueLeaving(tx, ctx, today);
  return changed;
}

defineSchedule("student-status-roll", 60, (tx, ctx, now) => rollStudentStatuses(tx, ctx, now));
