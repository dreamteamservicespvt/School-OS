// Time Table (04 §2): versions (Draft or Published with an effective date),
// editing a period with the clash check, making a draft automatically,
// publishing, copying, and reading the Time Table for a day.
import "server-only";

import type { PeriodSlot, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { AcademicRuleError, DAY_NAMES, DAY_SHORT, plural, weekday, wordList } from "./common";
import { academicSettings, periodSlots } from "./settings";
import { allocationActiveOn, limitsFor } from "./allocation";
import { mapActiveOn } from "./subjects";
import { dayOff } from "./calendar";
import { assertYearWritable } from "./years";

// ---------------------------------------------------------------- versions

/** The published version in force on a date for a campus (the latest effective date on or before it). */
export async function effectiveVersion(tx: Tx, ctx: SchoolContext, campusId: string, date: Date) {
  const years = await tx.academicYear.findMany({ where: { campusId, archivedAt: null, startDate: { lte: date }, endDate: { gte: date } }, select: { id: true } });
  return tx.timetableVersion.findFirst({
    where: {
      schoolId: ctx.schoolId, campusId, status: "PUBLISHED", archivedAt: null,
      effectiveFrom: { lte: date },
      academicYearId: { in: years.map((y) => y.id) },
    },
    orderBy: [{ effectiveFrom: "desc" }, { publishedAt: "desc" }],
  });
}

/** The published version of a year that is in force today, or the next one to come. */
export async function publishedVersionForYear(tx: Tx, yearId: string, date: Date) {
  return (
    (await tx.timetableVersion.findFirst({ where: { academicYearId: yearId, status: "PUBLISHED", archivedAt: null, effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { publishedAt: "desc" }] })) ??
    (await tx.timetableVersion.findFirst({ where: { academicYearId: yearId, status: "PUBLISHED", archivedAt: null }, orderBy: { effectiveFrom: "asc" } }))
  );
}

export async function draftVersion(tx: Tx, yearId: string) {
  return tx.timetableVersion.findFirst({ where: { academicYearId: yearId, status: "DRAFT", archivedAt: null }, orderBy: { createdAt: "desc" } });
}

export async function versionsForYear(tx: Tx, yearId: string) {
  const rows = await tx.timetableVersion.findMany({ where: { academicYearId: yearId, archivedAt: null }, orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }], include: { _count: { select: { periods: { where: { archivedAt: null, OR: [{ subjectId: { not: null } }, { isBreak: true }, { label: { not: null } }] } } } } } });
  return rows;
}

async function copyPeriods(tx: Tx, ctx: SchoolContext, fromVersionId: string, toVersionId: string, sectionMap?: Map<string, string>) {
  const periods = await tx.timetablePeriod.findMany({ where: { versionId: fromVersionId, archivedAt: null } });
  let n = 0;
  for (const p of periods) {
    const sectionId = sectionMap ? sectionMap.get(p.sectionId) : p.sectionId;
    if (!sectionId) continue;
    await tx.timetablePeriod.create({
      data: { schoolId: ctx.schoolId, versionId: toVersionId, sectionId, dayOfWeek: p.dayOfWeek, periodNo: p.periodNo, startTime: p.startTime, endTime: p.endTime, subjectId: p.subjectId, staffId: p.staffId, room: p.room, isBreak: p.isBreak, label: p.label },
    });
    n++;
  }
  return n;
}

/** Starts a draft to edit, copied from the published version (or empty). One draft per year at a time. */
export async function makeDraft(tx: Tx, ctx: SchoolContext, yearId: string, campusId: string, today: Date, correction?: string | null) {
  const note = await assertYearWritable(tx, yearId, correction);
  const existing = await draftVersion(tx, yearId);
  if (existing) return { version: existing, created: false };
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: yearId } });
  const from = await publishedVersionForYear(tx, yearId, today);
  const version = await tx.timetableVersion.create({
    data: { schoolId: ctx.schoolId, academicYearId: yearId, campusId, name: `Time Table ${year.name}, draft of ${formatDate(today)}`, status: "DRAFT", createdById: ctx.userId },
  });
  const copied = from ? await copyPeriods(tx, ctx, from.id, version.id) : 0;
  await writeAudit(tx, ctx, { action: "created", recordType: "Timetable Version", recordId: version.id, after: { name: version.name, copiedFrom: from?.name ?? null, periods: copied }, actorNote: note });
  return { version, created: true };
}

async function draftOrThrow(tx: Tx, versionId: string, correction?: string | null) {
  const version = await tx.timetableVersion.findFirst({ where: { id: versionId, archivedAt: null } });
  if (!version) throw new AcademicRuleError("This Time Table was not found.");
  if (version.status !== "DRAFT") throw new AcademicRuleError("Only a draft can be changed. Start a draft from the published Time Table first.");
  const note = await assertYearWritable(tx, version.academicYearId, correction);
  return { version, note };
}

/** Archives a draft. The published Time Table is untouched. */
export async function discardDraft(tx: Tx, ctx: SchoolContext, versionId: string) {
  const { version } = await draftOrThrow(tx, versionId);
  const now = new Date();
  await tx.timetableVersion.update({ where: { id: versionId }, data: { archivedAt: now, status: "ARCHIVED" } });
  await tx.timetablePeriod.updateMany({ where: { versionId, archivedAt: null }, data: { archivedAt: now } });
  await writeAudit(tx, ctx, { action: "discarded", recordType: "Timetable Version", recordId: versionId, before: { name: version.name } });
  return version;
}

// ---------------------------------------------------------------- grids

export type PeriodCell = {
  id: string; sectionId: string; sectionLabel: string; classId: string; dayOfWeek: number; periodNo: number; startTime: string; endTime: string;
  subjectId: string | null; subjectName: string | null; subjectCode: string | null; staffId: string | null; staffName: string | null;
  room: string | null; isBreak: boolean; label: string | null;
};

async function cells(tx: Tx, where: Prisma.TimetablePeriodWhereInput): Promise<PeriodCell[]> {
  const rows = await tx.timetablePeriod.findMany({
    where: { archivedAt: null, ...where },
    include: { subject: { select: { name: true, code: true } }, section: { select: { name: true, classId: true, room: true, schoolClass: { select: { name: true, sortOrder: true } } } } },
    orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }],
  });
  const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, fullName: true } });
  const nameOf = new Map(staff.map((s) => [s.id, s.fullName]));
  return rows.map((r) => ({
    id: r.id, sectionId: r.sectionId, sectionLabel: `${r.section.schoolClass.name} ${r.section.name}`, classId: r.section.classId,
    dayOfWeek: r.dayOfWeek, periodNo: r.periodNo, startTime: r.startTime, endTime: r.endTime,
    subjectId: r.subjectId, subjectName: r.subject?.name ?? null, subjectCode: r.subject?.code ?? null,
    staffId: r.staffId, staffName: r.staffId ? nameOf.get(r.staffId) ?? null : null,
    room: r.room ?? r.section.room ?? null, isBreak: r.isBreak, label: r.label,
  }));
}

export function sectionGrid(tx: Tx, versionId: string, sectionId: string) {
  return cells(tx, { versionId, sectionId });
}

export function staffGrid(tx: Tx, versionId: string, staffId: string) {
  return cells(tx, { versionId, staffId });
}

export function roomGrid(tx: Tx, versionId: string, room: string) {
  return cells(tx, { versionId, OR: [{ room: { equals: room, mode: "insensitive" } }, { room: null, section: { room: { equals: room, mode: "insensitive" } } }] });
}

export function versionCells(tx: Tx, versionId: string) {
  return cells(tx, { versionId });
}

/** Rows of the grid: the period master for the campus, with which days each row runs. */
export async function gridRows(tx: Tx, ctx: SchoolContext, campusId: string) {
  const [slots, settings] = await Promise.all([periodSlots(tx, ctx, campusId), academicSettings(tx, ctx, campusId)]);
  return { slots, days: settings.workingDays };
}

// ---------------------------------------------------------------- the clash check

export type Clash = { kind: "teacher" | "room" | "workload" | "consecutive" | "condition" | "availability"; hard: boolean; message: string; sectionId: string; dayOfWeek: number; periodNo: number };

/** Every clash and warning in a version: teacher or room booked twice (hard), limits and conditions (warnings). */
export async function clashCheck(tx: Tx, ctx: SchoolContext, versionId: string): Promise<Clash[]> {
  const version = await tx.timetableVersion.findUniqueOrThrow({ where: { id: versionId } });
  const all = await cells(tx, { versionId });
  const out: Clash[] = [];
  const byTeacher = new Map<string, PeriodCell[]>();
  const byRoom = new Map<string, PeriodCell[]>();
  for (const c of all) {
    if (c.isBreak) continue;
    if (c.staffId) byTeacher.set(`${c.staffId}:${c.dayOfWeek}:${c.periodNo}`, [...(byTeacher.get(`${c.staffId}:${c.dayOfWeek}:${c.periodNo}`) ?? []), c]);
    if (c.room && (c.subjectId || c.label)) {
      const k = `${c.room.toLowerCase()}:${c.dayOfWeek}:${c.periodNo}`;
      byRoom.set(k, [...(byRoom.get(k) ?? []), c]);
    }
  }
  for (const list of byTeacher.values()) {
    if (list.length < 2) continue;
    for (const c of list.slice(1)) out.push({ kind: "teacher", hard: true, sectionId: c.sectionId, dayOfWeek: c.dayOfWeek, periodNo: c.periodNo, message: `${c.staffName} is in ${wordList(list.map((x) => x.sectionLabel))}, period ${c.periodNo} on ${DAY_NAMES[c.dayOfWeek]}.` });
  }
  for (const list of byRoom.values()) {
    if (list.length < 2) continue;
    for (const c of list.slice(1)) out.push({ kind: "room", hard: true, sectionId: c.sectionId, dayOfWeek: c.dayOfWeek, periodNo: c.periodNo, message: `Room ${c.room} is booked for ${wordList(list.map((x) => x.sectionLabel))}, period ${c.periodNo} on ${DAY_NAMES[c.dayOfWeek]}.` });
  }
  // Warnings: workload per day and week, periods in a row, subject conditions, availability.
  const staffIds = [...new Set(all.map((c) => c.staffId).filter((x): x is string => Boolean(x)))];
  const limit = await limitsFor(tx, ctx, version.campusId, staffIds);
  const prefs = new Map((await tx.teacherPreference.findMany({ where: { staffId: { in: staffIds } } })).map((p) => [p.staffId, p]));
  for (const staffId of staffIds) {
    const mine = all.filter((c) => c.staffId === staffId && !c.isBreak);
    const l = limit(staffId);
    const name = mine[0]?.staffName ?? "A teacher";
    if (mine.length > l.perWeek) out.push({ kind: "workload", hard: false, sectionId: mine[0].sectionId, dayOfWeek: mine[0].dayOfWeek, periodNo: mine[0].periodNo, message: `${name}: ${mine.length} periods, limit ${l.perWeek}.` });
    for (let d = 1; d <= 7; d++) {
      const day = mine.filter((c) => c.dayOfWeek === d).sort((a, b) => a.periodNo - b.periodNo);
      if (day.length > l.perDay) out.push({ kind: "workload", hard: false, sectionId: day[0].sectionId, dayOfWeek: d, periodNo: day[0].periodNo, message: `${name}: ${day.length} periods on ${DAY_NAMES[d]}, limit ${l.perDay} a day.` });
      let run = 1;
      for (let i = 1; i < day.length; i++) {
        run = day[i].periodNo === day[i - 1].periodNo + 1 ? run + 1 : 1;
        if (run === l.consecutive + 1) out.push({ kind: "consecutive", hard: false, sectionId: day[i].sectionId, dayOfWeek: d, periodNo: day[i].periodNo, message: `${name}: ${run} periods in a row on ${DAY_NAMES[d]}, limit ${l.consecutive}.` });
      }
    }
    const blocked = new Set(prefs.get(staffId)?.unavailable ?? []);
    for (const c of mine) if (blocked.has(`${c.dayOfWeek}:${c.periodNo}`)) out.push({ kind: "availability", hard: false, sectionId: c.sectionId, dayOfWeek: c.dayOfWeek, periodNo: c.periodNo, message: `${name} is not available in period ${c.periodNo} on ${DAY_NAMES[c.dayOfWeek]} (teacher preferences).` });
  }
  const conditions = await tx.subjectCondition.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null } });
  for (const cond of conditions) {
    for (const c of all) {
      if (c.subjectId === cond.subjectId && c.periodNo === cond.periodNo && (cond.dayOfWeek === null || cond.dayOfWeek === c.dayOfWeek) && (cond.classId === null || cond.classId === c.classId)) {
        out.push({ kind: "condition", hard: false, sectionId: c.sectionId, dayOfWeek: c.dayOfWeek, periodNo: c.periodNo, message: `${c.subjectName} is kept out of period ${c.periodNo}${cond.dayOfWeek ? ` on ${DAY_NAMES[cond.dayOfWeek]}` : ""} (subject conditions), but ${c.sectionLabel} has it there.` });
      }
    }
  }
  return out;
}

/** The clash that a single change would make, if any: teacher or room already elsewhere. */
export async function clashFor(tx: Tx, input: { versionId: string; sectionId: string; days: number[]; periodNo: number; staffId: string | null; room: string | null }) {
  const problems: string[] = [];
  if (input.staffId) {
    const busy = await tx.timetablePeriod.findMany({
      where: { versionId: input.versionId, staffId: input.staffId, periodNo: input.periodNo, dayOfWeek: { in: input.days }, archivedAt: null, sectionId: { not: input.sectionId } },
      include: { section: { include: { schoolClass: true } } },
      orderBy: { dayOfWeek: "asc" },
    });
    if (busy.length) {
      const staff = await tx.staff.findUnique({ where: { id: input.staffId }, select: { fullName: true } });
      const b = busy[0];
      problems.push(`${staff?.fullName ?? "This teacher"} is already in ${b.section.schoolClass.name} ${b.section.name}, period ${b.periodNo} on ${DAY_NAMES[b.dayOfWeek]}${busy.length > 1 ? ` (and ${plural(busy.length - 1, "more day")})` : ""}.`);
    }
  }
  if (input.room) {
    const sections = await tx.section.findMany({ where: { room: { equals: input.room, mode: "insensitive" } }, select: { id: true } });
    const busy = await tx.timetablePeriod.findFirst({
      where: {
        versionId: input.versionId, periodNo: input.periodNo, dayOfWeek: { in: input.days }, archivedAt: null, sectionId: { not: input.sectionId }, isBreak: false,
        OR: [{ room: { equals: input.room, mode: "insensitive" } }, { room: null, sectionId: { in: sections.map((s) => s.id) }, OR: [{ subjectId: { not: null } }, { label: { not: null } }] }],
      },
      include: { section: { include: { schoolClass: true } } },
    });
    if (busy) problems.push(`Room ${input.room} is already booked for ${busy.section.schoolClass.name} ${busy.section.name}, period ${busy.periodNo} on ${DAY_NAMES[busy.dayOfWeek]}.`);
  }
  return problems;
}

// ---------------------------------------------------------------- editing a period

export type PeriodInput = {
  versionId: string;
  sectionId: string;
  dayOfWeek: number;
  periodNo: number;
  startTime: string;
  endTime: string;
  subjectId: string | null;
  staffId: string | null;
  room: string | null;
  isBreak: boolean;
  label: string | null;
  /** Changes this period on every day of the week. */
  wholeWeek: boolean;
  correction?: string | null;
};

/** Saves a period after the clash check (Done when 4: a teacher booked twice is blocked, naming the other class). */
export async function savePeriod(tx: Tx, ctx: SchoolContext, input: PeriodInput) {
  const { version, note } = await draftOrThrow(tx, input.versionId, input.correction);
  const section = await tx.section.findFirst({ where: { id: input.sectionId, academicYearId: version.academicYearId, archivedAt: null }, include: { schoolClass: true } });
  if (!section) throw new AcademicRuleError("This section was not found in the year of this Time Table.");
  const settings = await academicSettings(tx, ctx, version.campusId);
  const slots = await periodSlots(tx, ctx, version.campusId);
  const slot = slots.find((s) => s.number === input.periodNo);
  const days = input.wholeWeek ? settings.workingDays.filter((d) => !slot || slot.days.includes(d)) : [input.dayOfWeek];
  if (!input.isBreak && !input.label) {
    if (!input.subjectId) throw new AcademicRuleError("Choose a subject, or mark the period as lunch or break.", "subjectId");
    if (!input.staffId) throw new AcademicRuleError("Choose a teacher for this period.", "staffId");
  }
  if (input.subjectId) {
    const mapped = await tx.subjectClass.findFirst({ where: { subjectId: input.subjectId, classId: section.classId, ...mapActiveOn(version.effectiveFrom ?? new Date()) } });
    const subjectMapped = mapped ?? (await tx.subjectClass.findFirst({ where: { subjectId: input.subjectId, classId: section.classId, archivedAt: null, toDate: null } }));
    if (!subjectMapped) throw new AcademicRuleError(`That subject is not taught in ${section.schoolClass.name}. Map it in Subjects first.`, "subjectId");
  }
  if (input.staffId) {
    const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } });
    if (!staff) throw new AcademicRuleError("Choose a teacher who works here.", "staffId");
  }
  const room = input.isBreak ? null : input.room?.trim() || null;
  const clash = await clashFor(tx, { versionId: version.id, sectionId: section.id, days, periodNo: input.periodNo, staffId: input.isBreak ? null : input.staffId, room });
  if (clash.length) throw new AcademicRuleError(clash.join(" "), clash[0].startsWith("Room") ? "room" : "staffId");

  const data = {
    startTime: input.startTime, endTime: input.endTime,
    subjectId: input.isBreak ? null : input.subjectId, staffId: input.isBreak ? null : input.staffId,
    room, isBreak: input.isBreak, label: input.isBreak ? input.label || slot?.label || "Break" : input.label, archivedAt: null,
  };
  const before: Record<number, unknown> = {};
  for (const d of days) {
    const existing = await tx.timetablePeriod.findUnique({ where: { versionId_sectionId_dayOfWeek_periodNo: { versionId: version.id, sectionId: section.id, dayOfWeek: d, periodNo: input.periodNo } } });
    before[d] = existing && !existing.archivedAt ? { subjectId: existing.subjectId, staffId: existing.staffId, room: existing.room, isBreak: existing.isBreak, label: existing.label } : null;
    await tx.timetablePeriod.upsert({
      where: { versionId_sectionId_dayOfWeek_periodNo: { versionId: version.id, sectionId: section.id, dayOfWeek: d, periodNo: input.periodNo } },
      create: { schoolId: ctx.schoolId, versionId: version.id, sectionId: section.id, dayOfWeek: d, periodNo: input.periodNo, ...data },
      update: data,
    });
  }
  await writeAudit(tx, ctx, { action: "changed", recordType: "Timetable Period", recordId: section.id, before: JSON.parse(JSON.stringify(before)), after: { ...data, archivedAt: undefined, days, periodNo: input.periodNo }, actorNote: note });
  const warnings = (await clashCheck(tx, ctx, version.id)).filter((c) => !c.hard && c.sectionId === section.id && days.includes(c.dayOfWeek)).map((c) => c.message);
  return { label: `${section.schoolClass.name} ${section.name}`, days, warnings };
}

/** Removes a period from a draft (with Undo). */
export async function removePeriod(tx: Tx, ctx: SchoolContext, periodId: string, correction?: string | null) {
  const period = await tx.timetablePeriod.findFirst({ where: { id: periodId, archivedAt: null } });
  if (!period) throw new AcademicRuleError("This period was already removed.");
  const { note } = await draftOrThrow(tx, period.versionId, correction);
  await tx.timetablePeriod.update({ where: { id: periodId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "removed", recordType: "Timetable Period", recordId: periodId, before: { subjectId: period.subjectId, staffId: period.staffId, day: period.dayOfWeek, period: period.periodNo }, actorNote: note });
  return period;
}

/** Undo for a removed period, unless the teacher was booked elsewhere since. */
export async function restorePeriod(tx: Tx, ctx: SchoolContext, periodId: string) {
  const period = await tx.timetablePeriod.findFirst({ where: { id: periodId, archivedAt: { not: null } } });
  if (!period) throw new AcademicRuleError("This period is already back.");
  await draftOrThrow(tx, period.versionId);
  const clash = await clashFor(tx, { versionId: period.versionId, sectionId: period.sectionId, days: [period.dayOfWeek], periodNo: period.periodNo, staffId: period.staffId, room: period.room });
  if (clash.length) throw new AcademicRuleError(`It cannot come back: ${clash.join(" ")}`);
  await tx.timetablePeriod.update({ where: { id: periodId }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Timetable Period", recordId: periodId });
}

// ---------------------------------------------------------------- publish and copy

/** Publishes a draft from an effective date, after the clash check. Teachers are told (04 §4). */
export async function publishVersion(tx: Tx, ctx: SchoolContext, versionId: string, effectiveFrom: Date, today: Date) {
  const { version, note } = await draftOrThrow(tx, versionId);
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id: version.academicYearId } });
  if (effectiveFrom < today) throw new AcademicRuleError("The effective date cannot be in the past. Choose today or a later date.", "effectiveFrom");
  if (effectiveFrom < year.startDate || effectiveFrom > year.endDate) throw new AcademicRuleError(`The effective date must be inside ${year.name}.`, "effectiveFrom");
  const hard = (await clashCheck(tx, ctx, versionId)).filter((c) => c.hard);
  if (hard.length) throw new AcademicRuleError(`${plural(hard.length, "clash", "clashes")} must be fixed before publishing. ${hard[0].message}`);
  const filled = await tx.timetablePeriod.count({ where: { versionId, archivedAt: null, subjectId: { not: null } } });
  if (filled === 0) throw new AcademicRuleError("This draft has no periods yet. Fill it before publishing.");

  // A version published earlier for the same date is replaced by this one.
  const same = await tx.timetableVersion.findMany({ where: { academicYearId: version.academicYearId, status: "PUBLISHED", archivedAt: null, effectiveFrom } });
  for (const s of same) await tx.timetableVersion.update({ where: { id: s.id }, data: { status: "ARCHIVED" } });
  await tx.timetableVersion.update({
    where: { id: versionId },
    data: { status: "PUBLISHED", effectiveFrom, publishedAt: new Date(), publishedById: ctx.userId, name: `Time Table ${year.name} from ${formatDate(effectiveFrom)}` },
  });
  await writeAudit(tx, ctx, { action: "published", recordType: "Timetable Version", recordId: versionId, after: { effectiveFrom: effectiveFrom.toISOString().slice(0, 10), replaced: same.map((s) => s.name) }, actorNote: note });

  const teacherIds = await tx.timetablePeriod.findMany({ where: { versionId, archivedAt: null, staffId: { not: null } }, select: { staffId: true }, distinct: ["staffId"] });
  const logins = await tx.staff.findMany({ where: { id: { in: teacherIds.map((t) => t.staffId!) }, userLoginId: { not: null } }, select: { userLoginId: true } });
  for (const l of logins) {
    await notify(tx, ctx, { to: l.userLoginId!, type: "timetable-published", text: `A new Time Table starts on ${formatDate(effectiveFrom)}. See your periods.`, link: "/academic-management/time-table/mine", groupKey: `timetable-${versionId}` });
  }
  return { effectiveFrom, notified: logins.length };
}

/** Copies a published Time Table into a draft of another year (sections matched by class and name). Clashes are listed first. */
export async function copyToYear(tx: Tx, ctx: SchoolContext, fromVersionId: string, toYearId: string) {
  const from = await tx.timetableVersion.findFirst({ where: { id: fromVersionId, archivedAt: null } });
  if (!from) throw new AcademicRuleError("This Time Table was not found.");
  await assertYearWritable(tx, toYearId);
  if (await draftVersion(tx, toYearId)) throw new AcademicRuleError("That year already has a draft Time Table. Publish or discard it first.");
  const [oldSections, newSections, toYear] = await Promise.all([
    tx.section.findMany({ where: { academicYearId: from.academicYearId, archivedAt: null } }),
    tx.section.findMany({ where: { academicYearId: toYearId, archivedAt: null } }),
    tx.academicYear.findUniqueOrThrow({ where: { id: toYearId } }),
  ]);
  const map = new Map<string, string>();
  for (const o of oldSections) {
    const n = newSections.find((s) => s.classId === o.classId && s.name === o.name);
    if (n) map.set(o.id, n.id);
  }
  const version = await tx.timetableVersion.create({ data: { schoolId: ctx.schoolId, academicYearId: toYearId, campusId: from.campusId, name: `Time Table ${toYear.name}, copied from ${from.name}`, status: "DRAFT", createdById: ctx.userId } });
  const copied = await copyPeriods(tx, ctx, from.id, version.id, map);
  // Teachers who no longer teach the subject in the new year are listed as things to check.
  const allocations = await tx.teacherAllocation.findMany({ where: { academicYearId: toYearId, archivedAt: null } });
  const periods = await tx.timetablePeriod.findMany({ where: { versionId: version.id, archivedAt: null, staffId: { not: null } } });
  const unassigned = periods.filter((p) => !allocations.some((a) => a.sectionId === p.sectionId && a.subjectId === p.subjectId && a.staffId === p.staffId)).length;
  const clashes = await clashCheck(tx, ctx, version.id);
  await writeAudit(tx, ctx, { action: "copied", recordType: "Timetable Version", recordId: version.id, after: { from: from.name, periods: copied, unassigned, clashes: clashes.length } });
  return { version, copied, unassigned, clashes, sectionsMissing: oldSections.length - map.size };
}

// ---------------------------------------------------------------- make automatically

export type AutoResult = { placed: number; unplaced: { section: string; subject: string; count: number }[]; sections: number };

/**
 * Makes a draft for one class or the whole school from teacher allocations,
 * teacher preferences and subject conditions. Subject conditions win over
 * preferences (04 §10, assumed). The result is always a draft to check; it
 * never replaces the published Time Table (Done when 5).
 */
export async function autoFill(tx: Tx, ctx: SchoolContext, versionId: string, sectionIds: string[] | null, today: Date): Promise<AutoResult> {
  const { version, note } = await draftOrThrow(tx, versionId);
  const settings = await academicSettings(tx, ctx, version.campusId);
  const slots = await periodSlots(tx, ctx, version.campusId);
  const sections = await tx.section.findMany({
    where: { academicYearId: version.academicYearId, archivedAt: null, ...(sectionIds ? { id: { in: sectionIds } } : {}), schoolClass: { campusId: version.campusId, archivedAt: null } },
    include: { schoolClass: true },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  if (sections.length === 0) throw new AcademicRuleError("Choose a class with sections in this year.");
  const date = version.effectiveFrom && version.effectiveFrom > today ? version.effectiveFrom : today;
  const teaching = (day: number) => slots.filter((s) => !s.isBreak && s.days.includes(day));
  const days = settings.workingDays;

  // Clear the chosen sections' teaching periods (fixed periods and breaks stay).
  const mine = new Set(sections.map((s) => s.id));
  await tx.timetablePeriod.updateMany({ where: { versionId, sectionId: { in: [...mine] }, archivedAt: null, isBreak: false, label: null }, data: { archivedAt: new Date() } });

  const existing = await tx.timetablePeriod.findMany({ where: { versionId, archivedAt: null } });
  const teacherBusy = new Set(existing.filter((p) => p.staffId).map((p) => `${p.staffId}:${p.dayOfWeek}:${p.periodNo}`));
  const roomBusy = new Set<string>();
  const roomOfSection = new Map((await tx.section.findMany({ where: { academicYearId: version.academicYearId, archivedAt: null }, select: { id: true, room: true } })).map((s) => [s.id, s.room]));
  for (const p of existing) {
    const r = p.room ?? roomOfSection.get(p.sectionId);
    if (r && !p.isBreak && (p.subjectId || p.label)) roomBusy.add(`${r.toLowerCase()}:${p.dayOfWeek}:${p.periodNo}`);
  }
  const fixed = new Set(existing.filter((p) => mine.has(p.sectionId)).map((p) => `${p.sectionId}:${p.dayOfWeek}:${p.periodNo}`));
  const teacherDay = new Map<string, number[]>();
  for (const p of existing) if (p.staffId) teacherDay.set(`${p.staffId}:${p.dayOfWeek}`, [...(teacherDay.get(`${p.staffId}:${p.dayOfWeek}`) ?? []), p.periodNo]);

  const staffIds = (await tx.teacherAllocation.findMany({ where: { sectionId: { in: [...mine] }, ...allocationActiveOn(date) }, select: { staffId: true } })).map((a) => a.staffId);
  const limit = await limitsFor(tx, ctx, version.campusId, staffIds);
  const prefs = new Map((await tx.teacherPreference.findMany({ where: { staffId: { in: staffIds } } })).map((p) => [p.staffId, new Set(p.unavailable)]));
  const conditions = await tx.subjectCondition.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null } });
  const blockedBy = (subjectId: string, classId: string, day: number, periodNo: number) =>
    conditions.some((c) => c.subjectId === subjectId && c.periodNo === periodNo && (c.dayOfWeek === null || c.dayOfWeek === day) && (c.classId === null || c.classId === classId));

  const consecutiveOk = (staffId: string, day: number, periodNo: number) => {
    const taken = new Set([...(teacherDay.get(`${staffId}:${day}`) ?? []), periodNo]);
    let run = 1;
    for (let p = periodNo - 1; taken.has(p); p--) run++;
    for (let p = periodNo + 1; taken.has(p); p++) run++;
    return run <= limit(staffId).consecutive;
  };

  let placed = 0;
  const unplaced: AutoResult["unplaced"] = [];
  for (const section of sections) {
    const allocations = await tx.teacherAllocation.findMany({ where: { sectionId: section.id, isMain: true, ...allocationActiveOn(date) }, include: { subject: true } });
    const maps = await tx.subjectClass.findMany({ where: { classId: section.classId, ...mapActiveOn(date) } });
    const needs: { subjectId: string; subjectName: string; staffId: string; left: number; perDay: Map<number, number> }[] = [];
    for (const a of allocations) {
      const n = a.periodsPerWeek ?? maps.find((m) => m.subjectId === a.subjectId)?.periodsPerWeek ?? 0;
      if (n > 0 && !needs.some((x) => x.subjectId === a.subjectId)) needs.push({ subjectId: a.subjectId, subjectName: a.subject.name, staffId: a.staffId, left: n, perDay: new Map() });
    }
    needs.sort((a, b) => b.left - a.left);
    const room = section.room;
    // Spread each subject over the week: at most ceil(n / days) a day, then 2 more passes allowing one extra.
    for (let pass = 0; pass < 3; pass++) {
      for (const day of days) {
        for (const slot of teaching(day)) {
          const key = `${section.id}:${day}:${slot.number}`;
          if (fixed.has(key)) continue;
          const candidates = needs.filter((n) => n.left > 0).sort((a, b) => b.left - a.left);
          for (const need of candidates) {
            const total = need.left + [...need.perDay.values()].reduce((x, y) => x + y, 0);
            const cap = Math.ceil(total / days.length) + pass;
            if ((need.perDay.get(day) ?? 0) >= cap) continue;
            if (teacherBusy.has(`${need.staffId}:${day}:${slot.number}`)) continue;
            if (room && roomBusy.has(`${room.toLowerCase()}:${day}:${slot.number}`)) continue;
            if (blockedBy(need.subjectId, section.classId, day, slot.number)) continue;
            if (prefs.get(need.staffId)?.has(`${day}:${slot.number}`)) continue;
            if ((teacherDay.get(`${need.staffId}:${day}`)?.length ?? 0) >= limit(need.staffId).perDay) continue;
            if (!consecutiveOk(need.staffId, day, slot.number)) continue;
            await place(tx, ctx, versionId, section.id, day, slot, need.subjectId, need.staffId);
            fixed.add(key);
            teacherBusy.add(`${need.staffId}:${day}:${slot.number}`);
            if (room) roomBusy.add(`${room.toLowerCase()}:${day}:${slot.number}`);
            teacherDay.set(`${need.staffId}:${day}`, [...(teacherDay.get(`${need.staffId}:${day}`) ?? []), slot.number]);
            need.left--;
            need.perDay.set(day, (need.perDay.get(day) ?? 0) + 1);
            placed++;
            break;
          }
        }
      }
    }
    for (const n of needs) if (n.left > 0) unplaced.push({ section: `${section.schoolClass.name} ${section.name}`, subject: n.subjectName, count: n.left });
  }
  // Breaks from the period master on every working day, for the sections made.
  for (const section of sections) {
    for (const day of days) {
      for (const slot of slots.filter((s) => s.isBreak && s.days.includes(day))) {
        const k = `${section.id}:${day}:${slot.number}`;
        if (fixed.has(k)) continue;
        await place(tx, ctx, versionId, section.id, day, slot, null, null, slot.label);
      }
    }
  }
  await writeAudit(tx, ctx, { action: "made-automatically", recordType: "Timetable Version", recordId: versionId, after: { sections: sections.length, placed, unplaced: unplaced.reduce((n, u) => n + u.count, 0) }, actorNote: note });
  return { placed, unplaced, sections: sections.length };
}

async function place(tx: Tx, ctx: SchoolContext, versionId: string, sectionId: string, day: number, slot: PeriodSlot, subjectId: string | null, staffId: string | null, breakLabel?: string) {
  const data = { startTime: slot.startTime, endTime: slot.endTime, subjectId, staffId, room: null, isBreak: Boolean(breakLabel), label: breakLabel ?? null, archivedAt: null };
  await tx.timetablePeriod.upsert({
    where: { versionId_sectionId_dayOfWeek_periodNo: { versionId, sectionId, dayOfWeek: day, periodNo: slot.number } },
    create: { schoolId: ctx.schoolId, versionId, sectionId, dayOfWeek: day, periodNo: slot.number, ...data },
    update: data,
  });
}

// ---------------------------------------------------------------- reading a day

export type DayPeriod = PeriodCell & { substitution?: { id: string; substituteName: string | null; status: string; forStaffName?: string | null } | null; isSubstitute?: boolean };

/**
 * A teacher's periods on a date from the published Time Table in force,
 * with substitutions: periods they cover for others are added, periods
 * covered for them are marked. Empty on a holiday (A11).
 */
export async function periodsForStaffOnDate(tx: Tx, ctx: SchoolContext, staffId: string, date: Date): Promise<{ off: Awaited<ReturnType<typeof dayOff>>; periods: DayPeriod[] }> {
  const staff = await tx.staff.findFirst({ where: { id: staffId }, select: { campusId: true } });
  if (!staff) return { off: null, periods: [] };
  const off = await dayOff(tx, ctx, date, staff.campusId);
  if (off) return { off, periods: [] };
  const version = await effectiveVersion(tx, ctx, staff.campusId, date);
  const day = weekday(date);
  const own = version ? (await cells(tx, { versionId: version.id, staffId, dayOfWeek: day })) : [];
  const subs = await tx.substitution.findMany({ where: { date, archivedAt: null, status: { not: "CANCELLED" }, OR: [{ absentStaffId: staffId }, { substituteStaffId: staffId }] } });
  const covering = subs.filter((s) => s.substituteStaffId === staffId && s.status === "ARRANGED");
  const extra = covering.length ? await cells(tx, { id: { in: covering.map((c) => c.periodId) } }) : [];
  const names = new Map((await tx.staff.findMany({ where: { id: { in: subs.flatMap((s) => [s.substituteStaffId, s.absentStaffId]).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  const periods: DayPeriod[] = [
    ...own.map((p) => {
      const s = subs.find((x) => x.periodId === p.id && x.absentStaffId === staffId);
      return { ...p, substitution: s ? { id: s.id, substituteName: s.substituteStaffId ? names.get(s.substituteStaffId) ?? null : null, status: s.status } : null };
    }),
    ...extra.map((p) => {
      const s = covering.find((x) => x.periodId === p.id)!;
      return { ...p, isSubstitute: true, substitution: { id: s.id, substituteName: null, status: s.status, forStaffName: names.get(s.absentStaffId) ?? null } };
    }),
  ].sort((a, b) => a.periodNo - b.periodNo);
  return { off, periods };
}

/** A section's periods on a date from the Time Table in force, empty on a holiday. */
export async function periodsForSectionOnDate(tx: Tx, ctx: SchoolContext, sectionId: string, date: Date) {
  const section = await tx.section.findFirst({ where: { id: sectionId }, include: { schoolClass: true } });
  if (!section) return { off: null, periods: [] as PeriodCell[] };
  const off = await dayOff(tx, ctx, date, section.schoolClass.campusId);
  if (off) return { off, periods: [] as PeriodCell[] };
  const version = await effectiveVersion(tx, ctx, section.schoolClass.campusId, date);
  return { off, periods: version ? await cells(tx, { versionId: version.id, sectionId, dayOfWeek: weekday(date) }) : [] };
}

/** Teachers free in a period of a version (not teaching then), for the free periods view. */
export async function freeTeachersInVersion(tx: Tx, ctx: SchoolContext, versionId: string, day: number, periodNo: number) {
  const busy = await tx.timetablePeriod.findMany({ where: { versionId, dayOfWeek: day, periodNo, archivedAt: null, staffId: { not: null } }, select: { staffId: true } });
  const busyIds = new Set(busy.map((b) => b.staffId));
  const teachers = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: "ACTIVE", staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } });
  return teachers.filter((t) => !busyIds.has(t.id));
}

export function dayWords(days: number[]) {
  return days.map((d) => DAY_SHORT[d]).join(", ");
}
