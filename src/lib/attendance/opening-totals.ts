// Attendance so far, brought in when a school starts on School OS part way
// through the year (./opening.ts, gap list G19): read by every attendance
// total (./summary.ts).
import type { Tx } from "../db";

export type Opening = { from: Date; upTo: Date; met: number; present: number };

/**
 * The attendance brought in for each student that a period holds in whole
 * (its first day on or after the period's start, its last on or before the
 * period's end). A period that holds only part of it cannot be split, so it
 * adds nothing there.
 */
export async function openingsFor(tx: Tx, studentIds: string[], from: Date, to: Date): Promise<Map<string, Opening[]>> {
  const out = new Map<string, Opening[]>();
  if (studentIds.length === 0 || to < from) return out;
  const rows = await tx.openingAttendance.findMany({
    where: { studentId: { in: studentIds }, archivedAt: null, fromDate: { gte: from }, upTo: { lte: to } },
    select: { studentId: true, fromDate: true, upTo: true, daysMet: true, daysPresent: true },
  });
  for (const r of rows) {
    const list = out.get(r.studentId) ?? [];
    list.push({ from: r.fromDate, upTo: r.upTo, met: Number(r.daysMet), present: Number(r.daysPresent) });
    out.set(r.studentId, list);
  }
  return out;
}

/** Is this day inside a total brought in (so a mark on it would count twice)? */
export const coveredBy = (list: Opening[] | undefined, date: Date) => Boolean(list?.some((o) => date >= o.from && date <= o.upTo));
