"use server";

import "@/lib/approval-handlers";
import { formatDate, formatRupees } from "@/lib/format";
import { dateOf, id, needRupees, optionalText, rupeesOf, str, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { todayIn } from "@/lib/staff/dates";
import { cancelTransfer, moveMoney, saveBankAccount, setOpeningBalance } from "@/lib/finance/accounts";
import { financeAction } from "../_lib/action";

/** Move money (contra) between cash and bank: two lines, neither income nor expense. */
export async function moveMoneyAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    const fromId = id(fd, "fromId", "account the money comes from");
    const toId = id(fd, "toId", "account the money goes to");
    const amount = needRupees(fd, "amount", "Amount");
    const date = dateOf(fd, "date", "Date");
    await moveMoney(tx, ctx, { fromId, toId, amountPaise: amount, date, reference: optionalText(fd, "reference", "Reference", 60), confirmLowCash: str(fd, "confirmLowCash") === "on" });
    const [from, to] = await Promise.all([tx.bankAccount.findFirstOrThrow({ where: { id: fromId } }), tx.bankAccount.findFirstOrThrow({ where: { id: toId } })]);
    return { amount: formatRupees(amount), from: from.name, to: to.name, date: formatDate(date) };
  }, (r) => `${r.amount} moved from ${r.from} to ${r.to}. Both books are updated for ${r.date}.`);
}

export async function cancelTransferAction(_prev: unknown, fd: FormData) {
  return financeAction("archive", fd, async (tx, ctx, _v, current) => {
    await cancelTransfer(tx, ctx, id(fd, "transferId", "money move"), text(fd, "reason", "Reason", { min: 5, max: 300 }), todayIn(current.school.timeZone));
    return true;
  }, () => "Money move cancelled. Reversing lines are in today’s books.");
}

/** Add bank account, with its balance on the opening date (sent for approval if a balance was already set). */
export async function addAccountAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    const accountNo = str(fd, "accountNo").replace(/\s/g, "");
    if (!/^\d{9,18}$/.test(accountNo)) throw new MoneyProblem("Account numbers have 9 to 18 digits.", "accountNo");
    if (!str(fd, "ifsc")) throw new MoneyProblem("IFSC has 11 characters, like SBIN0011453.", "ifsc");
    const opening = rupeesOf(fd, "opening", "Opening balance");
    if (opening === null) throw new MoneyProblem("Enter the balance on the opening date (0 if new).", "opening");
    const asOn = dateOf(fd, "asOn", "As on");
    const a = await saveBankAccount(tx, ctx, {
      name: text(fd, "name", "Account name", { min: 2, max: 60 }), bankName: text(fd, "bankName", "Bank and branch", { min: 2, max: 80 }),
      accountNo, ifsc: str(fd, "ifsc"), isMain: str(fd, "isMain") === "on", campusId: null,
    });
    await setOpeningBalance(tx, ctx, { accountId: a.id, amountPaise: opening, date: asOn, note: "Set when the account was added" });
    return { name: a.name, opening: formatRupees(opening), date: formatDate(asOn) };
  }, (r) => `${r.name} added. Opening balance ${r.opening} on ${r.date}. It shows in the bank book from then.`);
}

/** Set an opening balance (first time), or ask to change it (goes to Approvals). */
export async function openingAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const accountId = id(fd, "accountId", "account");
    const amount = rupeesOf(fd, "amount", "Opening balance");
    if (amount === null) throw new MoneyProblem("Enter the right opening balance.", "amount");
    const reason = optionalText(fd, "reason", "Reason", 300);
    const had = await tx.openingBalance.findFirst({ where: { accountId, kind: { in: ["CASH", "BANK"] }, archivedAt: null } });
    if (had && (!reason || reason.length < 5)) throw new MoneyProblem("Say why it was wrong. The approver sees this.", "reason");
    const r = await setOpeningBalance(tx, ctx, { accountId, amountPaise: amount, date: had ? had.date : dateOf(fd, "date", "As on"), note: reason });
    return { waiting: r.waiting, amount: formatRupees(amount) };
  }, (r) => (r.waiting ? `Sent for approval: opening balance ${r.amount}. Every book from the opening date changes once approved.` : `Opening balance set at ${r.amount}.`));
}
