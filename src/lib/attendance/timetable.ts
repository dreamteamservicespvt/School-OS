// The Time Table periods behind period-wise attendance (05 §2 Take
// Attendance): which periods a section has on a date and which of them a
// teacher takes, including substitutions arranged for them.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { isoWeekday } from "../staff/dates";

export type PeriodSlotView = { periodNo: number; startTime: string; endTime: string; subject: string | null; staffId: string | null; sectionId: string; substitute: boolean };

/** The published Time Table version in force on a date for a campus. */
export async function versionOn(tx: Tx, ctx: SchoolContext, campusId: string, date: Date) {
  const versions = await tx.timetableVersion.findMany({
    where: { schoolId: ctx.schoolId, campusId, status: "PUBLISHED", archivedAt: null },
    orderBy: [{ effectiveFrom: "desc" }, { publishedAt: "desc" }],
    select: { id: true, effectiveFrom: true },
  });
  return versions.find((v) => !v.effectiveFrom || v.effectiveFrom <= date) ?? null;
}

/** A section's teaching periods on a date (no breaks), in order. */
export async function sectionPeriods(tx: Tx, ctx: SchoolContext, sectionId: string, campusId: string, date: Date): Promise<PeriodSlotView[]> {
  const version = await versionOn(tx, ctx, campusId, date);
  if (!version) return [];
  const rows = await tx.timetablePeriod.findMany({
    where: { versionId: version.id, sectionId, dayOfWeek: isoWeekday(date), isBreak: false, archivedAt: null },
    include: { subject: { select: { name: true } } },
    orderBy: { periodNo: "asc" },
  });
  const subs = await tx.substitution.findMany({ where: { periodId: { in: rows.map((r) => r.id) }, date, status: "ARRANGED", archivedAt: null } });
  return rows.map((r) => {
    const sub = subs.find((s) => s.periodId === r.id);
    return { periodNo: r.periodNo, startTime: r.startTime, endTime: r.endTime, subject: r.subject?.name ?? null, staffId: sub?.substituteStaffId ?? r.staffId, sectionId, substitute: Boolean(sub) };
  });
}

/** The periods a teacher takes on a date, across sections, with arranged substitutions. */
export async function teacherPeriodsOn(tx: Tx, ctx: SchoolContext, staffId: string, campusId: string, date: Date): Promise<PeriodSlotView[]> {
  const version = await versionOn(tx, ctx, campusId, date);
  if (!version) return [];
  const own = await tx.timetablePeriod.findMany({
    where: { versionId: version.id, staffId, dayOfWeek: isoWeekday(date), isBreak: false, archivedAt: null },
    include: { subject: { select: { name: true } } },
  });
  const away = await tx.substitution.findMany({ where: { periodId: { in: own.map((p) => p.id) }, date, status: "ARRANGED", archivedAt: null }, select: { periodId: true } });
  const awaySet = new Set(away.map((a) => a.periodId));
  const covering = await tx.substitution.findMany({ where: { substituteStaffId: staffId, date, status: "ARRANGED", archivedAt: null }, include: { period: { include: { subject: { select: { name: true } } } } } });
  const out: PeriodSlotView[] = [
    ...own.filter((p) => !awaySet.has(p.id)).map((p) => ({ periodNo: p.periodNo, startTime: p.startTime, endTime: p.endTime, subject: p.subject?.name ?? null, staffId, sectionId: p.sectionId, substitute: false })),
    ...covering.map((s) => ({ periodNo: s.period.periodNo, startTime: s.period.startTime, endTime: s.period.endTime, subject: s.period.subject?.name ?? null, staffId, sectionId: s.period.sectionId, substitute: true })),
  ];
  return out.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.periodNo - b.periodNo);
}
