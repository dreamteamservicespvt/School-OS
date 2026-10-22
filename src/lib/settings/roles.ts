// Roles (Settings, Users & Permissions): the ten ready roles, the role
// templates the school can switch on, and the school's own roles. Every
// change is audited and every School Admin is alerted.
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MODULES, type ModuleKey } from "../modules";
import type { AccessLevel, RolePermissions } from "../roles";
import { SettingsProblem, actorName, alertPermissionChange } from "./common";

import { cleanPermissions, permissionChanges } from "./role-words";
import { schoolRole, schoolRoles } from "../school-roles";
import { isSensitiveLevel, levelsForRole, mostForRole, SENSITIVE_WORDS, type SensitiveLevel } from "../sensitive";
export { LEVELS, cleanPermissions, permissionChanges } from "./role-words";

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

export type RoleInput = {
  name: string; permissions: Record<string, unknown>; requiresTwoStep: boolean; copyFromId?: string | null;
  /** Sensitive fields the role may see; null: as before (module by module); undefined: unchanged. */
  sensitiveFields?: SensitiveLevel | null;
};

/** A level within what 05-roles.md allows this role (src/lib/sensitive.ts), or a plain-words refusal. */
function checkSensitive(role: { key: string | null; kind: string; name: string }, level: SensitiveLevel | null | undefined) {
  if (level === undefined || level === null) return level;
  if (!isSensitiveLevel(level)) throw new SettingsProblem("Choose which sensitive fields this role may see.", "sensitiveFields");
  if (!levelsForRole(role).includes(level)) {
    throw new SettingsProblem(`The ${role.name} role can see at most ${SENSITIVE_WORDS[mostForRole(role)].label.toLowerCase()} fields.`, "sensitiveFields");
  }
  return level;
}

/** "Sensitive fields: Restricted" or "as before", for alerts. */
const sensitiveName = (level: string | null) => (level && isSensitiveLevel(level) ? SENSITIVE_WORDS[level].label.toLowerCase() : "as set for each module");

/** Creates a school's own role, usually by copying an existing one. */
export async function createRole(tx: Tx, ctx: SchoolContext, input: RoleInput) {
  const name = checkName(input.name);
  await nameFree(tx, ctx.schoolId, name);
  const permissions = cleanPermissions(input.permissions);
  const from = input.copyFromId ? await schoolRole(tx, ctx, { where: { id: input.copyFromId } }) : null;
  const sensitiveFields = checkSensitive({ key: null, kind: "CUSTOM", name }, input.sensitiveFields) ?? null;
  const role = await tx.role.create({
    // A key lets approval rules and approvals name the role, like the ready roles.
    data: { schoolId: ctx.schoolId, key: `custom-${randomUUID().slice(0, 8)}`, name, kind: "CUSTOM", isEnabled: true, requiresTwoStep: input.requiresTwoStep, sensitiveFields, permissions },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Role", recordId: role.id, after: { name, permissions, requiresTwoStep: input.requiresTwoStep, sensitiveFields, copiedFrom: from?.name ?? null } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} created the role ${name}${from ? ` by copying ${from.name}` : ""}.`, `/settings/users/roles/${role.id}`);
  return role;
}

/** Saves a role's permissions. Returns the audit entry, which Undo puts back. */
export async function updateRole(tx: Tx, ctx: SchoolContext, roleId: string, input: RoleInput) {
  const role = await schoolRole(tx, ctx, { where: { id: roleId } });
  if (!role || role.archivedAt) throw new SettingsProblem("This role was not found. It may have been archived.");
  const name = role.kind === "CUSTOM" ? checkName(input.name) : role.name;
  if (name !== role.name) await nameFree(tx, ctx.schoolId, name, role.id);
  const permissions = cleanPermissions(input.permissions);
  guardSchoolAdmin(role, permissions);
  const before = role.permissions as RolePermissions;
  const changes = permissionChanges(name, before, permissions);
  const twoStepChanged = role.requiresTwoStep !== input.requiresTwoStep;
  const sensitiveFields = input.sensitiveFields === undefined ? role.sensitiveFields : checkSensitive(role, input.sensitiveFields) ?? null;
  const sensitiveChanged = sensitiveFields !== role.sensitiveFields;
  if (changes.length === 0 && name === role.name && !twoStepChanged && !sensitiveChanged) return null;

  await tx.role.update({ where: { id: role.id }, data: { name, permissions, requiresTwoStep: input.requiresTwoStep, sensitiveFields } });
  const entry = await writeAudit(tx, ctx, {
    action: "changed-permissions",
    recordType: "Role",
    recordId: role.id,
    before: { name: role.name, permissions: before, requiresTwoStep: role.requiresTwoStep, sensitiveFields: role.sensitiveFields } as Prisma.InputJsonValue,
    after: { name, permissions, requiresTwoStep: input.requiresTwoStep, sensitiveFields } as Prisma.InputJsonValue,
  });
  const who = await actorName(tx, ctx);
  const words = [...changes];
  if (twoStepChanged) words.push(`${name} role ${input.requiresTwoStep ? "now needs" : "no longer needs"} two-step login`);
  if (sensitiveChanged) words.push(`${name} role now sees sensitive fields: ${sensitiveName(sensitiveFields)}`);
  if (name !== role.name) words.unshift(`${role.name} role is now called ${name}`);
  await alertPermissionChange(tx, ctx, `${who} changed a role: ${words.slice(0, 3).join("; ")}${words.length > 3 ? `; and ${words.length - 3} more` : ""}.`, `/settings/users/roles/${role.id}`);
  return entry;
}

/** Puts a role back as it was before one change (Undo from the role history). */
export async function restoreRoleVersion(tx: Tx, ctx: SchoolContext, auditEntryId: string) {
  const entry = await tx.auditLogEntry.findUnique({ where: { id: auditEntryId } });
  if (!entry || entry.recordType !== "Role" || entry.action !== "changed-permissions" || !entry.recordId) throw new SettingsProblem("This change cannot be put back.");
  const before = entry.before as { name: string; permissions: RolePermissions; requiresTwoStep: boolean; sensitiveFields?: string | null };
  // Entries from before sensitive fields were kept leave them as they are now.
  const sensitiveFields = before.sensitiveFields === undefined ? undefined : isSensitiveLevel(before.sensitiveFields) ? before.sensitiveFields : null;
  return updateRole(tx, ctx, entry.recordId, { name: before.name, permissions: before.permissions, requiresTwoStep: before.requiresTwoStep, sensitiveFields });
}

/** Archives a school's own role. Ready roles and templates cannot be archived; a role in use cannot either. */
export async function archiveRole(tx: Tx, ctx: SchoolContext, roleId: string) {
  const role = await schoolRole(tx, ctx, { where: { id: roleId } });
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
  const role = await schoolRole(tx, ctx, { where: { id: roleId } });
  if (!role || !role.archivedAt) throw new SettingsProblem("This role is not archived.");
  await tx.role.update({ where: { id: role.id }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Role", recordId: role.id, after: { name: role.name } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} restored the role ${role.name}.`, `/settings/users/roles/${role.id}`);
  return role;
}

/** Switches a role template on or off. A template in use cannot be switched off. */
export async function setTemplateOn(tx: Tx, ctx: SchoolContext, roleId: string, on: boolean) {
  const role = await schoolRole(tx, ctx, { where: { id: roleId } });
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

/** One line about what a role reaches, for role pickers: "Full: Fee Management · View: …". */
export function roleAbout(permissions: Partial<Record<ModuleKey, AccessLevel>>): string {
  const mods = roleModules(permissions);
  if (mods.length === MODULES.length && mods.every((m) => permissions[m.key] === "full")) return "Everything, in every module.";
  const by = (level: AccessLevel) => mods.filter((m) => permissions[m.key] === level && m.key !== "dashboard").map((m) => m.name);
  const parts = [["Full", by("full")], ["View", by("view")], ["Own", by("own")]] as const;
  const words = parts
    .filter(([, list]) => list.length)
    .map(([l, list]) => `${l}: ${list.length > 3 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.join(", ")}`);
  return words.join(" · ") || "Only the Dashboard.";
}

/** Roles a person can be given now: not archived, and templates only when switched on. */
export async function assignableRoles(tx: Tx, ctx: SchoolContext) {
  const roles = await schoolRoles(tx, ctx, { where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return roles
    .filter((r) => r.kind !== "TEMPLATE" || r.isEnabled)
    .map((r) => ({ id: r.id, key: r.key, name: r.name, kind: r.kind as string, twoStep: r.requiresTwoStep, about: roleAbout(r.permissions as Partial<RolePermissions>) }));
}
