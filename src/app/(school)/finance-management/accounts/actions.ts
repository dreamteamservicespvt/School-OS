"use server";

import { formatRupees } from "@/lib/format";
import { dateOf, id, parseRupees, strs, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { todayIn } from "@/lib/staff/dates";
import { addJournal, reverseJournal, type JournalLineInput } from "@/lib/finance/journals";
import { financeFeaturesOn } from "@/lib/finance/settings";
import type { SchoolContext, Tx } from "@/lib/db";
import { financeAction } from "../_lib/action";

async function accountsOn(tx: Tx, ctx: SchoolContext) {
  if (!(await financeFeaturesOn(tx, ctx)).has("finance-accounts")) throw new MoneyProblem("Accounts are switched off in Finance Settings.");
}

/** Journal entry: lines sent as repeated head, side and amount fields. Debits must equal credits. */
export async function journalAction(_prev: unknown, fd: FormData) {
  return financeAction("create", fd, async (tx, ctx) => {
    await accountsOn(tx, ctx);
    const heads = strs(fd, "lineHead");
    const sides = strs(fd, "lineSide");
    const amounts = strs(fd, "lineAmount");
    const lines: JournalLineInput[] = heads.map((h, i) => {
      const amt = parseRupees(amounts[i] ?? "", `Amount, line ${i + 1}`, "lines") ?? BigInt(0);
      if (!h) throw new MoneyProblem(`Choose the account on line ${i + 1}.`, "lines");
      if (amt <= BigInt(0)) throw new MoneyProblem("Every line needs an amount.", "lines");
      return { accountHeadId: h, debitPaise: sides[i] === "Cr" ? BigInt(0) : amt, creditPaise: sides[i] === "Cr" ? amt : BigInt(0) };
    });
    const j = await addJournal(tx, ctx, { date: dateOf(fd, "date", "Date"), narration: text(fd, "narration", "Narration", { min: 3, max: 300 }), lines });
    return { no: j.number, amount: formatRupees(lines.reduce((s, l) => s + l.debitPaise, BigInt(0))) };
  }, (r) => `${r.no} posted · ${r.amount}. In the ledger for each account. It cannot be edited, only reversed.`);
}

export async function reverseJournalAction(_prev: unknown, fd: FormData) {
  return financeAction("archive", fd, async (tx, ctx, _v, current) => {
    await accountsOn(tx, ctx);
    const rev = await reverseJournal(tx, ctx, id(fd, "journalId", "journal entry"), text(fd, "reason", "Reason", { min: 5, max: 300 }), todayIn(current.school.timeZone));
    return rev.number;
  }, (no) => `Reversed by ${no}. The original stays as it was. Both are in the ledger.`);
}
