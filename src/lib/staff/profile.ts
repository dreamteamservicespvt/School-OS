// What the staff profile (09 §2 Staff Profile, Teacher 360) shows from other
// modules, with real values: today's Staff Attendance mark and the month's
// marks and late marks for the Attendance tab (05 Attendance Management).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate, formatTime } from "../format";
import { statusList, statusMap } from "../attendance/settings";
import { isoDay } from "./dates";
import { statusLabel } from "./settings";

export type DayMark = { statusKey: string; name: string; counts: string; inTime: Date | null; lateMinutes: number | null };

/** The staff member's day marks from Staff Attendance between two dates, by ISO day. */
export async function staffMarks(tx: Tx, ctx: SchoolContext, staffId: string, from: Date, to: Date): Promise<Map<string, DayMark>> {
  const [marks, statuses] = await Promise.all([
    tx.attendanceMark.findMany({ where: { staffId, periodNo: 0, archivedAt: null, date: { gte: from, lte: to } }, select: { date: true, statusKey: true, inTime: true, lateMinutes: true } }),
    statusList(tx, ctx, { includeArchived: true }),
  ]);
  const byKey = statusMap(statuses);
  return new Map(marks.map((m) => {
    const st = byKey.get(m.statusKey);
    return [isoDay(m.date), { statusKey: m.statusKey, name: st?.name ?? m.statusKey, counts: st?.counts ?? "not-counted", inTime: m.inTime, lateMinutes: m.lateMinutes }];
  }));
}

/** The month's marks in numbers: present (half days count half), absent, late marks, half days. */
export function markCounts(marks: Iterable<DayMark>) {
  const out = { present: 0, absent: 0, late: 0, half: 0, marked: 0 };
  for (const m of marks) {
    out.marked++;
    if (m.statusKey === "late") out.late++;
    if (m.counts === "present") out.present += 1;
    else if (m.counts === "half") { out.present += 0.5; out.half++; }
    else if (m.counts === "absent") out.absent++;
  }
  return out;
}

export type TodayFact = { value: string; sub?: string; tone?: "warn" | "bad" };

/**
 * The profile's "Today" box: the staff status when they are not working, then
 * approved leave, a day without school, the Staff Attendance mark, or "Not
 * marked yet".
 */
export function todayFact(input: { status: string; onLeaveUntil: Date | null; offTitle: string | null; mark: DayMark | null; timeZone: string }): TodayFact {
  if (input.status !== "ACTIVE") return { value: statusLabel(input.status), tone: "warn" };
  if (input.onLeaveUntil) return { value: "On leave", sub: `Until ${formatDate(input.onLeaveUntil, input.timeZone)}`, tone: "warn" };
  if (input.offTitle) return { value: "No school", sub: input.offTitle };
  const m = input.mark;
  if (!m) return { value: "Not marked yet", sub: "In Staff Attendance" };
  const late = m.lateMinutes ? `${m.lateMinutes} min late` : "";
  const sub = m.inTime ? `In at ${formatTime(m.inTime, input.timeZone)}${late ? `, ${late}` : ""}` : late || undefined;
  return { value: m.name, sub, tone: m.counts === "absent" ? "bad" : m.statusKey === "late" || m.counts === "half" ? "warn" : undefined };
}
