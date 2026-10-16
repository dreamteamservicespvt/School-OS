// Attendance on the report card: days present of working days (08 §4,
// "Receives" from 05 Attendance). Attendance Management registers its source
// here when it is built; until then the class teacher types the days on the
// Report Cards page and those are used.
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type AttendanceDays = { present: number; working: number };
type Source = (tx: Tx, ctx: SchoolContext, studentIds: string[], range: { from: Date; to: Date }) => Promise<Map<string, AttendanceDays>>;

let source: Source | null = null;

/** Attendance Management calls this once, so report cards read the register. */
export function registerAttendanceSource(fn: Source) {
  source = fn;
}

/** Days present and working days per student from the register, or an empty map when there is no register yet. */
export async function attendanceFor(tx: Tx, ctx: SchoolContext, studentIds: string[], range: { from: Date; to: Date }): Promise<Map<string, AttendanceDays>> {
  if (!source || studentIds.length === 0) return new Map();
  return source(tx, ctx, studentIds, range);
}
