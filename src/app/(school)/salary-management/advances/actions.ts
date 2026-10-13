"use server";

import { dateOf, id, needRupees, optionalId, optionalText, str } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import type { Tx } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { todayIn } from "@/lib/staff/dates";
import { changeInstallment, closeRepaidInCash, giveAdvance, payAdvance, setPaused } from "@/lib/salary/advances";
import { monthName, parseMonthKey } from "@/lib/salary/words";
import { salaryAction } from "../_lib/action";

const tz = (c: { school: { timeZone: string } }) => todayIn(c.school.timeZone);
const who = async (tx: Tx, advanceId: string) => {
  const a = await tx.salaryAdvance.findFirst({ where: { id: advanceId }, select: { staffId: true, type: true, startMonth: true } });
  const s = a ? await tx.staff.findFirst({ where: { id: a.staffId }, select: { fullName: true } }) : null;
  return { name: s?.fullName ?? "", type: a?.type === "LOAN" ? "Loan" : "Advance", start: a ? monthName(a.startMonth) : "" };
};

/** Asks for an advance or loan. The Principal approves it in Forms & Approvals; it goes in the Day Book when paid. */
export async function giveAdvanceAction(_prev: unknown, fd: FormData) {
  return salaryAction("create", fd, async (tx, ctx) => {
    const startMonth = parseMonthKey(str(fd, "from"));
    if (!startMonth) throw new MoneyProblem("Choose the month recovery starts.", "from");
    const a = await giveAdvance(tx, ctx, {
      staffId: id(fd, "staffId", "staff member"), type: str(fd, "type"), amountPaise: needRupees(fd, "amount", "Amount"),
      installmentPaise: needRupees(fd, "installment", "Recover each month"), startMonth, reason: str(fd, "reason"),
    });
    return { what: `${a.type === "LOAN" ? "Loan" : "Advance"} of ${formatRupees(a.amountPaise)} for ${a.staffName}` };
  }, (r) => `${r.what} sent for approval. The approver gets it in Approvals.`);
}

export async function payAdvanceAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const advanceId = id(fd, "advanceId", "advance");
    const mode = str(fd, "mode");
    const a = await payAdvance(tx, ctx, advanceId, { date: dateOf(fd, "date", "Paid on"), mode, reference: mode === "CASH" ? null : optionalText(fd, "reference", "Reference", 60), accountId: mode === "CASH" ? null : optionalId(fd, "accountId"), today: tz(current) });
    const w = await who(tx, advanceId);
    return { amount: formatRupees(a.amountPaise), name: w.name, date: formatDate(a.paidOn!), start: w.start };
  }, (r) => `${r.amount} paid to ${r.name}. In the Day Book on ${r.date}. Recovery starts in ${r.start}.`);
}

export async function pauseAdvanceAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const advanceId = id(fd, "advanceId", "advance");
    const paused = str(fd, "paused") !== "0";
    await setPaused(tx, ctx, advanceId, paused, str(fd, "reason"));
    return { name: (await who(tx, advanceId)).name, paused };
  }, (r) => r.paused ? `Recovery paused for ${r.name}. Nothing is deducted until you restart it.` : `Recovery restarts for ${r.name} from the next salary.`);
}

export async function installmentAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const advanceId = id(fd, "advanceId", "advance");
    const amount = needRupees(fd, "installment", "New monthly installment");
    await changeInstallment(tx, ctx, advanceId, amount, str(fd, "reason"));
    return { name: (await who(tx, advanceId)).name, amount: formatRupees(amount) };
  }, (r) => `${r.name} now repays ${r.amount} a month, from the next salary.`);
}

export async function closeCashAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const advanceId = id(fd, "advanceId", "advance");
    const before = await tx.salaryAdvance.findFirst({ where: { id: advanceId }, select: { amountPaise: true, recoveredPaise: true } });
    await closeRepaidInCash(tx, ctx, advanceId, { date: dateOf(fd, "date", "Received on"), reason: str(fd, "reason"), today: tz(current) });
    const w = await who(tx, advanceId);
    return { type: w.type, left: before ? formatRupees(before.amountPaise - before.recoveredPaise) : "" };
  }, (r) => `${r.type} closed. ${r.left} received in cash · receipt in the Day Book.`);
}
