"use server";

import { formatDate, formatRupees } from "@/lib/format";
import { dateOf, id, needRupees, optionalId, optionalText, str, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { todayIn } from "@/lib/staff/dates";
import { cancelIncome, postIncome, recordIncome } from "@/lib/finance/income";
import { financeAction } from "../_lib/action";

/** Record income: posted to the Day Book now, or kept as a draft (for example until a cheque clears). */
export async function recordIncomeAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    const mode = str(fd, "mode");
    const amount = needRupees(fd, "amount", "Amount");
    if (amount > BigInt(100000000)) throw new MoneyProblem("More than ₹10 lakh: check the amount.", "amount");
    const post = str(fd, "post") === "on";
    const r = await recordIncome(tx, ctx, {
      date: dateOf(fd, "date", "Date"), accountHeadId: id(fd, "accountHeadId", "income head"), amountPaise: amount,
      receivedFrom: text(fd, "receivedFrom", "Received from", { min: 2, max: 120 }), vendorId: null, mode,
      reference: mode === "CASH" ? null : optionalText(fd, "reference", "Reference", 80), accountId: optionalId(fd, "accountId"), note: optionalText(fd, "note", "Note", 500),
    }, post);
    return { post, no: r.receiptNo, amount: formatRupees(r.amountPaise), date: formatDate(r.date) };
  }, (r) => (r.post ? `${r.no} posted · ${r.amount}. In the Day Book for ${r.date}. Print the receipt from the entry.` : `Saved as draft · ${r.amount}. Not in the Day Book until you post it.`));
}

export async function postIncomeAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const r = await postIncome(tx, ctx, id(fd, "incomeId", "income"));
    return { no: r.receiptNo, date: formatDate(r.date) };
  }, (r) => `${r.no} posted. It is in the Day Book for ${r.date}.`);
}

export async function cancelIncomeAction(_prev: unknown, fd: FormData) {
  return financeAction("archive", fd, async (tx, ctx, _v, current) => {
    const incomeId = id(fd, "incomeId", "income");
    const before = await tx.income.findFirst({ where: { id: incomeId }, select: { status: true } });
    await cancelIncome(tx, ctx, incomeId, text(fd, "reason", "Reason", { min: 5, max: 300 }), todayIn(current.school.timeZone));
    return before?.status === "POSTED";
  }, (posted) => (posted ? "Income cancelled. A reversal is in today’s Day Book and the entry stays, marked Cancelled." : "Draft cancelled. The Day Book does not change."));
}
