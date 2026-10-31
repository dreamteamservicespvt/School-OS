// What a login given from Staff & HR may hold (security audit run-2, lead L5;
// owner decision taken overnight as the safest choice, to confirm). Staff & HR
// gives logins to the staff it adds (09 Add Staff step 2), but School Admin and
// Principal logins are made in Settings, Users & Permissions ("admins directly
// here", 20-settings.md). So someone who cannot change Settings, Users &
// Permissions (Settings "edit") may not, from Staff & HR or a staff import:
//   - give the School Admin or Principal role, or any role that opens Settings;
//   - give a personal exception for Settings, or one above what they hold
//     themselves in that module;
//   - make a new sign-in link ("Reset password") for a login that holds one of
//     those roles they do not hold themselves;
//   - record the exit of a login that holds one of those roles or a Settings
//     exception, which closes that login on the last working day (run-3).
// Someone with Settings "edit" (the School Admin, the Principal) is not limited
// here, and Settings, Users & Permissions works as before.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { ModuleKey } from "../modules";
import { applyExceptions, combineRoles, narrowToOwn, type PermissionMap, type Reach } from "../permissions";
import type { AccessLevel, RolePermissions } from "../roles";

export const LOGIN_CEILING_WORDS = {
  role: "Only someone who can change Settings, Users & Permissions can give the School Admin or Principal role. Ask your School Admin.",
  settings: "Only someone who can change Settings, Users & Permissions can give access to Settings. Ask your School Admin.",
  above: "You can give a login only the access you have yourself. Ask your School Admin for more in Settings, Users & Permissions.",
  link: "Only someone who can change Settings, Users & Permissions can make a sign-in link for a School Admin or Principal login.",
  // Security audit run-3: recording an exit closes the leaver's login on the last working day.
  exit: "Only someone who can change Settings, Users & Permissions can record the exit of a School Admin, a Principal or anyone with access to Settings. Ask your School Admin.",
} as const;

/** Roles that only Settings, Users & Permissions gives. */
const TOP_ROLES = new Set(["school-admin", "principal"]);
const REACH: Record<Reach, number> = { none: 0, own: 1, all: 2 };
const LEVEL: Record<AccessLevel, { see: Reach; change: Reach }> = {
  full: { see: "all", change: "all" },
  view: { see: "all", change: "none" },
  own: { see: "own", change: "own" },
  none: { see: "none", change: "none" },
};

type Granter = { permissions: PermissionMap; roleKeys: string[] };
type RoleLike = { key: string | null; permissions: unknown };

/** The person giving the login: their roles and what they may do in this school, read in the same transaction. */
export async function granterOf(tx: Tx, ctx: SchoolContext): Promise<Granter> {
  const accesses = ctx.userId
    ? await tx.schoolAccess.findMany({ where: { userLoginId: ctx.userId, schoolId: ctx.schoolId, archivedAt: null }, include: { roles: { include: { role: true } } } })
    : [];
  const roles = accesses.flatMap((a) => a.roles.map((r) => r.role)).filter((r) => r.isEnabled && !r.archivedAt);
  const combined = combineRoles(roles.map((r) => r.permissions as RolePermissions));
  const own = accesses.length > 0 && accesses.every((a) => a.scope === "OWN");
  return {
    permissions: applyExceptions(own ? narrowToOwn(combined) : combined, accesses.map((a) => a.exceptions as Record<string, AccessLevel>)),
    roleKeys: roles.map((r) => r.key).filter((k): k is string => Boolean(k)),
  };
}

/** Can this person change Settings, Users & Permissions? Then nothing here limits them. */
export const managesUsers = (g: { permissions: PermissionMap }) => g.permissions.settings?.change === "all";

/** A role that only Settings, Users & Permissions gives: School Admin, Principal, or any role that opens Settings. */
export function isTopRole(role: RoleLike) {
  const settings = (role.permissions as Partial<RolePermissions> | null)?.settings ?? "none";
  return (role.key !== null && TOP_ROLES.has(role.key)) || settings !== "none";
}

/** Why this person may not give this login these roles and exceptions, in plain words; null when they may. */
export function loginGrantRefusal(g: Granter, roles: RoleLike[], exceptions: Record<string, AccessLevel>): { message: string; field: string } | null {
  if (managesUsers(g)) return null;
  if (roles.some(isTopRole)) return { message: LOGIN_CEILING_WORDS.role, field: "roleKeys" };
  for (const [key, level] of Object.entries(exceptions)) {
    const wanted = LEVEL[level];
    if (!wanted || level === "none") continue;
    if (key === "settings") return { message: LOGIN_CEILING_WORDS.settings, field: `perm:${key}` };
    const mine = g.permissions[key as ModuleKey] ?? { see: "none", change: "none" };
    if (REACH[wanted.see] > REACH[mine.see] || REACH[wanted.change] > REACH[mine.change]) return { message: LOGIN_CEILING_WORDS.above, field: `perm:${key}` };
  }
  return null;
}

/** Why this person may not make a new sign-in link for a login holding these roles; null when they may. */
export function signInLinkRefusal(g: Granter, targetRoles: RoleLike[]): string | null {
  if (managesUsers(g)) return null;
  const mine = new Set(g.roleKeys);
  return targetRoles.some((r) => isTopRole(r) && !(r.key && mine.has(r.key))) ? LOGIN_CEILING_WORDS.link : null;
}

/** The roles and personal exceptions a login holds in this school (its live access here), read in the same transaction. */
export async function heldHere(tx: Tx, ctx: SchoolContext, userLoginId: string): Promise<{ roles: RoleLike[]; exceptions: Record<string, AccessLevel>[] }> {
  const accesses = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, userLoginId, archivedAt: null },
    select: { exceptions: true, roles: { select: { role: { select: { key: true, permissions: true } } } } },
  });
  return { roles: accesses.flatMap((a) => a.roles.map((r) => r.role)), exceptions: accesses.map((a) => (a.exceptions ?? {}) as Record<string, AccessLevel>) };
}

/** A personal exception that opens Settings, given in Settings, Users & Permissions. */
const opensSettings = (exceptions: Record<string, AccessLevel>[]) => exceptions.some((ex) => Boolean(ex?.settings) && ex.settings !== "none");

/** Why this person may not record the exit of a login holding these, which closes it; null when they may. */
export function exitRefusal(g: Granter, held: { roles: RoleLike[]; exceptions: Record<string, AccessLevel>[] }): string | null {
  if (managesUsers(g)) return null;
  return held.roles.some(isTopRole) || opensSettings(held.exceptions) ? LOGIN_CEILING_WORDS.exit : null;
}
