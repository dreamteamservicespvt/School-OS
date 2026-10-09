// Approval rules (Settings, Forms & Approvals): for each kind of request,
// the steps, who approves at each step (a role or a named person), amount
// limits and escalation. src/lib/approvals.ts routes every request by these.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { REQUEST_TYPES, defaultSteps, requestLabel, type RuleStep } from "../approvals";
import { SettingsProblem } from "./common";
import { ruleSummary, type Namer, type StepDraft } from "./approval-rule-words";

export { ruleSummary } from "./approval-rule-words";

export const MAX_STEPS = 5;

/** The rule in use for each request type: the school's own, or the default. */
export async function rulesInUse(tx: Tx, schoolId: string) {
  const rows = await tx.approvalRule.findMany({ where: { schoolId, archivedAt: null } });
  return REQUEST_TYPES.map((t) => {
    const row = rows.find((r) => r.requestType === t.key);
    return {
      type: t.key,
      label: t.label,
      custom: Boolean(row),
      steps: (row?.steps as RuleStep[] | undefined) ?? defaultSteps(t.key),
      escalateAfterDays: row?.escalateAfterDays ?? 2,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/** Names of roles and people for summaries. */
export async function ruleNamer(tx: Tx, schoolId: string): Promise<Namer> {
  const roles = await tx.role.findMany({ where: { schoolId }, select: { key: true, id: true, name: true } });
  const accesses = await tx.schoolAccess.findMany({ where: { schoolId }, select: { userLogin: { select: { id: true, displayName: true } } } });
  const people = new Map(accesses.map((a) => [a.userLogin.id, a.userLogin.displayName]));
  return {
    role: (k) => roles.find((r) => r.key === k || r.id === k)?.name ?? "removed role",
    person: (id) => people.get(id) ?? "a person no longer here",
  };
}

/** Role keys for approver choices. A custom role has no key, so its id is used as the key. */
export function roleKeyOf(role: { key: string | null; id: string }) {
  return role.key ?? role.id;
}

/**
 * Checks and saves a rule. Every step needs an approver who exists and is
 * active; amount limits go up from step to step, and steps without a limit
 * come after the steps with one.
 */
export async function saveRule(tx: Tx, ctx: SchoolContext, requestType: string, input: { steps: StepDraft[]; escalateAfterDays: number }) {
  if (!REQUEST_TYPES.some((t) => t.key === requestType)) throw new SettingsProblem("This kind of request was not found.");
  const steps = input.steps;
  if (steps.length === 0) throw new SettingsProblem("Add at least one step.", "steps");
  if (steps.length > MAX_STEPS) throw new SettingsProblem(`Use at most ${MAX_STEPS} steps.`, "steps");
  if (!Number.isInteger(input.escalateAfterDays) || input.escalateAfterDays < 1 || input.escalateAfterDays > 30) {
    throw new SettingsProblem("Escalate after must be between 1 and 30 working days.", "escalateAfterDays");
  }
  const roles = await tx.role.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null } });
  const clean: RuleStep[] = [];
  let lastLimit: bigint | null = null;
  let seenOpen = false;
  for (const [i, s] of steps.entries()) {
    const n = i + 1;
    if (!s.approverRole && !s.approverUserId) throw new SettingsProblem(`Step ${n}: choose who approves.`, `step${i}`);
    if (s.approverRole) {
      const role = roles.find((r) => roleKeyOf(r) === s.approverRole);
      if (!role) throw new SettingsProblem(`Step ${n}: that role was not found.`, `step${i}`);
      if (!role.isEnabled) throw new SettingsProblem(`Step ${n}: the ${role.name} role is switched off. Switch it on in Roles, or pick another approver.`, `step${i}`);
      const holders = await tx.schoolAccess.count({ where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { roleId: role.id } } } });
      if (holders === 0) throw new SettingsProblem(`Step ${n}: no active user has the ${role.name} role. Pick another approver.`, `step${i}`);
    } else {
      const person = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: s.approverUserId!, archivedAt: null, userLogin: { status: "ACTIVE" } }, include: { userLogin: true } });
      if (!person) throw new SettingsProblem(`Step ${n}: that person is not an active user of your school. Pick another approver.`, `step${i}`);
    }
    let up: bigint | null = null;
    if (s.upToPaise) {
      if (!/^\d+$/.test(s.upToPaise) || BigInt(s.upToPaise) <= BigInt(0)) throw new SettingsProblem(`Step ${n}: the amount limit must be more than ₹0.`, `step${i}`);
      up = BigInt(s.upToPaise);
      if (seenOpen) throw new SettingsProblem(`Step ${n}: steps with an amount limit must come before steps with no limit.`, `step${i}`);
      if (lastLimit !== null && up <= lastLimit) throw new SettingsProblem(`Step ${n}: the amount limit must be higher than the step before it.`, `step${i}`);
      lastLimit = up;
    } else seenOpen = true;
    clean.push(s.approverUserId ? { approverUserId: s.approverUserId, upToPaise: up?.toString() ?? null } : { approverRole: s.approverRole, upToPaise: up?.toString() ?? null });
  }

  const existing = await tx.approvalRule.findUnique({ where: { schoolId_requestType: { schoolId: ctx.schoolId, requestType } } });
  const before = existing && !existing.archivedAt ? { steps: existing.steps, escalateAfterDays: existing.escalateAfterDays } : { steps: defaultSteps(requestType), escalateAfterDays: 2, default: true };
  const rule = existing
    ? await tx.approvalRule.update({ where: { id: existing.id }, data: { steps: clean, escalateAfterDays: input.escalateAfterDays, updatedById: ctx.userId, archivedAt: null } })
    : await tx.approvalRule.create({ data: { schoolId: ctx.schoolId, requestType, steps: clean, escalateAfterDays: input.escalateAfterDays, updatedById: ctx.userId } });
  const summary = ruleSummary(requestLabel(requestType), clean, input.escalateAfterDays, await ruleNamer(tx, ctx.schoolId));
  await writeAudit(tx, ctx, { action: "changed", recordType: "Approval Rule", recordId: rule.id, before: before as never, after: { steps: clean, escalateAfterDays: input.escalateAfterDays, summary } as never });
  return { rule, summary };
}

/** Goes back to the default rule for a request type. The old rule is archived, not deleted. */
export async function useDefaultRule(tx: Tx, ctx: SchoolContext, requestType: string) {
  const existing = await tx.approvalRule.findUnique({ where: { schoolId_requestType: { schoolId: ctx.schoolId, requestType } } });
  if (!existing || existing.archivedAt) return false;
  await tx.approvalRule.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Approval Rule", recordId: existing.id, before: { steps: existing.steps, escalateAfterDays: existing.escalateAfterDays } as never, after: { default: true } });
  return true;
}
