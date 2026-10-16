"use server";

import { formatRupees } from "@/lib/format";
import { id, needRupees, optionalId, str, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { copyBudgets, reviseBudget, setBudget } from "@/lib/finance/budgets";
import { financeFeaturesOn } from "@/lib/finance/settings";
import { financialYearOf } from "@/lib/finance/years";
import type { SchoolContext, Tx } from "@/lib/db";
import { financeAction } from "../_lib/action";

async function budgetsOn(tx: Tx, ctx: SchoolContext) {
  if (!(await financeFeaturesOn(tx, ctx)).has("finance-budget")) throw new MoneyProblem("Budgets are switched off in Finance Settings.");
}

export async function setBudgetAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    await budgetsOn(tx, ctx);
    const amount = needRupees(fd, "amount", "Amount for the year");
    const period = str(fd, "period");
    const b = await setBudget(tx, ctx, { financialYearId: id(fd, "financialYearId", "financial year"), accountHeadId: id(fd, "accountHeadId", "expense head"), costCentreId: optionalId(fd, "costCentreId"), period, amountPaise: amount, split: null });
    const head = await tx.accountHead.findUniqueOrThrow({ where: { id: b.accountHeadId } });
    const parts = period === "month" ? 12 : period === "term" ? 3 : 1;
    return { head: head.name, amount: formatRupees(amount), each: parts > 1 ? `${formatRupees(amount / BigInt(parts))} a ${period}` : null };
  }, (r) => `Budget set: ${r.head}, ${r.amount}${r.each ? ` (${r.each})` : ""}.`);
}

export async function reviseBudgetAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    await budgetsOn(tx, ctx);
    const amount = needRupees(fd, "amount", "New budget for the year");
    await reviseBudget(tx, ctx, id(fd, "budgetId", "budget"), amount, text(fd, "reason", "Reason", { min: 5, max: 300 }));
    return formatRupees(amount);
  }, (a) => `Budget now ${a}. The original and every revision are kept.`);
}

/** Plan next year: copy this year's budgets with a % change. */
export async function copyBudgetsAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    await budgetsOn(tx, ctx);
    const raw = str(fd, "percent").replace(/[^\d.-]/g, "");
    if (raw === "") throw new MoneyProblem("Enter a percentage (0 for no change).", "percent");
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < -50 || pct > 50) throw new MoneyProblem("Use a change between −50% and 50%. More looks like a mistake.", "percent");
    const from = await tx.financialYear.findFirst({ where: { id: id(fd, "fromYearId", "financial year") } });
    if (!from) throw new MoneyProblem("Choose the financial year.");
    const next = new Date(from.endDate.getTime() + 86400000);
    const to = await financialYearOf(tx, ctx, next);
    const made = await copyBudgets(tx, ctx, from.id, to.id, Math.round(pct * 100));
    return { made, year: to.name };
  }, (r) => (r.made ? `${r.made} ${r.made === 1 ? "budget" : "budgets"} made for ${r.year}. Change any head before the year starts.` : `Every head already has a budget for ${r.year}. Nothing was copied.`));
}
