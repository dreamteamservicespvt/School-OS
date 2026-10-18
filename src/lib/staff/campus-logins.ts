// One campus (src/lib/campus.ts) for work that has no Current: imports, and
// the notices Staff & HR sends to HR, approvers and salary staff. A login
// limited to one campus hears only about that campus's staff.
import "server-only";

import type { SchoolContext, Tx } from "../db";

/**
 * The campus each login is limited to, by the same rule as accessIn
 * (src/lib/auth/access.ts): set only when their widest School Access is "One
 * campus"; null for the whole school.
 */
export async function campusLimitsOf(tx: Tx, ctx: SchoolContext, logins: string[]): Promise<Map<string, string | null>> {
  const ORDER = ["OWN", "CHOSEN_CLASSES", "CAMPUS", "WHOLE_SCHOOL"];
  const rows = logins.length ? await tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, userLoginId: { in: logins }, archivedAt: null }, select: { userLoginId: true, scope: true, campusId: true } }) : [];
  const out = new Map<string, string | null>();
  for (const login of logins) {
    const mine = rows.filter((r) => r.userLoginId === login);
    const scope = mine.map((r) => r.scope).sort((x, y) => ORDER.indexOf(y) - ORDER.indexOf(x))[0];
    out.set(login, scope === "CAMPUS" ? mine.find((r) => r.scope === "CAMPUS")?.campusId ?? null : null);
  }
  return out;
}

/** The logins that may hear about a staff member of this campus: the whole school's, and those limited to this campus. */
export async function loginsForCampus(tx: Tx, ctx: SchoolContext, logins: string[], campusId: string): Promise<string[]> {
  const limits = await campusLimitsOf(tx, ctx, logins);
  return logins.filter((l) => !limits.get(l) || limits.get(l) === campusId);
}

/** The campus the signed-in person (ctx.userId) is limited to, or null for the whole school. */
export async function campusLimitOf(tx: Tx, ctx: SchoolContext): Promise<string | null> {
  return ctx.userId ? (await campusLimitsOf(tx, ctx, [ctx.userId])).get(ctx.userId) ?? null : null;
}
