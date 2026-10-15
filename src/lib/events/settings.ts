// Events Settings (18 §6): event types, venues, weekends, PTM defaults,
// calendar sharing and the gallery's photo consent rule. One row per school,
// made with the defaults the first time it is read for a change.
import "server-only";

import { createHmac } from "node:crypto";
import type { EventsSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { appUrl } from "../parent-link/token";
import { EventsProblem } from "./problem";

export type EventsSettings = Omit<EventsSetting, "updatedAt" | "updatedById">;

const DEFAULTS = (schoolId: string): EventsSettings => ({
  schoolId,
  eventTypes: ["Annual day", "Sports day", "Cultural", "Competition", "Trip", "Safety drill", "Meeting", "Alumni"],
  venues: ["Assembly hall", "Auditorium", "Library hall", "School ground", "Classrooms", "Outside the school"],
  secondSaturdayOff: false,
  fourthSaturdayOff: false,
  ptmSlotMinutes: 10,
  ptmReminderHour: 18,
  galleryRule: "OUT",
  feedOn: false,
  feedVersion: 1,
  housesOn: true,
  clubsOn: true,
  sportsOn: true,
  levels: ["School", "District", "State", "National"],
  activityKinds: ["Music", "Dance", "Debate", "Art", "Public speaking", "Olympiad", "Competition", "Project", "Volunteering", "Sport"],
  creditsOn: false,
  creditsTakePart: [5, 10, 15, 20],
  creditsWin: [10, 20, 40, 60],
  dailyOn: true,
  dailyTypes: ["Meal", "Nap", "Play", "Water", "Learning activity"],
});

/** The activity credits for one level: taking part and winning (Events Settings). */
export function creditsFor(s: Pick<EventsSettings, "levels" | "creditsTakePart" | "creditsWin" | "creditsOn">, level: string, won: boolean) {
  if (!s.creditsOn) return 0;
  const i = s.levels.indexOf(level);
  if (i < 0) return 0;
  return (won ? s.creditsWin[i] : s.creditsTakePart[i]) ?? 0;
}

/** Saves the credits table: one "taking part" and one "winning" number per level. */
export async function saveCredits(tx: Tx, ctx: SchoolContext, takePart: number[], win: number[]) {
  const s = await eventsSettings(tx, ctx);
  if (takePart.length !== s.levels.length || win.length !== s.levels.length) throw new EventsProblem("Enter the credits for every level.");
  for (const [i, v] of [...takePart, ...win].entries()) {
    if (!Number.isInteger(v) || v < 0 || v > 500) throw new EventsProblem("Credits are whole numbers from 0 to 500.", i < takePart.length ? `take_${i}` : `win_${i - takePart.length}`);
  }
  await tx.eventsSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, creditsTakePart: takePart, creditsWin: win, updatedById: ctx.userId }, update: { creditsTakePart: takePart, creditsWin: win, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "credits-changed", recordType: "Events Settings", recordId: ctx.schoolId, before: { takePart: s.creditsTakePart, win: s.creditsWin }, after: { takePart, win } });
}

/** The school's Events Settings, or the defaults when none are saved yet. */
export async function eventsSettings(tx: Tx, ctx: SchoolContext): Promise<EventsSettings> {
  const row = await tx.eventsSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  return row ?? DEFAULTS(ctx.schoolId);
}

export type SettingsChange = Partial<Pick<EventsSettings, "secondSaturdayOff" | "fourthSaturdayOff" | "ptmSlotMinutes" | "ptmReminderHour" | "galleryRule" | "feedOn" | "housesOn" | "clubsOn" | "sportsOn" | "creditsOn" | "dailyOn">>;

export async function saveEventsSettings(tx: Tx, ctx: SchoolContext, change: SettingsChange) {
  if (change.ptmSlotMinutes != null && ![5, 10, 15, 20].includes(change.ptmSlotMinutes)) throw new EventsProblem("Slot length is 5, 10, 15 or 20 minutes.", "ptmSlotMinutes");
  if (change.ptmReminderHour != null && (change.ptmReminderHour < 8 || change.ptmReminderHour > 21)) throw new EventsProblem("Pick a reminder time between 8 AM and 9 PM.", "ptmReminderHour");
  if (change.galleryRule != null && !["OUT", "BLUR"].includes(change.galleryRule)) throw new EventsProblem("Choose to leave the photo out or blur the students.", "galleryRule");
  const before = await eventsSettings(tx, ctx);
  const row = await tx.eventsSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...change, updatedById: ctx.userId }, update: { ...change, updatedById: ctx.userId } });
  const changed = Object.fromEntries(Object.entries(change).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v));
  if (Object.keys(changed).length) {
    const was = Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]]));
    await writeAudit(tx, ctx, { action: "changed", recordType: "Events Settings", recordId: ctx.schoolId, before: was as Record<string, string | number | boolean>, after: changed as Record<string, string | number | boolean> });
  }
  return row;
}

export type SettingsList = "eventTypes" | "venues" | "activityKinds" | "dailyTypes";
export const LIST_WORDS: Record<SettingsList, string> = { eventTypes: "event type", venues: "venue", activityKinds: "activity kind", dailyTypes: "activity type" };
/** Built-in Daily Activities types that cannot be removed (the diary needs them). */
export const DAILY_BUILT_IN = ["Meal", "Nap", "Play", "Water", "Learning activity"];

/** Adds or removes one entry of a list (event types, venues, activity kinds, Daily Activities types). */
export async function changeList(tx: Tx, ctx: SchoolContext, list: SettingsList, op: "add" | "remove", value: string) {
  const v = value.trim().replace(/\s+/g, " ");
  const what = LIST_WORDS[list];
  if (op === "add" && (v.length < 2 || v.length > 40)) throw new EventsProblem(`Give the ${what} a name of 2 to 40 characters.`, "value");
  if (op === "remove" && list === "dailyTypes" && DAILY_BUILT_IN.includes(v)) throw new EventsProblem(`${v} is one of the built-in activity types and stays.`);
  const s = await eventsSettings(tx, ctx);
  const items = s[list];
  if (op === "add" && items.some((x) => x.toLowerCase() === v.toLowerCase())) throw new EventsProblem(`${v} is already in the list.`, "value");
  if (op === "remove" && !items.includes(v)) throw new EventsProblem(`${v} is not in the list.`);
  if (op === "remove" && items.length <= 1) throw new EventsProblem(`Keep at least one ${what}.`);
  const next = op === "add" ? [...items, v] : items.filter((x) => x !== v);
  await tx.eventsSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, [list]: next, updatedById: ctx.userId }, update: { [list]: next, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: op === "add" ? "list-added" : "list-removed", recordType: "Events Settings", recordId: ctx.schoolId, before: { [list]: items }, after: { [list]: next } });
  return v;
}

/** Stops every old calendar feed link and makes new ones. */
export async function renewFeed(tx: Tx, ctx: SchoolContext) {
  const s = await eventsSettings(tx, ctx);
  await tx.eventsSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, feedVersion: s.feedVersion + 1, feedOn: true, updatedById: ctx.userId }, update: { feedVersion: s.feedVersion + 1, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "feed-renewed", recordType: "Events Settings", recordId: ctx.schoolId, after: { feedVersion: s.feedVersion + 1 } });
}

/* ---------- Calendar feed links (no secret is stored: worked out from the school, scope and version) ---------- */

function secret(): Buffer {
  const raw = process.env.PARENT_LINK_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("PARENT_LINK_SECRET is not set");
  return Buffer.from(raw);
}

export type FeedScope = "school" | "staff";
export const feedToken = (schoolId: string, scope: FeedScope, version: number) => createHmac("sha256", secret()).update(`calendar-feed:${schoolId}:${scope}:${version}`).digest("base64url").slice(0, 32);
export const feedUrl = (schoolId: string, scope: FeedScope, version: number) => `${appUrl()}/api/v1/calendar/${schoolId}/${scope}-${feedToken(schoolId, scope, version)}.ics`;

/** The album link for parents; a new share version stops old links. */
export const albumToken = (albumId: string, version: number) => createHmac("sha256", secret()).update(`album:${albumId}:${version}`).digest("base64url").slice(0, 32);
export const albumUrl = (schoolId: string, albumId: string, version: number) => `${appUrl()}/g/${schoolId}/${albumId}/${albumToken(albumId, version)}`;
