// Early Warnings rows from Attendance Flags (gap list P1.6: attendance is
// flagged once). The Attendance Flag A4 raises (05 §4) is the one record of a
// student's attendance concern; Early Warnings (warnings.ts) reads it here as
// the student's attendance row, and joins any older attendance Risk Flag to it.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { attendanceSummary } from "../attendance/summary";
import { CLEARED_REASON as ATTENDANCE_CLEARED, flagStatusOf, OPEN_ATTENDANCE_FLAG } from "../attendance/flags";
import type { Area, FlagStatus } from "./warnings";
import { weighAttendanceRows } from "./absence-signals";

/** Why an attendance Risk Flag closed when the student's Attendance Flag took over. */
export const JOINED = "Joined the Attendance Flag: attendance concerns are kept on one record.";

/** The attendance rules the rows are worded with (warningRules). */
type Rules = { threshold: number; watch: number; streakDays: number };

const pctText = (n: number) => `${Math.round(n * 10) / 10}%`;

/** Students whose Attendance Flag is not yet cleared: their attendance concern lives on that flag. */
export async function coveredStudents(tx: Tx, studentIds?: string[]) {
  const rows = await tx.attendanceFlag.findMany({ where: { clearedAt: null, ...(studentIds ? { studentId: { in: studentIds } } : {}) }, select: { studentId: true }, distinct: ["studentId"] });
  return new Set(rows.map((r) => r.studentId));
}

type Review = { id: string; decision: string; note: string; action: string | null; reviewerId: string; createdAt: Date };

/** One row of Early Warnings, from a Risk Flag or from a student's Attendance Flags. */
export type BaseRow = {
  /** The Risk Flag's id, or the main Attendance Flag's id (below the threshold first). */
  id: string;
  source: "risk" | "attendance";
  /** The Attendance Flags behind the row (one student's open flags together), or the one a Risk Flag joined. */
  attendanceFlagIds: string[];
  studentId: string; sectionId: string | null; area: Area; strength: "WATCH" | "ACT_NOW";
  reason: string; basis: string; value: number | null; status: FlagStatus;
  closedAt: Date | null; closedReason: string | null; action: string | null; taskId: string | null; counsellingId: string | null;
  raisedAt: Date; reviews: Review[];
};

type RiskWithReviews = Prisma.RiskFlagGetPayload<{ include: { reviews: true } }>;
export function riskRow(f: RiskWithReviews): BaseRow {
  return {
    id: f.id, source: "risk", attendanceFlagIds: f.attendanceFlagId ? [f.attendanceFlagId] : [],
    studentId: f.studentId, sectionId: f.sectionId, area: f.area as Area, strength: f.strength === "ACT_NOW" ? "ACT_NOW" : "WATCH",
    reason: f.reason, basis: f.basis, value: f.value, status: f.status as FlagStatus,
    closedAt: f.closedAt, closedReason: f.closedReason, action: f.action, taskId: f.taskId, counsellingId: f.counsellingId,
    raisedAt: f.raisedAt, reviews: f.reviews,
  };
}

type AttendanceWithReviews = Prisma.AttendanceFlagGetPayload<{ include: { reviews: true } }>;
const isOpenAttendance = (f: { clearedAt: Date | null; status: string }) => flagStatusOf(f) !== "CLOSED";

/**
 * Early Warnings rows from Attendance Flags, for students on this year's roll
 * (in `sectionIds` for own reach). A student's open flags (below the threshold
 * and absent in a row) make one row; closed flags are one row each. Open rows
 * show this year's % worked out now; closed ones the numbers when flagged.
 */
export async function attendanceFlagRows(tx: Tx, ctx: SchoolContext, q: { year: { id: string; startDate: Date } | null; today: Date; rules: Rules; sectionIds: string[] | null; studentIds?: string[]; openOnly?: boolean }): Promise<BaseRow[]> {
  if (!q.year || (q.sectionIds && !q.sectionIds.length)) return [];
  const flags: AttendanceWithReviews[] = await tx.attendanceFlag.findMany({
    where: { ...(q.openOnly ? OPEN_ATTENDANCE_FLAG : { OR: [{ clearedAt: null }, { createdAt: { gte: q.year.startDate } }] }), ...(q.studentIds ? { studentId: { in: q.studentIds } } : {}) },
    include: { reviews: true }, orderBy: { createdAt: "asc" },
  });
  if (!flags.length) return [];
  const enrol = await tx.enrolment.findMany({
    where: { academicYearId: q.year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null }, studentId: { in: [...new Set(flags.map((f) => f.studentId))] }, ...(q.sectionIds ? { sectionId: { in: q.sectionIds } } : {}) },
    select: { studentId: true, sectionId: true },
  });
  const sectionOf = new Map(enrol.map((e) => [e.studentId, e.sectionId]));
  const groups: AttendanceWithReviews[][] = [];
  const openBy = new Map<string, AttendanceWithReviews[]>();
  for (const f of flags) {
    if (!sectionOf.has(f.studentId)) continue;
    if (!isOpenAttendance(f)) { groups.push([f]); continue; }
    const g = openBy.get(f.studentId);
    if (g) g.push(f);
    else { const ng = [f]; openBy.set(f.studentId, ng); groups.push(ng); }
  }
  const openIds = [...openBy.keys()];
  const sum = openIds.length && q.today >= q.year.startDate ? await attendanceSummary(tx, ctx, { studentIds: openIds, from: q.year.startDate, to: q.today, today: q.today }) : null;
  const since = `${formatDate(q.year.startDate, "UTC")} to ${formatDate(q.today, "UTC")}`;
  const rules = q.rules;
  const rows = groups.map((g): BaseRow => {
    const list = [...g].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "below-threshold" ? -1 : 1));
    const main = list[0];
    const open = isOpenAttendance(main);
    const p = open ? sum?.people.get(main.studentId)?.percent ?? null : null;
    const reasons: string[] = [];
    const basis: string[] = [];
    let strength: BaseRow["strength"] = "WATCH";
    for (const f of list) {
      if (f.kind === "below-threshold") {
        strength = "ACT_NOW";
        reasons.push(p !== null ? `Attendance ${pctText(p)} this year (threshold ${rules.threshold}%)` : `Attendance ${pctText(Number(f.value))} when flagged on ${formatDate(f.raisedOn, "UTC")} (threshold ${rules.threshold}%)`);
        basis.push(`Attendance Flag, raised ${formatDate(f.raisedOn, "UTC")}${p !== null ? ` · attendance ${since}` : ""} · threshold ${rules.threshold}% (Attendance Settings)`);
      } else {
        reasons.push(`Absent ${Number(f.value)} school days in a row, up to ${formatDate(f.raisedOn, "UTC")}`);
        basis.push(`Attendance Flag · rule: ${rules.streakDays} days in a row (Attendance Settings)`);
        if (p !== null && p < rules.watch) strength = "ACT_NOW";
      }
    }
    if (main.kind !== "below-threshold" && p !== null && p < rules.watch) {
      reasons.push(`Attendance ${pctText(p)} this year (watch line ${rules.watch}%, threshold ${rules.threshold}%)`);
      basis.push(`Attendance, ${since}`);
    }
    const statuses = list.map(flagStatusOf);
    const status: FlagStatus = statuses.includes("NEW") ? "NEW" : statuses.includes("ACTION_PLANNED") ? "ACTION_PLANNED" : statuses.includes("REVIEWED") ? "REVIEWED" : "CLOSED";
    const seen = new Set<string>();
    const reviews = list.flatMap((f) => f.reviews).filter((r) => {
      const k = `${r.decision}|${r.note}|${r.reviewerId}|${r.createdAt.getTime()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
    const first = <K extends "action" | "taskId" | "counsellingId">(k: K) => list.find((f) => f[k])?.[k] ?? null;
    return {
      id: main.id, source: "attendance", attendanceFlagIds: list.map((f) => f.id),
      studentId: main.studentId, sectionId: sectionOf.get(main.studentId) ?? null, area: "attendance", strength,
      reason: reasons.join("\n"), basis: basis.join("\n"), value: main.kind === "below-threshold" ? p ?? Number(main.value) : p,
      status, closedAt: main.closedAt ?? main.clearedAt, closedReason: main.closedReason ?? (main.clearedAt ? ATTENDANCE_CLEARED : null),
      action: first("action"), taskId: first("taskId"), counsellingId: first("counsellingId"),
      raisedAt: new Date(Math.min(...list.map((f) => f.createdAt.getTime()))), reviews,
    };
  });
  // Absence reasons (./absence-signals.ts): the reason mix in the basis, and a stronger or weaker row.
  return weighAttendanceRows(tx, ctx, rows, { from: q.year.startDate, today: q.today, threshold: rules.threshold, streakDays: rules.streakDays });
}

/**
 * The one-time and ongoing step that keeps one record per attendance concern:
 * an open attendance Risk Flag (raised before this rule, at the Watch line, or
 * added from a suggestion) whose student now has an Attendance Flag joins it.
 * Its reviews are linked to the Attendance Flag, a review already made carries
 * over to a flag nobody has reviewed yet, and the Risk Flag is closed with the
 * reason and the link, never deleted. Audited. Safe to run twice.
 */
export async function joinAttendanceFlags(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const dupes = await tx.riskFlag.findMany({ where: { area: "attendance", closedAt: null } });
  if (!dupes.length) return 0;
  const afs = await tx.attendanceFlag.findMany({ where: { clearedAt: null, studentId: { in: dupes.map((d) => d.studentId) } }, orderBy: { createdAt: "asc" } });
  let joined = 0;
  for (const rf of dupes) {
    const mine = afs.filter((f) => f.studentId === rf.studentId).sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "below-threshold" ? -1 : 1));
    if (!mine.length) continue;
    const main = mine[0];
    await tx.flagReview.updateMany({ where: { flagId: rf.id, attendanceFlagId: null }, data: { attendanceFlagId: main.id } });
    if (rf.status === "REVIEWED" || rf.status === "ACTION_PLANNED") {
      for (const af of mine.filter((f) => f.status === "NEW")) {
        await tx.attendanceFlag.update({ where: { id: af.id }, data: { status: rf.status, action: af.action ?? rf.action, taskId: af.taskId ?? rf.taskId, counsellingId: af.counsellingId ?? rf.counsellingId } });
        await writeAudit(tx, ctx, { action: "review-carried-over", recordType: "Attendance Flag", recordId: af.id, before: { status: af.status }, after: { status: rf.status, fromRiskFlag: rf.id, action: rf.action } });
      }
    }
    await tx.riskFlag.update({ where: { id: rf.id }, data: { status: "CLOSED", closedAt: now, closedReason: JOINED, attendanceFlagId: main.id } });
    await writeAudit(tx, ctx, { action: "joined-attendance-flag", recordType: "Risk Flag", recordId: rf.id, before: { status: rf.status }, after: { status: "CLOSED", reason: JOINED, attendanceFlagId: main.id } });
    joined++;
  }
  return joined;
}
