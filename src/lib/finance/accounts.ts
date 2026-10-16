// Cash & Bank (07 §2): cash in hand and the school's bank accounts, money
// moved between them (contra), opening balances set once at go-live (later
// changes need approval), and closing a month or a financial year.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { encryptField } from "../crypto";
import { formatDate, formatRupees } from "../format";
import { monthLabel } from "../staff/dates";
import { MoneyProblem, MoneyWarning } from "../fees/problem";
import { accountBalances, postToDayBook, reverseSource } from "./daybook";
import { ensureFinanceDefaults } from "./settings";
import { assertBooksOpen, financialYearOf } from "./years";

const ZERO = BigInt(0);

export type BankAccountInput = { name: string; bankName: string | null; accountNo: string | null; ifsc: string | null; isMain: boolean; campusId: string | null };

export async function saveBankAccount(tx: Tx, ctx: SchoolContext, input: BankAccountInput, id?: string) {
  await ensureFinanceDefaults(tx, ctx);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new MoneyProblem("Give the account a name, such as Trust account.", "name");
  if (name.length > 60) throw new MoneyProblem("Name can be at most 60 characters.", "name");
  const acc = input.accountNo?.replace(/\s/g, "") ?? "";
  if (acc && !/^\d{6,18}$/.test(acc)) throw new MoneyProblem("Account number is 6 to 18 digits.", "accountNo");
  const ifsc = input.ifsc?.trim().toUpperCase() ?? "";
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new MoneyProblem("IFSC is 11 characters, like SBIN0001234.", "ifsc");
  const clash = await tx.bankAccount.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new MoneyProblem(`There is already an account called ${clash.name}.`, "name");
  if (input.isMain) await tx.bankAccount.updateMany({ where: { kind: "BANK", isMain: true, ...(id ? { id: { not: id } } : {}) }, data: { isMain: false } });
  const data = { name, bankName: input.bankName?.trim() || null, ifsc: ifsc || null, isMain: input.isMain, campusId: input.campusId, ...(acc ? { accountNoEnc: encryptField(acc), accountLast4: acc.slice(-4) } : {}) };
  if (id) {
    const before = await tx.bankAccount.findFirst({ where: { id } });
    if (!before) throw new MoneyProblem("This account was not found.");
    if (before.kind === "CASH") {
      const a = await tx.bankAccount.update({ where: { id }, data: { name } });
      await writeAudit(tx, ctx, { action: "renamed", recordType: "Bank Account", recordId: id, before: { name: before.name }, after: { name } });
      return a;
    }
    if (before.isMain && !input.isMain) throw new MoneyProblem("Choose another account as the main bank account first.", "isMain");
    const a = await tx.bankAccount.update({ where: { id }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Bank Account", recordId: id, before: { name: before.name, last4: before.accountLast4 }, after: { name, last4: a.accountLast4, isMain: a.isMain } });
    return a;
  }
  const a = await tx.bankAccount.create({ data: { ...data, schoolId: ctx.schoolId, kind: "BANK", createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Bank Account", recordId: a.id, after: { name, bank: a.bankName, last4: a.accountLast4 } });
  return a;
}

export async function archiveBankAccount(tx: Tx, ctx: SchoolContext, id: string) {
  const a = await tx.bankAccount.findFirst({ where: { id, archivedAt: null } });
  if (!a) throw new MoneyProblem("This account was not found.");
  if (a.kind === "CASH") throw new MoneyProblem("Cash in hand cannot be archived.");
  if (a.isMain) throw new MoneyProblem("Choose another account as the main bank account first.");
  const balance = (await accountBalances(tx, ctx)).get(a.id) ?? ZERO;
  if (balance !== ZERO) throw new MoneyProblem(`${a.name} still holds ${formatRupees(balance)}. Move the money to another account first.`);
  const heads = await tx.feeHead.count({ where: { bankAccountId: a.id, archivedAt: null } });
  if (heads) throw new MoneyProblem(`${heads} fee head${heads === 1 ? " goes" : "s go"} into ${a.name}. Link them to another account in Fee Structure first.`);
  await tx.bankAccount.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Bank Account", recordId: id, before: { name: a.name } });
}

/** Move money (contra): e.g. a cash deposit to the bank. Two Day Book lines, neither income nor expense. */
export async function moveMoney(tx: Tx, ctx: SchoolContext, input: { fromId: string; toId: string; amountPaise: bigint; date: Date; reference: string | null; confirmLowCash?: boolean }) {
  if (input.fromId === input.toId) throw new MoneyProblem("Choose two different accounts.", "toId");
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  const [from, to] = await Promise.all([tx.bankAccount.findFirst({ where: { id: input.fromId, archivedAt: null } }), tx.bankAccount.findFirst({ where: { id: input.toId, archivedAt: null } })]);
  if (!from) throw new MoneyProblem("Choose where the money comes from.", "fromId");
  if (!to) throw new MoneyProblem("Choose where the money goes.", "toId");
  const fy = await assertBooksOpen(tx, ctx, input.date);
  const balance = (await accountBalances(tx, ctx)).get(from.id) ?? ZERO;
  if (balance < input.amountPaise && !input.confirmLowCash) throw new MoneyWarning(`${from.name} has ${formatRupees(balance)}. This move is ${formatRupees(input.amountPaise)}.`, "amount");
  const t = await tx.cashTransfer.create({ data: { schoolId: ctx.schoolId, financialYearId: fy.id, fromAccountId: from.id, toAccountId: to.id, amountPaise: input.amountPaise, date: input.date, reference: input.reference, createdById: ctx.userId } });
  const mode = from.kind === "CASH" || to.kind === "CASH" ? "CASH" : "BANK_TRANSFER";
  const base = { date: input.date, amountPaise: input.amountPaise, mode, section: "transfer" as const, headName: `${from.name} to ${to.name}`, sourceType: "transfer", sourceId: t.id, partyName: from.kind === "CASH" ? "Cash deposited" : to.kind === "CASH" ? "Cash withdrawn" : "Money moved", reference: input.reference };
  await postToDayBook(tx, ctx, { ...base, direction: "OUT", accountId: from.id, sourceKey: `transfer:${t.id}:out` });
  await postToDayBook(tx, ctx, { ...base, direction: "IN", accountId: to.id, sourceKey: `transfer:${t.id}:in` });
  await writeAudit(tx, ctx, { action: "moved-money", recordType: "Cash Transfer", recordId: t.id, after: { from: from.name, to: to.name, amount: formatRupees(input.amountPaise), date: formatDate(input.date) } });
  return t;
}

export async function cancelTransfer(tx: Tx, ctx: SchoolContext, id: string, reason: string, today: Date) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const t = await tx.cashTransfer.findFirst({ where: { id } });
  if (!t || t.cancelledAt) throw new MoneyProblem("This money move was not found or is already cancelled.");
  await assertBooksOpen(tx, ctx, today);
  await reverseSource(tx, ctx, { sourceType: "transfer", sourceId: t.id, date: today, reversalType: "transfer-cancel", note: `Move cancelled: ${reason}` });
  await tx.cashTransfer.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Cash Transfer", recordId: id, after: { reason } });
}

/**
 * Opening balance of cash in hand or a bank account at go-live (D7). Set
 * once: it posts to the Day Book once, on the go-live date. A later change
 * goes to Approvals and posts the difference once approved.
 */
export async function setOpeningBalance(tx: Tx, ctx: SchoolContext, input: { accountId: string; amountPaise: bigint; date: Date; note: string | null }) {
  const a = await tx.bankAccount.findFirst({ where: { id: input.accountId, archivedAt: null } });
  if (!a) throw new MoneyProblem("Choose the account.", "accountId");
  if (input.amountPaise < ZERO) throw new MoneyProblem("Opening balance cannot be below ₹0.", "amount");
  const existing = await tx.openingBalance.findFirst({ where: { accountId: a.id, kind: { in: ["CASH", "BANK"] }, archivedAt: null } });
  if (existing) {
    if (existing.approvalId && existing.pendingPaise !== null) throw new MoneyProblem("A change to this opening balance is already waiting for approval.");
    if (existing.amountPaise === input.amountPaise) throw new MoneyProblem("That is the opening balance already set.", "amount");
    const approval = await requestApproval(tx, ctx, {
      type: "opening-balance",
      recordType: "Opening Balance",
      recordId: existing.id,
      summary: `Change ${a.name} opening balance from ${formatRupees(existing.amountPaise)} to ${formatRupees(input.amountPaise)}`,
      amountPaise: input.amountPaise,
      reason: input.note,
    });
    await tx.openingBalance.update({ where: { id: existing.id }, data: { approvalId: approval.id, pendingPaise: input.amountPaise } });
    return { waiting: true };
  }
  const fy = await financialYearOf(tx, ctx, input.date);
  if (fy.status === "CLOSED") await assertBooksOpen(tx, ctx, input.date);
  const ob = await tx.openingBalance.create({ data: { schoolId: ctx.schoolId, kind: a.kind === "CASH" ? "CASH" : "BANK", financialYearId: fy.id, date: input.date, accountId: a.id, amountPaise: input.amountPaise, note: input.note, broughtInById: ctx.userId } });
  if (input.amountPaise > ZERO) {
    await postToDayBook(tx, ctx, { date: input.date, direction: "IN", amountPaise: input.amountPaise, mode: "OPENING", section: "opening", headName: "Opening balance", accountId: a.id, sourceType: "opening-balance", sourceId: ob.id, sourceKey: `opening:${ob.id}`, partyName: `${a.name} at go-live`, note: input.note, skipBooksCheck: true });
  }
  await writeAudit(tx, ctx, { action: "set-opening", recordType: "Opening Balance", recordId: ob.id, after: { account: a.name, amount: formatRupees(input.amountPaise), date: formatDate(input.date) } });
  return { waiting: false };
}

export async function decideOpeningBalance(tx: Tx, ctx: SchoolContext, id: string, decision: string, note: string | null) {
  const ob = await tx.openingBalance.findFirst({ where: { id } });
  if (!ob || ob.pendingPaise === null) return;
  if (decision === "approve" && ob.accountId) {
    const diff = ob.pendingPaise - ob.amountPaise;
    if (diff !== ZERO) {
      await postToDayBook(tx, ctx, {
        date: ob.date, direction: diff > ZERO ? "IN" : "OUT", amountPaise: diff > ZERO ? diff : -diff, mode: "OPENING", section: "opening", headName: "Opening balance change",
        accountId: ob.accountId, sourceType: "opening-balance", sourceId: ob.id, sourceKey: `opening:${ob.id}:change:${ob.approvalId}`, partyName: "Opening balance corrected", note, skipBooksCheck: true,
      });
    }
    await tx.openingBalance.update({ where: { id }, data: { amountPaise: ob.pendingPaise, pendingPaise: null, approvalId: null } });
    await writeAudit(tx, ctx, { action: "opening-changed", recordType: "Opening Balance", recordId: id, before: { amount: formatRupees(ob.amountPaise) }, after: { amount: formatRupees(ob.pendingPaise) } });
  } else {
    await tx.openingBalance.update({ where: { id }, data: { pendingPaise: null, approvalId: null } });
  }
}

/** Closes a month: its books can no longer change. Months close in order. */
export async function closeMonth(tx: Tx, ctx: SchoolContext, month: Date, today: Date) {
  const m = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
  if (end >= today) throw new MoneyProblem(`${monthLabel(m)} has not ended yet. Close it after ${formatDate(end)}.`, "month");
  const fy = await financialYearOf(tx, ctx, m);
  const exists = await tx.periodClose.findUnique({ where: { schoolId_month: { schoolId: ctx.schoolId, month: m } } });
  if (exists) throw new MoneyProblem(`${monthLabel(m)} is already closed.`, "month");
  // Months close in order within the financial year: an earlier open month must close first.
  const closedBefore = await tx.periodClose.findMany({ where: { financialYearId: fy.id, month: { lt: m } }, select: { month: true } });
  const open: string[] = [];
  for (let d = new Date(Date.UTC(fy.startDate.getUTCFullYear(), fy.startDate.getUTCMonth(), 1)); d < m; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    if (!closedBefore.some((c) => c.month.getTime() === d.getTime())) open.push(monthLabel(d));
  }
  if (open.length) throw new MoneyProblem(`Close ${open.join(", ")} first: months close in order.`, "month");
  const waiting = await tx.expense.count({ where: { status: "WAITING", date: { gte: m, lte: end } } });
  const r = await tx.periodClose.create({ data: { schoolId: ctx.schoolId, financialYearId: fy.id, month: m, closedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "closed-month", recordType: "Period Close", recordId: r.id, after: { month: monthLabel(m), expensesStillWaiting: waiting } });
  return { month: m, waiting };
}

/** Closes a financial year: read-only from now on (rule 35). */
export async function closeFinancialYear(tx: Tx, ctx: SchoolContext, fyId: string, today: Date) {
  const fy = await tx.financialYear.findFirst({ where: { id: fyId } });
  if (!fy) throw new MoneyProblem("Choose the financial year.");
  if (fy.status === "CLOSED") throw new MoneyProblem(`${fy.name} is already closed.`);
  if (fy.endDate >= today) throw new MoneyProblem(`${fy.name} has not ended yet. Close it after ${formatDate(fy.endDate)}.`);
  await tx.financialYear.update({ where: { id: fy.id }, data: { status: "CLOSED", closedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "closed-year", recordType: "Financial Year", recordId: fy.id, after: { name: fy.name } });
}
