// Front Office settings (16 §6): the visitor, call and department lists the
// desk edits inline, the visitor policy (photo and ID proof required, the
// pickup code check), the pass expiry time and the optional parts switched on.
import "server-only";

import type { FrontOfficeSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { FRONT_OFFICE_FEATURES, minutesOf, type FrontOfficeFeature } from "./words";
import { FrontOfficeProblem } from "./problem";
import { instantOf } from "./time";

export type FoSettings = FrontOfficeSetting;

export async function frontOfficeSettings(tx: Tx, ctx: SchoolContext): Promise<FoSettings> {
  const row = await tx.frontOfficeSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (row) return row;
  return tx.frontOfficeSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId }, update: {} });
}

export async function foFeaturesOn(tx: Tx, ctx: SchoolContext): Promise<Set<FrontOfficeFeature>> {
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: FRONT_OFFICE_FEATURES.map((f) => f.key) } } });
  return new Set(rows.map((r) => r.featureKey as FrontOfficeFeature));
}

const DEFAULT_DAY = { start: 9 * 60, end: 15 * 60 + 30 };

/** The school day from the Period Master (first period to the last), or 9:00 AM to 3:30 PM. */
export async function schoolDay(tx: Tx, ctx: SchoolContext, weekday?: number) {
  const slots = await tx.periodSlot.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { startTime: true, endTime: true, days: true } });
  const used = weekday ? slots.filter((s) => s.days.includes(weekday)) : slots;
  const list = used.length ? used : slots;
  if (!list.length) return DEFAULT_DAY;
  const start = Math.min(...list.map((s) => minutesOf(s.startTime)));
  const end = Math.max(...list.map((s) => minutesOf(s.endTime)));
  return end > start ? { start, end } : DEFAULT_DAY;
}

/** The minute visitor passes expire on a day: the set time, else the end of the school day. */
export async function passEndMinute(tx: Tx, ctx: SchoolContext, s: Pick<FoSettings, "passExpiry">, dayIso: string) {
  if (s.passExpiry && /^\d{2}:\d{2}$/.test(s.passExpiry)) return minutesOf(s.passExpiry);
  const wd = ((new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return (await schoolDay(tx, ctx, wd)).end;
}

/**
 * When a pass made now expires (16 §2 Visitors): at the set time today. A
 * visitor who arrives after that time gets an hour, up to the end of the day.
 */
export async function passExpiryFor(tx: Tx, ctx: SchoolContext, s: Pick<FoSettings, "passExpiry">, dayIso: string, timeZone: string, now = new Date()) {
  const end = instantOf(dayIso, await passEndMinute(tx, ctx, s, dayIso), timeZone);
  if (end.getTime() > now.getTime() + 15 * 60_000) return end;
  const late = new Date(now.getTime() + 60 * 60_000);
  const lastMinute = instantOf(dayIso, 23 * 60 + 59, timeZone);
  return late < lastMinute ? late : lastMinute;
}

export type SettingsInput = {
  photoRequired: boolean;
  idProofRequired: boolean;
  pickupCodeCheck: boolean;
  passExpiry: string | null;
  slotMinutes: number;
  features: Record<FrontOfficeFeature, boolean>;
};

export async function saveSettings(tx: Tx, ctx: SchoolContext, input: SettingsInput) {
  if (input.passExpiry && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.passExpiry)) throw new FrontOfficeProblem("Choose a time for passes to expire, or leave it on the end of the school day.", "passExpiry");
  if (![10, 15, 20, 30].includes(input.slotMinutes)) throw new FrontOfficeProblem("Choose the appointment slot length.", "slotMinutes");
  const before = await frontOfficeSettings(tx, ctx);
  const after = await tx.frontOfficeSetting.update({
    where: { schoolId: ctx.schoolId },
    data: { photoRequired: input.photoRequired, idProofRequired: input.idProofRequired, pickupCodeCheck: input.pickupCodeCheck, passExpiry: input.passExpiry, slotMinutes: input.slotMinutes, updatedById: ctx.userId },
  });
  const was = await foFeaturesOn(tx, ctx);
  for (const f of FRONT_OFFICE_FEATURES) {
    const on = Boolean(input.features[f.key]);
    if (was.has(f.key) === on) continue;
    await tx.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: f.key } },
      create: { schoolId: ctx.schoolId, featureKey: f.key, isOn: on },
      update: { isOn: on },
    });
  }
  const pick = (s: FoSettings) => ({ photoRequired: s.photoRequired, idProofRequired: s.idProofRequired, pickupCodeCheck: s.pickupCodeCheck, passExpiry: s.passExpiry, slotMinutes: s.slotMinutes });
  await writeAudit(tx, ctx, {
    action: "changed", recordType: "Front Office Setting", recordId: null,
    before: { ...pick(before), features: [...was] }, after: { ...pick(after), features: FRONT_OFFICE_FEATURES.filter((f) => input.features[f.key]).map((f) => f.key) },
  });
  return after;
}

const LISTS = { visitorPurposes: "Visitor purposes", callPurposes: "Call purposes", requestDepartments: "Request departments" } as const;
export type ListKey = keyof typeof LISTS;
export const isListKey = (k: string): k is ListKey => k in LISTS;

/** "Add" in a list (16 §6: lists are edited inline by the Front Office manager). */
export async function addToList(tx: Tx, ctx: SchoolContext, list: ListKey, value: string) {
  const v = value.trim().replace(/\s+/g, " ");
  if (v.length < 2) throw new FrontOfficeProblem("Type at least 2 letters.", "value");
  if (v.length > 40) throw new FrontOfficeProblem("Keep it to 40 letters.", "value");
  const s = await frontOfficeSettings(tx, ctx);
  const current = s[list];
  if (current.some((x) => x.toLowerCase() === v.toLowerCase())) throw new FrontOfficeProblem(`“${v}” is already in the list.`, "value");
  if (current.length >= 30) throw new FrontOfficeProblem("A list can have at most 30 choices. Remove one first.", "value");
  await tx.frontOfficeSetting.update({ where: { schoolId: ctx.schoolId }, data: { [list]: [...current, v], updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "list-added", recordType: "Front Office Setting", recordId: null, after: { list: LISTS[list], value: v } });
  return v;
}

/** Removes a choice; records that used it keep their words. */
export async function removeFromList(tx: Tx, ctx: SchoolContext, list: ListKey, value: string) {
  const s = await frontOfficeSettings(tx, ctx);
  const current = s[list];
  if (!current.includes(value)) throw new FrontOfficeProblem("That choice is not in the list any more.");
  if (current.length <= 1) throw new FrontOfficeProblem("Keep at least one choice in the list.");
  await tx.frontOfficeSetting.update({ where: { schoolId: ctx.schoolId }, data: { [list]: current.filter((x) => x !== value), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "list-removed", recordType: "Front Office Setting", recordId: null, before: { list: LISTS[list], value } });
}
