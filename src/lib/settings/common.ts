// Shared pieces of Settings: the error a person can act on, and the
// permission change alert every School Admin gets (Users & Permissions).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { notify } from "../notifications";

/** A rule stopped the change. The message says what to do, in plain words. */
export class SettingsProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "SettingsProblem";
  }
}

/** Live School Admins of this school: active logins with an enabled School Admin role. */
export async function activeSchoolAdminIds(tx: Tx, schoolId: string): Promise<string[]> {
  const rows = await tx.schoolAccess.findMany({
    where: {
      schoolId,
      archivedAt: null,
      userLogin: { status: "ACTIVE", archivedAt: null },
      roles: { some: { role: { key: "school-admin", isEnabled: true, archivedAt: null } } },
    },
    select: { userLoginId: true },
  });
  return [...new Set(rows.map((r) => r.userLoginId))];
}

/** Display names for logins, by id. User Login is not a school record, so this reads it directly. */
export async function loginNames(tx: Tx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (clean.length === 0) return new Map();
  const rows = await tx.userLogin.findMany({ where: { id: { in: clean } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

/**
 * Permission change alert (Users & Permissions): every School Admin is told
 * who changed what for whom, and so is the person whose access changed. It
 * cannot be switched off (type "security"). The person making the change is
 * not told about their own change.
 */
export async function alertPermissionChange(tx: Tx, ctx: SchoolContext, text: string, link: string, personId?: string | null) {
  const admins = await activeSchoolAdminIds(tx, ctx.schoolId);
  const to = new Set(admins);
  if (personId) to.add(personId);
  for (const id of to) {
    await notify(tx, ctx, { to: id, type: "security", text, link: id === personId && !admins.includes(id) ? "/profile" : link });
  }
}

/** The name of the person doing the work, for alert texts. */
export async function actorName(tx: Tx, ctx: SchoolContext) {
  if (!ctx.userId) return "School OS";
  const u = await tx.userLogin.findUnique({ where: { id: ctx.userId }, select: { displayName: true } });
  return u?.displayName ?? "Someone";
}
