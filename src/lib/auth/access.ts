// What a signed-in person can open: their schools, and their roles and
// permissions in the chosen school.

import { withSchool, withUser } from "../db";
import { applyExceptions, combineRoles, narrowToOwn, type PermissionMap } from "../permissions";
import type { ModuleKey } from "../modules";
import type { AccessLevel, RolePermissions } from "../roles";

export type SchoolChoice = { id: string; name: string; code: string; logoUrl: string | null };

/** The schools this login has School Access to, oldest access first. */
export async function schoolsFor(userLoginId: string): Promise<SchoolChoice[]> {
  return withUser(userLoginId, async (tx) => {
    const accesses = await tx.schoolAccess.findMany({
      where: { userLoginId, archivedAt: null, school: { archivedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { school: { select: { id: true, name: true, code: true, logoUrl: true } } },
    });
    const seen = new Map<string, SchoolChoice>();
    for (const a of accesses) seen.set(a.school.id, a.school);
    return [...seen.values()];
  });
}

export type SchoolAccessView = {
  school: { id: string; name: string; code: string; logoUrl: string | null; timeZone: string };
  roles: { key: string | null; name: string }[];
  permissions: PermissionMap;
  modulesOn: Set<ModuleKey>;
  features: Set<string>;
  /** Scope of the person's access here (Settings, Users & Permissions): the widest of their access rows. */
  scope: "WHOLE_SCHOOL" | "CAMPUS" | "CHOSEN_CLASSES" | "OWN";
  /** The campus their access is limited to, when the scope is one campus. */
  campusId: string | null;
};

/** The person's roles and permissions in one school, or null if they have no access there. */
export async function accessIn(userLoginId: string, schoolId: string): Promise<SchoolAccessView | null> {
  return withSchool({ schoolId, userId: userLoginId }, async (tx) => {
    const accesses = await tx.schoolAccess.findMany({
      where: { userLoginId, schoolId, archivedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (accesses.length === 0) return null;
    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, logoUrl: true, timeZone: true, archivedAt: true },
    });
    if (!school || school.archivedAt) return null;

    const roles = accesses
      .flatMap((a) => a.roles.map((r) => r.role))
      .filter((r) => r.isEnabled && !r.archivedAt);
    const [modules, features] = await Promise.all([
      tx.schoolModule.findMany({ where: { schoolId, isOn: true } }),
      tx.schoolFeature.findMany({ where: { schoolId, isOn: true } }),
    ]);
    const ORDER = ["OWN", "CHOSEN_CLASSES", "CAMPUS", "WHOLE_SCHOOL"] as const;
    const scope = accesses.map((a) => a.scope).sort((x, y) => ORDER.indexOf(y) - ORDER.indexOf(x))[0];
    const combined = combineRoles(roles.map((r) => r.permissions as RolePermissions));
    return {
      school: { id: school.id, name: school.name, code: school.code, logoUrl: school.logoUrl, timeZone: school.timeZone },
      roles: roles.map((r) => ({ key: r.key, name: r.name })),
      permissions: applyExceptions(
        scope === "OWN" ? narrowToOwn(combined) : combined,
        accesses.map((a) => a.exceptions as Record<string, AccessLevel>),
      ),
      scope,
      campusId: scope === "CAMPUS" ? accesses.find((a) => a.scope === "CAMPUS")?.campusId ?? null : null,
      modulesOn: new Set(modules.map((m) => m.moduleKey as ModuleKey)),
      features: new Set(features.map((f) => f.featureKey)),
    };
  });
}
