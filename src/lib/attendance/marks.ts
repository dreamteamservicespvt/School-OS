// Take Attendance (05 §2): the class list for a date, and saving it. Rules:
// one mark per student per date (and period); holidays are off (rule 18);
// after the lock time a change needs a correction (rule 17); offline saves
// follow 08-platform-security.md §10 (first save wins, the second becomes a
// correction; the lock is judged by when it was taken; wrong clocks flagged).
import "server-only";

import { Prisma, type AttendanceSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { fileLink } from "../files";
import { ruleReady } from "../messaging/automatic";
import { formatDate, formatTime } from "../format";
import { assertYearOpen } from "../academic/years";
import { isoDay } from "../staff/dates";
import { AttendanceProblem, BASE, canTakeDaily, NotYoursError, type AttendanceAccess } from "./access";
import { dayInfo, OffDayError } from "./calendar";
import { loadSchoolCalendar } from "../calendar/school-days";
import { attendanceFeatures, attendanceSettings, statusList, statusesFor, type StatusInfo } from "./settings";
import { instantAt, schoolDateOf, time12 } from "./time";
import { sectionPeriods, teacherPeriodsOn } from "./timetable";
import { createCorrection } from "./corrections";
import { ON_REGISTER_STATUSES } from "./on-register";
import { nextReason, reasonChoices, reasonFromLeave, REASONS_FEATURE, shownReason, type ShownReason } from "./absence-reasons";
import { queueAfterSave } from "./after-save";

export { absenceSendTime } from "./after-save";

export const dayText = (d: Date) => formatDate(d, "UTC");

export async function sectionInfo(tx: Tx, sectionId: string) {
  const s = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null }, include: { schoolClass: { select: { name: true, campusId: true, sortOrder: true } } } });
  if (!s) return null;
  return { id: s.id, name: `${s.schoolClass.name} ${s.name}`, campusId: s.schoolClass.campusId, academicYearId: s.academicYearId, classTeacherId: s.classTeacherId, classId: s.classId };
}

/** Students studying in a section, in roll-number (or name) order. */
export async function roster(tx: Tx, sectionId: string, academicYearId: string, order: string = "roll", opts: { pastYear?: boolean } = {}) {
  // A finished year keeps everyone who was in the class (promoted, passed out or left since).
  const rows = await tx.enrolment.findMany({
    where: opts.pastYear
      ? { sectionId, academicYearId, archivedAt: null }
      : { sectionId, academicYearId, archivedAt: null, status: "STUDYING", student: { archivedAt: null, status: { in: ON_REGISTER_STATUSES } } },
    include: { student: { select: { id: true, fullName: true, admissionNo: true, photoFileId: true } } },
  });
  rows.sort((a, b) => (order === "name" ? a.student.fullName.localeCompare(b.student.fullName) : (a.rollNo ?? 9999) - (b.rollNo ?? 9999) || a.student.fullName.localeCompare(b.student.fullName)));
  return rows.map((r) => ({ studentId: r.student.id, rollNo: r.rollNo, name: r.student.fullName, admissionNo: r.student.admissionNo, photoFileId: r.student.photoFileId }));
}

/** Approved student leave covering a date, by student. */
export async function studentLeavesOn(tx: Tx, studentIds: string[], date: Date) {
  if (studentIds.length === 0) return new Map<string, { id: string; typeName: string; typeCode: string | null; halfDay: boolean; reason: string | null }>();
  const rows = await tx.leaveRequest.findMany({
    where: { studentId: { in: studentIds }, status: "APPROVED", archivedAt: null, fromDate: { lte: date }, toDate: { gte: date } },
    select: { id: true, studentId: true, leaveTypeId: true, halfDay: true, reason: true },
  });
  const types = await tx.leaveType.findMany({ where: { id: { in: rows.map((r) => r.leaveTypeId) } }, select: { id: true, name: true, code: true } });
  return new Map(rows.map((r) => {
    const t = types.find((x) => x.id === r.leaveTypeId);
    return [r.studentId!, { id: r.id, typeName: t?.name ?? "Leave", typeCode: t?.code ?? null, halfDay: r.halfDay, reason: r.reason || null }];
  }));
}

export type LockState = { locked: boolean; at: Date; atText: string };

/** When a date's attendance locks (Attendance Settings, rule 17). */
export function lockState(settings: Pick<AttendanceSetting, "lockTime">, date: Date, now: Date, timeZone: string): LockState {
  const at = instantAt(date, settings.lockTime, timeZone);
  return { locked: now.getTime() >= at.getTime(), at, atText: time12(settings.lockTime) };
}

export class LockedError extends AttendanceProblem {
  constructor(date: Date, lock: LockState, href: string) {
    super(`Attendance for ${dayText(date)} locked at ${lock.atText} (Attendance Settings). Request a correction.`, undefined, { href, label: "Request a correction" });
    this.name = "LockedError";
  }
}


// ---------------------------------------------------------------- choosing a class

export type TakeChoice = { sectionId: string; name: string; periodNo: number; periodLabel: string | null; startTime: string | null; done: boolean };

/**
 * The classes (and periods) a person may take on a date, for Take Attendance
 * and the teacher's home. Classes with no school that day (a holiday, a
 * Sunday, a day off for their campus) are left out.
 */
export async function takeChoices(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, date: Date): Promise<TakeChoice[]> {
  if (access.students === "none" || access.change === "none" || !access.yearId) return [];
  const features = await attendanceFeatures(tx, ctx);
  const periodWise = features.has("attendance-period-wise");
  const full = access.students === "all" && access.change === "all";
  const [all, calendar] = await Promise.all([
    tx.section.findMany({
      where: { academicYearId: access.yearId, archivedAt: null, ...(full ? {} : { id: { in: periodWise ? [...access.classSections, ...access.teachingSections] : access.classSections } }) },
      include: { schoolClass: { select: { name: true, sortOrder: true, campusId: true } } },
    }),
    loadSchoolCalendar(tx, ctx, date, date),
  ]);
  const sections = all.filter((s) => calendar.campus(s.schoolClass.campusId).info(date, { classId: s.classId }).on);
  sections.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
  const done = await tx.attendanceMark.groupBy({ by: ["sectionId", "periodNo"], where: { date, sectionId: { in: sections.map((s) => s.id) }, archivedAt: null }, _count: true });
  const isDone = (sid: string, p: number) => done.some((d) => d.sectionId === sid && d.periodNo === p);
  if (!periodWise) return sections.map((s) => ({ sectionId: s.id, name: `${s.schoolClass.name} ${s.name}`, periodNo: 0, periodLabel: null, startTime: null, done: isDone(s.id, 0) }));

  const out: TakeChoice[] = [];
  if (full) {
    for (const s of sections) {
      const periods = await sectionPeriods(tx, ctx, s.id, s.schoolClass.campusId, date);
      for (const p of periods) out.push({ sectionId: s.id, name: `${s.schoolClass.name} ${s.name}`, periodNo: p.periodNo, periodLabel: `Period ${p.periodNo}, ${time12(p.startTime)}${p.subject ? ` · ${p.subject}` : ""}`, startTime: p.startTime, done: isDone(s.id, p.periodNo) });
    }
    return out;
  }
  if (!access.staffId || !access.campusId) return [];
  const mine = await teacherPeriodsOn(tx, ctx, access.staffId, access.campusId, date);
  for (const p of mine) {
    const s = sections.find((x) => x.id === p.sectionId) ?? (await tx.section.findFirst({ where: { id: p.sectionId }, include: { schoolClass: { select: { name: true, sortOrder: true, campusId: true } } } }));
    if (!s || !calendar.campus(s.schoolClass.campusId).info(date, { classId: s.classId }).on) continue;
    out.push({ sectionId: s.id, name: `${s.schoolClass.name} ${s.name}`, periodNo: p.periodNo, periodLabel: `Period ${p.periodNo}, ${time12(p.startTime)}${p.subject ? ` · ${p.subject}` : ""}${p.substitute ? " (substitution)" : ""}`, startTime: p.startTime, done: isDone(s.id, p.periodNo) });
  }
  return out;
}

/** May this person take attendance for this section (and period) on this date? */
export async function canTake(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, sectionId: string, date: Date, periodNo: number) {
  if (access.change === "none" || access.students === "none") return false;
  if (access.change === "all" && access.students === "all") return true;
  if (periodNo === 0) return canTakeDaily(access, sectionId);
  if (!access.staffId || !access.campusId) return false;
  const mine = await teacherPeriodsOn(tx, ctx, access.staffId, access.campusId, date);
  return mine.some((p) => p.sectionId === sectionId && p.periodNo === periodNo) || access.classSections.includes(sectionId);
}

// ---------------------------------------------------------------- the sheet

export type SheetStudent = {
  studentId: string; rollNo: number | null; name: string; admissionNo: string; photoUrl: string | null;
  statusKey: string | null; note: string | null; method: string | null;
  leave: { id: string; typeName: string; halfDay: boolean; reason: string | null } | null;
  /** The absence reason as this person may see it (absence reasons on, absent marks only). */
  reason: ShownReason | null;
};

export async function loadSheet(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { sectionId: string; date: Date; periodNo: number; now: Date; timeZone: string }) {
  const section = await sectionInfo(tx, input.sectionId);
  if (!section) throw new AttendanceProblem("This class was not found.");
  if (!(await canTake(tx, ctx, access, section.id, input.date, input.periodNo))) throw new NotYoursError();
  const settings = await attendanceSettings(tx, ctx);
  const reasonsOn = (await attendanceFeatures(tx, ctx)).has(REASONS_FEATURE);
  const [info, statuses, students, marks, lastSubmission] = await Promise.all([
    dayInfo(tx, ctx, input.date, section.campusId, { classId: section.classId }),
    statusList(tx, ctx),
    roster(tx, section.id, section.academicYearId, settings.registerOrder),
    tx.attendanceMark.findMany({ where: { sectionId: section.id, date: input.date, periodNo: input.periodNo, archivedAt: null } }),
    tx.attendanceSubmission.findFirst({ where: { sectionId: section.id, date: input.date, periodNo: input.periodNo, outcome: "saved" }, orderBy: { receivedAt: "desc" } }),
  ]);
  const leaves = await studentLeavesOn(tx, students.map((s) => s.studentId), input.date);
  const byStudent = new Map(marks.map((m) => [m.studentId!, m]));
  const sheet: SheetStudent[] = students.map((s) => {
    const m = byStudent.get(s.studentId);
    return {
      studentId: s.studentId, rollNo: s.rollNo, name: s.name, admissionNo: s.admissionNo,
      photoUrl: settings.showPhotos && s.photoFileId ? fileLink(s.photoFileId, ctx.schoolId) : null,
      statusKey: m?.statusKey ?? null, note: m?.note ?? null, method: m?.method ?? null, leave: leaves.get(s.studentId) ?? null,
      reason: reasonsOn && m ? shownReason(m, access.seesFees) : null,
    };
  });
  const savedBy = lastSubmission?.submittedById ? await tx.userLogin.findUnique({ where: { id: lastSubmission.submittedById }, select: { displayName: true } }) : null;
  const lock = lockState(settings, input.date, input.now, input.timeZone);
  const future = input.date > schoolDateOf(input.now, input.timeZone);
  return {
    section, settings, day: info, statuses: statusesFor(statuses, "students") as StatusInfo[], students: sheet,
    saved: marks.length > 0, savedAt: lastSubmission?.receivedAt ?? (marks[0]?.markedAt ?? null), savedBy: savedBy?.displayName ?? null,
    lock, canChangeAfterLock: access.lockOverride, future,
    /** Absence reasons (School Feature): the reasons this person may choose, or null when off. */
    reasons: reasonsOn ? reasonChoices(access.seesFees) : null,
  };
}

// ---------------------------------------------------------------- saving

/** One student's mark. The absence reason is optional: left out, an absent student gets "Not known yet" (when reasons are on). */
export type Entry = { studentId: string; statusKey: string; note?: string | null; reason?: string | null; reasonNote?: string | null };
type Reason = { absenceReason: string | null; absenceNote: string | null; reasonSource: string | null };

export type SaveInput = {
  sectionId: string;
  date: Date;
  periodNo: number;
  entries: Entry[];
  now: Date;
  timeZone: string;
  /** Offline saves from the phone's queue. */
  offline?: { clientId: string; takenAt: Date; clientNow: Date } | null;
  /** Online saves also carry an id so a double tap counts once. */
  clientId?: string | null;
};

export type SaveResult = {
  outcome: "saved" | "correction" | "unchanged";
  counts: Record<string, number>;
  changed: number;
  correctionId?: string;
  clockFlagged?: boolean;
  messagesAt?: Date | null;
  /** Absence messages are on, but no WhatsApp or SMS channel is connected. */
  noChannel?: boolean;
  /** Absence messages are on here, but Communication's "Absent today" message is switched off: nothing goes. */
  ruleOff?: boolean;
  summary: string;
};

function countsOf(entries: { statusKey: string }[]) {
  const c: Record<string, number> = {};
  for (const e of entries) c[e.statusKey] = (c[e.statusKey] ?? 0) + 1;
  return c;
}

export function countsText(counts: Record<string, number>, statuses: StatusInfo[]) {
  const parts = statuses.filter((s) => counts[s.key]).map((s) => `${counts[s.key]} ${s.name.toLowerCase()}`);
  return parts.join(", ") || "nobody marked";
}

/**
 * Saves a class's attendance for a date (and period). A second save updates,
 * never duplicates. Students on approved leave stay Leave. Runs automation A4
 * after a short wait. Throws in plain words when a rule blocks it.
 */
export async function saveClassAttendance(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: SaveInput): Promise<SaveResult> {
  const clientId = input.offline?.clientId ?? input.clientId ?? null;
  if (clientId) {
    const seen = await tx.attendanceSubmission.findUnique({ where: { schoolId_clientId: { schoolId: ctx.schoolId, clientId } } });
    if (seen) return { outcome: seen.outcome === "correction" ? "correction" : "unchanged", counts: {}, changed: 0, correctionId: seen.correctionId ?? undefined, clockFlagged: seen.clockFlagged, summary: "Already received." };
  }
  const section = await sectionInfo(tx, input.sectionId);
  if (!section) throw new AttendanceProblem("This class was not found.", "sectionId");
  if (!(await canTake(tx, ctx, access, section.id, input.date, input.periodNo))) throw new NotYoursError();
  await assertYearOpen(tx, section.academicYearId);
  const today = schoolDateOf(input.now, input.timeZone);
  if (input.date > today) throw new AttendanceProblem(`${dayText(input.date)} has not come yet. Attendance can be taken for today or earlier days.`, "date");
  const year = await tx.academicYear.findUnique({ where: { id: section.academicYearId } });
  if (year && (input.date < year.startDate || input.date > year.endDate)) throw new AttendanceProblem(`${dayText(input.date)} is outside the academic year ${year.name}.`, "date");
  const info = await dayInfo(tx, ctx, input.date, section.campusId, { classId: section.classId });
  if (!info.on) throw new OffDayError(info, input.date);
  if (input.entries.length === 0) throw new AttendanceProblem("Mark at least one student before saving.");

  const settings = await attendanceSettings(tx, ctx);
  const statuses = statusesFor(await statusList(tx, ctx), "students");
  const valid = new Set(statuses.map((s) => s.key));
  const students = await roster(tx, section.id, section.academicYearId);
  const inClass = new Map(students.map((s) => [s.studentId, s]));
  const leaves = await studentLeavesOn(tx, students.map((s) => s.studentId), input.date);
  const reasonsOn = (await attendanceFeatures(tx, ctx)).has(REASONS_FEATURE);
  const absentKeys = new Set(statuses.filter((s) => s.counts === "absent").map((s) => s.key));
  const seen = new Set<string>();
  const entries: (Entry & { leaveRequestId: string | null })[] = [];
  for (const e of input.entries) {
    if (!inClass.has(e.studentId)) throw new AttendanceProblem("One of the students is not in this class any more. Reload the class list and save again.");
    if (seen.has(e.studentId)) continue;
    seen.add(e.studentId);
    const leave = leaves.get(e.studentId);
    const statusKey = leave && !leave.halfDay ? "leave" : e.statusKey;
    if (!valid.has(statusKey)) throw new AttendanceProblem(`"${e.statusKey}" is not one of the school's attendance statuses. Reload the page and try again.`);
    const note = (e.note ?? "").trim().slice(0, 300) || null;
    entries.push({ studentId: e.studentId, statusKey, note, reason: e.reason ?? null, reasonNote: e.reasonNote ?? null, leaveRequestId: leave && statusKey === "leave" ? leave.id : null });
  }

  // Offline: wrong phone clock (08 §10). The server's time is used when the difference is big.
  let takenAt: Date | null = null;
  let skewSeconds: number | null = null;
  let clockFlagged = false;
  if (input.offline) {
    skewSeconds = Math.round((input.now.getTime() - input.offline.clientNow.getTime()) / 1000);
    clockFlagged = Math.abs(skewSeconds) > settings.maxClockSkewMinutes * 60;
    takenAt = clockFlagged ? new Date(input.offline.takenAt.getTime() + skewSeconds * 1000) : input.offline.takenAt;
    if (takenAt > input.now) takenAt = input.now;
  }

  const existing = await tx.attendanceMark.findMany({ where: { sectionId: section.id, date: input.date, periodNo: input.periodNo, archivedAt: null, studentId: { not: null } } });
  const before = new Map(existing.map((m) => [m.studentId!, m]));
  // Absence reasons: an unchanged mark saved again without a reason keeps what it had (marks from before stay "not recorded").
  const reasons = new Map<string, Reason>();
  for (const e of entries) {
    const b = before.get(e.studentId);
    const leave = leaves.get(e.studentId);
    const keepAsIs = b && b.statusKey === e.statusKey && !e.reason;
    reasons.set(e.studentId, keepAsIs
      ? { absenceReason: b.absenceReason, absenceNote: b.absenceNote, reasonSource: b.reasonSource }
      : nextReason({
          on: reasonsOn, absent: absentKeys.has(e.statusKey), seesFees: access.seesFees, wanted: e.reason, note: e.reasonNote, existing: b ?? null,
          leave: leave?.halfDay ? reasonFromLeave({ typeCode: leave.typeCode, typeName: leave.typeName, reason: leave.reason }) : null,
        }));
  }
  const reasonOf = (id: string) => reasons.get(id)!;
  const changes = entries.filter((e) => {
    const b = before.get(e.studentId);
    const r = reasonOf(e.studentId);
    return !b || b.statusKey !== e.statusKey || (b.note ?? null) !== (e.note ?? null) || b.absenceReason !== r.absenceReason || (b.absenceNote ?? null) !== r.absenceNote;
  });
  const lock = lockState(settings, input.date, input.now, input.timeZone);
  const reachedSameDay = isoDay(today) === isoDay(input.date);
  const lockedForThis = input.offline ? (!reachedSameDay || (takenAt ?? input.now) >= lock.at) : lock.locked;
  const label = `${section.name}${input.periodNo ? `, period ${input.periodNo}` : ""}`;
  const names = new Map(students.map((s) => [s.studentId, s.name]));

  const record = async (outcome: string, correctionId: string | null) => {
    if (!clientId) return;
    await tx.attendanceSubmission.create({
      data: {
        schoolId: ctx.schoolId, clientId, sectionId: section.id, date: input.date, periodNo: input.periodNo, submittedById: ctx.userId,
        offline: Boolean(input.offline), takenAt, clockSkewSeconds: skewSeconds, clockFlagged, outcome, correctionId, entries: entries.length,
      },
    });
  };

  // Two people, one register (08 §10): an offline save that arrives after someone else's becomes a correction.
  const someoneElse = existing.some((m) => m.markedById && m.markedById !== ctx.userId);
  if (input.offline && existing.length > 0 && someoneElse && changes.length > 0) {
    const correction = await createCorrection(tx, ctx, {
      forWhom: "student", sectionId: section.id, sectionName: section.name, date: input.date, periodNo: input.periodNo, kind: "offline-conflict",
      entries: changes.map((c) => ({ id: c.studentId, name: names.get(c.studentId) ?? "Student", from: before.get(c.studentId)?.statusKey ?? null, to: c.statusKey, note: c.note ?? null })),
      reason: `Two people marked ${label} for ${dayText(input.date)}. The first one to reach the school was saved; this is the second.`,
      versions: {
        saved: existing.map((m) => ({ id: m.studentId, name: names.get(m.studentId!) ?? "Student", status: m.statusKey })),
        second: entries.map((e) => ({ id: e.studentId, name: names.get(e.studentId) ?? "Student", status: e.statusKey })),
        takenAt: takenAt?.toISOString() ?? null,
      } as unknown as Prisma.InputJsonValue,
    });
    await record("correction", correction.id);
    return { outcome: "correction", counts: countsOf(entries), changed: 0, correctionId: correction.id, clockFlagged, summary: `Someone else saved ${label} first. Your version went to Approvals as a correction.` };
  }

  if (changes.length === 0) {
    await record("unchanged", null);
    return { outcome: "unchanged", counts: countsOf(entries), changed: 0, clockFlagged, summary: "Nothing changed." };
  }

  if (lockedForThis && !(access.lockOverride && !input.offline)) {
    if (!input.offline) throw new LockedError(input.date, lock, `${BASE}/register/correction?section=${section.id}&date=${isoDay(input.date)}${input.periodNo ? `&period=${input.periodNo}` : ""}`);
    // Offline, taken after the lock or reaching the school on a later day: a correction (08 §10).
    const correction = await createCorrection(tx, ctx, {
      forWhom: "student", sectionId: section.id, sectionName: section.name, date: input.date, periodNo: input.periodNo, kind: "offline-late",
      entries: changes.map((c) => ({ id: c.studentId, name: names.get(c.studentId) ?? "Student", from: before.get(c.studentId)?.statusKey ?? null, to: c.statusKey, note: c.note ?? null })),
      reason: reachedSameDay
        ? `Taken on the phone at ${formatTime(takenAt ?? input.now, input.timeZone)}, after attendance locked at ${lock.atText}.`
        : `Taken on the phone offline and sent on a later day (${formatDate(input.now, input.timeZone)}).`,
      versions: null,
    });
    await record("correction", correction.id);
    return { outcome: "correction", counts: countsOf(entries), changed: 0, correctionId: correction.id, clockFlagged, summary: `It reached the school after the lock, so it went to Approvals as a correction.` };
  }

  const fresh = changes.filter((c) => !before.has(c.studentId));
  if (fresh.length) {
    await tx.attendanceMark.createMany({
      data: fresh.map((c) => ({
        schoolId: ctx.schoolId, academicYearId: section.academicYearId, studentId: c.studentId, sectionId: section.id, date: input.date, periodNo: input.periodNo,
        statusKey: c.statusKey, note: c.note ?? null, method: "register", markedById: ctx.userId, markedAt: input.now, takenAt, leaveRequestId: c.leaveRequestId,
        ...reasonOf(c.studentId),
      })),
      skipDuplicates: true,
    });
  }
  for (const c of changes.filter((x) => before.has(x.studentId))) {
    await tx.attendanceMark.update({
      where: { id: before.get(c.studentId)!.id },
      data: { statusKey: c.statusKey, note: c.note ?? null, method: "register", markedById: ctx.userId, markedAt: input.now, takenAt, leaveRequestId: c.leaveRequestId, ...reasonOf(c.studentId) },
    });
  }
  const afterLock = lockedForThis;
  await writeAudit(tx, ctx, {
    action: afterLock ? "attendance-changed-after-lock" : existing.length ? "attendance-changed" : "attendance-saved",
    recordType: "Attendance Mark", recordId: section.id,
    before: existing.length ? (changes.filter((c) => before.has(c.studentId)).map((c) => ({ student: names.get(c.studentId), status: before.get(c.studentId)!.statusKey, note: before.get(c.studentId)!.note, reason: before.get(c.studentId)!.absenceReason })) as unknown as Prisma.InputJsonValue) : null,
    after: {
      class: section.name, date: isoDay(input.date), period: input.periodNo || null, counts: countsOf(entries),
      changes: changes.map((c) => ({ student: names.get(c.studentId), status: c.statusKey, note: c.note ?? null, ...(reasonOf(c.studentId).absenceReason ? { reason: reasonOf(c.studentId).absenceReason } : {}) })),
      offline: Boolean(input.offline), clockFlagged,
    } as unknown as Prisma.InputJsonValue,
  });
  await record("saved", null);

  // A4: absence messages after a short wait, then flags. Safe to run twice.
  const { sendAt } = await queueAfterSave(tx, ctx, settings, [{ sectionId: section.id, date: input.date }], input.now);

  const counts = countsOf(entries);
  // Promise a message only when it can go: Communication's "Absent today" message is on and a channel can carry it
  // (the same check the sender makes, so the save never promises what parents do not get).
  const wantsMessage = settings.absenceAlertOn && entries.some((e) => absentKeys.has(e.statusKey));
  const rule = wantsMessage ? await ruleReady(tx, ctx, "absence") : null;
  return {
    outcome: "saved", counts, changed: changes.length, clockFlagged,
    messagesAt: rule?.ready ? sendAt : null,
    noChannel: Boolean(rule?.on && !rule.ready),
    ruleOff: Boolean(rule && !rule.on),
    summary: `Attendance saved for ${label}: ${countsText(counts, statuses)}.`,
  };
}
