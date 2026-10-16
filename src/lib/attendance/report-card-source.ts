// Attendance for report cards (08 §4 "Receives" from 05 Attendance): days
// present of working days, read from the register. Registered with
// Examination & Results, which imports this file from its report cards.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { registerAttendanceSource, type AttendanceDays } from "../exams/attendance";
import { attendanceSummary, type PersonSummary } from "./summary";

/**
 * The report card's attendance for one student. A student with no mark in the
 * range gets none, so days the class teacher typed are kept.
 */
export function reportCardDays(s: PersonSummary | undefined): AttendanceDays | null {
  if (!s || s.markedDays === 0) return null;
  return { present: s.present, working: s.workingDays };
}

export async function registerDays(tx: Tx, ctx: SchoolContext, studentIds: string[], range: { from: Date; to: Date }, today = new Date()) {
  const r = await attendanceSummary(tx, ctx, { studentIds, from: range.from, to: range.to, today });
  const out = new Map<string, AttendanceDays>();
  for (const id of studentIds) {
    const days = reportCardDays(r.people.get(id));
    if (days) out.set(id, days);
  }
  return out;
}

registerAttendanceSource((tx, ctx, studentIds, range) => registerDays(tx, ctx, studentIds, range));
