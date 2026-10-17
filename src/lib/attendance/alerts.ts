// Automation A4, "Attendance marked" (05 §4): after a short wait, one
// absence message per absent student per day to the parent (none for
// students on approved leave); then each student's % is worked out again and
// anyone below the threshold, or absent several days in a row, is flagged
// once to the class teacher and the principal. Safe to run twice.
import "server-only";

import { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { notify } from "../notifications";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { addDays, isoDay } from "../staff/dates";
import { BASE } from "./access";
import { schoolDays } from "./calendar";
import { attendanceSettings, statusList, statusMap, weightOf } from "./settings";
import { attendanceSummary, dayStatus, percentText } from "./summary";
import { sendAttendanceMessage } from "./notify-parents";
import { studentLeavesOn } from "./marks";
import { instantAt, schoolDateOf } from "./time";
import { CLEARED_REASON } from "./flags";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function primaryGuardians(tx: Tx, studentIds: string[]) {
  const links = await tx.studentGuardian.findMany({ where: { studentId: { in: studentIds }, archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] });
  const out = new Map<string, string>();
  for (const l of links) if (!out.has(l.studentId)) out.set(l.studentId, l.guardianId);
  return out;
}

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
}

/** Saves one alert per student/day/kind and hands each new one to Communication. Returns how many were new. */
export async function raiseAlerts(tx: Tx, ctx: SchoolContext, date: Date, kind: string, rows: { studentId: string; text: string }[], channels: string[]) {
  if (rows.length === 0) return 0;
  const guardians = await primaryGuardians(tx, rows.map((r) => r.studentId));
  const created = await tx.attendanceAlert.createManyAndReturn({
    data: rows.map((r) => ({ schoolId: ctx.schoolId, studentId: r.studentId, date, kind, guardianId: guardians.get(r.studentId) ?? null, text: r.text, channels })),
    skipDuplicates: true,
  });
  for (const alert of created) {
    const outcome = await sendAttendanceMessage(tx, ctx, alert);
    await tx.attendanceAlert.update({ where: { id: alert.id }, data: { status: outcome.status, note: outcome.note, messageRef: outcome.messageRef ?? null } });
  }
  return created.length;
}

async function loginsWithRole(tx: Tx, ctx: SchoolContext, key: string) {
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key, isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  });
  return [...new Set(rows.map((r) => r.userLoginId))];
}

export type AfterSaveResult = { messages: number; flagged: number; cleared: number };

export async function afterAttendanceSaved(tx: Tx, ctx: SchoolContext, payload: { sectionId: string; date: string }): Promise<AfterSaveResult> {
  const date = day(payload.date);
  const settings = await attendanceSettings(tx, ctx);
  const section = await tx.section.findFirst({ where: { id: payload.sectionId }, include: { schoolClass: { select: { name: true, campusId: true } } } });
  if (!section) return { messages: 0, flagged: 0, cleared: 0 };
  const className = `${section.schoolClass.name} ${section.name}`;
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } });
  const statuses = statusMap(await statusList(tx, ctx, { includeArchived: true }));
  const marks = await tx.attendanceMark.findMany({ where: { sectionId: section.id, date, archivedAt: null, studentId: { not: null } }, select: { studentId: true, periodNo: true, statusKey: true, lateMinutes: true } });
  const studentIds = [...new Set(marks.map((m) => m.studentId!))];
  const students = await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, firstName: true } });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.fullName ?? "Your child";

  // 1. One absence message per absent student for the day. With period-wise
  //    attendance, the first period saved that day decides (05 §10).
  let messages = 0;
  if (settings.absenceAlertOn) {
    const firstPeriod = Math.min(...marks.map((m) => m.periodNo));
    const deciding = marks.filter((m) => m.periodNo === (marks.some((x) => x.periodNo === 0) ? 0 : firstPeriod));
    const absent = deciding.filter((m) => m.statusKey === "absent").map((m) => m.studentId!);
    const onLeave = await studentLeavesOn(tx, absent, date);
    const rows = absent.filter((id) => !onLeave.has(id)).map((id) => ({
      studentId: id,
      text: fillTemplate(settings.absenceTemplate, { student: nameOf(id), class: className, date: formatDate(date, "UTC"), school: school?.name ?? "" }),
    }));
    messages += await raiseAlerts(tx, ctx, date, "absence", rows, settings.absenceChannels);
  }
  if (settings.lateAlertOn) {
    const late = marks.filter((m) => m.statusKey === "late").map((m) => m.studentId!);
    messages += await raiseAlerts(tx, ctx, date, "late", late.map((id) => ({ studentId: id, text: `Dear parent, ${nameOf(id)} of ${className} came late to school today (${formatDate(date, "UTC")}). ${school?.name ?? ""}` })), settings.absenceChannels);
  }

  // 2. Flags, once per drop below, cleared when they recover.
  const teacher = section.classTeacherId ? await tx.staff.findUnique({ where: { id: section.classTeacherId }, select: { userLoginId: true } }) : null;
  const principals = await loginsWithRole(tx, ctx, "principal");
  const tell = async (who: string[], text: string, link: string, kind: "threshold" | "streak") => {
    const to = new Set<string>();
    if (who.includes("class-teacher") && teacher?.userLoginId) to.add(teacher.userLoginId);
    if (who.includes("principal")) for (const p of principals) to.add(p);
    for (const person of to) await notify(tx, ctx, { to: person, type: "attendance-flag", text, link, groupKey: `attendance-flag-${kind}-${section.id}`, mergedText: (n) => kind === "threshold" ? `${n} students in ${className} are below ${settings.thresholdPercent}% attendance` : `${n} students in ${className} have been absent ${settings.chronicDays} school days in a row` });
  };
  let flagged = 0;
  let cleared = 0;
  // Not yet cleared, including flags a person closed as not a concern: those are not raised again until attendance recovers.
  const open = await tx.attendanceFlag.findMany({ where: { studentId: { in: studentIds }, clearedAt: null } });
  /** Attendance is back within the rule: the flag clears and, unless a person closed it already, closes in Early Warnings too. */
  const clear = async (flag: (typeof open)[number]) => {
    const at = new Date();
    await tx.attendanceFlag.update({ where: { id: flag.id }, data: { clearedAt: at, ...(flag.status === "CLOSED" ? {} : { status: "CLOSED", closedAt: at, closedReason: CLEARED_REASON }) } });
    if (flag.status !== "CLOSED") await writeAudit(tx, ctx, { action: "cleared", recordType: "Attendance Flag", recordId: flag.id, before: { status: flag.status }, after: { status: "CLOSED", reason: CLEARED_REASON } });
    cleared++;
  };
  const year = await tx.academicYear.findUnique({ where: { id: section.academicYearId } });

  if (settings.thresholdOn && year) {
    const sum = await attendanceSummary(tx, ctx, { studentIds, from: year.startDate, to: date, campusId: section.schoolClass.campusId });
    for (const id of studentIds) {
      const p = sum.people.get(id)?.percent ?? null;
      const flag = open.find((f) => f.studentId === id && f.kind === "below-threshold");
      // Too few days to judge fairly (inferred): at least 5 counted days.
      if (p !== null && p < settings.thresholdPercent && (sum.people.get(id)?.countedDays ?? 0) >= 5) {
        if (flag) continue;
        await tx.attendanceFlag.create({ data: { schoolId: ctx.schoolId, studentId: id, kind: "below-threshold", value: new Prisma.Decimal(p), raisedOn: date } });
        flagged++;
        await tell(settings.thresholdNotify, `${nameOf(id)} (${className}) is at ${percentText(p)} attendance, below ${settings.thresholdPercent}%`, `${BASE}/register?section=${section.id}&student=${id}`, "threshold");
        if (settings.thresholdNotify.includes("parent")) {
          await raiseAlerts(tx, ctx, date, "threshold", [{ studentId: id, text: `Dear parent, ${nameOf(id)}'s attendance this year is ${percentText(p)}, below the school's ${settings.thresholdPercent}%. Please speak to the class teacher. ${school?.name ?? ""}` }], settings.absenceChannels);
        }
      } else if (flag && p !== null && p >= settings.thresholdPercent) {
        await clear(flag);
      }
    }
  }

  if (settings.chronicOn) {
    const from = addDays(date, -Math.max(settings.chronicDays * 3, 14));
    const days = await schoolDays(tx, ctx, from, date, section.schoolClass.campusId);
    const recent = days.working.slice(-settings.chronicDays);
    const all = await tx.attendanceMark.findMany({ where: { studentId: { in: studentIds }, date: { in: recent }, archivedAt: null }, select: { studentId: true, date: true, periodNo: true, statusKey: true } });
    const rule = settings.periodDayRule === "most" ? "most" : "any";
    for (const id of studentIds) {
      const absentAll = recent.length >= settings.chronicDays && recent.every((d) => {
        const st = dayStatus(all.filter((m) => m.studentId === id && isoDay(m.date) === isoDay(d)), statuses, rule);
        return st !== null && weightOf(statuses.get(st)) === 0;
      });
      const flag = open.find((f) => f.studentId === id && f.kind === "absent-streak");
      if (absentAll && !flag) {
        await tx.attendanceFlag.create({ data: { schoolId: ctx.schoolId, studentId: id, kind: "absent-streak", value: new Prisma.Decimal(settings.chronicDays), raisedOn: date } });
        flagged++;
        await tell(settings.chronicNotify, `${nameOf(id)} (${className}) has been absent ${settings.chronicDays} school days in a row`, `${BASE}/register?section=${section.id}&student=${id}`, "streak");
        if (settings.chronicNotify.includes("parent")) {
          await raiseAlerts(tx, ctx, date, "chronic", [{ studentId: id, text: `Dear parent, ${nameOf(id)} has been absent for ${settings.chronicDays} school days in a row. Please speak to the class teacher. ${school?.name ?? ""}` }], settings.absenceChannels);
        }
      } else if (!absentAll && flag) {
        const today = all.find((m) => m.studentId === id && isoDay(m.date) === isoDay(date));
        if (today && (weightOf(statuses.get(today.statusKey)) ?? 0) > 0) await clear(flag);
      }
    }
  }
  return { messages, flagged, cleared };
}

/** Sets the "locked" mark on saved marks once the lock time has passed (rule 17). Safe to run twice. */
export async function lockPastMarks(tx: Tx, ctx: SchoolContext, now: Date, timeZone: string, lockTime: string) {
  const today = schoolDateOf(now, timeZone);
  const lockedToday = now >= instantAt(today, lockTime, timeZone);
  const before = lockedToday ? addDays(today, 1) : today;
  const r = await tx.attendanceMark.updateMany({ where: { schoolId: ctx.schoolId, locked: false, date: { lt: before } }, data: { locked: true } });
  return r.count;
}
