// One Approvals list for every request (00-global.md §3). Modules create
// requests here; what happens to each request's record once it is decided is
// listed in ./approval-handlers.ts, which decide() loads itself. Who approves
// comes from Settings, Forms & Approvals.
import "server-only";

import { Prisma, type ApprovalStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "./db";
import { writeAudit } from "./audit";
import { notify } from "./notifications";
import { formatRupees } from "./format";
import { approvalOffCampus, approvalsOnCampus } from "./approval-campus";
import { missingRecordWords } from "./approval-records";

export const REQUEST_TYPES = [
  { key: "student-leave", label: "Student leave" },
  { key: "staff-leave", label: "Staff leave" },
  { key: "concession", label: "Discount or concession" },
  { key: "refund", label: "Refund" },
  { key: "expense", label: "Expense" },
  { key: "purchase", label: "Purchase" },
  { key: "admission", label: "Admission" },
  { key: "certificate", label: "Certificate (including TC)" },
  { key: "payroll", label: "Salary and payroll" },
  { key: "salary-adjustment", label: "Salary adjustment" },
  { key: "salary-advance", label: "Salary advance or loan" },
  { key: "attendance-correction", label: "Attendance correction" },
  { key: "marks-moderation", label: "Marks change after lock" },
  { key: "notice", label: "Notice" },
  { key: "scholarship", label: "Scholarship" },
  { key: "transport-change", label: "Transport change" },
  { key: "outing", label: "Hostel outing pass" },
  { key: "asset-disposal", label: "Asset disposal" },
  { key: "payment-verification", label: "Fee payment verification" },
  { key: "data-deletion", label: "Data deletion" },
  { key: "user-request", label: "User join request" },
  { key: "payment-cancellation", label: "Fee payment cancellation" },
  { key: "opening-balance", label: "Opening balance change" },
  { key: "staff-exit", label: "Staff exit" },
  { key: "re-admission", label: "Student re-admission" },
  { key: "clearance-waiver", label: "Clearance waiver (student leaving)" },
  { key: "fee-structure-change", label: "Fee structure change after the year starts" },
  { key: "library-charge", label: "Library lost or damaged book charge" },
  { key: "stock-audit", label: "Stock audit adjustment" },
  { key: "stock-transfer", label: "Stock transfer between stores" },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]["key"];
export const requestLabel = (key: string) => REQUEST_TYPES.find((t) => t.key === key)?.label ?? key;

/**
 * Request types nothing in School OS asks for yet (00-global.md §3 lists
 * them, and Forms & Approvals keeps a rule for each). They cannot be asked for
 * until their module adds a follow-up in ./approval-handlers.ts.
 */
export const NOT_ASKED_YET = ["salary-adjustment", "user-request"] as const satisfies readonly RequestType[];
/** The request types a module can ask for: each has a follow-up, which TypeScript checks in ./approval-handlers.ts. */
export type AskableType = Exclude<RequestType, (typeof NOT_ASKED_YET)[number]>;

export type RuleStep = { approverRole?: string | null; approverUserId?: string | null; upToPaise?: string | null };

/** Defaults when the school has set no rule (00-global.md §3.2, inferred). */
export function defaultSteps(type: string): RuleStep[] {
  if (type === "expense") return [{ approverRole: "accountant", upToPaise: "500000" }, { approverRole: "principal" }];
  if (type === "student-leave") return [{ approverRole: "class-teacher", upToPaise: null }];
  if (type === "data-deletion" || type === "user-request") return [{ approverRole: "school-admin" }];
  return [{ approverRole: "principal" }];
}

export const OPEN_STATUSES: ApprovalStatus[] = ["WAITING", "ESCALATED"];

/**
 * Roles that never decide a request type, whatever the school's rule says
 * (owner's rules, 12 Oct 2026): HR does not approve staff leave; it goes to
 * the head of department, then the Principal.
 */
export const NEVER_DECIDES: Readonly<Partial<Record<RequestType, readonly string[]>>> = { "staff-leave": ["hr"] };
/** Request types only one role may reject (owner's rules, 12 Oct 2026): only the Principal rejects an admission. */
export const ONLY_REJECTS: Readonly<Partial<Record<RequestType, string>>> = { admission: "principal" };

export const barredFrom = (type: string, role: string | null | undefined) => Boolean(role && NEVER_DECIDES[type as RequestType]?.includes(role));

/** Does this person hold this role (switched on) in the school? */
export async function holdsRole(tx: Tx, ctx: SchoolContext, roleKey: string) {
  if (!ctx.userId) return false;
  const n = await tx.schoolAccess.count({ where: { schoolId: ctx.schoolId, userLoginId: ctx.userId, archivedAt: null, roles: { some: { role: { key: roleKey, isEnabled: true, archivedAt: null } } } } });
  return n > 0;
}

/** May this person reject (not only approve) requests of this type? */
export async function mayReject(tx: Tx, ctx: SchoolContext, type: string) {
  const only = ONLY_REJECTS[type as RequestType];
  return only ? holdsRole(tx, ctx, only) : true;
}

/** Picks the step for an amount: the first whose limit covers it ("up to ₹5,000 the Accountant; above, the Principal"). */
export function stepForAmount(steps: RuleStep[], amountPaise: bigint | null): number {
  if (steps.length === 0) return -1;
  if (amountPaise === null) return 0;
  const i = steps.findIndex((s) => !s.upToPaise || amountPaise <= BigInt(s.upToPaise));
  return i === -1 ? steps.length - 1 : i;
}

async function holders(tx: Tx, schoolId: string, step: RuleStep): Promise<string[]> {
  if (step.approverUserId) {
    const u = await tx.schoolAccess.findFirst({ where: { schoolId, userLoginId: step.approverUserId, archivedAt: null, userLogin: { status: "ACTIVE" } } });
    return u ? [step.approverUserId] : [];
  }
  if (!step.approverRole) return [];
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: step.approverRole, isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  });
  return rows.map((r) => r.userLoginId);
}

export type NewRequest = {
  type: AskableType;
  recordType: string;
  recordId: string;
  summary: string;
  amountPaise?: bigint | null;
  reason?: string | null;
  /** A named person for this one request, e.g. the class teacher of the student's section. Used when the rule's first step is that role. */
  preferredApproverId?: string | null;
  /** The people the request is about (the staff member on leave, the staff whose attendance changes). They never decide it. */
  aboutUserIds?: (string | null | undefined)[];
  /** A role that decides first, before the rule's steps (HR for staff attendance corrections). Escalation moves it to the rule's first step. */
  firstApproverRole?: string | null;
  /**
   * A named person who decides first, before the rule's steps (e.g. the head
   * of the staff member's department for staff leave). If nobody decides in
   * time, escalation moves the request to the rule's first step.
   */
  firstApproverId?: string | null;
};

async function stepsFor(tx: Tx, schoolId: string, type: string): Promise<{ steps: RuleStep[]; escalateAfterDays: number }> {
  const rule = await tx.approvalRule.findUnique({ where: { schoolId_requestType: { schoolId, requestType: type } } });
  if (rule && !rule.archivedAt) return { steps: rule.steps as RuleStep[], escalateAfterDays: rule.escalateAfterDays };
  return { steps: defaultSteps(type), escalateAfterDays: 2 };
}

/** How many steps the school's rule for a request type has (Settings, Forms & Approvals). */
export async function ruleStepCount(tx: Tx, schoolId: string, type: string): Promise<number> {
  return (await stepsFor(tx, schoolId, type)).steps.length;
}

/**
 * "Step 2 of 3", for a request whose rule has more than one step; null for a
 * one-step request (nothing to count). The stored step is 1-based; 0 is a
 * person asked before the rule (a head of department), shown as the first.
 */
export function stepWords(step: number, steps: number): string | null {
  if (steps <= 1) return null;
  return `${Math.min(Math.max(step, 1), steps)} of ${steps}`;
}

/**
 * Puts a request in the Approvals list. A person never approves their own
 * request: if the requester is the only one who could, it goes to the next
 * step, and finally to the Principal.
 */
export async function requestApproval(tx: Tx, ctx: SchoolContext, req: NewRequest) {
  if (!ctx.userId) throw new Error("A request needs a person");
  const amount = req.amountPaise ?? null;
  const about = [...new Set((req.aboutUserIds ?? []).filter((x): x is string => Boolean(x)))];
  // Nobody approves their own request, or one about themselves.
  const notSelf = (p: string) => p !== ctx.userId && !about.includes(p);
  const { steps } = await stepsFor(tx, ctx.schoolId, req.type);
  let index = stepForAmount(steps, amount);
  let route: { role: string | null; user: string | null; people: string[] } | null = null;
  if (req.firstApproverId && notSelf(req.firstApproverId) && index >= 0) {
    const people = await holders(tx, ctx.schoolId, { approverUserId: req.firstApproverId });
    if (people.length > 0) {
      route = { role: null, user: req.firstApproverId, people };
      index = -1;
    }
  }
  if (!route && req.firstApproverRole && !barredFrom(req.type, req.firstApproverRole) && index >= 0) {
    const people = (await holders(tx, ctx.schoolId, { approverRole: req.firstApproverRole })).filter(notSelf);
    if (people.length > 0) {
      route = { role: req.firstApproverRole, user: null, people };
      index = -1;
    }
  }
  if (!route && req.preferredApproverId && notSelf(req.preferredApproverId) && index >= 0 && !barredFrom(req.type, steps[index].approverRole)) {
    const people = await holders(tx, ctx.schoolId, steps[index]);
    if (people.includes(req.preferredApproverId)) route = { role: null, user: req.preferredApproverId, people: [req.preferredApproverId] };
  }
  for (; !route && index >= 0 && index < steps.length; index++) {
    if (!steps[index].approverUserId && barredFrom(req.type, steps[index].approverRole)) continue;
    const people = (await holders(tx, ctx.schoolId, steps[index])).filter(notSelf);
    if (people.length > 0) {
      route = { role: steps[index].approverUserId ? null : steps[index].approverRole ?? null, user: steps[index].approverUserId ?? null, people };
      break;
    }
  }
  if (!route) {
    const people = (await holders(tx, ctx.schoolId, { approverRole: "principal" })).filter(notSelf);
    const admins = people.length ? people : (await holders(tx, ctx.schoolId, { approverRole: "school-admin" })).filter(notSelf);
    if (admins.length === 0) {
      // Often the person asking is the school's only School Admin: tell them to add the approver, not to ask themselves.
      throw new Error(await holdsRole(tx, ctx, "school-admin")
        ? "Nobody else can approve this yet. Add a Principal or another School Admin in Settings, Users & Permissions."
        : "Nobody else can approve this yet. Ask your School Admin to add a Principal (Settings, Users & Permissions).");
    }
    route = { role: people.length ? "principal" : "school-admin", user: null, people: admins };
    index = steps.length;
  }

  const approval = await tx.approval.create({
    data: {
      schoolId: ctx.schoolId,
      type: req.type,
      recordType: req.recordType,
      recordId: req.recordId,
      summary: req.summary,
      amountPaise: amount,
      reason: req.reason ?? null,
      askedById: ctx.userId,
      aboutUserIds: about,
      currentApproverId: route.user,
      currentApproverRole: route.role,
      step: index + 1,
      history: [{ at: new Date().toISOString(), by: ctx.userId, action: "asked", note: req.reason ?? null }],
    },
  });
  for (const person of route.people) {
    await notify(tx, ctx, {
      to: person,
      type: "approval",
      text: `Waiting for your approval: ${req.summary}`,
      link: `/approvals/${approval.id}`,
      groupKey: `approval-${req.type}`,
      mergedText: (n) => `${n} ${requestLabel(req.type).toLowerCase()} requests are waiting for your approval`,
    });
  }
  await writeAudit(tx, ctx, { action: "asked-approval", recordType: "Approval", recordId: approval.id, after: { type: req.type, summary: req.summary, amount: amount?.toString() ?? null } });
  return approval;
}

/** Can this person decide this request? */
export async function canDecide(tx: Tx, ctx: SchoolContext, approval: { type: string; askedById: string; aboutUserIds?: string[] | null; currentApproverId: string | null; currentApproverRole: string | null; status: ApprovalStatus }) {
  if (!ctx.userId || approval.askedById === ctx.userId || !OPEN_STATUSES.includes(approval.status)) return false;
  if ((approval.aboutUserIds ?? []).includes(ctx.userId)) return false;
  if (approval.currentApproverId) return approval.currentApproverId === ctx.userId;
  if (!approval.currentApproverRole || barredFrom(approval.type, approval.currentApproverRole)) return false;
  const mine = await tx.schoolAccess.findFirst({
    where: { schoolId: ctx.schoolId, userLoginId: ctx.userId, archivedAt: null, roles: { some: { role: { key: approval.currentApproverRole, isEnabled: true } } } },
  });
  return Boolean(mine);
}

/**
 * Does this person decide requests of this type: a step of the school's rule
 * names them or a role they hold, or they are the Principal, who decides last
 * (the School Admin, when the school has no Principal)? Used where an approver
 * acting on their own work needs nobody's approval (a notice to parents).
 */
export async function decidesRequestsOf(tx: Tx, ctx: SchoolContext, type: AskableType) {
  if (!ctx.userId) return false;
  const { steps } = await stepsFor(tx, ctx.schoolId, type);
  for (const step of [...steps, { approverRole: "principal" }]) {
    if (step.approverUserId) {
      if (step.approverUserId === ctx.userId) return true;
    } else if (step.approverRole && !barredFrom(type, step.approverRole) && (await holdsRole(tx, ctx, step.approverRole))) return true;
  }
  const noPrincipal = (await holders(tx, ctx.schoolId, { approverRole: "principal" })).length === 0;
  return noPrincipal && (await holdsRole(tx, ctx, "school-admin"));
}

/** The open requests this person may decide (only their campus's, for a person limited to one campus). */
export async function approvalsFor(tx: Tx, ctx: SchoolContext, roleKeys: (string | null)[], extra: Prisma.ApprovalWhereInput = {}): Promise<Prisma.ApprovalWhereInput> {
  const keys = roleKeys.filter((k): k is string => Boolean(k));
  // A role barred from a request type (HR and staff leave) never sees it as waiting for them.
  const barredFor = Object.entries(NEVER_DECIDES).flatMap(([type, roles]) => (roles ?? []).filter((r) => keys.includes(r)).map((r) => ({ type, currentApproverRole: r })));
  return approvalsOnCampus(tx, ctx, {
    AND: [
      extra,
      { schoolId: ctx.schoolId, status: { in: OPEN_STATUSES }, askedById: { not: ctx.userId ?? undefined } },
      ...(ctx.userId ? [{ NOT: { aboutUserIds: { has: ctx.userId } } }] : []),
      { OR: [{ currentApproverId: ctx.userId }, { currentApproverId: null, currentApproverRole: { in: keys } }] },
      ...(barredFor.length ? [{ NOT: { OR: barredFor } }] : []),
    ],
  } satisfies Prisma.ApprovalWhereInput);
}

export type Decision = "approve" | "reject" | "ask-change" | "withdraw";

/** The plain words when someone other than the one allowed role tries to reject. */
export function rejectRefusal(type: string) {
  const role = ONLY_REJECTS[type as RequestType];
  const who = role === "principal" ? "the Principal" : "the school's chosen approver";
  return `Only ${who} can reject ${requestLabel(type).toLowerCase()} requests. You can approve it or ask for a change.`;
}

/** What happens to a request's record when it is decided (00-global.md §3.4). Each module's list is in ./approval-handlers.ts. */
export type FollowUp = (tx: Tx, ctx: SchoolContext, approval: { id: string; recordType: string; recordId: string; amountPaise: bigint | null }, decision: Decision, note: string | null) => Promise<void>;

/**
 * The follow-up for a request type, or null when there is none. The list is
 * loaded here, by this file, so no screen, job or script has to remember to
 * import it: a server that has just started runs the same follow-ups as one
 * that has been up all day. Loaded on first use because the modules'
 * follow-ups themselves use this file (requestApproval).
 */
export async function followUpFor(type: string): Promise<FollowUp | null> {
  const { followUpOf } = await import("./approval-handlers");
  return followUpOf(type);
}

export class DecisionProblem extends Error {}

/**
 * The plain words of a problem the person can act on: a decision refused, or
 * a module's own problem from a follow-up ("Class 5 is full", "Net pay is
 * below zero for..."). Null for a fault on our side, whose words are not for
 * the screen.
 */
export function plainReason(e: unknown): string | null {
  if (!(e instanceof Error) || !e.message) return null;
  if (e instanceof DecisionProblem) return e.message;
  if (Object.getPrototypeOf(e) === Error.prototype) return null;
  if ([TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError].some((K) => e instanceof K)) return null;
  if ([Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError, Prisma.PrismaClientValidationError, Prisma.PrismaClientInitializationError, Prisma.PrismaClientRustPanicError].some((K) => e instanceof K)) return null;
  return e.message;
}

export async function decide(tx: Tx, ctx: SchoolContext, approvalId: string, decision: Decision, note: string | null) {
  const approval = await tx.approval.findUnique({ where: { id: approvalId } });
  // A request about another campus's record is unknown to a person limited to one campus.
  if (!approval || (await approvalOffCampus(tx, ctx, approval))) throw new DecisionProblem("This request was not found.");
  if (!OPEN_STATUSES.includes(approval.status)) throw new DecisionProblem("This request was already decided.");

  if (decision === "withdraw") {
    if (approval.askedById !== ctx.userId) throw new DecisionProblem("Only the person who asked can withdraw a request.");
  } else {
    if (approval.askedById === ctx.userId) throw new DecisionProblem("Nobody can approve their own request.");
    if (ctx.userId && approval.aboutUserIds.includes(ctx.userId)) throw new DecisionProblem("This request is about you, so someone else decides it.");
    if (!(await canDecide(tx, ctx, approval))) throw new DecisionProblem("This request is waiting for someone else.");
    if (decision === "reject" && !(await mayReject(tx, ctx, approval.type))) throw new DecisionProblem(rejectRefusal(approval.type));
  }
  if ((decision === "reject" || decision === "ask-change") && (!note || note.trim().length < 5)) {
    throw new DecisionProblem("Give a reason of at least 5 characters, so the person knows why.");
  }

  // Without a follow-up the request would say Approved while its record stays waiting: refuse, and change nothing.
  const followUp = await followUpFor(approval.type);
  if (!followUp) throw new DecisionProblem(`School OS cannot act on this request yet (${requestLabel(approval.type)}), so nothing was changed. Please tell DREAM TEAM support.`);

  // A request whose record cannot be found cannot move anything on (QA SEED-03): it is
  // not approved or sent back as if it had worked. Rejecting or withdrawing it only takes it off the list.
  const missing = await missingRecordWords(tx, approval);
  if (missing && (decision === "approve" || decision === "ask-change")) {
    throw new DecisionProblem(`The ${missing} this request is about cannot be found in School OS, so it cannot be ${decision === "approve" ? "approved" : "sent back for a change"}, and nothing was changed. Reject it with a reason to take it off the list.`);
  }

  const status: ApprovalStatus = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "WITHDRAWN" : "REJECTED";
  const history = [...((approval.history as object[]) ?? []), { at: new Date().toISOString(), by: ctx.userId, action: decision, note }];
  // Only one decision can win, even if two people press at the same moment.
  const changed = await tx.approval.updateMany({
    where: { id: approval.id, status: { in: OPEN_STATUSES } },
    data: { status, decidedById: ctx.userId, decidedAt: new Date(), decisionReason: note, history },
  });
  if (changed.count === 0) throw new DecisionProblem("This request was already decided.");

  if (!missing) await followUp(tx, ctx, approval, decision, note);

  // The related notifications are done for everyone who received them (§4 rule 5).
  await tx.notification.updateMany({ where: { link: `/approvals/${approval.id}`, doneAt: null }, data: { doneAt: new Date() } });
  if (decision !== "withdraw") {
    const words = decision === "approve" ? "approved" : decision === "reject" ? "not approved" : "sent back for a change";
    await notify(tx, ctx, {
      to: approval.askedById,
      type: "approval-decided",
      text: `${approval.summary}: ${words}${note ? `. Reason: ${note}` : "."}`,
      link: `/approvals/${approval.id}`,
    });
  }
  await writeAudit(tx, ctx, {
    action: `approval-${decision}`,
    recordType: "Approval",
    recordId: approval.id,
    before: { status: approval.status },
    after: { status, note, amount: approval.amountPaise ? formatRupees(approval.amountPaise) : null },
  });
  return status;
}

/** Moves requests nobody decided in time to the next approver; both are told (§3.4). */
export async function escalateOverdue(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const open = await tx.approval.findMany({ where: { schoolId: ctx.schoolId, status: { in: OPEN_STATUSES } } });
  let moved = 0;
  for (const a of open) {
    const { steps, escalateAfterDays } = await stepsFor(tx, ctx.schoolId, a.type);
    const last = [...(a.history as { at: string }[])].reverse()[0];
    const since = new Date(last?.at ?? a.createdAt);
    if (workingDaysBetween(since, now) < escalateAfterDays) continue;
    // Steps are 1-based on the record; a step held by a role barred from this type (HR and staff leave) is passed over.
    let nextIndex = a.step;
    while (nextIndex < steps.length && !steps[nextIndex].approverUserId && barredFrom(a.type, steps[nextIndex].approverRole)) nextIndex++;
    const next = nextIndex < steps.length ? steps[nextIndex] : { approverRole: a.currentApproverRole === "principal" ? null : "principal" };
    if (!next.approverRole && !("approverUserId" in next && next.approverUserId)) continue;
    const people = (await holders(tx, ctx.schoolId, next)).filter((p) => p !== a.askedById && !a.aboutUserIds.includes(p));
    if (people.length === 0) continue;
    const before = { approverRole: a.currentApproverRole, approverId: a.currentApproverId };
    await tx.approval.update({
      where: { id: a.id },
      data: {
        status: "ESCALATED",
        step: nextIndex + 1,
        currentApproverRole: "approverUserId" in next && next.approverUserId ? null : next.approverRole ?? null,
        currentApproverId: "approverUserId" in next && next.approverUserId ? next.approverUserId : null,
        history: [...(a.history as object[]), { at: now.toISOString(), by: null, action: "escalated" }],
      },
    });
    for (const p of people) {
      await notify(tx, ctx, { to: p, type: "approval", text: `Moved to you after ${escalateAfterDays} working days: ${a.summary}`, link: `/approvals/${a.id}` });
    }
    await writeAudit(tx, ctx, { action: "approval-escalated", recordType: "Approval", recordId: a.id, before, after: { step: nextIndex + 1 } });
    moved++;
  }
  return moved;
}

/** Monday to Saturday count as working days (inferred: Indian schools work Saturdays). */
export function workingDaysBetween(from: Date, to: Date) {
  let days = 0;
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) days++;
  }
  return days;
}
