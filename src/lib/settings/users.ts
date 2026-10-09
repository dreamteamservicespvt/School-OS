// Logins of a school (Settings, Users & Permissions): invite, roles and
// scope, exceptions, disable and enable, two-step reset, and which Staff or
// Student record a login belongs to.
//
// School Access rows are never deleted. When a person's roles change, the old
// row is archived and a new one made, so the history of who had which role
// stays in the database. A person is "Disabled" in this school when their
// login is switched off, or when they have no live School Access here.
import "server-only";

import type { AccessScope, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { hashToken, newToken } from "../auth/tokens";
import { INVITE_VALID_MS } from "../auth/invites";
import { MODULE_KEYS, MODULES } from "../modules";
import type { AccessLevel } from "../roles";
import { SettingsProblem, activeSchoolAdminIds, actorName, alertPermissionChange } from "./common";

export const SCOPES: { value: AccessScope; label: string; help: string }[] = [
  { value: "WHOLE_SCHOOL", label: "Whole school", help: "Every record their roles allow, in every campus." },
  { value: "CAMPUS", label: "One campus", help: "Only the chosen campus." },
  { value: "OWN", label: "Own records only", help: "Only their own classes and records, whatever the roles say." },
];
export const scopeLabel = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? (s === "CHOSEN_CLASSES" ? "Chosen classes" : s);

export type UserState = "ACTIVE" | "INVITED" | "DISABLED";
export const STATE_LABEL: Record<UserState, string> = { ACTIVE: "Active", INVITED: "Invited", DISABLED: "Disabled" };

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;

/** A username suggestion from a name: "Meena Iyer" -> "meena.iyer", made unique. */
export async function suggestUsername(tx: Tx, name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 30) || "user";
  const padded = base.length < 3 ? `${base}.user` : base;
  for (let i = 1; i < 200; i++) {
    const u = i === 1 ? padded : `${padded}${i}`;
    if (!(await tx.userLogin.findUnique({ where: { username: u }, select: { id: true } }))) return u;
  }
  return `${padded}.${Date.now().toString(36)}`;
}

export function checkUsername(u: string): string | null {
  if (!USERNAME.test(u)) return "Username must be 3 to 40 characters: small letters, numbers, dots, dashes or underscores, starting with a letter or number.";
  return null;
}

/** The person's live School Access in this school, with roles. */
export async function liveAccess(tx: Tx, schoolId: string, userLoginId: string) {
  return tx.schoolAccess.findFirst({
    where: { schoolId, userLoginId, archivedAt: null },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Any School Access this person ever had here (to prove they belong to this school). */
async function belongsHere(tx: Tx, schoolId: string, userLoginId: string) {
  const any = await tx.schoolAccess.findFirst({ where: { schoolId, userLoginId }, orderBy: { createdAt: "desc" }, include: { roles: { include: { role: true } } } });
  if (!any) throw new SettingsProblem("This person was not found in your school.");
  return any;
}

async function rolesFor(tx: Tx, schoolId: string, roleIds: string[]) {
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) throw new SettingsProblem("Choose at least one role.", "roleIds");
  const roles = await tx.role.findMany({ where: { schoolId, id: { in: unique }, archivedAt: null } });
  if (roles.length !== unique.length) throw new SettingsProblem("One of the chosen roles was not found. Reload the page and choose again.", "roleIds");
  const off = roles.find((r) => !r.isEnabled);
  if (off) throw new SettingsProblem(`The ${off.name} role is switched off. Switch it on in Roles first.`, "roleIds");
  return roles;
}

async function checkScope(tx: Tx, scope: AccessScope, campusId: string | null) {
  if (!SCOPES.some((s) => s.value === scope)) throw new SettingsProblem("Choose the scope.", "scope");
  if (scope === "CAMPUS") {
    if (!campusId) throw new SettingsProblem("Choose the campus.", "campusId");
    const c = await tx.campus.findUnique({ where: { id: campusId } });
    if (!c || c.archivedAt) throw new SettingsProblem("That campus was not found.", "campusId");
  }
  return scope === "CAMPUS" ? campusId : null;
}

/** Would this person stop being an active School Admin, leaving none? Then it is refused. */
async function keepOneAdmin(tx: Tx, schoolId: string, userLoginId: string, stillAdmin: boolean) {
  if (stillAdmin) return;
  const admins = await activeSchoolAdminIds(tx, schoolId);
  if (admins.includes(userLoginId) && admins.length <= 1) {
    throw new SettingsProblem("At least one School Admin must remain. Add another School Admin first.");
  }
}

const roleWords = (roles: { name: string }[]) => roles.map((r) => r.name).join(", ");

export type InviteInput = {
  displayName: string;
  phone: string | null;
  email: string | null;
  username: string;
  roleIds: string[];
  scope: AccessScope;
  campusId: string | null;
  staffId: string | null;
};

/**
 * Makes a new login (Invited) with School Access and its roles, and an invite
 * link the person opens to set their own password. Returns the link token.
 */
export async function inviteUser(tx: Tx, ctx: SchoolContext, input: InviteInput, now = new Date()) {
  const username = input.username.trim().toLowerCase();
  const bad = checkUsername(username);
  if (bad) throw new SettingsProblem(bad, "username");
  if (await tx.userLogin.findUnique({ where: { username } })) throw new SettingsProblem(`The username ${username} is taken. Try another.`, "username");
  const roles = await rolesFor(tx, ctx.schoolId, input.roleIds);
  const campusId = await checkScope(tx, input.scope, input.campusId);
  let staff = null;
  if (input.staffId) {
    staff = await tx.staff.findUnique({ where: { id: input.staffId } });
    if (!staff || staff.archivedAt) throw new SettingsProblem("That staff member was not found.", "staffId");
    if (staff.userLoginId) throw new SettingsProblem(`${staff.fullName} already has a login.`, "staffId");
  }

  const token = newToken();
  const login = await tx.userLogin.create({
    data: {
      username,
      displayName: input.displayName.trim(),
      phone: input.phone,
      email: input.email,
      status: "INVITED",
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(now.getTime() + INVITE_VALID_MS),
    },
  });
  const access = await tx.schoolAccess.create({
    data: {
      schoolId: ctx.schoolId,
      userLoginId: login.id,
      scope: input.scope,
      campusId,
      roles: { create: roles.map((r) => ({ roleId: r.id, schoolId: ctx.schoolId })) },
    },
  });
  if (staff) await tx.staff.update({ where: { id: staff.id }, data: { userLoginId: login.id, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, {
    action: "invited",
    recordType: "User Login",
    recordId: login.id,
    after: { username, name: login.displayName, roles: roles.map((r) => r.name), scope: input.scope, access: access.id, staff: staff?.fullName ?? null },
  });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} invited ${login.displayName} with the ${roleWords(roles)} role${roles.length > 1 ? "s" : ""}.`, `/settings/users/${login.id}`);
  // messaging: send the invite link to login.phone / login.email through Communication's sendMessage once it exists.
  return { login, token };
}

/** A new invite link for someone who has not set their password yet. The old link stops working. */
export async function resendInvite(tx: Tx, ctx: SchoolContext, userLoginId: string, now = new Date()) {
  await belongsHere(tx, ctx.schoolId, userLoginId);
  const login = await tx.userLogin.findUnique({ where: { id: userLoginId } });
  if (!login || login.status !== "INVITED") throw new SettingsProblem("This person has already set a password, so they do not need an invite.");
  const token = newToken();
  await tx.userLogin.update({ where: { id: login.id }, data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(now.getTime() + INVITE_VALID_MS) } });
  await writeAudit(tx, ctx, { action: "invite-sent-again", recordType: "User Login", recordId: login.id });
  // messaging: the same invite hand-off as inviteUser.
  return token;
}

/** Changes a person's roles, scope and campus here. Signs them out everywhere when their roles change (08 §2). */
export async function changeAccess(tx: Tx, ctx: SchoolContext, userLoginId: string, input: { roleIds: string[]; scope: AccessScope; campusId: string | null }) {
  const current = await liveAccess(tx, ctx.schoolId, userLoginId);
  if (!current) throw new SettingsProblem("This person is disabled in your school. Enable them first.");
  const roles = await rolesFor(tx, ctx.schoolId, input.roleIds);
  const campusId = await checkScope(tx, input.scope, input.campusId);
  const oldIds = current.roles.map((r) => r.roleId).sort();
  const newIds = roles.map((r) => r.id).sort();
  const rolesChanged = oldIds.join() !== newIds.join();
  const scopeChanged = current.scope !== input.scope || (current.campusId ?? null) !== campusId;
  if (!rolesChanged && !scopeChanged) return { changed: false, signedOut: 0 };
  await keepOneAdmin(tx, ctx.schoolId, userLoginId, roles.some((r) => r.key === "school-admin"));

  const now = new Date();
  await tx.schoolAccess.update({ where: { id: current.id }, data: { archivedAt: now } });
  await tx.schoolAccess.create({
    data: {
      schoolId: ctx.schoolId,
      userLoginId,
      scope: input.scope,
      campusId,
      exceptions: current.exceptions as Prisma.InputJsonValue,
      roles: { create: roles.map((r) => ({ roleId: r.id, schoolId: ctx.schoolId })) },
    },
  });
  let signedOut = 0;
  if (rolesChanged && userLoginId !== ctx.userId) {
    const r = await tx.session.updateMany({ where: { userLoginId, revokedAt: null }, data: { revokedAt: now, revokedReason: "Roles changed" } });
    signedOut = r.count;
  }
  const oldRoles = current.roles.map((r) => r.role);
  await writeAudit(tx, ctx, {
    action: "changed-roles",
    recordType: "User Login",
    recordId: userLoginId,
    before: { roles: oldRoles.map((r) => r.name), scope: current.scope, campusId: current.campusId },
    after: { roles: roles.map((r) => r.name), scope: input.scope, campusId },
  });
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId } });
  const who = await actorName(tx, ctx);
  const parts = [];
  if (rolesChanged) parts.push(`roles from ${roleWords(oldRoles)} to ${roleWords(roles)}`);
  if (scopeChanged) parts.push(`scope from ${scopeLabel(current.scope)} to ${scopeLabel(input.scope)}`);
  await alertPermissionChange(tx, ctx, `${who} changed ${login.displayName}'s ${parts.join(" and ")}.`, `/settings/users/${userLoginId}`, userLoginId);
  return { changed: true, signedOut };
}

/** Exceptions for one person: a module set here replaces what their roles give, wider or narrower. */
export async function setExceptions(tx: Tx, ctx: SchoolContext, userLoginId: string, input: Record<string, string>) {
  const current = await liveAccess(tx, ctx.schoolId, userLoginId);
  if (!current) throw new SettingsProblem("This person is disabled in your school. Enable them first.");
  const next: Record<string, AccessLevel> = {};
  for (const k of MODULE_KEYS) {
    const v = input[k];
    if (v === "full" || v === "view" || v === "own" || v === "none") next[k] = v;
  }
  const isAdmin = current.roles.some((r) => r.role.key === "school-admin");
  if (isAdmin && next.settings && next.settings !== "full") {
    const admins = await activeSchoolAdminIds(tx, ctx.schoolId);
    if (admins.length <= 1 && admins.includes(userLoginId)) throw new SettingsProblem("At least one School Admin must remain with Settings. Add another School Admin first.");
  }
  const before = (current.exceptions ?? {}) as Record<string, AccessLevel>;
  if (JSON.stringify(Object.entries(before).sort()) === JSON.stringify(Object.entries(next).sort())) return false;
  await tx.schoolAccess.update({ where: { id: current.id }, data: { exceptions: next } });
  await writeAudit(tx, ctx, { action: "changed-exceptions", recordType: "User Login", recordId: userLoginId, before, after: next });
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId } });
  const who = await actorName(tx, ctx);
  const changed = MODULES.filter((m) => before[m.key] !== next[m.key]).map((m) => `${m.name}: ${next[m.key] ? levelWord(next[m.key]) : "back to their roles"}`);
  await alertPermissionChange(tx, ctx, `${who} changed ${login.displayName}'s exceptions (${changed.slice(0, 3).join("; ")}${changed.length > 3 ? `; and ${changed.length - 3} more` : ""}).`, `/settings/users/${userLoginId}`, userLoginId);
  return true;
}

const levelWord = (l: AccessLevel) => ({ full: "Full", view: "View", own: "Own", none: "None" })[l];

/**
 * Disables a person here: they cannot open this school, and are signed out
 * on every device at once. If this was the only school their login works in,
 * the login itself is switched off.
 */
export async function disableUser(tx: Tx, ctx: SchoolContext, userLoginId: string, otherSchoolIds: string[]) {
  if (userLoginId === ctx.userId) throw new SettingsProblem("You cannot disable your own login. Ask another School Admin.");
  await belongsHere(tx, ctx.schoolId, userLoginId);
  const live = await tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, userLoginId, archivedAt: null } });
  if (live.length === 0) throw new SettingsProblem("This person is already disabled.");
  await keepOneAdmin(tx, ctx.schoolId, userLoginId, false);
  const now = new Date();
  await tx.schoolAccess.updateMany({ where: { id: { in: live.map((a) => a.id) } }, data: { archivedAt: now } });
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId } });
  const others = otherSchoolIds.filter((s) => s !== ctx.schoolId);
  if (others.length === 0) await tx.userLogin.update({ where: { id: userLoginId }, data: { status: "DISABLED" } });
  const revoked = await tx.session.updateMany({ where: { userLoginId, revokedAt: null }, data: { revokedAt: now, revokedReason: "Disabled by the school" } });
  await writeAudit(tx, ctx, { action: "disabled", recordType: "User Login", recordId: userLoginId, before: { status: login.status }, after: { status: "DISABLED", signedOutDevices: revoked.count } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} disabled ${login.displayName}'s login. They were signed out on ${revoked.count} device${revoked.count === 1 ? "" : "s"}.`, `/settings/users/${userLoginId}`);
  return { name: login.displayName, signedOut: revoked.count };
}

/** Enables a disabled person again, with the roles and scope they had. */
export async function enableUser(tx: Tx, ctx: SchoolContext, userLoginId: string) {
  const last = await belongsHere(tx, ctx.schoolId, userLoginId);
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId } });
  const live = await liveAccess(tx, ctx.schoolId, userLoginId);
  if (live && login.status !== "DISABLED") throw new SettingsProblem("This person is already active.");
  if (!live) {
    const usable = last.roles.map((r) => r.role).filter((r) => !r.archivedAt && r.isEnabled);
    if (usable.length === 0) throw new SettingsProblem("The roles this person had are archived or switched off. Open the person and give them a role after enabling.");
    await tx.schoolAccess.create({
      data: {
        schoolId: ctx.schoolId,
        userLoginId,
        scope: last.scope,
        campusId: last.campusId,
        exceptions: last.exceptions as Prisma.InputJsonValue,
        roles: { create: usable.map((r) => ({ roleId: r.id, schoolId: ctx.schoolId })) },
      },
    });
  }
  const status = login.passwordHash ? "ACTIVE" : "INVITED";
  if (login.status === "DISABLED") await tx.userLogin.update({ where: { id: userLoginId }, data: { status, failedAttempts: 0, lockedUntil: null } });
  await writeAudit(tx, ctx, { action: "enabled", recordType: "User Login", recordId: userLoginId, before: { status: "DISABLED" }, after: { status } });
  const who = await actorName(tx, ctx);
  await alertPermissionChange(tx, ctx, `${who} enabled ${login.displayName}'s login again.`, `/settings/users/${userLoginId}`, userLoginId);
  return { name: login.displayName, status };
}

export const TWO_STEP_REASONS = [
  { value: "lost-phone", label: "Lost phone" },
  { value: "new-phone", label: "New phone" },
  { value: "number-changed", label: "Number changed" },
  { value: "other", label: "Other" },
] as const;

/**
 * Resets two-step login for someone who lost the phone that gets their codes.
 * Only another School Admin or the Principal may do it, never for themselves.
 */
export async function resetTwoStep(tx: Tx, ctx: SchoolContext, actorRoleKeys: (string | null)[], userLoginId: string, input: { reason: string; checkDone: string }) {
  if (!actorRoleKeys.some((k) => k === "school-admin" || k === "principal")) throw new SettingsProblem("Only a School Admin or the Principal can reset two-step login.");
  if (userLoginId === ctx.userId) throw new SettingsProblem("You cannot reset your own two-step login. Ask another School Admin or the Principal.");
  if (!TWO_STEP_REASONS.some((r) => r.value === input.reason)) throw new SettingsProblem("Choose the reason.", "reason");
  const check = input.checkDone.trim();
  if (check.length < 5) throw new SettingsProblem("Say how the person was confirmed, for example \"in person at the office\".", "checkDone");
  await belongsHere(tx, ctx.schoolId, userLoginId);
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId } });
  const now = new Date();
  await tx.userLogin.update({ where: { id: userLoginId }, data: { twoStepResetAt: now } });
  const reasonLabel = TWO_STEP_REASONS.find((r) => r.value === input.reason)!.label;
  await writeAudit(tx, ctx, { action: "reset-two-step", recordType: "User Login", recordId: userLoginId, after: { reason: reasonLabel, checkDone: check.slice(0, 300) } });
  await notify(tx, ctx, { to: userLoginId, type: "security", text: "Your two-step login was reset. You will set it up again at your next sign-in.", link: "/profile" });
  return login.displayName;
}

/** Links a login to the Staff or Student record it belongs to (one record, never two). */
export async function linkRecord(tx: Tx, ctx: SchoolContext, userLoginId: string, target: { kind: "staff" | "student" | "none"; id: string | null }) {
  await belongsHere(tx, ctx.schoolId, userLoginId);
  const [staffNow, studentNow] = await Promise.all([
    tx.staff.findFirst({ where: { userLoginId } }),
    tx.student.findFirst({ where: { userLoginId } }),
  ]);
  if (target.kind === "staff" && staffNow?.id === target.id) return false;
  if (target.kind === "student" && studentNow?.id === target.id) return false;
  if (target.kind === "none" && !staffNow && !studentNow) return false;

  let label: string | null = null;
  if (target.kind === "staff") {
    const s = target.id ? await tx.staff.findUnique({ where: { id: target.id } }) : null;
    if (!s || s.archivedAt) throw new SettingsProblem("That staff member was not found.", "recordId");
    if (s.userLoginId && s.userLoginId !== userLoginId) throw new SettingsProblem(`${s.fullName} already has another login.`, "recordId");
    label = `Staff: ${s.fullName}`;
  } else if (target.kind === "student") {
    const s = target.id ? await tx.student.findUnique({ where: { id: target.id } }) : null;
    if (!s || s.archivedAt) throw new SettingsProblem("That student was not found.", "recordId");
    if (s.userLoginId && s.userLoginId !== userLoginId) throw new SettingsProblem(`${s.fullName} already has another login.`, "recordId");
    label = `Student: ${s.fullName}`;
  }
  if (staffNow) await tx.staff.update({ where: { id: staffNow.id }, data: { userLoginId: null, updatedById: ctx.userId } });
  if (studentNow) await tx.student.update({ where: { id: studentNow.id }, data: { userLoginId: null } });
  if (target.kind === "staff") await tx.staff.update({ where: { id: target.id! }, data: { userLoginId, updatedById: ctx.userId } });
  if (target.kind === "student") await tx.student.update({ where: { id: target.id! }, data: { userLoginId } });
  await writeAudit(tx, ctx, {
    action: "linked-record",
    recordType: "User Login",
    recordId: userLoginId,
    before: { belongsTo: staffNow ? `Staff: ${staffNow.fullName}` : studentNow ? `Student: ${studentNow.fullName}` : null },
    after: { belongsTo: label },
  });
  return true;
}

/** Name, phone and email of a login that works only in this school. */
export async function updateDetails(tx: Tx, ctx: SchoolContext, userLoginId: string, otherSchoolIds: string[], input: { displayName: string; phone: string | null; email: string | null }) {
  await belongsHere(tx, ctx.schoolId, userLoginId);
  if (otherSchoolIds.some((s) => s !== ctx.schoolId)) throw new SettingsProblem("This login also works in another school, so only the person can change these details, in My profile.");
  const before = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId }, select: { displayName: true, phone: true, email: true } });
  const after = { displayName: input.displayName.trim(), phone: input.phone, email: input.email };
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  await tx.userLogin.update({ where: { id: userLoginId }, data: after });
  await writeAudit(tx, ctx, { action: "changed", recordType: "User Login", recordId: userLoginId, before, after });
  return true;
}

/** The person's state in this school. */
export function stateOf(loginStatus: UserState, hasLiveAccess: boolean): UserState {
  if (loginStatus === "DISABLED" || !hasLiveAccess) return "DISABLED";
  return loginStatus;
}
