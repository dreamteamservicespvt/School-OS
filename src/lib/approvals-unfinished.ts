// "Approved, but not finished" on the Approvals page (00-global.md §3.4; gap
// list G01, follow-up). Before 18 October 2026 a decision made on a server
// that had just started could be recorded while its record stayed waiting
// (the leave, the payment to verify, the application at Decision, the
// outing pass, the library charge...), because the follow-up never ran.
// Nothing re-runs them by itself: the person who decided, or the Principal or
// School Admin, sees each one and taps Finish now, which runs the same
// follow-up a decision runs today, as the person who decided, in one
// transaction with an Audit Log line. If it cannot be done now (the class is
// full, a net pay is below zero) the plain reason is shown and nothing changes.
import "server-only";

import type { Approval } from "@prisma/client";
import type { SchoolContext, Tx } from "./db";
import { writeAudit } from "./audit";
import { DecisionProblem, followUpFor, holdsRole, requestLabel } from "./approvals";
import { decisionOf } from "./approval-waiting";
import { unfinishedChecks, unfinishedOf } from "./approval-handlers";
import { OVERSEER_ROLES } from "./approvals-inbox";

const DECIDED = ["APPROVED", "REJECTED"] as const;

/** The Principal and the School Admin may finish any; others only what they decided. */
export async function finishesAny(tx: Tx, ctx: SchoolContext) {
  for (const role of OVERSEER_ROLES) if (await holdsRole(tx, ctx, role)) return true;
  return false;
}

/** Only the newest request for a record counts: one asked again later is the one that moves it. */
async function newestOnly(tx: Tx, rows: Approval[]) {
  if (!rows.length) return rows;
  const later = await tx.approval.findMany({ where: { OR: rows.map((a) => ({ type: a.type, recordId: a.recordId, createdAt: { gt: a.createdAt } })) }, select: { type: true, recordId: true } });
  const asked = new Set(later.map((l) => `${l.type}:${l.recordId}`));
  return rows.filter((a) => !asked.has(`${a.type}:${a.recordId}`));
}

/** Is this decided request's record still waiting on it? */
async function stillWaits(tx: Tx, a: Approval) {
  if (!(DECIDED as readonly string[]).includes(a.status)) return false;
  const check = unfinishedOf(a.type);
  if (!check || !(await check(tx)).includes(a.id)) return false;
  return (await newestOnly(tx, [a])).length === 1;
}

/**
 * Decided requests (approved, not approved or sent back) whose record still
 * waits on them, that this person may finish: the ones they decided, or
 * every one for the Principal and School Admin. Latest decision first.
 */
export async function unfinishedApprovals(tx: Tx, ctx: SchoolContext, opts: { any?: boolean } = {}) {
  if (!ctx.userId) return [];
  const any = opts.any ?? (await finishesAny(tx, ctx));
  const byType: { type: string; ids: string[] }[] = [];
  for (const [type, check] of unfinishedChecks()) {
    const ids = await check(tx);
    if (ids.length) byType.push({ type, ids });
  }
  if (!byType.length) return [];
  const rows = await tx.approval.findMany({
    where: { schoolId: ctx.schoolId, status: { in: [...DECIDED] }, OR: byType.map((t) => ({ type: t.type, id: { in: t.ids } })), ...(any ? {} : { decidedById: ctx.userId }) },
    orderBy: { decidedAt: "desc" },
    take: 200,
  });
  return newestOnly(tx, rows);
}

/**
 * Finish now: runs the request's follow-up as it runs when a request is
 * decided, as the person who decided it, and writes an Audit Log line with
 * who finished it. Throws (and changes nothing) when it cannot be done now.
 */
export async function finishFollowUp(tx: Tx, ctx: SchoolContext, approvalId: string) {
  if (!ctx.userId) throw new DecisionProblem("Sign in to finish a request.");
  // Two people tapping Finish now at once: the second waits, then finds it finished.
  await tx.$queryRaw`SELECT id FROM approval WHERE id = ${approvalId}::uuid FOR UPDATE`;
  const a = await tx.approval.findFirst({ where: { id: approvalId, schoolId: ctx.schoolId } });
  if (!a) throw new DecisionProblem("This request was not found.");
  if (a.decidedById !== ctx.userId && !(await finishesAny(tx, ctx))) throw new DecisionProblem("Only the person who decided this request, the Principal or the School Admin can finish it.");
  if (!(await stillWaits(tx, a))) throw new DecisionProblem("This request is already finished: its record has moved on. Nothing was changed.");
  const decision = decisionOf(a);
  const followUp = await followUpFor(a.type);
  if (!decision || !followUp) throw new DecisionProblem(`School OS cannot finish this request (${requestLabel(a.type)}). Nothing was changed. Please tell DREAM TEAM support.`);
  // The same follow-up a decision runs today, done as the person who decided (their name stays on the record).
  const asDecider: SchoolContext = { schoolId: ctx.schoolId, userId: a.decidedById ?? ctx.userId };
  await followUp(tx, asDecider, a, decision, a.decisionReason);
  if (await stillWaits(tx, a)) throw new DecisionProblem("School OS could not finish this request: its record did not move on. Nothing was changed. Please tell DREAM TEAM support.");
  await writeAudit(tx, ctx, {
    action: "approval-follow-up-finished",
    recordType: "Approval",
    recordId: a.id,
    before: { status: a.status, record: `${a.recordType} still waiting` },
    after: { decision, request: requestLabel(a.type), summary: a.summary, decidedBy: a.decidedById, decidedAt: a.decidedAt?.toISOString() ?? null, finishedBy: ctx.userId },
  });
  return { approval: a, decision };
}
