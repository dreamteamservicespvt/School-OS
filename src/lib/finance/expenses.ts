// Expenses (07 §2, D12): Draft → Waiting for approval → Approved → Paid
// (or Cancelled). Up to the amount in Finance Settings an expense is
// approved at once; above it, it waits in Approvals and cannot be paid until
// approved. Only when paid does it reach the Day Book, on the date paid.
import "server-only";

import type { Expense } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { formatDate, formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { MoneyProblem, MoneyWarning } from "../fees/problem";
import { postToDayBook, reverseSource, accountBalances } from "./daybook";
import { accountForMode, financeFeaturesOn, financeSettings } from "./settings";
import { assertBooksOpen, financialYearOf } from "./years";
import { budgetImpact } from "./budgets";
import { financeModeLabel } from "./words";

const ZERO = BigInt(0);

export type ExpenseInput = {
  date: Date;
  accountHeadId: string;
  amountPaise: bigint;
  vendorId: string | null;
  costCentreId: string | null;
  billFileId: string | null;
  note: string | null;
  isVendorBill: boolean;
  billNo: string | null;
  billDueDate: Date | null;
  /** Reason given when saving despite the duplicate warning. */
  duplicateReason: string | null;
};

export type PayInput = { date: Date; mode: string; reference: string | null; accountId: string | null; amountPaise?: bigint | null; confirmLowCash?: boolean };

async function checkExpense(tx: Tx, ctx: SchoolContext, input: ExpenseInput, selfId?: string) {
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  const head = await tx.accountHead.findFirst({ where: { id: input.accountHeadId, kind: "EXPENSE", archivedAt: null } });
  if (!head) throw new MoneyProblem("Choose the expense head.", "accountHeadId");
  const settings = await financeSettings(tx, ctx);
  if (!input.billFileId && input.amountPaise > settings.billRequiredAbove) throw new MoneyProblem(`Attach the bill for amounts over ${formatRupees(settings.billRequiredAbove)}.`, "bill");
  if (input.vendorId && !(await tx.vendor.findFirst({ where: { id: input.vendorId, archivedAt: null } }))) throw new MoneyProblem("Choose a vendor from the list, or add a new one.", "vendorId");
  if (input.costCentreId && !(await tx.costCentre.findFirst({ where: { id: input.costCentreId, archivedAt: null } }))) throw new MoneyProblem("Choose a department.", "costCentreId");
  if (input.isVendorBill && !input.vendorId) throw new MoneyProblem("A vendor bill needs the vendor.", "vendorId");
  if (input.isVendorBill && !input.billNo) throw new MoneyProblem("Enter the bill number from the vendor's bill.", "billNo");
  // Duplicate bill: same vendor and bill number, or same vendor, amount and date.
  if (input.vendorId && !input.duplicateReason) {
    const dup = await tx.expense.findFirst({
      where: {
        vendorId: input.vendorId,
        status: { not: "CANCELLED" },
        ...(selfId ? { id: { not: selfId } } : {}),
        OR: [...(input.billNo ? [{ billNo: { equals: input.billNo, mode: "insensitive" as const } }] : []), { amountPaise: input.amountPaise, date: input.date }],
      },
    });
    if (dup) {
      const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
      throw new MoneyWarning(`Bill ${dup.billNo ?? dup.number} from ${vendor?.name ?? "this vendor"} already recorded on ${formatDate(dup.date)}`, "billNo", { href: `/finance-management/expenses/${dup.id}`, label: "Open existing" });
    }
  }
  return head;
}

/**
 * Records an expense. Within the limit it is approved at once (and paid now
 * when asked); above the limit it goes to Approvals. Returns the expense, a
 * budget warning when it takes a head over 80% or 100%, and what happened.
 */
export async function recordExpense(tx: Tx, ctx: SchoolContext, input: ExpenseInput, payNow: PayInput | null, opts: { draft?: boolean } = {}) {
  const head = await checkExpense(tx, ctx, input);
  const fy = await financialYearOf(tx, ctx, input.date);
  if (fy.status === "CLOSED") await assertBooksOpen(tx, ctx, input.date, "date");
  const n = await nextNumber(tx, ctx, `expense:${fy.name}`);
  const expense = await tx.expense.create({
    data: {
      schoolId: ctx.schoolId,
      financialYearId: fy.id,
      number: formatNumber(`EXP/${fy.name}/`, n, 5),
      date: input.date,
      accountHeadId: head.id,
      vendorId: input.vendorId,
      costCentreId: input.costCentreId,
      amountPaise: input.amountPaise,
      billFileId: input.billFileId,
      isVendorBill: input.isVendorBill,
      billNo: input.billNo,
      billDueDate: input.billDueDate,
      note: input.note,
      duplicateReason: input.duplicateReason,
      status: "DRAFT",
      requestedById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Expense", recordId: expense.id, after: expenseAudit(expense) });
  const budget = await budgetImpact(tx, ctx, { financialYearId: fy.id, accountHeadId: head.id, costCentreId: input.costCentreId, amountPaise: input.amountPaise, excludeExpenseId: expense.id });
  if (opts.draft) return { expense, outcome: "draft" as const, budget };
  const sent = await submitExpense(tx, ctx, expense.id, budget?.message ?? null);
  if (sent === "approved" && payNow) {
    await payExpense(tx, ctx, expense.id, payNow);
    return { expense, outcome: "paid" as const, budget };
  }
  return { expense, outcome: sent, budget };
}

/** Sends a draft on: approved at once within the limit, otherwise to Approvals. */
export async function submitExpense(tx: Tx, ctx: SchoolContext, expenseId: string, budgetNote: string | null = null): Promise<"approved" | "waiting"> {
  const e = await tx.expense.findFirst({ where: { id: expenseId } });
  if (!e) throw new MoneyProblem("This expense was not found.");
  if (e.status !== "DRAFT") throw new MoneyProblem("Only a draft can be sent for approval.");
  const settings = await financeSettings(tx, ctx);
  if (e.amountPaise <= settings.expenseApproveUpTo) {
    await tx.expense.update({ where: { id: e.id }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date(), rejectReason: null } });
    await writeAudit(tx, ctx, { action: "approved-at-once", recordType: "Expense", recordId: e.id, after: { amount: formatRupees(e.amountPaise), limit: formatRupees(settings.expenseApproveUpTo) } });
    return "approved";
  }
  const head = await tx.accountHead.findUnique({ where: { id: e.accountHeadId } });
  const vendor = e.vendorId ? await tx.vendor.findUnique({ where: { id: e.vendorId } }) : null;
  const approval = await requestApproval(tx, ctx, {
    type: "expense",
    recordType: "Expense",
    recordId: e.id,
    summary: `${head?.name ?? "Expense"} ${formatRupees(e.amountPaise)}${vendor ? ` to ${vendor.name}` : ""} (${e.number})`,
    amountPaise: e.amountPaise,
    reason: [e.note, budgetNote, e.duplicateReason ? `Saved despite a possible duplicate: ${e.duplicateReason}` : null].filter(Boolean).join(". ") || null,
  });
  await tx.expense.update({ where: { id: e.id }, data: { status: "WAITING", approvalId: approval.id, rejectReason: null } });
  return "waiting";
}

/** Changes a draft (for example one sent back by the approver). */
export async function updateDraftExpense(tx: Tx, ctx: SchoolContext, expenseId: string, input: ExpenseInput) {
  const e = await tx.expense.findFirst({ where: { id: expenseId } });
  if (!e) throw new MoneyProblem("This expense was not found.");
  if (e.status !== "DRAFT") throw new MoneyProblem("Posted entries cannot be edited. Cancel and record again?");
  if (e.broughtIn) throw new MoneyProblem("Brought in from old software. It cannot be changed.");
  const head = await checkExpense(tx, ctx, input, e.id);
  const updated = await tx.expense.update({
    where: { id: e.id },
    data: { date: input.date, accountHeadId: head.id, vendorId: input.vendorId, costCentreId: input.costCentreId, amountPaise: input.amountPaise, billFileId: input.billFileId ?? e.billFileId, isVendorBill: input.isVendorBill, billNo: input.billNo, billDueDate: input.billDueDate, note: input.note, duplicateReason: input.duplicateReason },
  });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Expense", recordId: e.id, before: expenseAudit(e), after: expenseAudit(updated) });
  return updated;
}

/**
 * Marks an approved expense paid (in full, or a part of a vendor bill). Only
 * then it posts to the Day Book, on the date paid. Warns when cash in hand
 * would go below zero.
 */
export async function payExpense(tx: Tx, ctx: SchoolContext, expenseId: string, input: PayInput) {
  // One payment at a time per expense: a double click or a second tab waits here, then
  // sees the first payment, so the money never goes out (or into the Day Book) twice.
  await tx.$queryRaw`SELECT id FROM expense WHERE id = ${expenseId}::uuid FOR UPDATE`;
  const e = await tx.expense.findFirst({ where: { id: expenseId } });
  if (!e) throw new MoneyProblem("This expense was not found.");
  if (e.broughtIn) throw new MoneyProblem("Brought in from old software. Not in the Day Book.");
  if (e.status === "WAITING") {
    const s = await financeSettings(tx, ctx);
    throw new MoneyProblem(`Above ${formatRupees(s.expenseApproveUpTo)}: waiting for the principal. It can be paid once approved.`);
  }
  if (e.status === "PAID") throw new MoneyProblem("This expense is already paid.");
  if (e.status !== "APPROVED") throw new MoneyProblem("Only an approved expense can be paid.");
  if (input.mode !== "CASH" && !input.reference) throw new MoneyProblem(`Enter the ${input.mode === "CHEQUE" ? "cheque number" : "transaction or UTR number"}.`, "reference");
  const left = e.amountPaise - e.paidPaise;
  const amount = input.amountPaise ?? left;
  if (amount <= ZERO) throw new MoneyProblem("Amount must be more than ₹0.", "payAmount");
  if (amount > left) throw new MoneyProblem(`Only ${formatRupees(left)} is left to pay on this expense.`, "payAmount");
  if (amount < left && !e.isVendorBill) throw new MoneyProblem("Only vendor bills can be paid in parts. Pay the full amount.", "payAmount");
  await assertBooksOpen(tx, ctx, input.date, "paidOn");
  const accountId = await accountForMode(tx, ctx, input.mode, input.accountId);
  const account = await tx.bankAccount.findFirst({ where: { id: accountId, archivedAt: null } });
  if (!account) throw new MoneyProblem("Choose the cash or bank account the money comes from.", "accountId");
  if (account.kind === "CASH" && !input.confirmLowCash) {
    const balance = (await accountBalances(tx, ctx)).get(account.id) ?? ZERO;
    if (balance < amount) throw new MoneyWarning(`Cash in hand is ${formatRupees(balance)}. This payment is ${formatRupees(amount)}.`, "mode");
  }
  const pay = await tx.expensePayment.create({ data: { schoolId: ctx.schoolId, expenseId: e.id, amountPaise: amount, date: input.date, mode: input.mode, reference: input.reference, accountId, paidById: ctx.userId } });
  const paid = e.paidPaise + amount;
  await tx.expense.update({ where: { id: e.id }, data: { paidPaise: paid, status: paid >= e.amountPaise ? "PAID" : "APPROVED" } });
  const head = await tx.accountHead.findUnique({ where: { id: e.accountHeadId } });
  const vendor = e.vendorId ? await tx.vendor.findUnique({ where: { id: e.vendorId } }) : null;
  const { entry } = await postToDayBook(tx, ctx, {
    date: input.date,
    direction: "OUT",
    amountPaise: amount,
    mode: input.mode,
    section: "expense",
    headName: head?.name ?? "Expense",
    accountHeadId: e.accountHeadId,
    accountId,
    sourceType: "expense-payment",
    sourceId: pay.id,
    sourceKey: `expense-payment:${pay.id}`,
    vendorId: e.vendorId,
    costCentreId: e.costCentreId,
    partyName: vendor?.name ?? (e.note?.slice(0, 80) || head?.name || "Expense"),
    reference: input.reference ?? e.billNo,
    note: `${e.number}${e.note ? `: ${e.note}` : ""}`,
  });
  await writeAudit(tx, ctx, { action: "paid", recordType: "Expense", recordId: e.id, after: { amount: formatRupees(amount), date: formatDate(input.date), mode: financeModeLabel(input.mode), reference: input.reference } });
  // The Day Book date differs from the date paid when that day was already closed.
  return { ...pay, dayBookDate: entry.date };
}

/** Cancels an expense with a reason. A paid one gets reversing Day Book entries on the cancel date. */
export async function cancelExpense(tx: Tx, ctx: SchoolContext, expenseId: string, reason: string, today: Date) {
  if (reason.trim().length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const e = await tx.expense.findFirst({ where: { id: expenseId }, include: { payments: true } });
  if (!e) throw new MoneyProblem("This expense was not found.");
  if (e.status === "CANCELLED") throw new MoneyProblem("This expense is already cancelled.");
  if (e.broughtIn) throw new MoneyProblem("Brought in from old software. Undo the whole import from the import history if it was wrong.");
  if (e.status === "WAITING" && e.approvalId) {
    await tx.approval.updateMany({ where: { id: e.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: `Expense cancelled: ${reason}` } });
  }
  const live = e.payments.filter((p) => !p.cancelledAt);
  if (live.length) await assertBooksOpen(tx, ctx, today);
  for (const p of live) {
    await reverseSource(tx, ctx, { sourceType: "expense-payment", sourceId: p.id, date: today, reversalType: "expense-cancel", note: `Expense cancelled: ${reason}` });
    await tx.expensePayment.update({ where: { id: p.id }, data: { cancelledAt: new Date() } });
  }
  await tx.expense.update({ where: { id: e.id }, data: { status: "CANCELLED", cancelReason: reason.trim(), cancelledAt: new Date(), cancelledById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Expense", recordId: e.id, before: { status: e.status }, after: { reason } });
}

/** Approvals decided an expense: approved, or back to Draft with the approver's reason. */
export async function decideExpense(tx: Tx, ctx: SchoolContext, expenseId: string, decision: string, note: string | null) {
  const e = await tx.expense.findFirst({ where: { id: expenseId } });
  if (!e || e.status !== "WAITING") return;
  if (decision === "approve") {
    await tx.expense.update({ where: { id: e.id }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } });
  } else {
    await tx.expense.update({ where: { id: e.id }, data: { status: "DRAFT", rejectReason: note ?? (decision === "withdraw" ? "Withdrawn" : null) } });
  }
  await writeAudit(tx, ctx, { action: decision === "approve" ? "approved" : "sent-back", recordType: "Expense", recordId: e.id, after: { note } });
}

function expenseAudit(e: Expense) {
  return { number: e.number, date: formatDate(e.date), amount: formatRupees(e.amountPaise), head: e.accountHeadId, vendor: e.vendorId, status: e.status };
}

/** Attaches the photo of the bill to an expense that has none (needed before paying above the bill limit). */
export async function attachBill(tx: Tx, ctx: SchoolContext, expenseId: string, fileId: string) {
  const e = await tx.expense.findFirst({ where: { id: expenseId } });
  if (!e) throw new MoneyProblem("This expense was not found.");
  if (e.status === "CANCELLED") throw new MoneyProblem("This expense is cancelled.");
  if (e.billFileId) throw new MoneyProblem("A bill is already attached.");
  await tx.expense.update({ where: { id: e.id }, data: { billFileId: fileId } });
  await writeAudit(tx, ctx, { action: "bill-attached", recordType: "Expense", recordId: e.id, after: { file: fileId } });
}

/** The expense head this person used last (the form's default). */
export async function lastHeadUsed(tx: Tx, ctx: SchoolContext) {
  const e = await tx.expense.findFirst({ where: { requestedById: ctx.userId, broughtIn: false }, orderBy: { createdAt: "desc" }, select: { accountHeadId: true } });
  return e?.accountHeadId ?? null;
}

export async function saveVendor(tx: Tx, ctx: SchoolContext, input: { name: string; phone: string | null; gstin: string | null; address: string | null }, id?: string) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new MoneyProblem("Vendor name is needed.", "vendorName");
  const clash = await tx.vendor.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash && !id) return clash;
  const v = id ? await tx.vendor.update({ where: { id }, data: { ...input, name } }) : await tx.vendor.create({ data: { ...input, name, schoolId: ctx.schoolId, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: id ? "changed" : "created", recordType: "Vendor", recordId: v.id, after: { name } });
  return v;
}

export async function featuresFor(tx: Tx, ctx: SchoolContext) {
  return financeFeaturesOn(tx, ctx);
}
