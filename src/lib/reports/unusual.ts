// Unusual activity in Looking ahead (19 §2 AI signals: "odd fee changes or many
// attendance edits by one person"; gap list G25). Measured from the Audit Log,
// the record of every change, and compared with each person's own usual: their
// weekly rate over the 8 weeks before the last 2. The usual number shown is the
// one worked out, never a fixed sentence. A signal's key carries only a level
// (6 or more, 12 or more, 24 or more...), so "Not a concern" keeps it quiet until
// the number really grows. Fee changes are kept for people with the school's fees.
import "server-only";

import { UNUSUAL_FEE, type Forecast, type Ctx } from "./forecasts";
import { DAY_MS } from "../staff/dates";

/** Attendance edits: changes to a register after it was taken, after the lock, and corrections. */
export const ATTENDANCE_EDITS = [
  { recordType: "Attendance Mark", action: "attendance-changed" },
  { recordType: "Attendance Mark", action: "attendance-changed-after-lock" },
  { recordType: "Attendance Mark", action: "attendance-corrected" },
] as const;

/** Fee changes: cancelled payments, removed or adjusted dues, refunds, concessions and counter discounts given or taken off. */
export const FEE_CHANGES = [
  { recordType: "Payment", action: "cancelled" },
  { recordType: "Student Fee Due", action: "removed" },
  { recordType: "Student Fee Due", action: "adjusted" },
  { recordType: "Refund", action: "refunded" },
  { recordType: "Concession", action: "applied" },
  { recordType: "Concession", action: "taken-off" },
] as const;


/** The last this many days are compared with the 8 weeks before them. */
const RECENT_DAYS = 14;
const USUAL_WEEKS = 8;

/**
 * Is a person's count in the last 2 weeks unusual for them? At least `min`
 * changes and at least 3 times their own usual for 2 weeks (from the 8 weeks
 * before). Returns the usual per week, or null when it is not unusual.
 */
export function unusualAgainstUsual(recent: number, before8Weeks: number, min: number): { perWeek: number } | null {
  const usualTwoWeeks = before8Weeks / (USUAL_WEEKS / 2);
  if (recent < min || recent < usualTwoWeeks * 3) return null;
  return { perWeek: before8Weeks / USUAL_WEEKS };
}

/** The level in a key: 1 for 6 to 11, 2 for 12 to 23, 3 for 24 to 47... so a dismissed signal comes back only when it doubles. */
export function levelOf(n: number, min: number) {
  return Math.max(1, Math.floor(Math.log2(n / min)) + 1);
}

const usualWords = (perWeek: number, before: number) =>
  before === 0 ? "None in the 8 weeks before" : `Usually about ${perWeek < 1 ? "1 every few weeks" : `${Math.round(perWeek)} a week`} (${before} in the 8 weeks before)`;

export async function unusualForecasts(c: Ctx, now: Date): Promise<Forecast[]> {
  const recentFrom = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
  const usualFrom = new Date(recentFrom.getTime() - USUAL_WEEKS * 7 * DAY_MS);
  const count = async (pairs: readonly { recordType: string; action: string }[], from: Date, to: Date) =>
    c.tx.auditLogEntry.groupBy({ by: ["userLoginId"], where: { userLoginId: { not: null }, at: { gte: from, lt: to }, OR: pairs.map((p) => ({ recordType: p.recordType, action: p.action })) }, _count: { _all: true } });
  const [attNow, attBefore, feeNow, feeBefore, afterLock] = await Promise.all([
    count(ATTENDANCE_EDITS, recentFrom, now), count(ATTENDANCE_EDITS, usualFrom, recentFrom),
    count(FEE_CHANGES, recentFrom, now), count(FEE_CHANGES, usualFrom, recentFrom),
    count([ATTENDANCE_EDITS[1]], recentFrom, now),
  ]);
  const found: { kind: "att" | "fee"; pid: string; n: number; before: number; perWeek: number }[] = [];
  const check = (kind: "att" | "fee", recent: typeof attNow, before: typeof attNow, min: number) => {
    for (const r of recent) {
      const b = before.find((x) => x.userLoginId === r.userLoginId)?._count._all ?? 0;
      const u = unusualAgainstUsual(r._count._all, b, min);
      if (u) found.push({ kind, pid: r.userLoginId!, n: r._count._all, before: b, perWeek: u.perWeek });
    }
  };
  check("att", attNow, attBefore, 6);
  check("fee", feeNow, feeBefore, 5);
  if (!found.length) return [];
  const people = new Map((await c.tx.userLogin.findMany({ where: { id: { in: found.map((f) => f.pid) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return found.map((f): Forecast => {
    const who = people.get(f.pid) ?? "One login";
    if (f.kind === "att") {
      const locked = afterLock.find((x) => x.userLoginId === f.pid)?._count._all ?? 0;
      return {
        key: `unusual-att:${f.pid}:${levelOf(f.n, 6)}`, area: "activity", strength: "WATCH", value: f.n, score: 55, certainty: f.before > 0 ? "medium" : "low",
        title: `Unusual: ${who} changed attendance ${f.n} times in two weeks`,
        body: `${f.n} changes to registers already taken in the last 14 days${locked ? `, ${locked} of them after the lock` : ""}. ${usualWords(f.perWeek, f.before)}. There may be a good reason; a word with ${who.split(" ")[0]} may help. You decide.`,
        source: "attendance changes and corrections in the Audit Log: the last 14 days against the same person's 8 weeks before",
        href: `/settings/data-security/audit-log?person=${f.pid}&recordType=Attendance%20Mark&period=last15`, hrefLabel: "Open the changes",
      };
    }
    return {
      key: `${UNUSUAL_FEE}${f.pid}:${levelOf(f.n, 5)}`, area: "activity", strength: "WATCH", value: f.n, score: 60, certainty: f.before > 0 ? "medium" : "low",
      title: `Unusual: ${who} made ${f.n} fee changes in two weeks`,
      body: `${f.n} cancelled payments, removed or adjusted dues, refunds, concessions or counter discounts in the last 14 days. ${usualWords(f.perWeek, f.before)}. There may be a good reason; checking them in Fee Management may help. You decide.`,
      source: "fee changes in the Audit Log: the last 14 days against the same person's 8 weeks before",
      href: `/settings/data-security/audit-log?person=${f.pid}&period=last15`, hrefLabel: "Open the changes",
    };
  });
}
