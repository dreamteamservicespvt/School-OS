// Academic Settings (04 §6): school timings and working days, the period
// master, workload limits and the substitution rule, per campus.
import "server-only";

import type { PeriodSlot } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { AcademicRuleError, DAY_SHORT, minutes, TIME_RE } from "./common";

export type AcademicSettingsView = {
  dayStart: string;
  dayEnd: string;
  workingDays: number[];
  halfDays: number[];
  halfDayEnd: string | null;
  maxPeriodsPerDay: number;
  maxPeriodsPerWeek: number;
  maxConsecutive: number;
  autoSubstitutions: boolean;
};

export const DEFAULT_SETTINGS: AcademicSettingsView = {
  dayStart: "08:30", dayEnd: "15:00", workingDays: [1, 2, 3, 4, 5, 6], halfDays: [], halfDayEnd: null,
  maxPeriodsPerDay: 7, maxPeriodsPerWeek: 32, maxConsecutive: 4, autoSubstitutions: true,
};

export async function mainCampusId(tx: Tx, ctx: SchoolContext): Promise<string> {
  const campus = (await tx.campus.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, isMain: true } }))
    ?? (await tx.campus.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { createdAt: "asc" } }));
  if (!campus) throw new AcademicRuleError("This school has no campus yet. Add one in Settings, School Profile.");
  return campus.id;
}

export async function academicSettings(tx: Tx, ctx: SchoolContext, campusId: string): Promise<AcademicSettingsView> {
  const row = await tx.academicSettings.findUnique({ where: { schoolId_campusId: { schoolId: ctx.schoolId, campusId } } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    dayStart: row.dayStart, dayEnd: row.dayEnd, workingDays: row.workingDays, halfDays: row.halfDays, halfDayEnd: row.halfDayEnd,
    maxPeriodsPerDay: row.maxPeriodsPerDay, maxPeriodsPerWeek: row.maxPeriodsPerWeek, maxConsecutive: row.maxConsecutive, autoSubstitutions: row.autoSubstitutions,
  };
}

export async function saveAcademicSettings(tx: Tx, ctx: SchoolContext, campusId: string, input: AcademicSettingsView) {
  if (!TIME_RE.test(input.dayStart) || !TIME_RE.test(input.dayEnd)) throw new AcademicRuleError("Times must be like 08:30.", "dayStart");
  if (minutes(input.dayEnd) <= minutes(input.dayStart)) throw new AcademicRuleError("School must end after it starts.", "dayEnd");
  if (input.workingDays.length === 0) throw new AcademicRuleError("Choose at least one working day.", "workingDays");
  if (input.halfDays.some((d) => !input.workingDays.includes(d))) throw new AcademicRuleError("A half day must also be a working day.", "halfDays");
  if (input.halfDays.length && (!input.halfDayEnd || !TIME_RE.test(input.halfDayEnd))) throw new AcademicRuleError("Give the time half days end, like 12:30.", "halfDayEnd");
  if (input.maxPeriodsPerDay * input.workingDays.length < input.maxPeriodsPerWeek) {
    throw new AcademicRuleError(`${input.maxPeriodsPerWeek} periods a week cannot fit in ${input.maxPeriodsPerDay} a day over ${input.workingDays.length} days. Lower the weekly limit or raise the daily one.`, "maxPeriodsPerWeek");
  }
  const before = await academicSettings(tx, ctx, campusId);
  const data = { ...input, workingDays: [...input.workingDays].sort(), halfDays: [...input.halfDays].sort(), halfDayEnd: input.halfDays.length ? input.halfDayEnd : null, updatedById: ctx.userId };
  await tx.academicSettings.upsert({
    where: { schoolId_campusId: { schoolId: ctx.schoolId, campusId } },
    create: { schoolId: ctx.schoolId, campusId, ...data },
    update: data,
  });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Academic Settings", recordId: campusId, before, after: data });
}

/** The period master in order of the day. */
export async function periodSlots(tx: Tx, ctx: SchoolContext, campusId: string): Promise<PeriodSlot[]> {
  const rows = await tx.periodSlot.findMany({ where: { schoolId: ctx.schoolId, campusId, archivedAt: null } });
  return rows.sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
}

/** Teaching slots (not breaks) running on a weekday. */
export function teachingSlotsOn(slots: PeriodSlot[], day: number) {
  return slots.filter((s) => !s.isBreak && s.days.includes(day));
}

export type SlotInput = { label: string; number: number; startTime: string; endTime: string; isBreak: boolean; days: number[] };

export async function checkSlot(tx: Tx, ctx: SchoolContext, campusId: string, input: SlotInput, exceptId?: string) {
  if (!input.label.trim()) throw new AcademicRuleError("Give the period a name, like Period 1 or Lunch.", "label");
  if (!TIME_RE.test(input.startTime)) throw new AcademicRuleError("Start time must be like 08:45.", "startTime");
  if (!TIME_RE.test(input.endTime)) throw new AcademicRuleError("End time must be like 09:25.", "endTime");
  if (minutes(input.endTime) <= minutes(input.startTime)) throw new AcademicRuleError("The period must end after it starts.", "endTime");
  if (input.days.length === 0) throw new AcademicRuleError("Choose the days this period runs.", "days");
  const others = (await periodSlots(tx, ctx, campusId)).filter((s) => s.id !== exceptId);
  for (const o of others) {
    const shared = o.days.filter((d) => input.days.includes(d));
    if (!shared.length) continue;
    if (minutes(input.startTime) < minutes(o.endTime) && minutes(input.endTime) > minutes(o.startTime)) {
      throw new AcademicRuleError(`${input.label} overlaps ${o.label} (${o.startTime} to ${o.endTime}) on ${shared.map((d) => DAY_SHORT[d]).join(", ")}.`, "startTime");
    }
    if (!input.isBreak && !o.isBreak && o.number === input.number) {
      throw new AcademicRuleError(`Period number ${input.number} is already used by ${o.label}.`, "number");
    }
  }
}

export async function saveSlot(tx: Tx, ctx: SchoolContext, campusId: string, input: SlotInput, id?: string) {
  await checkSlot(tx, ctx, campusId, input, id);
  // Breaks are numbered below zero so they never mix with teaching periods.
  let number = input.number;
  if (input.isBreak) {
    const existing = id ? await tx.periodSlot.findUnique({ where: { id } }) : null;
    if (existing?.isBreak) number = existing.number;
    else {
      const lowest = await tx.periodSlot.aggregate({ where: { schoolId: ctx.schoolId, campusId, archivedAt: null, isBreak: true }, _min: { number: true } });
      number = Math.min(0, (lowest._min.number ?? 1) - 1);
    }
  }
  const data = { label: input.label.trim(), number, startTime: input.startTime, endTime: input.endTime, isBreak: input.isBreak, days: [...input.days].sort() };
  if (id) {
    const before = await tx.periodSlot.findFirst({ where: { id, campusId, archivedAt: null } });
    if (!before) throw new AcademicRuleError("This period was not found.");
    const row = await tx.periodSlot.update({ where: { id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Period Master", recordId: id, before: { ...before, createdAt: undefined }, after: data });
    return row;
  }
  const row = await tx.periodSlot.create({ data: { schoolId: ctx.schoolId, campusId, ...data } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Period Master", recordId: row.id, after: data });
  return row;
}

export async function archiveSlot(tx: Tx, ctx: SchoolContext, id: string) {
  const slot = await tx.periodSlot.findFirst({ where: { id, archivedAt: null } });
  if (!slot) throw new AcademicRuleError("This period was not found.");
  await tx.periodSlot.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Period Master", recordId: id, before: { label: slot.label, startTime: slot.startTime, endTime: slot.endTime } });
  return slot;
}
