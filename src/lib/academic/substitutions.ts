// Substitutions (04 §2, workflow 7): periods needing cover when a teacher is
// on approved leave or marked absent, free teachers ranked as substitutes,
// arranging cover without double booking anyone, and temporary teachers.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { AcademicRuleError, addDays, daysBetween, plural, weekday, weekStart } from "./common";
import { dayOff } from "./calendar";
import { effectiveVersion, type PeriodCell } from "./timetable";
import { academicSettings } from "./settings";
import { allocationActiveOn } from "./allocation";

const REASON_WORDS: Record<string, string> = { leave: "Leave", absent: "Absent", temporary: "Temporary teacher" };
export const reasonWords = (r: string) => REASON_WORDS[r] ?? r;

/** Staff away on a date: approved leave, marked absent by hand, or replaced by a temporary teacher. */
export async function absentStaffOn(tx: Tx, ctx: SchoolContext, date: Date) {
  const [leave, absences, covers] = await Promise.all([
    tx.leaveRequest.findMany({ where: { schoolId: ctx.schoolId, staffId: { not: null }, status: "APPROVED", archivedAt: null, fromDate: { lte: date }, toDate: { gte: date } } }),
    tx.staffAbsence.findMany({ where: { schoolId: ctx.schoolId, date, archivedAt: null } }),
    tx.temporaryCover.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, fromDate: { lte: date }, toDate: { gte: date } } }),
  ]);
  const away = new Map<string, { reason: string; leaveRequestId: string | null; coverId: string | null }>();
  for (const c of covers) away.set(c.absentStaffId, { reason: "temporary", leaveRequestId: null, coverId: c.id });
  for (const l of leave) away.set(l.staffId!, { reason: "leave", leaveRequestId: l.id, coverId: away.get(l.staffId!)?.coverId ?? null });
  for (const a of absences) if (!away.has(a.staffId)) away.set(a.staffId, { reason: "absent", leaveRequestId: null, coverId: null });
  return away;
}

export type NeedRow = PeriodCell & {
  date: Date;
  absentStaffId: string;
  absentName: string;
  reason: string;
  substitution: { id: string; status: string; substituteId: string | null; substituteName: string | null; note: string | null } | null;
};

/** The periods needing a substitute on a date, with what is arranged (Done when 6). */
export async function needsOn(tx: Tx, ctx: SchoolContext, campusId: string, date: Date): Promise<{ off: Awaited<ReturnType<typeof dayOff>>; rows: NeedRow[] }> {
  const off = await dayOff(tx, ctx, date, campusId);
  if (off) return { off, rows: [] };
  const version = await effectiveVersion(tx, ctx, campusId, date);
  const away = await absentStaffOn(tx, ctx, date);
  // Only this campus's periods: another campus has its own Time Table and substitutions.
  const subs = await tx.substitution.findMany({ where: { schoolId: ctx.schoolId, date, archivedAt: null, status: { not: "CANCELLED" }, period: { section: { schoolClass: { campusId } } } } });
  const periodIds = new Set<string>(subs.map((s) => s.periodId));
  const day = weekday(date);
  let fromAway: PeriodCell[] = [];
  if (version && away.size) fromAway = await cellsWhere(tx, { versionId: version.id, dayOfWeek: day, staffId: { in: [...away.keys()] } });
  const extra = await cellsWhere(tx, { id: { in: [...periodIds].filter((id) => !fromAway.some((p) => p.id === id)) } });
  const all = [...fromAway, ...extra];
  const names = new Map((await tx.staff.findMany({ where: { id: { in: [...new Set([...all.map((p) => p.staffId), ...subs.map((s) => s.substituteStaffId), ...subs.map((s) => s.absentStaffId)].filter((x): x is string => Boolean(x)))] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  const rows: NeedRow[] = all.map((p) => {
    const s = subs.find((x) => x.periodId === p.id);
    const absentStaffId = s?.absentStaffId ?? p.staffId!;
    return {
      ...p, date, absentStaffId, absentName: names.get(absentStaffId) ?? "",
      reason: s?.reason ?? away.get(absentStaffId)?.reason ?? "absent",
      substitution: s ? { id: s.id, status: s.status, substituteId: s.substituteStaffId, substituteName: s.substituteStaffId ? names.get(s.substituteStaffId) ?? null : null, note: s.note } : null,
    };
  });
  rows.sort((a, b) => a.periodNo - b.periodNo || a.sectionLabel.localeCompare(b.sectionLabel));
  return { off, rows };
}

async function cellsWhere(tx: Tx, where: Prisma.TimetablePeriodWhereInput): Promise<PeriodCell[]> {
  const rows = await tx.timetablePeriod.findMany({
    where: { archivedAt: null, isBreak: false, staffId: { not: null }, ...where },
    include: { subject: { select: { name: true, code: true } }, section: { select: { name: true, classId: true, room: true, schoolClass: { select: { name: true } } } } },
  });
  const staff = new Map((await tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId!) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  return rows.map((r) => ({
    id: r.id, sectionId: r.sectionId, sectionLabel: `${r.section.schoolClass.name} ${r.section.name}`, classId: r.section.classId,
    dayOfWeek: r.dayOfWeek, periodNo: r.periodNo, startTime: r.startTime, endTime: r.endTime,
    subjectId: r.subjectId, subjectName: r.subject?.name ?? null, subjectCode: r.subject?.code ?? null,
    staffId: r.staffId, staffName: staff.get(r.staffId!) ?? null, room: r.room ?? r.section.room, isBreak: r.isBreak, label: r.label,
  }));
}

/**
 * Teachers free in a period on a date: working, not away, not teaching then
 * in the Time Table in force, and not already covering another class then.
 */
export async function freeTeachersAt(tx: Tx, ctx: SchoolContext, campusId: string, date: Date, periodNo: number) {
  const version = await effectiveVersion(tx, ctx, campusId, date);
  const away = await absentStaffOn(tx, ctx, date);
  const [teaching, covering, teachers] = await Promise.all([
    version ? tx.timetablePeriod.findMany({ where: { versionId: version.id, dayOfWeek: weekday(date), periodNo, archivedAt: null, staffId: { not: null } }, select: { staffId: true } }) : [],
    tx.substitution.findMany({ where: { schoolId: ctx.schoolId, date, status: "ARRANGED", archivedAt: null, period: { periodNo } }, select: { substituteStaffId: true } }),
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId, archivedAt: null, status: "ACTIVE", staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }),
  ]);
  const busy = new Set([...teaching.map((t) => t.staffId), ...covering.map((c) => c.substituteStaffId), ...away.keys()]);
  return teachers.filter((t) => !busy.has(t.id));
}

/** Substitutions each teacher took this week and this month, for fairness. */
export async function substitutionLoads(tx: Tx, ctx: SchoolContext, date: Date) {
  const monday = weekStart(date);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const rows = await tx.substitution.findMany({ where: { schoolId: ctx.schoolId, status: "ARRANGED", archivedAt: null, substituteStaffId: { not: null }, date: { gte: monthStart < monday ? monthStart : monday, lte: monthEnd > addDays(monday, 6) ? monthEnd : addDays(monday, 6) } }, select: { substituteStaffId: true, date: true } });
  const week = new Map<string, number>();
  const month = new Map<string, number>();
  for (const r of rows) {
    if (r.date >= monday && r.date <= addDays(monday, 6)) week.set(r.substituteStaffId!, (week.get(r.substituteStaffId!) ?? 0) + 1);
    if (r.date >= monthStart && r.date <= monthEnd) month.set(r.substituteStaffId!, (month.get(r.substituteStaffId!) ?? 0) + 1);
  }
  return { week, month };
}

export type Suggestion = { id: string; name: string; designation: string; sameSubject: boolean; sameClass: boolean; thisWeek: number; why: string };

/** Free teachers for a period, ranked: teaches the same subject, teaches that class, fewest substitutions this week (inferred). */
export async function suggestSubstitutes(tx: Tx, ctx: SchoolContext, campusId: string, periodId: string, date: Date): Promise<Suggestion[]> {
  const period = await tx.timetablePeriod.findFirst({ where: { id: periodId }, include: { section: true } });
  if (!period) return [];
  const free = await freeTeachersAt(tx, ctx, campusId, date, period.periodNo);
  const allocations = await tx.teacherAllocation.findMany({ where: { staffId: { in: free.map((f) => f.id) }, academicYearId: period.section.academicYearId, ...allocationActiveOn(date) }, include: { section: { select: { classId: true } } } });
  const { week } = await substitutionLoads(tx, ctx, date);
  return free
    .map((t) => {
      const mine = allocations.filter((a) => a.staffId === t.id);
      const sameSubject = Boolean(period.subjectId && mine.some((a) => a.subjectId === period.subjectId));
      const sameClass = mine.some((a) => a.section.classId === period.section.classId);
      const thisWeek = week.get(t.id) ?? 0;
      const why = [sameSubject && "teaches this subject", sameClass && "teaches this class", `${plural(thisWeek, "substitution")} this week`].filter(Boolean).join(", ");
      return { id: t.id, name: t.fullName, designation: t.designation, sameSubject, sameClass, thisWeek, why };
    })
    .sort((a, b) => Number(b.sameSubject) - Number(a.sameSubject) || Number(b.sameClass) - Number(a.sameClass) || a.thisWeek - b.thisWeek || a.name.localeCompare(b.name));
}

async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Arranges a substitute for one or more periods on a date. Busy teachers
 * are refused on the server too (04 §5 "Substitute double-booked").
 */
export async function assignSubstitute(tx: Tx, ctx: SchoolContext, input: { campusId: string; date: Date; periodIds: string[]; substituteId: string; note: string | null }) {
  if (input.periodIds.length === 0) throw new AcademicRuleError("Choose the period or periods to cover.", "periodIds");
  await lock(tx, `substitute:${input.substituteId}:${input.date.toISOString().slice(0, 10)}`);
  const sub = await tx.staff.findFirst({ where: { id: input.substituteId, archivedAt: null, status: "ACTIVE" } });
  if (!sub) throw new AcademicRuleError("Choose a substitute who is working today.", "substituteId");
  const away = await absentStaffOn(tx, ctx, input.date);
  // The periods are on the campus whose free teachers are checked (another campus's periods are not found).
  const periods = await tx.timetablePeriod.findMany({ where: { id: { in: input.periodIds }, archivedAt: null, section: { schoolClass: { campusId: input.campusId } } }, include: { section: { include: { schoolClass: true } }, subject: true } });
  if (periods.length !== input.periodIds.length) throw new AcademicRuleError("A chosen period is no longer in the Time Table. Reload the page.");
  const periodNos = periods.map((p) => p.periodNo);
  if (new Set(periodNos).size !== periodNos.length) throw new AcademicRuleError(`${sub.fullName} cannot cover two classes in the same period.`, "substituteId");
  const made: string[] = [];
  for (const p of periods) {
    if (weekday(input.date) !== p.dayOfWeek) throw new AcademicRuleError("That period is on another day of the week.");
    if (p.staffId === sub.id) throw new AcademicRuleError(`${sub.fullName} is the teacher who is away for ${p.section.schoolClass.name} ${p.section.name}.`, "substituteId");
    const free = await freeTeachersAt(tx, ctx, input.campusId, input.date, p.periodNo);
    const existing = await tx.substitution.findFirst({ where: { date: input.date, periodId: p.id, archivedAt: null, status: { not: "CANCELLED" } } });
    const alreadyThis = existing?.substituteStaffId === sub.id && existing.status === "ARRANGED";
    if (!alreadyThis && !free.some((f) => f.id === sub.id)) {
      throw new AcademicRuleError(`${sub.fullName} is not free in period ${p.periodNo} on ${formatDate(input.date)}. Choose another teacher.`, "substituteId");
    }
    const absentStaffId = existing?.absentStaffId ?? p.staffId;
    if (!absentStaffId) throw new AcademicRuleError("That period has no teacher to cover.");
    const info = away.get(absentStaffId);
    const data = { substituteStaffId: sub.id, status: "ARRANGED" as const, note: input.note, reason: existing?.reason ?? info?.reason ?? "absent", leaveRequestId: existing?.leaveRequestId ?? info?.leaveRequestId ?? null };
    const row = existing
      ? await tx.substitution.update({ where: { id: existing.id }, data })
      : await tx.substitution.create({ data: { schoolId: ctx.schoolId, date: input.date, periodId: p.id, absentStaffId, createdById: ctx.userId, ...data } });
    made.push(row.id);
    await writeAudit(tx, ctx, { action: "substitute-arranged", recordType: "Substitution", recordId: row.id, before: existing ? { substitute: existing.substituteStaffId, status: existing.status } : null, after: { substitute: sub.fullName, date: input.date.toISOString().slice(0, 10), period: p.periodNo, section: `${p.section.schoolClass.name} ${p.section.name}` } });
    // The class teacher is told too (04 §2).
    if (p.section.classTeacherId && p.section.classTeacherId !== sub.id) {
      const ct = await tx.staff.findUnique({ where: { id: p.section.classTeacherId }, select: { userLoginId: true } });
      if (ct?.userLoginId) await notify(tx, ctx, { to: ct.userLoginId, type: "substitution", text: `${sub.fullName} covers ${p.subject?.name ?? "a period"} in ${p.section.schoolClass.name} ${p.section.name}, period ${p.periodNo} on ${formatDate(input.date)}.`, link: `/academic-management/substitutions?date=${input.date.toISOString().slice(0, 10)}`, groupKey: `sub-ct-${input.date.toISOString().slice(0, 10)}`, mergedText: (n) => `${n} substitutions arranged for your class on ${formatDate(input.date)}` });
    }
  }
  if (sub.userLoginId) {
    const words = periods.length === 1 ? `${periods[0].subject?.name ?? "a period"} in ${periods[0].section.schoolClass.name} ${periods[0].section.name}, period ${periods[0].periodNo}` : `${plural(periods.length, "period")}`;
    await notify(tx, ctx, { to: sub.userLoginId, type: "substitution", text: `Extra period on ${formatDate(input.date)}: ${words}.`, link: "/academic-management/time-table/mine", groupKey: `sub-${input.date.toISOString().slice(0, 10)}`, mergedText: (n) => `${n} extra periods for you on ${formatDate(input.date)}` });
  }
  return { ids: made, substitute: sub.fullName, count: periods.length };
}

/** Removes the substitute from a period; the period shows as Needed again. */
export async function removeSubstitute(tx: Tx, ctx: SchoolContext, substitutionId: string) {
  const s = await tx.substitution.findFirst({ where: { id: substitutionId, archivedAt: null }, include: { period: { include: { section: { include: { schoolClass: true } } } } } });
  if (!s) throw new AcademicRuleError("This substitution was not found.");
  await tx.substitution.update({ where: { id: s.id }, data: { substituteStaffId: null, status: "NEEDED" } });
  await writeAudit(tx, ctx, { action: "substitute-removed", recordType: "Substitution", recordId: s.id, before: { substitute: s.substituteStaffId, status: s.status } });
  if (s.substituteStaffId) {
    const sub = await tx.staff.findUnique({ where: { id: s.substituteStaffId }, select: { userLoginId: true } });
    if (sub?.userLoginId) await notify(tx, ctx, { to: sub.userLoginId, type: "substitution", text: `You no longer cover ${s.period.section.schoolClass.name} ${s.period.section.name}, period ${s.period.periodNo} on ${formatDate(s.date)}.`, link: "/academic-management/time-table/mine" });
  }
  return s;
}

/** For each of a teacher's periods on the leave dates, a "Needed" row (A5). Safe to run twice. */
export async function raiseForLeave(tx: Tx, ctx: SchoolContext, leaveRequestId: string) {
  const leave = await tx.leaveRequest.findFirst({ where: { id: leaveRequestId, staffId: { not: null }, status: "APPROVED", archivedAt: null } });
  if (!leave) return 0;
  const staff = await tx.staff.findUnique({ where: { id: leave.staffId! } });
  if (!staff) return 0;
  const settings = await academicSettings(tx, ctx, staff.campusId);
  if (!settings.autoSubstitutions) return 0;
  return raiseFor(tx, ctx, staff.id, staff.campusId, daysBetween(leave.fromDate, leave.toDate).slice(0, 62), { reason: "leave", leaveRequestId: leave.id });
}

async function raiseFor(tx: Tx, ctx: SchoolContext, staffId: string, campusId: string, dates: Date[], how: { reason: string; leaveRequestId?: string | null }) {
  let n = 0;
  for (const date of dates) {
    if (await dayOff(tx, ctx, date, campusId)) continue;
    const version = await effectiveVersion(tx, ctx, campusId, date);
    if (!version) continue;
    const periods = await tx.timetablePeriod.findMany({ where: { versionId: version.id, staffId, dayOfWeek: weekday(date), archivedAt: null, isBreak: false } });
    for (const p of periods) {
      const exists = await tx.substitution.findFirst({ where: { date, periodId: p.id, archivedAt: null, status: { not: "CANCELLED" } } });
      if (exists) continue;
      await tx.substitution.create({ data: { schoolId: ctx.schoolId, date, periodId: p.id, absentStaffId: staffId, status: "NEEDED", reason: how.reason, leaveRequestId: how.leaveRequestId ?? null, createdById: ctx.userId } });
      n++;
    }
  }
  return n;
}

/** When leave is cancelled, its future substitutions are released and substitutes told (workflow 7, step 10). */
export async function releaseForLeave(tx: Tx, ctx: SchoolContext, leaveRequestId: string, today: Date) {
  const rows = await tx.substitution.findMany({ where: { leaveRequestId, archivedAt: null, status: { not: "CANCELLED" }, date: { gte: today } }, include: { period: { include: { section: { include: { schoolClass: true } } } } } });
  for (const r of rows) {
    await tx.substitution.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
    if (r.substituteStaffId) {
      const sub = await tx.staff.findUnique({ where: { id: r.substituteStaffId }, select: { userLoginId: true } });
      if (sub?.userLoginId) await notify(tx, ctx, { to: sub.userLoginId, type: "substitution", text: `Cover released: ${r.period.section.schoolClass.name} ${r.period.section.name}, period ${r.period.periodNo} on ${formatDate(r.date)}. The teacher is back.`, link: "/academic-management/time-table/mine" });
    }
  }
  if (rows.length) await writeAudit(tx, ctx, { action: "released", recordType: "Substitution", recordId: leaveRequestId, after: { released: rows.length } });
  return rows.length;
}

/** Marks a teacher absent for a day by hand and raises the periods needing cover. */
export async function markAbsent(tx: Tx, ctx: SchoolContext, input: { staffId: string; date: Date; note: string | null }) {
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!staff) throw new AcademicRuleError("Choose the teacher who is absent.", "staffId");
  const off = await dayOff(tx, ctx, input.date, staff.campusId);
  if (off) throw new AcademicRuleError(`${formatDate(input.date)} is not a school day (${off.title}).`, "date");
  const away = (await absentStaffOn(tx, ctx, input.date)).get(staff.id);
  if (away) throw new AcademicRuleError(`${staff.fullName} is already marked away on ${formatDate(input.date)} (${reasonWords(away.reason).toLowerCase()}).`, "staffId");
  const row = await tx.staffAbsence.create({ data: { schoolId: ctx.schoolId, staffId: staff.id, date: input.date, note: input.note, createdById: ctx.userId } });
  // Their own substitute duties that day are released too.
  const covering = await tx.substitution.findMany({ where: { date: input.date, substituteStaffId: staff.id, status: "ARRANGED", archivedAt: null } });
  for (const c of covering) await tx.substitution.update({ where: { id: c.id }, data: { substituteStaffId: null, status: "NEEDED" } });
  const raised = await raiseFor(tx, ctx, staff.id, staff.campusId, [input.date], { reason: "absent" });
  await writeAudit(tx, ctx, { action: "marked-absent", recordType: "Staff Absence", recordId: row.id, after: { staff: staff.fullName, date: input.date.toISOString().slice(0, 10), periods: raised, released: covering.length } });
  return { absence: row, raised, name: staff.fullName, released: covering.length };
}

/** Undoes "mark absent": the needs not yet covered are cancelled. */
export async function unmarkAbsent(tx: Tx, ctx: SchoolContext, absenceId: string) {
  const a = await tx.staffAbsence.findFirst({ where: { id: absenceId, archivedAt: null } });
  if (!a) throw new AcademicRuleError("This absence was already removed.");
  await tx.staffAbsence.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
  const rows = await tx.substitution.findMany({ where: { date: a.date, absentStaffId: a.staffId, reason: "absent", archivedAt: null, status: { not: "CANCELLED" } } });
  for (const r of rows) await removeAndCancel(tx, ctx, r.id);
  await writeAudit(tx, ctx, { action: "absence-removed", recordType: "Staff Absence", recordId: a.id, after: { cancelled: rows.length } });
  return a;
}

async function removeAndCancel(tx: Tx, ctx: SchoolContext, id: string) {
  const r = await tx.substitution.findUniqueOrThrow({ where: { id } });
  if (r.substituteStaffId) await removeSubstitute(tx, ctx, id);
  await tx.substitution.update({ where: { id }, data: { status: "CANCELLED" } });
}

/**
 * A temporary teacher for a longer absence: takes the absent teacher's
 * periods on every school day from one date to another where they are free.
 * Periods they cannot take stay "Needed".
 */
export async function temporaryTeacher(tx: Tx, ctx: SchoolContext, input: { absentStaffId: string; tempStaffId: string; fromDate: Date; toDate: Date; note: string | null }) {
  if (input.absentStaffId === input.tempStaffId) throw new AcademicRuleError("The temporary teacher must be someone else.", "tempStaffId");
  if (input.toDate < input.fromDate) throw new AcademicRuleError("The to date must be on or after the from date.", "toDate");
  const days = daysBetween(input.fromDate, input.toDate);
  if (days.length > 120) throw new AcademicRuleError("A temporary teacher can be named for at most 120 days at a time.", "toDate");
  const [absent, temp] = await Promise.all([
    tx.staff.findFirst({ where: { id: input.absentStaffId, archivedAt: null } }),
    tx.staff.findFirst({ where: { id: input.tempStaffId, archivedAt: null, status: "ACTIVE" } }),
  ]);
  if (!absent) throw new AcademicRuleError("Choose the absent teacher.", "absentStaffId");
  if (!temp) throw new AcademicRuleError("Choose a temporary teacher who is working.", "tempStaffId");
  const overlap = await tx.temporaryCover.findFirst({ where: { absentStaffId: absent.id, archivedAt: null, fromDate: { lte: input.toDate }, toDate: { gte: input.fromDate } } });
  if (overlap) throw new AcademicRuleError(`${absent.fullName} already has a temporary teacher from ${formatDate(overlap.fromDate)} to ${formatDate(overlap.toDate)}.`, "fromDate");
  const cover = await tx.temporaryCover.create({ data: { schoolId: ctx.schoolId, absentStaffId: absent.id, tempStaffId: temp.id, fromDate: input.fromDate, toDate: input.toDate, note: input.note, createdById: ctx.userId } });
  let covered = 0, needed = 0;
  for (const date of days) {
    if (await dayOff(tx, ctx, date, absent.campusId)) continue;
    const version = await effectiveVersion(tx, ctx, absent.campusId, date);
    if (!version) continue;
    const periods = await tx.timetablePeriod.findMany({ where: { versionId: version.id, staffId: absent.id, dayOfWeek: weekday(date), archivedAt: null, isBreak: false } });
    for (const p of periods) {
      const existing = await tx.substitution.findFirst({ where: { date, periodId: p.id, archivedAt: null, status: { not: "CANCELLED" } } });
      if (existing?.status === "ARRANGED") continue;
      const free = (await freeTeachersAt(tx, ctx, absent.campusId, date, p.periodNo)).some((f) => f.id === temp.id);
      const data = free
        ? { substituteStaffId: temp.id, status: "ARRANGED" as const, reason: "temporary", coverId: cover.id }
        : { substituteStaffId: null, status: "NEEDED" as const, reason: "temporary", coverId: cover.id };
      if (existing) await tx.substitution.update({ where: { id: existing.id }, data });
      else await tx.substitution.create({ data: { schoolId: ctx.schoolId, date, periodId: p.id, absentStaffId: absent.id, createdById: ctx.userId, ...data } });
      if (free) covered++; else needed++;
    }
  }
  await writeAudit(tx, ctx, { action: "temporary-teacher", recordType: "Temporary Cover", recordId: cover.id, after: { absent: absent.fullName, temporary: temp.fullName, from: input.fromDate.toISOString().slice(0, 10), to: input.toDate.toISOString().slice(0, 10), covered, needed } });
  if (temp.userLoginId) await notify(tx, ctx, { to: temp.userLoginId, type: "substitution", text: `You take ${absent.fullName}'s classes from ${formatDate(input.fromDate)} to ${formatDate(input.toDate)} (${plural(covered, "period")}).`, link: "/academic-management/time-table/mine" });
  return { cover, covered, needed, absent: absent.fullName, temp: temp.fullName };
}

/** Ends a temporary cover early: the cover's future periods go back to Needed or are released. */
export async function endTemporaryCover(tx: Tx, ctx: SchoolContext, coverId: string, today: Date) {
  const cover = await tx.temporaryCover.findFirst({ where: { id: coverId, archivedAt: null } });
  if (!cover) throw new AcademicRuleError("This temporary teacher was not found.");
  const rows = await tx.substitution.findMany({ where: { coverId, archivedAt: null, date: { gte: today }, status: { not: "CANCELLED" } } });
  for (const r of rows) await tx.substitution.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
  if (cover.fromDate >= today) await tx.temporaryCover.update({ where: { id: coverId }, data: { archivedAt: new Date() } });
  else await tx.temporaryCover.update({ where: { id: coverId }, data: { toDate: addDays(today, -1) } });
  await writeAudit(tx, ctx, { action: "ended", recordType: "Temporary Cover", recordId: coverId, after: { released: rows.length } });
  return rows.length;
}

/** All arranged substitutions on a day, by substitute (the Substitute Time Table). */
export async function substituteTimetable(tx: Tx, ctx: SchoolContext, campusId: string, date: Date) {
  const { rows } = await needsOn(tx, ctx, campusId, date);
  const bySub = new Map<string, { name: string; periods: NeedRow[] }>();
  for (const r of rows) {
    if (r.substitution?.status !== "ARRANGED" || !r.substitution.substituteId) continue;
    const e = bySub.get(r.substitution.substituteId) ?? { name: r.substitution.substituteName ?? "", periods: [] };
    e.periods.push(r);
    bySub.set(r.substitution.substituteId, e);
  }
  return [...bySub.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
}
