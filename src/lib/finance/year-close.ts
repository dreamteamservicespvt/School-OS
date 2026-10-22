// Closing a financial year (07 §6 "Month and year close", §5 "Entry in the
// wrong financial year", 04-data-model rule 35; 03-school-year-and-day: "On 31
// March the financial year ends too: the accounts are checked and the year is
// closed in Finance Management").
//
// Before closing, a plain check list: what stops the close (the year has not
// ended, an earlier year is still open, money dated in the year still waits to
// be verified or posted, which could never be done once the year is closed)
// and what only needs a look (expenses waiting or still to pay, salary not
// paid, days not counted). Closing makes every date in the year read-only;
// each cash and bank account's closing balance is the next year's opening
// balance (the books carry it by themselves, so nothing is typed twice), and
// income and expense heads start the next year at zero, the year's surplus or
// deficit moving to Opening balances (as the trial balance shows).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { MoneyProblem } from "../fees/problem";
import { accountBook } from "./daybook";
import { findFinanceReport } from "./reports";
import { financialYearOf, fyBounds, fyStartMonth } from "./years";

const ZERO = BigInt(0);
const DAY = 86_400_000;

export type YearCheck = {
  key: string;
  /** "stop": the year cannot close until this is done; "look": worth a look, does not stop it; "ok": nothing to do. */
  tone: "stop" | "look" | "ok";
  text: string;
  /** Where to put it right. */
  href?: string;
};

export type YearClosePlan = Awaited<ReturnType<typeof yearClosePlan>>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The check list and what closing will do, for one financial year. */
export async function yearClosePlan(tx: Tx, ctx: SchoolContext, fyId: string, today: Date, hidePay: string[] | null = null) {
  const fy = await tx.financialYear.findFirst({ where: { id: fyId, archivedAt: null } });
  if (!fy) throw new MoneyProblem("Choose the financial year.");
  const inYear = { gte: fy.startDate, lte: fy.endDate };
  const range = `from=${iso(fy.startDate)}&to=${iso(fy.endDate)}&period=custom`;
  const [earlier, waitingPays, draftIncome, waitingExpenses, unpaidExpenses, unpaidRuns, dayCloses, monthCloses, accounts] = await Promise.all([
    tx.financialYear.findMany({ where: { archivedAt: null, status: "OPEN", endDate: { lt: fy.startDate } }, orderBy: { startDate: "asc" }, select: { name: true } }),
    tx.payment.count({ where: { status: "WAITING", paymentDate: inYear } }),
    tx.income.count({ where: { status: "DRAFT", date: inYear } }),
    tx.expense.count({ where: { status: { in: ["DRAFT", "WAITING"] }, date: inYear, broughtIn: false } }),
    tx.expense.findMany({ where: { status: "APPROVED", date: inYear, broughtIn: false }, select: { amountPaise: true, paidPaise: true } }),
    tx.payrollRun.count({ where: { status: { in: ["OPEN", "CALCULATED", "WAITING", "APPROVED"] }, month: inYear } }),
    tx.dayClose.count({ where: { date: inYear, reopenedAt: null } }),
    tx.periodClose.count({ where: { financialYearId: fy.id } }),
    tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, kind: true } }),
  ]);
  const checks: YearCheck[] = [];
  const ended = fy.endDate < today;
  if (fy.status === "CLOSED") checks.push({ key: "closed", tone: "stop", text: `${fy.name} is already closed.` });
  if (!ended) checks.push({ key: "ended", tone: "stop", text: `${fy.name} has not ended yet. Close it after ${formatDate(fy.endDate)}.` });
  else checks.push({ key: "ended", tone: "ok", text: `${fy.name} ended on ${formatDate(fy.endDate)}.` });
  if (earlier.length) checks.push({ key: "earlier", tone: "stop", text: `Close ${earlier.map((e) => e.name).join(", ")} first: years close in order.` });
  checks.push(waitingPays
    ? { key: "verify", tone: "stop", text: `${plural(waitingPays, "fee payment dated in the year waits", "fee payments dated in the year wait")} for verification. Verify or reject ${waitingPays === 1 ? "it" : "them"} first: once the year is closed, nothing can be added to it.`, href: `/fee-management/dashboard?status=WAITING&${range}` }
    : { key: "verify", tone: "ok", text: "No fee payment waits for verification." });
  checks.push(draftIncome
    ? { key: "income", tone: "stop", text: `${plural(draftIncome, "income entry dated in the year is", "income entries dated in the year are")} still Draft. Post or cancel ${draftIncome === 1 ? "it" : "them"} first.`, href: `/finance-management/income?status=DRAFT&${range}` }
    : { key: "income", tone: "ok", text: "No income is left as Draft." });
  const toPay = unpaidExpenses.reduce((s, e) => s + e.amountPaise - e.paidPaise, ZERO);
  if (waitingExpenses) checks.push({ key: "waiting", tone: "look", text: `${plural(waitingExpenses, "expense dated in the year is", "expenses dated in the year are")} Draft or waiting for approval. ${waitingExpenses === 1 ? "It stays" : "They stay"} open and ${waitingExpenses === 1 ? "is" : "are"} paid in the new year.`, href: `/finance-management/expenses?tab=waiting` });
  if (unpaidExpenses.length) checks.push({ key: "to-pay", tone: "look", text: `${plural(unpaidExpenses.length, "approved expense", "approved expenses")} still to pay, ${formatRupees(toPay)}. ${unpaidExpenses.length === 1 ? "It is" : "They are"} paid in the new year, on the date paid.`, href: `/finance-management/expenses?status=APPROVED&${range}` });
  if (unpaidRuns) checks.push({ key: "salary", tone: "look", text: `${plural(unpaidRuns, "month's salary of the year is", "months' salary of the year are")} not marked paid yet. It reaches the Day Book in the new year, on the date paid.`, href: "/salary-management/generate" });
  const days = Math.round((Math.min(fy.endDate.getTime(), today.getTime() - DAY) - fy.startDate.getTime()) / DAY) + 1;
  if (dayCloses > 0 && dayCloses < days) checks.push({ key: "days", tone: "look", text: `${plural(dayCloses, "day", "days")} of the year ${dayCloses === 1 ? "was" : "were"} counted and closed in the Day Book. Days not counted are locked with the year all the same.` });
  if (monthCloses) checks.push({ key: "months", tone: "ok", text: `${plural(monthCloses, "month is", "months are")} already closed. The rest close with the year.` });

  // What closing does: each account's balance carried, the year's result.
  const carried = [] as { name: string; kind: string; closing: bigint }[];
  for (const a of accounts) {
    const b = await accountBook(tx, a.id, fy.startDate, fy.endDate);
    carried.push({ name: a.name, kind: a.kind, closing: b.closing });
  }
  const pl = await findFinanceReport("profit-loss")!.run(tx, ctx, { financialYearId: fy.id, yearStart: fy.startDate, from: fy.startDate, to: fy.endDate, group: "month", by: "head", today, hidePay });
  const surplusWord = String(pl.totals?.section ?? "Surplus");
  const result = (pl.totals?.amount as bigint | undefined) ?? ZERO;
  const nextStart = new Date(fy.endDate.getTime() + DAY);
  const nextName = (await tx.financialYear.findFirst({ where: { archivedAt: null, startDate: { lte: nextStart }, endDate: { gte: nextStart } }, select: { name: true } }))?.name
    ?? fyBounds(nextStart, await fyStartMonth(tx, ctx)).name;
  return {
    fy,
    nextStart,
    nextName,
    checks,
    canClose: !checks.some((c) => c.tone === "stop"),
    carried,
    result: { word: surplusWord === "Deficit" ? "Deficit" as const : "Surplus" as const, amount: result },
  };
}

/**
 * Closes a financial year: read-only from now on (rule 35). Refused while the
 * check list has something that stops it. The next year is opened, each
 * account's closing balance is its opening balance there, and the audit log
 * keeps the balances carried and the year's result.
 */
export async function closeFinancialYear(tx: Tx, ctx: SchoolContext, fyId: string, today: Date) {
  const plan = await yearClosePlan(tx, ctx, fyId, today);
  const stop = plan.checks.find((c) => c.tone === "stop");
  if (stop) throw new MoneyProblem(stop.text);
  // Closed only if still open: two people closing at once close it once.
  const done = await tx.financialYear.updateMany({ where: { id: plan.fy.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
  if (done.count === 0) throw new MoneyProblem(`${plan.fy.name} is already closed.`);
  const next = await financialYearOf(tx, ctx, plan.nextStart);
  await writeAudit(tx, ctx, {
    action: "closed-year", recordType: "Financial Year", recordId: plan.fy.id,
    before: { status: "Open" },
    after: {
      name: plan.fy.name, status: "Closed", nextYear: next.name,
      carried: plan.carried.map((a) => `${a.name}: ${formatRupees(a.closing)} on ${formatDate(plan.nextStart)}`),
      [plan.result.word.toLowerCase()]: formatRupees(plan.result.amount),
    },
  });
  return { ...plan, next };
}
