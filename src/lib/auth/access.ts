// What a signed-in person can open: their schools, and their roles and
// permissions in the chosen school.

import { readPreferences } from "../settings/profile-rules";
import { aiRolesOf } from "../settings/switch-rules";
import { withSchool, withUser } from "../db";
import { applyExceptions, combineRoles, narrowToOwn, type PermissionMap } from "../permissions";
import { MODULES, type ModuleKey } from "../modules";
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

/**
 * Whether this login still opens a school other than `exceptSchoolId`. Inside a
 * school the database hides the person's other schools, so this reads through
 * withUser(), as sign-in does. It sees committed rows only: ask about the other
 * schools, never the one being changed in the open transaction.
 */
export async function worksElsewhere(userLoginId: string, exceptSchoolId: string): Promise<boolean> {
  return (await schoolsFor(userLoginId)).some((s) => s.id !== exceptSchoolId);
}

export type SchoolAccessView = {
  school: { id: string; name: string; code: string; logoUrl: string | null; timeZone: string; accent: string | null; weekStart: "monday" | "sunday"; languages: string[]; defaultLanguage: string };
  /** Set by DREAM TEAM in the console. Suspended or Closed: the school is paused (see /paused). */
  schoolStatus: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  /** Each role with its own levels (the Settings copy of 05-roles.md), for who does the desk work (src/lib/duty.ts). */
  roles: { key: string | null; name: string; permissions?: RolePermissions }[];
  permissions: PermissionMap;
  modulesOn: Set<ModuleKey>;
  features: Set<string>;
  /** Roles the school chose for the AI assistant (Settings, Modules On/Off); every AI check reads it (aiAllowed). */
  aiRoles: string[];
  /** Scope of the person's access here (Settings, Users & Permissions): the widest of their access rows. */
  scope: "WHOLE_SCHOOL" | "CAMPUS" | "CHOSEN_CLASSES" | "OWN";
  /** The campus their access is limited to, when the scope is one campus. */
  campusId: string | null;
};

/**
 * What a DREAM TEAM support person may open inside a school while its Support
 * Access Request is allowed (07-super-admin.md §3.4): every page of every
 * module the school has switched on, as the school's own leaders see it, to
 * look. They hold no role, so every detail kept for named roles stays hidden
 * (Aadhaar and other ID numbers, counselling notes, private notes), and they
 * never see Salary Management. Nothing can be changed, exported, printed or
 * cancelled: requireAction() in src/lib/current.ts refuses it, and src/proxy.ts
 * refuses every request from their browser that is not a page.
 */
export const SUPPORT_PERMISSIONS: PermissionMap = Object.fromEntries(
  MODULES.map((m) => [m.key, m.key === "salary-management" ? { see: "none", change: "none" } : { see: "all", change: "all" }]),
) as PermissionMap;

/** The school as a support person sees it: its details, modules and features, with SUPPORT_PERMISSIONS and no roles. */
export async function supportAccessView(schoolId: string): Promise<SchoolAccessView | null> {
  return withSchool({ schoolId, userId: null }, async (tx) => {
    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, logoUrl: true, timeZone: true, archivedAt: true, preferences: true, status: true, languages: true, defaultLanguage: true },
    });
    if (!school || school.archivedAt) return null;
    const [modules, features] = await Promise.all([
      tx.schoolModule.findMany({ where: { schoolId, isOn: true } }),
      tx.schoolFeature.findMany({ where: { schoolId, isOn: true } }),
    ]);
    return {
      school: { id: school.id, name: school.name, code: school.code, logoUrl: school.logoUrl, timeZone: school.timeZone, accent: readPreferences(school.preferences).schoolAccent ?? null, weekStart: readPreferences(school.preferences).weekStart === "sunday" ? "sunday" : "monday", languages: school.languages, defaultLanguage: school.defaultLanguage },
      schoolStatus: school.status,
      roles: [],
      permissions: SUPPORT_PERMISSIONS,
      scope: "WHOLE_SCHOOL",
      campusId: null,
      modulesOn: new Set(modules.map((m) => m.moduleKey as ModuleKey)),
      features: new Set(features.map((f) => f.featureKey)),
      // A support person holds no role, so no AI is offered to them.
      aiRoles: [],
    };
  });
}

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
      select: { id: true, name: true, code: true, logoUrl: true, timeZone: true, archivedAt: true, preferences: true, status: true, languages: true, defaultLanguage: true },
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
      school: { id: school.id, name: school.name, code: school.code, logoUrl: school.logoUrl, timeZone: school.timeZone, accent: readPreferences(school.preferences).schoolAccent ?? null, weekStart: readPreferences(school.preferences).weekStart === "sunday" ? "sunday" : "monday", languages: school.languages, defaultLanguage: school.defaultLanguage },
      schoolStatus: school.status,
      roles: roles.map((r) => ({ key: r.key, name: r.name, permissions: r.permissions as RolePermissions })),
      permissions: applyExceptions(
        scope === "OWN" ? narrowToOwn(combined) : combined,
        accesses.map((a) => a.exceptions as Record<string, AccessLevel>),
      ),
      scope,
      campusId: scope === "CAMPUS" ? accesses.find((a) => a.scope === "CAMPUS")?.campusId ?? null : null,
      modulesOn: new Set(modules.map((m) => m.moduleKey as ModuleKey)),
      features: new Set(features.map((f) => f.featureKey)),
      aiRoles: aiRolesOf(readPreferences(school.preferences)),
    };
  });
}
