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
});

/** The school's Events Settings, or the defaults when none are saved yet. */
export async function eventsSettings(tx: Tx, ctx: SchoolContext): Promise<EventsSettings> {
  const row = await tx.eventsSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  return row ?? DEFAULTS(ctx.schoolId);
}

export type SettingsChange = Partial<Pick<EventsSettings, "secondSaturdayOff" | "fourthSaturdayOff" | "ptmSlotMinutes" | "ptmReminderHour" | "galleryRule" | "feedOn">>;

export async function saveEventsSettings(tx: Tx, ctx: SchoolContext, change: SettingsChange) {
  if (change.ptmSlotMinutes != null && ![5, 10, 15, 20].includes(change.ptmSlotMinutes)) throw new EventsProblem("Slot length is 5, 10, 15 or 20 minutes.", "ptmSlotMinutes");
  if (change.ptmReminderHour != null && (change.ptmReminderHour < 8 || change.ptmReminderHour > 21)) throw new EventsProblem("Pick a reminder time between 8 AM and 9 PM.", "ptmReminderHour");
  if (change.galleryRule != null && !["OUT", "BLUR"].includes(change.galleryRule)) throw new EventsProblem("Choose to leave the photo out or blur the students.", "galleryRule");
  const before = await eventsSettings(tx, ctx);
  const row = await tx.eventsSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...change, updatedById: ctx.userId }, update: { ...change, updatedById: ctx.userId } });
  const changed = Object.fromEntries(Object.entries(change).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v));
  if (Object.keys(changed).length) {
    await writeAudit(tx, ctx, { action: "changed", recordType: "Events Settings", recordId: ctx.schoolId, before: Object.fromEntries(Object.keys(changed).map((k) => [k, (before as Record<string, unknown>)[k]])), after: changed });
  }
  return row;
}

/** Adds or removes one entry of a list (event types or venues). */
export async function changeList(tx: Tx, ctx: SchoolContext, list: "eventTypes" | "venues", op: "add" | "remove", value: string) {
  const v = value.trim().replace(/\s+/g, " ");
  const what = list === "eventTypes" ? "event type" : "venue";
  if (op === "add" && (v.length < 2 || v.length > 40)) throw new EventsProblem(`Give the ${what} a name of 2 to 40 characters.`, "value");
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
