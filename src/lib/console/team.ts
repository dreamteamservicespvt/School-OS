// DREAM TEAM's own console users (07-super-admin.md §2, §3.6). Owner only.
// A new member gets a welcome link, confirms a code on their mobile and sets
// their own password. The last active Owner can never be disabled or demoted.
import "server-only";

import type { ConsoleRole, SuperAdminUser } from "@prisma/client";
import { withConsole, type Tx } from "../db";
import { hashToken, newToken } from "../auth/tokens";
import { checkNewPassword, hashPassword, verifyPassword } from "../auth/password";
import { logActivity, maskMobile, tenDigits, type ConsoleActor } from "./activity";
import { WELCOME_VALID_MS } from "./auth";
import { appUrl, deliver, supportPhone, type ConsoleOutgoing } from "./outbox";
import { CONSOLE_ROLES, ROLE_ORDER } from "./roles";
import { ConsoleProblem } from "./schools";

const roleOk = (r: string): r is ConsoleRole => (ROLE_ORDER as string[]).includes(r);

function welcomeMessages(u: Pick<SuperAdminUser, "name" | "phone" | "email" | "role">, link: string): ConsoleOutgoing[] {
  const help = supportPhone() ? ` Questions? Call ${supportPhone()}.` : "";
  const text = [`School OS console, DREAM TEAM SERVICES.`, `${u.name}, you are invited as ${CONSOLE_ROLES[u.role].label}.`, `Tap to confirm a code and set your password: ${link}`, `Your username is your mobile number: ${maskMobile(u.phone)}.`, `The link works for 3 days.${help}`].join("\n");
  const safe = text.replace(link, `${appUrl()}/console/welcome/••••`);
  const out: ConsoleOutgoing[] = [
    { channel: "whatsapp", to: u.phone, purpose: "team-invite", text, safeText: safe, templateParams: [u.name, CONSOLE_ROLES[u.role].label, link, maskMobile(u.phone)] },
  ];
  if (u.email) out.push({ channel: "email", to: u.email, purpose: "team-invite", subject: "Your School OS console invite", text: `${text}\n`, safeText: safe });
  return out;
}

async function newWelcome(tx: Tx, userId: string, now: Date) {
  const token = newToken();
  await tx.superAdminUser.update({ where: { id: userId }, data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(now.getTime() + WELCOME_VALID_MS) } });
  return `${appUrl()}/console/welcome/${token}`;
}

async function activeOwners(tx: Tx) {
  return tx.superAdminUser.count({ where: { role: "OWNER", status: "ACTIVE", archivedAt: null } });
}

export async function inviteTeamMember(actor: ConsoleActor, input: { name: string; mobile: string; email: string | null; role: string }, now = new Date()) {
  const name = input.name.trim();
  if (!name) throw new ConsoleProblem("Enter the full name.", "name");
  const phone = tenDigits(input.mobile);
  if (!phone) throw new ConsoleProblem("Enter a 10-digit Indian mobile number.", "mobile");
  if (!roleOk(input.role)) throw new ConsoleProblem("Choose a role.", "role");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConsoleProblem("This email does not look right.", "email");
  const made = await withConsole(async (tx) => {
    const taken = await tx.superAdminUser.findUnique({ where: { phone } });
    if (taken) throw new ConsoleProblem(`This number is already ${taken.name}’s console login.`, "mobile");
    const u = await tx.superAdminUser.create({ data: { name: name.slice(0, 120), phone, email, role: input.role as ConsoleRole, status: "INVITED", invitedById: actor.id } });
    const link = await newWelcome(tx, u.id, now);
    await logActivity(tx, actor, { type: "team", text: `invited ${u.name} to the team as ${CONSOLE_ROLES[u.role].label}, on +91 ${maskMobile(phone)}.`, to: "Invited" });
    return { u, link };
  });
  const delivered = await deliver(welcomeMessages(made.u, made.link));
  return { name: made.u.name, delivered };
}

export async function resendTeamInvite(actor: ConsoleActor, userId: string, now = new Date()) {
  const made = await withConsole(async (tx) => {
    const u = await tx.superAdminUser.findUnique({ where: { id: userId } });
    if (!u || u.archivedAt) throw new ConsoleProblem("This team member was not found.");
    if (u.status === "ACTIVE") throw new ConsoleProblem(`${u.name} has already set a password.`);
    const was = u.status;
    if (u.status === "DISABLED") await tx.superAdminUser.update({ where: { id: u.id }, data: { status: "INVITED", disabledAt: null, disabledReason: null, passwordHash: null } });
    const link = await newWelcome(tx, u.id, now);
    await logActivity(tx, actor, { type: "team", text: was === "DISABLED" ? `enabled ${u.name} again and sent a new invite to +91 ${maskMobile(u.phone)}.` : `resent the team invite to ${u.name}, +91 ${maskMobile(u.phone)}. The old link stopped working.`, ...(was === "DISABLED" ? { from: "Disabled", to: "Invited" } : {}) });
    return { u, link };
  });
  return { name: made.u.name, delivered: await deliver(welcomeMessages(made.u, made.link)) };
}

export async function changeTeamRole(actor: ConsoleActor, userId: string, role: string) {
  if (!roleOk(role)) throw new ConsoleProblem("Choose a role.", "role");
  return withConsole(async (tx) => {
    const u = await tx.superAdminUser.findUnique({ where: { id: userId } });
    if (!u || u.archivedAt) throw new ConsoleProblem("This team member was not found.");
    if (u.role === role) return { name: u.name, role, changed: false };
    if (u.role === "OWNER" && u.status === "ACTIVE" && (await activeOwners(tx)) <= 1) throw new ConsoleProblem("DREAM TEAM needs at least one active Owner. Make someone else Owner first.", "role");
    await tx.superAdminUser.update({ where: { id: u.id }, data: { role } });
    await logActivity(tx, actor, { type: "team", text: `changed ${u.name}’s role.`, from: CONSOLE_ROLES[u.role].label, to: CONSOLE_ROLES[role].label });
    return { name: u.name, role, changed: true };
  });
}

export async function disableTeamMember(actor: ConsoleActor, userId: string, reason: string, now = new Date()) {
  const r = reason.trim();
  if (r.length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  if (actor.id === userId) throw new ConsoleProblem("You cannot disable your own login. Ask another Owner.");
  return withConsole(async (tx) => {
    const u = await tx.superAdminUser.findUnique({ where: { id: userId } });
    if (!u || u.archivedAt) throw new ConsoleProblem("This team member was not found.");
    if (u.status === "DISABLED") throw new ConsoleProblem(`${u.name} is already disabled.`);
    if (u.role === "OWNER" && u.status === "ACTIVE" && (await activeOwners(tx)) <= 1) throw new ConsoleProblem("The last Owner cannot be disabled. Make someone else Owner first.");
    await tx.superAdminUser.update({ where: { id: u.id }, data: { status: "DISABLED", disabledAt: now, disabledReason: r, inviteTokenHash: null, inviteExpiresAt: null } });
    await tx.consoleSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "disabled" } });
    await tx.consoleDevice.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } });
    await logActivity(tx, actor, { type: "team", text: `disabled ${u.name}’s console login: “${r}”`, from: u.status === "INVITED" ? "Invited" : "Active", to: "Disabled" });
    return { name: u.name };
  });
}

/** Change one's own password: the old one, then a new one; other devices are signed out. */
export async function changeOwnPassword(actor: ConsoleActor & { id: string }, input: { current: string; next: string; sessionId: string }, now = new Date()) {
  const u = await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: actor.id } }));
  if (!u || !u.passwordHash) throw new ConsoleProblem("Your login was not found.");
  if (!(await verifyPassword(input.current, u.passwordHash))) throw new ConsoleProblem("Your current password is not right.", "current");
  const bad = checkNewPassword(input.next);
  if (bad) throw new ConsoleProblem(bad, "next");
  if (await verifyPassword(input.next, u.passwordHash)) throw new ConsoleProblem("Choose a password you have not used here.", "next");
  const passwordHash = await hashPassword(input.next);
  await withConsole(async (tx) => {
    await tx.superAdminUser.update({ where: { id: u.id }, data: { passwordHash, passwordChangedAt: now } });
    const out = await tx.consoleSession.updateMany({ where: { userId: u.id, revokedAt: null, NOT: { id: input.sessionId } }, data: { revokedAt: now, revokedReason: "password changed" } });
    await logActivity(tx, actor, { type: "team", text: `changed their own console password.${out.count ? ` ${out.count} other ${out.count === 1 ? "device was" : "devices were"} signed out.` : ""}` });
  });
}
