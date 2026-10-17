// Support Access (07-super-admin.md §3.4): DREAM TEAM helps a school inside its
// School Master, only when the school says yes.
//
// 1. A Support user (or the Owner) asks from the school's console page, with a
//    reason and how long (1 hour, 4 hours or 1 day).
// 2. The school's School Admins and Principals get it in Approvals and on WhatsApp.
// 3. One of them taps Allow or Decline.
// 4. Allowed: the person who asked opens the School Master for the time given,
//    with a coloured bar on every screen (src/lib/console/support-entry.ts).
// 5. It ends by itself at that time; either side can end it earlier.
// 6. Everything is written to the school's Audit Log, marked "DREAM TEAM
//    support", and to the console's Activity Log.
//
// The request is a console record (kept outside every school). The school's
// own side reads and answers only its own requests, through withConsoleSchool.
import "server-only";

import { Prisma, type SupportAccessRequest } from "@prisma/client";
import { withConsole, withConsoleSchool, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { hashToken, newToken } from "../auth/tokens";
import { logActivity, type ConsoleActor } from "./activity";
import { notifyTeam } from "./notify";
import { deliver, type Delivered } from "./outbox";
import { ADMIN_ROLE_KEYS } from "./measure";
import { adminNotice, ConsoleProblem, STATUS_LABEL } from "./schools";
import { endIn, endSupport, endsWords, expireIn, lengthWords, SUPPORT_LENGTHS, SUPPORT_RECORD, SUPPORT_WAIT_MS, supportContext, supportLink, waitedTooLong } from "./support-entry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The one-time ticket from the console to the school's own address works this long. */
export const TICKET_MS = 60 * 1000;

/** The school's active School Admins and Principals: the people who can answer. */
async function answerers(tx: Tx, schoolId: string) {
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId, archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null }, roles: { some: { role: { key: { in: [...ADMIN_ROLE_KEYS] }, isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  });
  return [...new Set(rows.map((r) => r.userLoginId))];
}

/** Allowed requests of this school that are past their time end now, and requests waiting 24 hours expire, inside the same work. */
async function endOverdue(tx: Tx, schoolId: string, now: Date) {
  const due = await tx.supportAccessRequest.findMany({ where: { forSchoolId: schoolId, status: "ALLOWED", endsAt: { lte: now } } });
  for (const r of due) await endIn(tx, r, "time", null, now);
  const stale = await tx.supportAccessRequest.findMany({ where: { forSchoolId: schoolId, status: "WAITING", createdAt: { lte: new Date(now.getTime() - SUPPORT_WAIT_MS) } } });
  for (const r of stale) await expireIn(tx, r, now);
}

// ---------------------------------------------------------------------------
// The console's side
// ---------------------------------------------------------------------------

/** Step 1 and 2: the request, the school's Approvals notice and the WhatsApp message to its School Admins and Principals. */
export async function requestSupportAccess(actor: ConsoleActor, schoolId: string, input: { reason: string; lengthMinutes: number }, now = new Date()): Promise<{ id: string; schoolName: string; delivered: Delivered[] }> {
  if (!actor.id || !actor.role) throw new ConsoleProblem("Only a DREAM TEAM person can ask for support access.");
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 5) throw new ConsoleProblem("Say in a few words why you need to look inside, for example “Fee structure is not saving”.", "reason");
  if (reason.length > 300) throw new ConsoleProblem("Keep the reason under 300 characters.", "reason");
  if (!SUPPORT_LENGTHS.some((l) => l.minutes === input.lengthMinutes)) throw new ConsoleProblem("Choose how long: 1 hour, 4 hours or 1 day.", "lengthMinutes");
  if (!UUID.test(schoolId)) throw new ConsoleProblem("This school was not found.");
  const length = lengthWords(input.lengthMinutes);
  let made: { request: SupportAccessRequest; schoolName: string };
  try {
    made = await withConsoleSchool(schoolId, async (tx) => {
      const card = await tx.consoleSchool.findUnique({ where: { id: schoolId } });
      if (!card) throw new ConsoleProblem("This school was not found.");
      if (card.status !== "TRIAL" && card.status !== "ACTIVE") throw new ConsoleProblem(`${card.name} is ${STATUS_LABEL[card.status]}, so nobody works inside it now. Support access is only for a school that is open.`);
      await endOverdue(tx, schoolId, now);
      const open = await tx.supportAccessRequest.findFirst({ where: { forSchoolId: schoolId, status: { in: ["WAITING", "ALLOWED"] } } });
      if (open?.status === "WAITING") throw new ConsoleProblem(`${open.requestedByName}’s request to ${card.name} is already waiting for the school’s answer.`);
      if (open?.endsAt) throw new ConsoleProblem(`${card.name} already allowed support access to ${open.requestedByName}, until ${endsWords(open.endsAt, now)}.`);
      const people = await answerers(tx, schoolId);
      if (people.length === 0) throw new ConsoleProblem(`${card.name} has no active School Admin or Principal to answer yet. Help them sign in first.`);
      const request = await tx.supportAccessRequest.create({ data: { forSchoolId: schoolId, schoolName: card.name, requestedById: actor.id!, requestedByName: actor.name, reason, lengthMinutes: input.lengthMinutes } });
      const ctx: SchoolContext = { schoolId, userId: null };
      for (const p of people) {
        await notify(tx, ctx, { to: p, type: "approval", text: `${actor.name} of DREAM TEAM asks to look inside School OS for ${length} to help: “${reason}”. Allow or decline.`, link: supportLink(request.id) });
      }
      await writeAudit(tx, ctx, { action: "support access asked", recordType: SUPPORT_RECORD, recordId: request.id, after: { reason, length }, actorNote: `DREAM TEAM: ${actor.name}` });
      await logActivity(tx, actor, { type: "support", school: { id: schoolId, name: card.name }, text: `asked ${card.name} for support access for ${length}: “${reason}”`, to: "Waiting" });
      return { request, schoolName: card.name };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConsoleProblem("A request to this school is already open. Refresh the page.");
    throw e;
  }
  const delivered = await deliver(await adminNotice(schoolId, made.schoolName, `${actor.name} of DREAM TEAM asks to look inside your School OS for ${length}, to help with: "${reason}". Nothing is opened until you allow it. Open Approvals in School OS to allow or decline.`));
  return { id: made.request.id, schoolName: made.schoolName, delivered };
}

async function requestOrThrow(id: string) {
  if (!UUID.test(id)) throw new ConsoleProblem("This request was not found.");
  const r = await withConsole((tx) => tx.supportAccessRequest.findUnique({ where: { id } }));
  if (!r) throw new ConsoleProblem("This request was not found.");
  return r;
}

/** The console takes back a request the school has not answered yet. */
export async function withdrawSupportRequest(actor: ConsoleActor, id: string, now = new Date()) {
  const r = await requestOrThrow(id);
  if (r.status === "EXPIRED") throw new ConsoleProblem("This request has already expired: the school did not answer within 24 hours.");
  if (r.status !== "WAITING") throw new ConsoleProblem("The school has already answered this request.");
  const done = await endSupport(r.id, "withdrawn", { ctx: { schoolId: r.forSchoolId, userId: null }, actorNote: `DREAM TEAM: ${actor.name}`, actor }, now);
  if (!done) throw new ConsoleProblem("The school has already answered this request.");
  return { schoolName: r.schoolName };
}

/** "End now", from the console: the entry stops working at once. */
export async function endSupportFromConsole(actor: ConsoleActor, id: string, now = new Date()) {
  const r = await requestOrThrow(id);
  if (r.status !== "ALLOWED") throw new ConsoleProblem("This support access has already ended.");
  const done = await endSupport(r.id, "support", { ctx: { schoolId: r.forSchoolId, userId: null }, actorNote: `DREAM TEAM: ${actor.name}`, actor }, now);
  if (!done) throw new ConsoleProblem("This support access has already ended.");
  return { schoolName: r.schoolName };
}

/**
 * Step 4: the person who asked opens the school. Gives a one-time ticket for
 * the school's own address (/support/enter), which swaps it for the support
 * browser's token. The console sign-in it came from must stay signed in.
 */
export async function startSupportEntry(actor: ConsoleActor, consoleSessionId: string, id: string, now = new Date()) {
  const r = await requestOrThrow(id);
  if (!actor.id || r.requestedById !== actor.id) throw new ConsoleProblem(`Only ${r.requestedByName}, who asked, can open ${r.schoolName} with this request.`);
  if (r.status === "WAITING") throw new ConsoleProblem(`${r.schoolName} has not answered yet.`);
  if (r.status !== "ALLOWED" || !r.endsAt) throw new ConsoleProblem("This request is no longer allowed. Ask again if you still need to help.");
  if (r.endsAt <= now) {
    await endSupport(r.id, "time", null, now);
    throw new ConsoleProblem("The time the school gave has ended. Ask again if you still need to help.");
  }
  const ticket = newToken();
  const ok = await withConsole(async (tx) => {
    const card = await tx.consoleSchool.findUnique({ where: { id: r.forSchoolId }, select: { status: true } });
    if (!card || (card.status !== "TRIAL" && card.status !== "ACTIVE")) return false;
    const changed = await tx.supportAccessRequest.updateMany({
      where: { id: r.id, status: "ALLOWED" },
      data: { entryTicketHash: hashToken(ticket), entryTicketExpiresAt: new Date(now.getTime() + TICKET_MS), entrySessionId: consoleSessionId },
    });
    return changed.count === 1;
  });
  if (!ok) throw new ConsoleProblem(`${r.schoolName} cannot be opened now. It may have been paused.`);
  return { ticket, schoolName: r.schoolName, endsAt: r.endsAt };
}

/** /support/enter on the school's address: the ticket, used once, becomes the support browser's token. */
export async function claimSupportTicket(ticket: string | null | undefined, now = new Date()): Promise<{ token: string; endsAt: Date; schoolName: string } | null> {
  if (!ticket || ticket.length < 20 || ticket.length > 200) return null;
  const r = await withConsole((tx) => tx.supportAccessRequest.findUnique({ where: { entryTicketHash: hashToken(ticket) } }));
  if (!r || r.status !== "ALLOWED" || !r.endsAt || r.endsAt <= now || !r.entryTicketExpiresAt || r.entryTicketExpiresAt <= now) return null;
  const user = await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: r.requestedById }, select: { id: true, name: true, role: true } }));
  if (!user) return null;
  const token = newToken();
  const claimed = await withConsoleSchool(r.forSchoolId, async (tx) => {
    const changed = await tx.supportAccessRequest.updateMany({
      where: { id: r.id, status: "ALLOWED", entryTicketHash: hashToken(ticket) },
      data: { entryTicketHash: null, entryTicketExpiresAt: null, entryTokenHash: hashToken(token), enteredAt: r.enteredAt ?? now },
    });
    if (changed.count !== 1) return false;
    await writeAudit(tx, supportContext({ schoolId: r.forSchoolId, requestId: r.id, name: user.name }), { action: "support access opened", recordType: SUPPORT_RECORD, recordId: r.id, after: { until: r.endsAt!.toISOString(), reason: r.reason } });
    await logActivity(tx, user, { type: "support", school: { id: r.forSchoolId, name: r.schoolName }, text: `opened ${r.schoolName}’s School Master with its support access, until ${endsWords(r.endsAt!, now)}.` });
    return true;
  });
  return claimed ? { token, endsAt: r.endsAt, schoolName: r.schoolName } : null;
}

export type SupportRow = SupportAccessRequest & { live: boolean };

/** The Support Access page: what waits, what is open now, and the history. */
export async function supportRequests(opts: { schoolId?: string | null; take?: number } = {}, now = new Date()): Promise<SupportRow[]> {
  const rows = await withConsole((tx) => tx.supportAccessRequest.findMany({
    where: opts.schoolId ? { forSchoolId: opts.schoolId } : {},
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
  }));
  return rows.map((r) => ({ ...r, live: r.status === "ALLOWED" && Boolean(r.endsAt && r.endsAt > now) }));
}

// ---------------------------------------------------------------------------
// The school's side: its School Admin or Principal answers in Approvals
// ---------------------------------------------------------------------------

export class SupportProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportProblem";
  }
}

const EXPIRED_ANSWER = "This request has expired: it waited more than 24 hours without an answer. Nothing was opened. DREAM TEAM can ask again if they still need to help.";

/** The school person answering: who they are, and their roles here. */
export type Answerer = { ctx: SchoolContext; user: { id: string; displayName: string }; roles: { key: string | null; name: string }[]; school: { id: string; name: string; timeZone: string }; support?: unknown };

/** Only the School Admin and the Principal answer DREAM TEAM (07-super-admin.md §3.4, step 2). */
export const answersSupport = (c: Pick<Answerer, "roles" | "support">) => !c.support && c.roles.some((r) => r.key && (ADMIN_ROLE_KEYS as readonly string[]).includes(r.key));

const schoolActor = (c: Answerer): ConsoleActor => ({ id: null, name: `${c.user.displayName} (${c.roles.find((r) => r.key && (ADMIN_ROLE_KEYS as readonly string[]).includes(r.key))?.name ?? "School Admin"}, ${c.school.name})`, role: null });

/** This school's requests, newest first, for its Approvals. */
export async function schoolSupportRequests(schoolId: string, now = new Date(), take = 10): Promise<SupportRow[]> {
  const rows = await withConsoleSchool(schoolId, (tx) => tx.supportAccessRequest.findMany({ where: { forSchoolId: schoolId }, orderBy: { createdAt: "desc" }, take }));
  return rows.map((r) => ({ ...r, live: r.status === "ALLOWED" && Boolean(r.endsAt && r.endsAt > now) }));
}

/** How many of this school's requests wait for an answer (the top bar's Approvals count); one waiting 24 hours has expired. */
export async function waitingSupportCount(schoolId: string, now = new Date()) {
  return withConsoleSchool(schoolId, (tx) => tx.supportAccessRequest.count({ where: { forSchoolId: schoolId, status: "WAITING", createdAt: { gt: new Date(now.getTime() - SUPPORT_WAIT_MS) } } }));
}

/** Step 3: Allow (the time starts now) or Decline (with a reason, as for any request). */
export async function answerSupport(c: Answerer, id: string, decision: "allow" | "decline", note: string | null, now = new Date()) {
  if (!answersSupport(c)) throw new SupportProblem("Only the School Admin or the Principal can answer DREAM TEAM’s request.");
  if (!UUID.test(id)) throw new SupportProblem("This request was not found.");
  const why = note?.trim() ?? "";
  if (decision === "decline" && why.length < 5) throw new SupportProblem("Give a reason of at least 5 characters, so DREAM TEAM knows why.");
  const answered = await withConsoleSchool(c.school.id, async (tx) => {
    const r = await tx.supportAccessRequest.findFirst({ where: { id, forSchoolId: c.school.id } });
    if (!r) throw new SupportProblem("This request was not found.");
    // Not answered within 24 hours: it expires now, and DREAM TEAM asks again if they still need to.
    if (waitedTooLong(r, now)) {
      await expireIn(tx, r, now);
      return null;
    }
    if (r.status === "EXPIRED") throw new SupportProblem(EXPIRED_ANSWER);
    if (r.status !== "WAITING") throw new SupportProblem(r.status === "ENDED" && r.endedHow === "withdrawn" ? "DREAM TEAM has withdrawn this request." : "This request was already answered.");
    const allow = decision === "allow";
    const endsAt = new Date(now.getTime() + r.lengthMinutes * 60_000);
    const changed = await tx.supportAccessRequest.updateMany({
      where: { id: r.id, status: "WAITING" },
      data: allow
        ? { status: "ALLOWED", decidedById: c.user.id, decidedByName: c.user.displayName, decidedAt: now, startsAt: now, endsAt }
        : { status: "DECLINED", decidedById: c.user.id, decidedByName: c.user.displayName, decidedAt: now, declineReason: why.slice(0, 300) },
    });
    if (changed.count === 0) throw new SupportProblem("This request was already answered.");
    await tx.notification.updateMany({ where: { link: supportLink(r.id), doneAt: null }, data: { doneAt: now } });
    await writeAudit(tx, c.ctx, {
      action: allow ? "support access allowed" : "support access declined",
      recordType: SUPPORT_RECORD,
      recordId: r.id,
      before: { status: "WAITING" },
      after: allow ? { status: "ALLOWED", for: r.requestedByName, until: endsAt.toISOString(), length: lengthWords(r.lengthMinutes) } : { status: "DECLINED", for: r.requestedByName, reason: why },
    });
    const until = endsWords(endsAt, now, c.school.timeZone);
    await logActivity(tx, schoolActor(c), {
      type: "support",
      school: { id: c.school.id, name: c.school.name },
      text: allow ? `allowed support access for ${r.requestedByName} until ${until}.` : `declined support access for ${r.requestedByName}: “${why}”`,
      from: "Waiting",
      to: allow ? "Allowed" : "Declined",
    });
    await notifyTeam(tx, {
      roles: [],
      alsoUserId: r.requestedById,
      text: allow ? `${c.school.name} allowed your support access until ${until}. Open it from Support Access.` : `${c.school.name} declined your support access: “${why}”`,
      link: "/console/support",
      tone: allow ? "ok" : "warn",
    });
    return { requestedByName: r.requestedByName, endsAt: allow ? endsAt : null, until };
  });
  if (!answered) throw new SupportProblem(EXPIRED_ANSWER);
  return answered;
}

/** Step 5: the school ends it earlier, from its Approvals history. */
export async function endSupportFromSchool(c: Answerer, id: string, now = new Date()) {
  if (!answersSupport(c)) throw new SupportProblem("Only the School Admin or the Principal can end DREAM TEAM’s access.");
  if (!UUID.test(id)) throw new SupportProblem("This request was not found.");
  const r = await withConsoleSchool(c.school.id, (tx) => tx.supportAccessRequest.findFirst({ where: { id, forSchoolId: c.school.id } }));
  if (!r) throw new SupportProblem("This request was not found.");
  if (r.status !== "ALLOWED") throw new SupportProblem("This support access has already ended.");
  const done = await withConsoleSchool(c.school.id, (tx) => endIn(tx, r, "school", { ctx: c.ctx, actor: schoolActor(c) }, now));
  if (!done) throw new SupportProblem("This support access has already ended.");
  return { requestedByName: r.requestedByName };
}
