// A group login: one School OS login used in more than one school (a group of
// schools shares its owner or office staff). Its two-step login is one for
// every school, so a School Admin of one school must not reset it for the
// others (owner decision 4, 15 Nov 2026): only DREAM TEAM resets it, from the
// school's page in the console, with the reason and how they checked it is
// really the person. Every school the login opens gets the line in its Audit Log.
import "server-only";

import { prisma, withConsoleSchool, withSchool } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { schoolsFor } from "./access";
import { logActivity, type ConsoleActor } from "../console/activity";
import { ConsoleProblem } from "../console/schools";

/** What a School Admin sees instead of "Reset two-step login" for a group login. */
export const GROUP_LOGIN_RESET_WORDS = "This login is used in more than one school. Ask DREAM TEAM support to reset it.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Does this login open more than one school? */
export async function isGroupLogin(userLoginId: string): Promise<boolean> {
  if (!UUID.test(userLoginId)) return false;
  return (await schoolsFor(userLoginId)).length > 1;
}

export type GroupLogin = { userLoginId: string; name: string; roles: string[]; schools: string[]; twoStepResetAt: Date | null };

/** The logins of this school that also open another school, for the console. Names and roles only. */
export async function groupLoginsOf(schoolId: string): Promise<GroupLogin[]> {
  const rows = await withSchool({ schoolId, userId: null }, (tx) => tx.schoolAccess.findMany({
    where: { schoolId, archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null } },
    select: { userLoginId: true, userLogin: { select: { displayName: true, twoStepResetAt: true } }, roles: { select: { role: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  }));
  const byLogin = new Map<string, GroupLogin>();
  for (const r of rows) {
    const had = byLogin.get(r.userLoginId);
    const roles = r.roles.map((x) => x.role.name);
    if (had) { had.roles = [...new Set([...had.roles, ...roles])]; continue; }
    byLogin.set(r.userLoginId, { userLoginId: r.userLoginId, name: r.userLogin.displayName, roles, schools: [], twoStepResetAt: r.userLogin.twoStepResetAt });
  }
  const out: GroupLogin[] = [];
  for (const g of byLogin.values()) {
    const schools = await schoolsFor(g.userLoginId);
    if (schools.length > 1) out.push({ ...g, schools: schools.map((s) => s.name) });
  }
  return out;
}

/**
 * DREAM TEAM resets a group login's two-step login (lost or new phone): the
 * next sign-in asks for a code again on every device. Needs the reason and how
 * it was checked; each school the login opens gets it in its Audit Log, the
 * person gets a security notice there, and the Activity Log has a line.
 */
export async function resetGroupTwoStep(actor: ConsoleActor, schoolId: string, userLoginId: string, input: { reason: string }, now = new Date()) {
  const reason = input.reason.trim();
  if (reason.length < 10) throw new ConsoleProblem("Give the reason and how you checked it is really them, in a few words.", "reason");
  const schools = await schoolsFor(userLoginId);
  if (!schools.some((s) => s.id === schoolId)) throw new ConsoleProblem("This login was not found in this school.");
  if (schools.length < 2) throw new ConsoleProblem("This login is used in this school only. Its School Admin or Principal resets its two-step login in Users & Permissions.");
  const login = await prisma.userLogin.findUnique({ where: { id: userLoginId }, select: { displayName: true, status: true, archivedAt: true } });
  if (!login || login.status !== "ACTIVE" || login.archivedAt) throw new ConsoleProblem("This login is not active.");
  await prisma.userLogin.update({ where: { id: userLoginId }, data: { twoStepResetAt: now } });
  for (const s of schools) {
    const ctx = { schoolId: s.id, userId: null };
    await withSchool(ctx, async (tx) => {
      await writeAudit(tx, ctx, { action: "reset-two-step", recordType: "User Login", recordId: userLoginId, after: { reason, by: "DREAM TEAM support", groupLogin: true }, actorNote: `DREAM TEAM support: ${actor.name}` });
      await notify(tx, ctx, { to: userLoginId, type: "security", key: "Your two-step login was reset by DREAM TEAM support. You will set it up again at your next sign-in.", link: "/profile" });
    });
  }
  const here = schools.find((s) => s.id === schoolId)!;
  await withConsoleSchool(schoolId, (tx) => logActivity(tx, actor, {
    type: "login", school: { id: schoolId, name: here.name },
    text: `reset ${login.displayName}’s two-step login (a login used in ${schools.length} schools: ${schools.map((s) => s.name).join(", ")}). Reason: ${reason}`,
  }));
  return { name: login.displayName, schools: schools.length };
}
