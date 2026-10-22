// Password rules (Settings, Users & Permissions, "Password and session rules";
// 20-settings.md "Set password format rules", gap list G45). A School Admin
// sets, within safe bounds:
// - the shortest new password (8 to 32 characters);
// - how many of a person's earlier passwords may not be used again (0 to 10);
// - an optional expiry (30 to 365 days), counted from the day it was switched on
//   for passwords set before, so nobody is caught at once.
// Always, whatever the school chose: a letter and a number, and not a common
// password (common-passwords.ts, a small list kept here; no outside service).
//
// The rules apply wherever a password is set: an invite link, choosing one's own
// after a temporary password or an expired one, Change password in My profile,
// a DREAM TEAM reset link, and a temporary password typed by HR. A login that
// works in several schools follows the strictest of its schools. A school that
// saved nothing has the rules every school had before, so nothing changes for it
// and every existing password keeps working.

import { prisma, withSchool, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { SettingsProblem } from "../settings/common";
import { schoolsFor } from "./access";
import { checkNewPassword, verifyPassword } from "./password";
import { englishT, type T } from "../i18n/t";

export type PasswordRules = {
  minLength: number;
  /** How many earlier passwords (the current one first) a new one may not repeat; 0 = not checked. */
  history: number;
  /** Days before a password must be changed; null = never. */
  expiryDays: number | null;
  /** When expiry was switched on (older passwords count from then). */
  expirySince: Date | null;
};

/** The rules of a school that saved none: what every school had before G45. */
export const DEFAULT_PASSWORD_RULES: PasswordRules = { minLength: 8, history: 0, expiryDays: null, expirySince: null };

/** Safe bounds, also checked by the database. */
export const MIN_LENGTH_CHOICES = [8, 10, 12, 14, 16, 20, 24, 32] as const;
export const HISTORY_CHOICES = [0, 1, 3, 5, 10] as const;
export const EXPIRY_CHOICES = [30, 60, 90, 180, 365] as const;

/** Why this new password may not be used under these rules, in plain words, or null when it may. Needs no database. */
export function passwordProblem(password: string, rules: Pick<PasswordRules, "minLength"> = DEFAULT_PASSWORD_RULES): string | null {
  return checkNewPassword(password, rules.minLength);
}

type PolicyRow = { minLength: number; historyCount: number; expiryDays: number | null; expirySince: Date | null } | null;

function fromRow(row: PolicyRow): PasswordRules {
  if (!row) return DEFAULT_PASSWORD_RULES;
  return { minLength: row.minLength, history: row.historyCount, expiryDays: row.expiryDays, expirySince: row.expirySince };
}

/** One school's password rules, read inside its own transaction. */
export async function readPasswordRules(tx: Tx, schoolId: string): Promise<PasswordRules & { saved: boolean }> {
  const row = await tx.passwordPolicy.findUnique({ where: { schoolId } });
  return { ...fromRow(row), saved: Boolean(row) };
}

/** The strictest of several schools' rules: the longest length, the most earlier passwords, the shortest expiry. */
export function strictest(list: PasswordRules[]): PasswordRules {
  if (list.length === 0) return DEFAULT_PASSWORD_RULES;
  const expiring = list.filter((r) => r.expiryDays !== null).sort((a, b) => a.expiryDays! - b.expiryDays!);
  return {
    minLength: Math.max(...list.map((r) => r.minLength)),
    history: Math.max(...list.map((r) => r.history)),
    expiryDays: expiring[0]?.expiryDays ?? null,
    expirySince: expiring[0]?.expirySince ?? null,
  };
}

/** The rules for a login: the strictest of every school it can open. */
export async function passwordRulesForLogin(userLoginId: string): Promise<PasswordRules> {
  const schools = await schoolsFor(userLoginId);
  const list = await Promise.all(schools.map((s) => withSchool({ schoolId: s.id, userId: null }, async (tx) => fromRow(await tx.passwordPolicy.findUnique({ where: { schoolId: s.id } })))));
  return strictest(list);
}

/** Whether this password is the login's current one or one of its last earlier ones, as the rules count them. */
export async function isRecentPassword(userLoginId: string, password: string, history: number): Promise<boolean> {
  if (history <= 0) return false;
  const login = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { passwordHash: true } });
  const earlier = history > 1
    ? await prisma.passwordHistory.findMany({ where: { userLoginId }, orderBy: { createdAt: "desc" }, take: history - 1, select: { passwordHash: true } })
    : [];
  for (const hash of [login?.passwordHash, ...earlier.map((e) => e.passwordHash)]) {
    if (hash && (await verifyPassword(hash, password))) return true;
  }
  return false;
}

/** Plain words for a password used before. */
export const REUSED_WORDS = (history: number) =>
  history === 1 ? "Choose a password different from the one you have now." : `Choose a password you have not used for your last ${history} passwords.`;

/**
 * The full check for a new password of an existing login: the school's rules
 * (the strictest of its schools) and its earlier passwords. Null when it may be used.
 */
export async function newPasswordProblem(userLoginId: string, password: string): Promise<string | null> {
  const rules = await passwordRulesForLogin(userLoginId);
  const problem = passwordProblem(password, rules);
  if (problem) return problem;
  if (await isRecentPassword(userLoginId, password, rules.history)) return REUSED_WORDS(rules.history);
  return null;
}

/** Keeps the password being replaced, as its hash, so the history rule can check it later. Call before the new one is saved. */
export async function keepOldPassword(userLoginId: string, oldHash: string | null | undefined, now = new Date()) {
  if (!oldHash) return;
  await prisma.passwordHistory.create({ data: { userLoginId, passwordHash: oldHash, createdAt: now } });
}

/** Whether the login's password is older than the rules allow (counted from expiry being switched on, for older passwords). */
export function passwordExpired(login: { passwordChangedAt: Date | null; createdAt: Date }, rules: PasswordRules, now = new Date()): boolean {
  if (!rules.expiryDays) return false;
  const set = (login.passwordChangedAt ?? login.createdAt).getTime();
  const from = Math.max(set, rules.expirySince?.getTime() ?? 0);
  return now.getTime() - from >= rules.expiryDays * 86_400_000;
}

export type PasswordRulesInput = { minLength: number; history: number; expiryDays: number | null };

/** Checks a choice against the safe bounds; the database checks them again. */
export function checkPasswordRules(input: PasswordRulesInput): PasswordRulesInput {
  if (!(MIN_LENGTH_CHOICES as readonly number[]).includes(input.minLength)) throw new SettingsProblem("Choose the shortest password: from 8 to 32 characters.", "minLength");
  if (!(HISTORY_CHOICES as readonly number[]).includes(input.history)) throw new SettingsProblem("Choose how many earlier passwords may not be used again: none to 10.", "history");
  if (input.expiryDays !== null && !(EXPIRY_CHOICES as readonly number[]).includes(input.expiryDays)) throw new SettingsProblem("Choose when passwords must be changed: from 30 to 365 days, or never.", "expiryDays");
  return input;
}

/**
 * Saves the school's password rules, written in the audit log with before and
 * after. They apply the next time anyone sets a password; nobody is signed out.
 * Returns false when nothing changed.
 */
export async function savePasswordRules(tx: Tx, ctx: SchoolContext, input: PasswordRulesInput, now = new Date()): Promise<boolean> {
  const rules = checkPasswordRules(input);
  const before = await readPasswordRules(tx, ctx.schoolId);
  if (before.saved && before.minLength === rules.minLength && before.history === rules.history && before.expiryDays === rules.expiryDays) return false;
  // Switching expiry on starts the count today for passwords set earlier; changing its days keeps the start.
  const expirySince = rules.expiryDays === null ? null : before.expiryDays === null ? now : before.expirySince ?? now;
  const data = { minLength: rules.minLength, historyCount: rules.history, expiryDays: rules.expiryDays, expirySince, updatedById: ctx.userId };
  await tx.passwordPolicy.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, ...data }, update: data });
  await writeAudit(tx, ctx, {
    action: "changed-password-rules",
    recordType: "Password Policy",
    recordId: ctx.schoolId,
    before: { minLength: before.minLength, history: before.history, expiryDays: before.expiryDays },
    after: { minLength: rules.minLength, history: rules.history, expiryDays: rules.expiryDays },
  });
  return true;
}

/** "At least 10 characters, a letter and a number, not a common password; not one of your last 3." For the forms. */
export function passwordRuleWords(rules: PasswordRules, t: T = englishT): string {
  const n = rules.minLength;
  if (rules.history === 1) return t("At least {n} characters, with a letter and a number; not a common password; not the one you have now.", { n });
  if (rules.history > 1) return t("At least {n} characters, with a letter and a number; not a common password; not one of your last {count}.", { n, count: rules.history });
  return t("At least {n} characters, with a letter and a number; not a common password.", { n });
}
