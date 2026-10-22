// Automation A4, "Attendance marked" (05 §4): after a short wait, one
// absence message per absent student per day to the parent (none for
// students on approved leave); then each student's % is worked out again and
// anyone below the threshold, or absent several days in a row, is flagged
// once to the class teacher and the principal. Safe to run twice.
//
// It runs after every way a student's mark is written (./after-save.ts): the
// register, device and QR punches, approved corrections and approved leave.
// The parent message itself is Communication's "Absent today" (or "Late
// arrival") automatic message: its template, channels and on/off are the one
// setting (Communication, Message Settings). A student who punched in at the
// gate but is marked absent is not messaged: the class teacher is asked to
// check the register.
import "server-only";

import { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { notify } from "../notifications";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { addDays, isoDay } from "../staff/dates";
import { ruleReady } from "../messaging/automatic";
import { BASE } from "./access";
import { schoolDays } from "./calendar";
import { attendanceFeatures, attendanceSettings, statusList, statusMap, weightOf } from "./settings";
import { attendanceSummary, dayStatus, percentText } from "./summary";
import { sendAttendanceMessage } from "./notify-parents";
import { studentLeavesOn } from "./marks";
import { instantAt, schoolDateOf, time12 } from "./time";
import { CLEARED_REASON } from "./flags";
import { OPEN_LINK } from "../students/guardian-access";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function primaryGuardians(tx: Tx, studentIds: string[]) {
  const links = await tx.studentGuardian.findMany({ where: { studentId: { in: studentIds }, ...OPEN_LINK }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] });
  const out = new Map<string, string>();
  for (const l of links) if (!out.has(l.studentId)) out.set(l.studentId, l.guardianId);
  return out;
}

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
}

/**
 * Saves one alert per student/day/kind and hands each new one to Communication. Returns how many were new.
 * A row with `held` is saved as not sent, with that note, and goes to nobody.
 */
export async function raiseAlerts(tx: Tx, ctx: SchoolContext, date: Date, kind: string, rows: { studentId: string; text: string; held?: string }[], channels: string[]) {
  if (rows.length === 0) return 0;
  const guardians = await primaryGuardians(tx, rows.map((r) => r.studentId));
  const created = await tx.attendanceAlert.createManyAndReturn({
    data: rows.map((r) => ({ schoolId: ctx.schoolId, studentId: r.studentId, date, kind, guardianId: guardians.get(r.studentId) ?? null, text: r.text, channels, ...(r.held ? { status: "skipped", note: r.held } : {}) })),
    skipDuplicates: true,
  });
  for (const alert of created) {
    if (alert.status === "skipped") continue;
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

export async function afterAttendanceSaved(tx: Tx, ctx: SchoolContext, payload: { sectionId: string; date: string; messages?: boolean }): Promise<AfterSaveResult> {
  const date = day(payload.date);
  const settings = await attendanceSettings(tx, ctx);
  const section = await tx.section.findFirst({ where: { id: payload.sectionId }, include: { schoolClass: { select: { name: true, campusId: true } } } });
  if (!section) return { messages: 0, flagged: 0, cleared: 0 };
  const className = `${section.schoolClass.name} ${section.name}`;
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true, timeZone: true } });
  const statuses = statusMap(await statusList(tx, ctx, { includeArchived: true }));
  const marks = await tx.attendanceMark.findMany({ where: { sectionId: section.id, date, archivedAt: null, studentId: { not: null } }, select: { studentId: true, periodNo: true, statusKey: true, lateMinutes: true, inTime: true } });
  const studentIds = [...new Set(marks.map((m) => m.studentId!))];
  const students = await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, firstName: true } });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.fullName ?? "Your child";
  // A status that counts as absent (the school's own ones too), not only the "absent" key.
  const isAbsent = (key: string) => weightOf(statuses.get(key)) === 0;

  // 1. One absence message per absent student for the day. Each student's own
  //    marks decide: the once-a-day mark, or, with period-wise attendance, the
  //    first period the register marked them in (05 §10). A device's gate
  //    punch is a once-a-day mark, so in a period-wise school it never hides
  //    a student marked absent in period 1.
  let messages = 0;
  const wantsMessages = payload.messages !== false;
  if (wantsMessages && (settings.absenceAlertOn || settings.lateAlertOn)) {
    const periodWise = (await attendanceFeatures(tx, ctx)).has("attendance-period-wise");
    const byStudent = new Map<string, typeof marks>();
    for (const m of marks) byStudent.set(m.studentId!, [...(byStudent.get(m.studentId!) ?? []), m]);
    const deciding = [...byStudent.values()].map((list) => {
      const periods = list.filter((m) => m.periodNo > 0).sort((a, b) => a.periodNo - b.periodNo);
      return (periodWise && periods[0]) || list.find((m) => m.periodNo === 0) || periods[0];
    });
    if (settings.absenceAlertOn) {
      const absent = deciding.filter((m) => isAbsent(m.statusKey)).map((m) => m.studentId!);
      const onLeave = await studentLeavesOn(tx, absent, date);
      const gate = await inAtGate(tx, absent, date, marks, school?.timeZone ?? "Asia/Kolkata");
      const rule = await ruleReady(tx, ctx, "absence");
      const rows = absent.filter((id) => !onLeave.has(id)).map((id) => {
        const at = gate.get(id);
        return {
          studentId: id,
          text: `${nameOf(id)} (${className}) absent on ${formatDate(date, "UTC")}`,
          held: at ? `Punched in at ${at}, but marked absent. Not sent: check the register.` : undefined,
        };
      });
      messages += await raiseAlerts(tx, ctx, date, "absence", rows, rule.channels);
      // The class teacher checks a register that disagrees with the gate.
      const held = rows.filter((r) => r.held);
      if (held.length) await tellGate(tx, ctx, section, className, date, held.map((r) => nameOf(r.studentId)));
    }
    if (settings.lateAlertOn) {
      const late = deciding.filter((m) => m.statusKey === "late").map((m) => m.studentId!);
      const rule = await ruleReady(tx, ctx, "late");
      messages += await raiseAlerts(tx, ctx, date, "late", late.map((id) => ({ studentId: id, text: `${nameOf(id)} (${className}) late on ${formatDate(date, "UTC")}` })), rule.channels);
    }
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
    const days = await schoolDays(tx, ctx, from, date, section.schoolClass.campusId, { classId: section.classId });
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

export type MessageCount = { sent: number; waiting: number; notSent: number; reasons: { why: string; count: number }[] };

/** A not-sent note in a few words, for the count line. */
function whyWords(note: string | null): string {
  const n = (note ?? "").toLowerCase();
  if (n.startsWith("punched in")) return "punched in at the gate";
  if (n.includes("opted out")) return "opted out";
  if (n.includes("phone number")) return "no parent phone";
  if (n.includes("no parent")) return "no parent on file";
  if (n.includes("switched off")) return "message switched off";
  if (n.includes("channel") || n.includes("whatsapp") || n.includes("sms")) return "no channel ready";
  return n ? n.replace(/\.$/, "") : "not sent";
}

/**
 * The day's absence messages for some sections, from the Attendance Alerts:
 * how many went, how many wait for the delay, and how many did not go and
 * why, so the office never believes messages went when they did not (G08).
 * Null when nothing is marked yet.
 */
export async function absenceMessagesOn(tx: Tx, date: Date, sectionIds: string[]): Promise<MessageCount | null> {
  if (!sectionIds.length) return null;
  const marked = await tx.attendanceMark.findMany({ where: { sectionId: { in: sectionIds }, date, archivedAt: null, studentId: { not: null } }, select: { studentId: true }, distinct: ["studentId"] });
  if (!marked.length) return null;
  const rows = await tx.attendanceAlert.findMany({ where: { date, kind: "absence", studentId: { in: marked.map((m) => m.studentId!) } }, select: { status: true, note: true } });
  const out: MessageCount = { sent: 0, waiting: 0, notSent: 0, reasons: [] };
  const why = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "sent") out.sent++;
    else if (r.status === "waiting") out.waiting++;
    else {
      out.notSent++;
      const w = whyWords(r.note);
      why.set(w, (why.get(w) ?? 0) + 1);
    }
  }
  out.reasons = [...why].map(([w, count]) => ({ why: w, count })).sort((a, b) => b.count - a.count);
  return out;
}

/** "Absence messages today: 12 sent, 2 not sent (1 no parent phone, 1 opted out)". Null when there are none. */
export function messageCountText(c: MessageCount | null, isToday: boolean): string | null {
  if (!c || c.sent + c.waiting + c.notSent === 0) return null;
  const parts = [c.sent ? `${c.sent} sent` : null, c.waiting ? `${c.waiting} waiting` : null, c.notSent ? `${c.notSent} not sent (${c.reasons.map((r) => `${r.count} ${r.why}`).join(", ")})` : null].filter(Boolean);
  return `Absence messages${isToday ? " today" : ""}: ${parts.join(", ")}`;
}

/** Students with an accepted gate punch (device) or a check-in time (QR) that day: "8:02 AM", by student. */
async function inAtGate(tx: Tx, studentIds: string[], date: Date, marks: { studentId: string | null; inTime: Date | null }[], timeZone: string) {
  const out = new Map<string, string>();
  if (!studentIds.length) return out;
  const clock = (d: Date) => time12(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d));
  for (const m of marks) if (m.studentId && m.inTime && studentIds.includes(m.studentId) && !out.has(m.studentId)) out.set(m.studentId, clock(m.inTime));
  const punches = await tx.devicePunch.findMany({
    where: { accepted: true, studentId: { in: studentIds }, punchedAt: { gte: instantAt(date, "00:00", timeZone), lt: instantAt(addDays(date, 1), "00:00", timeZone) } },
    orderBy: { punchedAt: "asc" }, select: { studentId: true, punchedAt: true },
  });
  for (const p of punches) if (p.studentId && !out.has(p.studentId)) out.set(p.studentId, clock(p.punchedAt));
  return out;
}

async function tellGate(tx: Tx, ctx: SchoolContext, section: { id: string; classTeacherId: string | null }, className: string, date: Date, names: string[]) {
  const teacher = section.classTeacherId ? await tx.staff.findUnique({ where: { id: section.classTeacherId }, select: { userLoginId: true } }) : null;
  if (!teacher?.userLoginId) return;
  const who = names.length === 1 ? `${names[0]} punched in at the gate` : `${names.length} students punched in at the gate`;
  await notify(tx, ctx, {
    to: teacher.userLoginId, type: "attendance-flag",
    text: `${who} but ${names.length === 1 ? "is" : "are"} marked absent in ${className} on ${formatDate(date, "UTC")}. No absence message went to the parents. Check the register.`,
    link: `${BASE}/register/absences?date=${isoDay(date)}&section=${section.id}`, groupKey: `attendance-gate-${section.id}-${isoDay(date)}`,
    mergedText: (n) => `${n} students in ${className} punched in at the gate but are marked absent`,
  });
}

/** Sets the "locked" mark on saved marks once the lock time has passed (rule 17). Safe to run twice. */
export async function lockPastMarks(tx: Tx, ctx: SchoolContext, now: Date, timeZone: string, lockTime: string) {
  const today = schoolDateOf(now, timeZone);
  const lockedToday = now >= instantAt(today, lockTime, timeZone);
  const before = lockedToday ? addDays(today, 1) : today;
  const r = await tx.attendanceMark.updateMany({ where: { schoolId: ctx.schoolId, locked: false, date: { lt: before } }, data: { locked: true } });
  return r.count;
}
