// Session rules (Settings, Users & Permissions, "Password and session rules";
// 20-settings.md, gap list G45): how long a sign-in lasts without use, on a
// computer and on a phone, and the longest one sign-in lasts, used or not. They
// are applied on the server to every request (sessions.ts, findSession), not
// only in the browser.
//
// A school that never saved its own rules keeps what every school had before:
// 7 days without use on any device and no longest sign-in, so no existing login
// changes. The blueprint's suggestion (inferred) is 30 minutes on computers and
// 7 days on the phone app; the page marks those choices "Recommended".
//
// Signing out after time without use never forgets a remembered device
// (remembered.ts): signing in there again with the password asks no code.

import { withSchool, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { SettingsProblem } from "../settings/common";

export type SessionRules = {
  /** Minutes without use before a sign-in on a computer ends. */
  idleComputer: number;
  /** Minutes without use before a sign-in on a phone ends. */
  idlePhone: number;
  /** The longest one sign-in lasts, in minutes; null = no limit. */
  maxSession: number | null;
};

const DAY = 24 * 60;

/** The rules of a school that saved none: what every school had before G45. */
export const DEFAULT_SESSION_RULES: SessionRules = { idleComputer: 7 * DAY, idlePhone: 7 * DAY, maxSession: null };

/** The blueprint's suggestion (20-settings.md, inferred): 30 minutes on computers, 7 days on the phone app. */
export const RECOMMENDED_SESSION_RULES: SessionRules = { idleComputer: 30, idlePhone: 7 * DAY, maxSession: null };

/** The choices for time without use, in minutes: 5 minutes to 7 days (the safe bounds; also checked by the database). */
export const IDLE_CHOICES = [5, 10, 15, 30, 60, 120, 240, 480, 720, DAY, 3 * DAY, 7 * DAY] as const;
/** The choices for the longest sign-in, in minutes: 1 hour to 90 days, or no limit (null). */
export const MAX_SESSION_CHOICES = [60, 240, 480, 720, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY] as const;

/** "30 minutes", "1 hour", "7 days". */
export function durationWords(minutes: number): string {
  const n = (v: number, one: string) => `${v} ${one}${v === 1 ? "" : "s"}`;
  if (minutes % DAY === 0) return n(minutes / DAY, "day");
  if (minutes % 60 === 0) return n(minutes / 60, "hour");
  return n(minutes, "minute");
}

/** Phones (and tablets): the browser or the installed app. Everything else counts as a computer. */
export function isPhone(userAgent: string | null | undefined): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent ?? "");
}

/** Why a sign-in ended by itself: "away" (not used for too long) or "too-long" (the longest sign-in was reached). */
export type TimeOut = "away" | "too-long";
/** The revoked reason written on a session that ended by itself, so the sign-in page can say why. */
export const TIMED_OUT_REASONS: Record<TimeOut, string> = {
  away: "Signed out after time without use",
  "too-long": "Signed out: the longest sign-in was reached",
};

/** The sign-in page's words after a sign-in ended by itself (`/sign-in?signedOut=away&m=30`). */
export function timedOutWords(signedOut: string | undefined, m: string | undefined): string | undefined {
  const minutes = Number(m);
  const how = Number.isInteger(minutes) && minutes > 0 && minutes <= 200_000 ? durationWords(minutes) : null;
  if (signedOut === "away") return `You were signed out because you were away${how ? ` for ${how}` : " for a while"}. Sign in again to carry on.`;
  if (signedOut === "too-long") return `You were signed out because your school ends every sign-in after ${how ?? "a set time"}. Sign in again to carry on.`;
  return undefined;
}

/** When this session ends under these rules, and why. */
export function sessionEnds(
  session: { userAgent: string | null; createdAt: Date; lastUsedAt: Date },
  rules: SessionRules,
): { at: Date; why: TimeOut; idleMinutes: number } {
  const idleMinutes = isPhone(session.userAgent) ? rules.idlePhone : rules.idleComputer;
  const idleEnd = session.lastUsedAt.getTime() + idleMinutes * 60_000;
  const maxEnd = rules.maxSession === null ? Infinity : session.createdAt.getTime() + rules.maxSession * 60_000;
  return maxEnd < idleEnd ? { at: new Date(maxEnd), why: "too-long", idleMinutes } : { at: new Date(idleEnd), why: "away", idleMinutes };
}

function fromRow(row: { idleMinutesComputer: number; idleMinutesPhone: number; maxSessionMinutes: number | null } | null): SessionRules {
  if (!row) return DEFAULT_SESSION_RULES;
  return { idleComputer: row.idleMinutesComputer, idlePhone: row.idleMinutesPhone, maxSession: row.maxSessionMinutes };
}

/** The school's rules, read inside its own transaction. */
export async function readSessionRules(tx: Tx, schoolId: string): Promise<SessionRules & { saved: boolean }> {
  const row = await tx.passwordPolicy.findUnique({ where: { schoolId } });
  return { ...fromRow(row), saved: Boolean(row) };
}

// Every request reads the rules, so they are kept for a short time in memory.
// A change saved here clears it at once; other servers see it within this time.
const CACHE_MS = 30_000;
const cache = new Map<string, { rules: SessionRules; until: number }>();

/** Forgets the kept rules (after a save, and in tests). */
export function forgetSessionRules(schoolId?: string) {
  if (schoolId) cache.delete(schoolId);
  else cache.clear();
}

/** The rules for a session working in this school (no school yet: the defaults). */
export async function sessionRulesFor(schoolId: string | null, now = Date.now()): Promise<SessionRules> {
  if (!schoolId) return DEFAULT_SESSION_RULES;
  const kept = cache.get(schoolId);
  if (kept && kept.until > now) return kept.rules;
  const rules = await withSchool({ schoolId, userId: null }, async (tx) => fromRow(await tx.passwordPolicy.findUnique({ where: { schoolId } })));
  cache.set(schoolId, { rules, until: now + CACHE_MS });
  return rules;
}

/** Checks a choice against the safe bounds; the database checks them again. */
export function checkSessionRules(input: SessionRules): SessionRules {
  if (!(IDLE_CHOICES as readonly number[]).includes(input.idleComputer)) throw new SettingsProblem("Choose how long a computer may be left unused: from 5 minutes to 7 days.", "idleComputer");
  if (!(IDLE_CHOICES as readonly number[]).includes(input.idlePhone)) throw new SettingsProblem("Choose how long a phone may be left unused: from 5 minutes to 7 days.", "idlePhone");
  if (input.maxSession !== null && !(MAX_SESSION_CHOICES as readonly number[]).includes(input.maxSession)) throw new SettingsProblem("Choose the longest sign-in: from 1 hour to 90 days, or no limit.", "maxSession");
  return input;
}

/** Saves the school's session rules; written in the audit log with before and after. Returns false when nothing changed. */
export async function saveSessionRules(tx: Tx, ctx: SchoolContext, input: SessionRules): Promise<boolean> {
  const rules = checkSessionRules(input);
  const before = await readSessionRules(tx, ctx.schoolId);
  if (before.saved && before.idleComputer === rules.idleComputer && before.idlePhone === rules.idlePhone && before.maxSession === rules.maxSession) return false;
  const data = { idleMinutesComputer: rules.idleComputer, idleMinutesPhone: rules.idlePhone, maxSessionMinutes: rules.maxSession, updatedById: ctx.userId };
  await tx.passwordPolicy.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...data }, update: data });
  await writeAudit(tx, ctx, {
    action: "changed-session-rules",
    recordType: "Password Policy",
    recordId: ctx.schoolId,
    before: { idleComputer: before.idleComputer, idlePhone: before.idlePhone, maxSession: before.maxSession },
    after: { idleComputer: rules.idleComputer, idlePhone: rules.idlePhone, maxSession: rules.maxSession },
  });
  forgetSessionRules(ctx.schoolId);
  return true;
}
