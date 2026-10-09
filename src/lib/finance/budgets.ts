// Budget (optional, 07 §2): yearly amounts by expense head and department.
// Used is never stored or typed: it is worked out from paid expenses (rule
// 38); committed is approved but not yet paid. Alerts at 80% and 100%.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { MoneyProblem } from "../fees/problem";
import { financeFeaturesOn } from "./settings";

const ZERO = BigInt(0);
export const ALERT_AT = [80, 100];

/** Paid and committed amounts per head and department in a financial year. */
async function usage(tx: Tx, financialYearId: string, excludeExpenseId?: string) {
  const fy = await tx.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
  const paid = await tx.expensePayment.findMany({
    where: { cancelledAt: null, date: { gte: fy.startDate, lte: fy.endDate }, expense: { status: { not: "CANCELLED" } } },
    include: { expense: { select: { accountHeadId: true, costCentreId: true } } },
  });
  const committed = await tx.expense.findMany({
    where: { status: { in: ["APPROVED", "WAITING"] }, financialYearId, broughtIn: false, ...(excludeExpenseId ? { id: { not: excludeExpenseId } } : {}) },
    select: { accountHeadId: true, costCentreId: true, amountPaise: true, paidPaise: true },
  });
  const broughtIn = await tx.expense.findMany({ where: { broughtIn: true, status: "PAID", financialYearId }, select: { accountHeadId: true, costCentreId: true, amountPaise: true } });
  return { paid, committed, broughtIn };
}

function usedFor(u: Awaited<ReturnType<typeof usage>>, headId: string, costCentreId: string | null) {
  const match = (h: string, c: string | null) => h === headId && (costCentreId === null || c === costCentreId);
  const spent = u.paid.filter((p) => match(p.expense.accountHeadId, p.expense.costCentreId)).reduce((s, p) => s + p.amountPaise, ZERO)
    + u.broughtIn.filter((e) => match(e.accountHeadId, e.costCentreId)).reduce((s, e) => s + e.amountPaise, ZERO);
  const committed = u.committed.filter((e) => match(e.accountHeadId, e.costCentreId)).reduce((s, e) => s + e.amountPaise - e.paidPaise, ZERO);
  return { spent, committed };
}

export async function budgetsWithUse(tx: Tx, financialYearId: string) {
  const budgets = await tx.budget.findMany({ where: { financialYearId, archivedAt: null }, include: { revisions: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } });
  const u = await usage(tx, financialYearId);
  return budgets.map((b) => {
    const { spent, committed } = usedFor(u, b.accountHeadId, b.costCentreId);
    const remaining = b.amountPaise - spent - committed;
    const pct = b.amountPaise > ZERO ? Math.round((Number(spent + committed) * 100) / Number(b.amountPaise)) : 0;
    return { ...b, spent, committed, remaining, pct, alert: pct >= 100 ? "over" : pct >= 80 ? "near" : null };
  });
}

/** What an expense does to its head's budget: a warning at 80% and above 100% (07 Done when 8). */
export async function budgetImpact(tx: Tx, ctx: SchoolContext, input: { financialYearId: string; accountHeadId: string; costCentreId: string | null; amountPaise: bigint; excludeExpenseId?: string }) {
  if (!(await financeFeaturesOn(tx, ctx)).has("finance-budget")) return null;
  const budgets = await tx.budget.findMany({ where: { financialYearId: input.financialYearId, accountHeadId: input.accountHeadId, archivedAt: null, OR: [{ costCentreId: null }, ...(input.costCentreId ? [{ costCentreId: input.costCentreId }] : [])] } });
  if (!budgets.length) return null;
  const b = budgets.find((x) => x.costCentreId === input.costCentreId) ?? budgets[0];
  const u = await usage(tx, input.financialYearId, input.excludeExpenseId);
  const { spent, committed } = usedFor(u, b.accountHeadId, b.costCentreId);
  const after = spent + committed + input.amountPaise;
  const pct = b.amountPaise > ZERO ? Math.round((Number(after) * 100) / Number(b.amountPaise)) : 0;
  if (pct < 80) return null;
  const head = await tx.accountHead.findUnique({ where: { id: b.accountHeadId } });
  return { pct, message: `${head?.name ?? "This"} budget: ${pct}% used after this expense`, over: pct > 100 };
}

export type BudgetInput = { financialYearId: string; accountHeadId: string; costCentreId: string | null; period: string; amountPaise: bigint; split: bigint[] | null };

export async function setBudget(tx: Tx, ctx: SchoolContext, input: BudgetInput) {
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Budget must be more than ₹0.", "amount");
  const fy = await tx.financialYear.findFirst({ where: { id: input.financialYearId } });
  if (!fy) throw new MoneyProblem("Choose the financial year.", "financialYearId");
  if (fy.status === "CLOSED") throw new MoneyProblem(`Finance year ${fy.name} is closed, so its budgets cannot change.`);
  const head = await tx.accountHead.findFirst({ where: { id: input.accountHeadId, kind: "EXPENSE", archivedAt: null } });
  if (!head) throw new MoneyProblem("Choose an expense head.", "accountHeadId");
  if (!["year", "term", "month"].includes(input.period)) throw new MoneyProblem("Choose year, term or month.", "period");
  const parts = input.split ?? equalSplit(input.amountPaise, input.period === "month" ? 12 : input.period === "term" ? 3 : 1);
  if (parts.reduce((s, p) => s + p, ZERO) !== input.amountPaise) throw new MoneyProblem(`The split adds up to ${formatRupees(parts.reduce((s, p) => s + p, ZERO))}. Budget is ${formatRupees(input.amountPaise)}.`, "split");
  const clash = await tx.budget.findFirst({ where: { financialYearId: fy.id, accountHeadId: head.id, costCentreId: input.costCentreId, archivedAt: null } });
  if (clash) throw new MoneyProblem(`There is already a ${head.name} budget for ${fy.name}. Revise it instead.`, "accountHeadId");
  const b = await tx.budget.create({
    data: { schoolId: ctx.schoolId, financialYearId: fy.id, accountHeadId: head.id, costCentreId: input.costCentreId, period: input.period, amountPaise: input.amountPaise, originalPaise: input.amountPaise, split: parts.map((p) => p.toString()), createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Budget", recordId: b.id, after: { head: head.name, year: fy.name, amount: formatRupees(input.amountPaise) } });
  return b;
}

export function equalSplit(total: bigint, n: number) {
  const r = BigInt(100);
  const each = (total / BigInt(n) / r) * r;
  const parts = Array.from({ length: n }, () => each);
  parts[n - 1] = total - each * BigInt(n - 1);
  return parts;
}

/** Revises a budget: the original and each revision are kept. */
export async function reviseBudget(tx: Tx, ctx: SchoolContext, budgetId: string, amountPaise: bigint, reason: string) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  if (amountPaise <= ZERO) throw new MoneyProblem("Budget must be more than ₹0.", "amount");
  const b = await tx.budget.findFirst({ where: { id: budgetId, archivedAt: null } });
  if (!b) throw new MoneyProblem("This budget was not found.");
  if (b.amountPaise === amountPaise) throw new MoneyProblem("The new amount is the same as the current one.", "amount");
  await tx.budgetRevision.create({ data: { schoolId: ctx.schoolId, budgetId: b.id, fromPaise: b.amountPaise, toPaise: amountPaise, reason: reason.trim(), createdById: ctx.userId } });
  const parts = equalSplit(amountPaise, b.period === "month" ? 12 : b.period === "term" ? 3 : 1);
  await tx.budget.update({ where: { id: b.id }, data: { amountPaise, split: parts.map((p) => p.toString()) } });
  await writeAudit(tx, ctx, { action: "revised", recordType: "Budget", recordId: b.id, before: { amount: formatRupees(b.amountPaise) }, after: { amount: formatRupees(amountPaise), reason } });
}

/** Copies last year's budgets into a year with a % change. Heads already budgeted are skipped. */
export async function copyBudgets(tx: Tx, ctx: SchoolContext, fromYearId: string, toYearId: string, percentBp: number) {
  if (fromYearId === toYearId) throw new MoneyProblem("Choose a different year to copy from.", "fromYearId");
  const from = await tx.budget.findMany({ where: { financialYearId: fromYearId, archivedAt: null } });
  if (!from.length) throw new MoneyProblem("That year has no budgets to copy.", "fromYearId");
  let made = 0;
  for (const b of from) {
    const exists = await tx.budget.findFirst({ where: { financialYearId: toYearId, accountHeadId: b.accountHeadId, costCentreId: b.costCentreId, archivedAt: null } });
    if (exists) continue;
    const amount = (((b.amountPaise * BigInt(10000 + percentBp)) / BigInt(10000) + BigInt(50)) / BigInt(100)) * BigInt(100);
    await setBudget(tx, ctx, { financialYearId: toYearId, accountHeadId: b.accountHeadId, costCentreId: b.costCentreId, period: b.period, amountPaise: amount, split: null });
    made++;
  }
  return made;
}

export async function archiveBudget(tx: Tx, ctx: SchoolContext, budgetId: string) {
  await tx.budget.update({ where: { id: budgetId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Budget", recordId: budgetId });
}
