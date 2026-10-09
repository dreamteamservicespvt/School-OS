// Roles (Settings, Users & Permissions): the ten ready roles, the role
// templates the school can switch on, and the school's own roles. Every
// change is audited and every School Admin is alerted.
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MODULES, MODULE_KEYS, type ModuleKey } from "../modules";
import type { AccessLevel, RolePermissions } from "../roles";
import { SettingsProblem, actorName, alertPermissionChange } from "./common";

export const LEVELS: { value: AccessLevel; label: string; words: string }[] = [
  { value: "full", label: "Full", words: "can see and change everything" },
  { value: "view", label: "View", words: "can see but not change" },
  { value: "own", label: "Own", words: "only their own classes or records" },
  { value: "none", label: "None", words: "no access" },
];

/** Cleans a submitted permission grid: every module gets a known level. */
export function cleanPermissions(input: Record<string, unknown>): RolePermissions {
  return Object.fromEntries(
    MODULE_KEYS.map((k) => {
      const v = input[k];
      return [k, v === "full" || v === "view" || v === "own" ? v : "none"];
    }),
  ) as RolePermissions;
}

const moduleName = (k: string) => MODULES.find((m) => m.key === k)?.name ?? k;

/**
 * The changes in plain words, for the confirmation and the alert:
 * "Teacher role can now see Salary Management".
 */
export function permissionChanges(roleName: string, before: Partial<RolePermissions>, after: Partial<RolePermissions>): string[] {
  const out: string[] = [];
  for (const k of MODULE_KEYS) {
    const a = before[k] ?? "none";
    const b = after[k] ?? "none";
    if (a === b) continue;
    const name = moduleName(k);
    if (b === "none") out.push(`${roleName} role can no longer open ${name}`);
    else if (a === "none") out.push(`${roleName} role can now ${b === "full" ? "see and change everything in" : b === "view" ? "see" : "see their own records in"} ${name}`);
    else if (b === "full") out.push(`${roleName} role can now change everything in ${name}`);
    else if (b === "view") out.push(`${roleName} role can now only see ${name}, not change it`);
    else out.push(`${roleName} role now sees only their own records in ${name}`);
  }
  return out;
}

/** How many people hold each role right now (live School Access only). */
export async function roleUsage(tx: Tx, schoolId: string): Promise<Map<string, number>> {
  const rows = await tx.schoolAccessRole.findMany({
    where: { schoolId, schoolAccess: { archivedAt: null } },
    select: { roleId: true, schoolAccess: { select: { userLoginId: true } } },
  });
  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!sets.has(r.roleId)) sets.set(r.roleId, new Set());
    sets.get(r.roleId)!.add(r.schoolAccess.userLoginId);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

function checkName(name: string) {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) throw new SettingsProblem("Role name is needed.", "name");
  if (n.length > 60) throw new SettingsProblem("Role name can be at most 60 characters.", "name");
  return n;
}

async function nameFree(tx: Tx, schoolId: string, name: string, exceptId?: string) {
  const clash = await tx.role.findFirst({ where: { schoolId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) {
    throw new SettingsProblem(
      clash.archivedAt ? `An archived role is called "${clash.name}". Restore it from the Archived roles, or use a different name.` : `There is already a role called "${clash.name}". Use a different name.`,
      "name",
    );
  }
}

/** The School Admin role must keep full Settings, so nobody is locked out of Settings. */
function guardSchoolAdmin(role: { key: string | null }, permissions: RolePermissions) {
  if (role.key === "school-admin" && permissions.settings !== "full") {
    throw new SettingsProblem("The School Admin role must keep Full access to Settings, so someone can always manage logins and roles.", "settings");
  }
}

export type RoleInput = { name: string; permissions: Record<string, unknown>; requiresTwoStep: boolean; copyFromId?: string | null };

/** Creates a school's own role, usually by copying an existing one. */
export async function createRole(tx: Tx, ctx: SchoolContext, input: RoleInput) {
  const name = checkName(input.name);
  await nameFree(tx, ctx.schoolId, name);
  const permissions = cleanPermissions(input.permissions);
  const from = input.copyFromId ? await tx.role.findUnique({ where: { id: input.copyFromId } }) : null;
  const role = await tx.role.create({
    // A key lets approval rules and approvals name the role, like the ready roles.
    data: { schoolId: ctx.schoolId, key: `custom-${randomUUID().slice(0, 8)}`, name, kind: "CUSTOM", isEnabled: true, requiresTwoStep: input.requiresTwoStep, permissions },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Role", recordId: role.id, after: { name, permissions, requiresTwoStep: input.requiresTwoStep, copiedFrom: from?.name ?? null } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} created the role ${name}${from ? ` by copying ${from.name}` : ""}.`, `/settings/users/roles/${role.id}`);
  return role;
}

/** Saves a role's permissions. Returns the audit entry, which Undo puts back. */
export async function updateRole(tx: Tx, ctx: SchoolContext, roleId: string, input: RoleInput) {
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role || role.archivedAt) throw new SettingsProblem("This role was not found. It may have been archived.");
  const name = role.kind === "CUSTOM" ? checkName(input.name) : role.name;
  if (name !== role.name) await nameFree(tx, ctx.schoolId, name, role.id);
  const permissions = cleanPermissions(input.permissions);
  guardSchoolAdmin(role, permissions);
  const before = role.permissions as RolePermissions;
  const changes = permissionChanges(name, before, permissions);
  const twoStepChanged = role.requiresTwoStep !== input.requiresTwoStep;
  if (changes.length === 0 && name === role.name && !twoStepChanged) return null;

  await tx.role.update({ where: { id: role.id }, data: { name, permissions, requiresTwoStep: input.requiresTwoStep } });
  const entry = await writeAudit(tx, ctx, {
    action: "changed-permissions",
    recordType: "Role",
    recordId: role.id,
    before: { name: role.name, permissions: before, requiresTwoStep: role.requiresTwoStep } as Prisma.InputJsonValue,
    after: { name, permissions, requiresTwoStep: input.requiresTwoStep } as Prisma.InputJsonValue,
  });
  const who = await actorName(tx, ctx);
  const words = [...changes];
  if (twoStepChanged) words.push(`${name} role ${input.requiresTwoStep ? "now needs" : "no longer needs"} two-step login`);
  if (name !== role.name) words.unshift(`${role.name} role is now called ${name}`);
  await alertPermissionChange(tx, ctx, `${who} changed a role: ${words.slice(0, 3).join("; ")}${words.length > 3 ? `; and ${words.length - 3} more` : ""}.`, `/settings/users/roles/${role.id}`);
  return entry;
}

/** Puts a role back as it was before one change (Undo from the role history). */
export async function restoreRoleVersion(tx: Tx, ctx: SchoolContext, auditEntryId: string) {
  const entry = await tx.auditLogEntry.findUnique({ where: { id: auditEntryId } });
  if (!entry || entry.recordType !== "Role" || entry.action !== "changed-permissions" || !entry.recordId) throw new SettingsProblem("This change cannot be put back.");
  const before = entry.before as { name: string; permissions: RolePermissions; requiresTwoStep: boolean };
  return updateRole(tx, ctx, entry.recordId, { name: before.name, permissions: before.permissions, requiresTwoStep: before.requiresTwoStep });
}

/** Archives a school's own role. Ready roles and templates cannot be archived; a role in use cannot either. */
export async function archiveRole(tx: Tx, ctx: SchoolContext, roleId: string) {
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role || role.archivedAt) throw new SettingsProblem("This role was not found. It may already be archived.");
  if (role.kind !== "CUSTOM") throw new SettingsProblem(`${role.name} is a ${role.kind === "READY" ? "ready role" : "role template"} and cannot be archived. ${role.kind === "TEMPLATE" ? "Switch it off instead." : "Change its permissions instead."}`);
  const used = (await roleUsage(tx, ctx.schoolId)).get(role.id) ?? 0;
  if (used > 0) throw new SettingsProblem(`${used} ${used === 1 ? "person has" : "people have"} the ${role.name} role. Give them another role first, then archive it.`);
  await tx.role.update({ where: { id: role.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Role", recordId: role.id, before: { name: role.name } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} archived the role ${role.name}.`, "/settings/users/roles");
  return role;
}

export async function restoreRole(tx: Tx, ctx: SchoolContext, roleId: string) {
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role || !role.archivedAt) throw new SettingsProblem("This role is not archived.");
  await tx.role.update({ where: { id: role.id }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Role", recordId: role.id, after: { name: role.name } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} restored the role ${role.name}.`, `/settings/users/roles/${role.id}`);
  return role;
}

/** Switches a role template on or off. A template in use cannot be switched off. */
export async function setTemplateOn(tx: Tx, ctx: SchoolContext, roleId: string, on: boolean) {
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role || role.archivedAt) throw new SettingsProblem("This role was not found.");
  if (role.kind !== "TEMPLATE") throw new SettingsProblem(`${role.name} is not a role template, so it is always on.`);
  if (role.isEnabled === on) return role;
  if (!on) {
    const used = (await roleUsage(tx, ctx.schoolId)).get(role.id) ?? 0;
    if (used > 0) throw new SettingsProblem(`${used} ${used === 1 ? "person has" : "people have"} the ${role.name} role. Give them another role first, then switch it off.`);
  }
  await tx.role.update({ where: { id: role.id }, data: { isEnabled: on } });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "Role", recordId: role.id, before: { isEnabled: role.isEnabled }, after: { isEnabled: on } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} switched ${on ? "on" : "off"} the ${role.name} role.`, `/settings/users/roles/${role.id}`);
  return role;
}

/** Modules where a role's level is not "none", in menu order, for short summaries. */
export function roleModules(permissions: Partial<Record<ModuleKey, AccessLevel>>) {
  return MODULES.filter((m) => (permissions[m.key] ?? "none") !== "none");
}
