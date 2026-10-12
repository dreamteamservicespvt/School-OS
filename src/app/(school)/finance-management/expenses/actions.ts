"use server";

import { formatDate, formatRupees } from "@/lib/format";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { dateOf, file, id, needRupees, optionalDateOf, optionalId, optionalText, rupeesOf, str, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import "@/lib/approval-handlers";
import { decide, canDecide } from "@/lib/approvals";
import { todayIn } from "@/lib/staff/dates";
import type { SchoolContext, Tx } from "@/lib/db";
import { attachBill, cancelExpense, payExpense, recordExpense, saveVendor, submitExpense } from "@/lib/finance/expenses";
import { financeFeaturesOn } from "@/lib/finance/settings";
import { EXPENSE_MODES } from "@/lib/finance/words";
import { financeAction } from "../_lib/action";

const MAX = BigInt(1000000000); // ₹1 crore: a typing mistake above this

async function billFile(tx: Tx, ctx: SchoolContext, fd: FormData) {
  const f = file(fd, "bill");
  if (!f) return null;
  const saved = await saveFile(tx, ctx, { file: f, purpose: "expense-bill", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 });
  return saved.id;
}

async function vendorOf(tx: Tx, ctx: SchoolContext, fd: FormData) {
  const picked = optionalId(fd, "vendorId");
  if (picked) return picked;
  const name = optionalText(fd, "vendorName", "Vendor", 120);
  if (!name) return null;
  return (await saveVendor(tx, ctx, { name, phone: null, gstin: null, address: null })).id;
}

function payOf(fd: FormData, date: Date) {
  const mode = str(fd, "mode");
  if (!EXPENSE_MODES.some((m) => m.value === mode)) throw new MoneyProblem("Choose how it was paid.", "mode");
  const reference = mode === "CASH" ? null : optionalText(fd, "reference", "Reference", 60);
  if (reference && !/^[A-Za-z0-9 /.-]{4,60}$/.test(reference)) throw new MoneyProblem("This does not look like a bank reference. Use letters, digits and spaces.", "reference");
  return { date, mode, reference, accountId: mode === "CASH" ? null : optionalId(fd, "accountId"), confirmLowCash: str(fd, "confirmLowCash") === "on" };
}

/** Record expense: approved at once within the limit (and paid now when asked), else sent for approval. */
export async function recordExpenseAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    const amount = needRupees(fd, "amount", "Amount");
    if (amount > MAX) throw new MoneyProblem("More than ₹1 crore: check the amount.", "amount");
    const date = dateOf(fd, "date", "Date");
    const features = await financeFeaturesOn(tx, ctx);
    const r = await recordExpense(tx, ctx, {
      date, amountPaise: amount, accountHeadId: id(fd, "accountHeadId", "expense head"),
      vendorId: await vendorOf(tx, ctx, fd),
      costCentreId: features.has("finance-cost-centres") ? optionalId(fd, "costCentreId") : null,
      billFileId: await billFile(tx, ctx, fd),
      note: text(fd, "what", "What was it for", { min: 3, max: 200 }),
      isVendorBill: false, billNo: null, billDueDate: null,
      duplicateReason: optionalText(fd, "duplicateReason", "Reason", 300),
    }, str(fd, "paid") === "on" ? payOf(fd, date) : null);
    return { no: r.expense.number, amount: formatRupees(amount), outcome: r.outcome, budget: r.budget?.message ?? null, date: formatDate(date) };
  }, (r) => {
    const tail = r.budget ? ` ${r.budget}` : "";
    if (r.outcome === "paid") return `${r.no} paid · ${r.amount}. Approved at once and added to the Day Book for ${r.date}.${tail}`;
    if (r.outcome === "waiting") return `${r.no} sent for approval · ${r.amount}. You can mark it paid once it is approved.${tail}`;
    return `${r.no} saved · approved at once. Not in the Day Book until you mark it paid.${tail}`;
  });
}

/** Record vendor bill: pay it later, in part or in full. */
export async function recordBillAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    const features = await financeFeaturesOn(tx, ctx);
    if (!features.has("finance-vendor-bills")) throw new MoneyProblem("Vendor bills are switched off in Finance Settings.");
    const amount = needRupees(fd, "amount", "Amount");
    if (amount > MAX) throw new MoneyProblem("More than ₹1 crore: check the amount.", "amount");
    const date = dateOf(fd, "date", "Bill date");
    const due = optionalDateOf(fd, "dueDate", "Due date");
    if (due && due < date) throw new MoneyProblem("The due date is before the bill date.", "dueDate");
    const billNo = text(fd, "billNo", "Bill number", { min: 1, max: 40 });
    const r = await recordExpense(tx, ctx, {
      date, amountPaise: amount, accountHeadId: id(fd, "accountHeadId", "expense head"),
      vendorId: await vendorOf(tx, ctx, fd),
      costCentreId: features.has("finance-cost-centres") ? optionalId(fd, "costCentreId") : null,
      billFileId: await billFile(tx, ctx, fd),
      note: optionalText(fd, "what", "What was it for", 200),
      isVendorBill: true, billNo, billDueDate: due,
      duplicateReason: optionalText(fd, "duplicateReason", "Reason", 300),
    }, null);
    return { billNo, amount: formatRupees(amount), due: due ? formatDate(due) : null, waiting: r.outcome === "waiting" };
  }, (r) => `Bill ${r.billNo} saved · ${r.amount}${r.due ? `. Due ${r.due}` : ""}.${r.waiting ? " It waits for approval before it can be paid." : ""}`);
}

/** Send a draft (or one sent back) for approval again. */
export async function submitExpenseAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => submitExpense(tx, ctx, id(fd, "expenseId", "expense")),
    (r) => (r === "approved" ? "Approved at once. Mark it paid when the money goes." : "Sent for approval."));
}

/** Approve, or send back with a reason. Only the person the request waits for may decide. */
export async function decideExpenseAction(_prev: unknown, fd: FormData) {
  return financeAction("approve", fd, async (tx, ctx) => {
    const e = await tx.expense.findFirst({ where: { id: id(fd, "expenseId", "expense") } });
    if (!e?.approvalId || e.status !== "WAITING") throw new MoneyProblem("This expense is not waiting for approval.");
    const approval = await tx.approval.findFirst({ where: { id: e.approvalId } });
    if (!approval || !(await canDecide(tx, ctx, approval))) throw new MoneyProblem("This expense is waiting for someone else.");
    const decision = str(fd, "decision") === "approve" ? "approve" : "reject";
    const note = optionalText(fd, "reason", "Reason", 300);
    if (decision === "reject" && (!note || note.length < 5)) throw new MoneyProblem("Say why it goes back, in at least 5 characters.", "reason");
    await decide(tx, ctx, e.approvalId, decision, note);
    return { decision, no: e.number, amount: formatRupees(e.amountPaise) };
  }, (r) => (r.decision === "approve" ? `Approved: ${r.no} · ${r.amount}. It can now be marked paid.` : `Sent back. It is a draft again with your reason.`));
}

/** Mark paid: only now it reaches the Day Book, on the date paid. A vendor bill may be paid in parts. */
export async function payExpenseAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const expenseId = id(fd, "expenseId", "expense");
    const date = dateOf(fd, "date", "Date paid");
    const pay = await payExpense(tx, ctx, expenseId, { ...payOf(fd, date), amountPaise: rupeesOf(fd, "payAmount", "Amount") });
    const e = await tx.expense.findFirstOrThrow({ where: { id: expenseId } });
    return { no: e.number, amount: formatRupees(pay.amountPaise), date: formatDate(date), left: e.amountPaise - e.paidPaise };
  }, (r) => `${r.no}: ${r.amount} paid. In the Day Book for ${r.date}.${r.left > BigInt(0) ? ` ${formatRupees(r.left)} still to pay.` : ""}`);
}

export async function attachBillAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const fileId = await billFile(tx, ctx, fd);
    if (!fileId) throw new MoneyProblem("Choose the photo or PDF of the bill.", "bill");
    await attachBill(tx, ctx, id(fd, "expenseId", "expense"), fileId);
    return true;
  }, () => "Bill attached.");
}

export async function cancelExpenseAction(_prev: unknown, fd: FormData) {
  return financeAction("archive", fd, async (tx, ctx, _v, current) => {
    const expenseId = id(fd, "expenseId", "expense");
    const before = await tx.expense.findFirst({ where: { id: expenseId }, select: { paidPaise: true, number: true } });
    await cancelExpense(tx, ctx, expenseId, text(fd, "reason", "Reason", { min: 5, max: 300 }), todayIn(current.school.timeZone));
    return { paid: (before?.paidPaise ?? BigInt(0)) > BigInt(0), no: before?.number ?? "" };
  }, (r) => (r.paid ? `${r.no} cancelled. A reversal is in today’s Day Book.` : `${r.no} cancelled. Kept with your reason.`));
}
