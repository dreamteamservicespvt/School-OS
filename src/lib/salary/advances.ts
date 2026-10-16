// Advances and Loans (10 §2): money given ahead of salary and taken back in
// monthly installments from each payroll. A new advance needs the Principal's
// approval; when it is paid out it reaches the Day Book. Recoveries are taken
// when a month is approved (payroll.ts). Nothing is deleted: a pause, a new
// installment and closing all keep their reason in the history.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { requestApproval } from "../approvals";
import { MoneyProblem } from "../fees/problem";
import { formatDate, formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { postToDayBook } from "../finance/daybook";
import { assertBooksOpen } from "../finance/years";
import { accountForMode, systemHead } from "../finance/settings";
import { firstOfMonth, monthName, payModeLabel } from "./words";

const ZERO = BigInt(0);

type HistoryItem = { at: string; by: string | null; what: string; reason: string | null };
const push = (h: Prisma.JsonValue, item: Omit<HistoryItem, "at">) => [...((h as HistoryItem[] | null) ?? []), { at: new Date().toISOString(), ...item }];

export const balanceOf = (a: { amountPaise: bigint; recoveredPaise: bigint }) => (a.amountPaise > a.recoveredPaise ? a.amountPaise - a.recoveredPaise : ZERO);

async function getAdvance(tx: Tx, id: string) {
  const a = await tx.salaryAdvance.findFirst({ where: { id } });
  if (!a) throw new MoneyProblem("This advance was not found.");
  return a;
}

export type GiveInput = { staffId: string; type: string; amountPaise: bigint; installmentPaise: bigint; startMonth: Date; reason: string };

/** Give an advance or loan: saved waiting for the Principal's approval. */
export async function giveAdvance(tx: Tx, ctx: SchoolContext, input: GiveInput) {
  const settings = await tx.salarySetting.findFirst();
  if (settings && !settings.advancesOn) throw new MoneyProblem("Advances and loans are switched off in Salary Settings.");
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null }, select: { id: true, fullName: true, userLoginId: true, status: true } });
  if (!staff) throw new MoneyProblem("Choose the staff member.", "staffId");
  if (["RESIGNED", "RETIRED", "TERMINATED"].includes(staff.status)) throw new MoneyProblem(`${staff.fullName} has left. An advance cannot be given.`, "staffId");
  const type = input.type === "LOAN" ? "LOAN" : input.type === "ADVANCE" ? "ADVANCE" : null;
  if (!type) throw new MoneyProblem("Choose advance or loan.", "type");
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Enter the amount.", "amount");
  if (input.amountPaise > BigInt(100000000)) throw new MoneyProblem("More than ₹10 lakh: check the amount.", "amount");
  if (input.installmentPaise <= ZERO) throw new MoneyProblem("Enter the monthly installment.", "installment");
  if (input.installmentPaise > input.amountPaise) throw new MoneyProblem("The installment is more than the amount.", "installment");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new MoneyProblem("Give a reason.", "reason");
  const open = await tx.salaryAdvance.count({ where: { staffId: staff.id, status: { in: ["WAITING", "APPROVED", "ACTIVE"] } } });
  const number = formatNumber("ADV-", await nextNumber(tx, ctx, "salary-advance"), 4);
  const adv = await tx.salaryAdvance.create({
    data: { schoolId: ctx.schoolId, number, staffId: staff.id, type, amountPaise: input.amountPaise, installmentPaise: input.installmentPaise, startMonth: firstOfMonth(input.startMonth), reason, createdById: ctx.userId, history: [{ at: new Date().toISOString(), by: ctx.userId, what: "Asked", reason }] },
  });
  const approval = await requestApproval(tx, ctx, {
    type: "salary-advance", recordType: "Salary Advance", recordId: adv.id, amountPaise: adv.amountPaise,
    summary: `${type === "LOAN" ? "Loan" : "Salary advance"} ${formatRupees(adv.amountPaise)} for ${staff.fullName} · ${formatRupees(adv.installmentPaise)} a month from ${monthName(adv.startMonth)}`,
    reason: open ? `${reason} (already has ${open} open)` : reason, aboutUserIds: [staff.userLoginId],
  });
  await tx.salaryAdvance.update({ where: { id: adv.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "salary-advance-asked", recordType: "Salary Advance", recordId: adv.id, after: { number, staff: staff.fullName, type, amount: formatRupees(adv.amountPaise), installment: formatRupees(adv.installmentPaise), from: monthName(adv.startMonth), reason } });
  return { ...adv, approvalId: approval.id, staffName: staff.fullName };
}

/** The Principal's decision (registered in handlers.ts). */
export async function decideAdvance(tx: Tx, ctx: SchoolContext, id: string, decision: string, note: string | null) {
  const a = await getAdvance(tx, id);
  if (a.status !== "WAITING") return;
  const status = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "CANCELLED" : "REJECTED";
  const what = decision === "approve" ? "Approved" : decision === "withdraw" ? "Taken back" : decision === "ask-change" ? "Sent back" : "Not approved";
  await tx.salaryAdvance.update({ where: { id: a.id }, data: { status, decidedReason: note, history: push(a.history, { by: ctx.userId, what, reason: note }) } });
  await writeAudit(tx, ctx, { action: `salary-advance-${decision}`, recordType: "Salary Advance", recordId: a.id, before: { status: a.status }, after: { status, note } });
}

export type AdvancePay = { date: Date; mode: string; reference: string | null; accountId: string | null; today: Date };

/** Paid out: reaches the Day Book; recovery starts in the start month. */
export async function payAdvance(tx: Tx, ctx: SchoolContext, id: string, input: AdvancePay) {
  const a = await getAdvance(tx, id);
  if (a.status === "WAITING") throw new MoneyProblem("This advance is waiting for the Principal's approval.");
  if (a.status !== "APPROVED") throw new MoneyProblem("This advance is already paid or closed.");
  if (!["BANK_TRANSFER", "CHEQUE", "CASH"].includes(input.mode)) throw new MoneyProblem("Choose how it was paid.", "mode");
  if (input.date > input.today) throw new MoneyProblem("The date paid cannot be in the future.", "date");
  await assertBooksOpen(tx, ctx, input.date, "date");
  const staff = await tx.staff.findFirst({ where: { id: a.staffId }, select: { fullName: true } });
  const head = await systemHead(tx, ctx, "salary");
  const accountId = await accountForMode(tx, ctx, input.mode, input.accountId);
  await postToDayBook(tx, ctx, {
    date: input.date, direction: "OUT", amountPaise: a.amountPaise, mode: input.mode, section: "salary-advance", headName: a.type === "LOAN" ? "Staff loan" : "Salary advance",
    accountHeadId: head?.id ?? null, accountId, sourceType: "salary-advance", sourceId: a.id, sourceKey: `salary-advance:${a.id}`, staffId: a.staffId,
    partyName: `${staff?.fullName ?? "Staff"} · ${a.number}`, reference: input.reference, note: a.reason,
  });
  const updated = await tx.salaryAdvance.update({ where: { id: a.id }, data: { status: "ACTIVE", paidOn: input.date, payMode: input.mode, payReference: input.reference, payAccountId: accountId, history: push(a.history, { by: ctx.userId, what: `Paid by ${payModeLabel(input.mode).toLowerCase()} on ${formatDate(input.date)}`, reason: null }) } });
  await writeAudit(tx, ctx, { action: "salary-advance-paid", recordType: "Salary Advance", recordId: a.id, before: { status: a.status }, after: { status: "ACTIVE", paidOn: formatDate(input.date), mode: payModeLabel(input.mode), amount: formatRupees(a.amountPaise) } });
  return updated;
}

/** Pause or restart the monthly recovery (a reason is kept). */
export async function setPaused(tx: Tx, ctx: SchoolContext, id: string, paused: boolean, reason: string) {
  const a = await getAdvance(tx, id);
  if (a.status !== "ACTIVE") throw new MoneyProblem("Only an active advance can be paused or restarted.");
  if (reason.trim().length < 3) throw new MoneyProblem("Give a reason.", "reason");
  await tx.salaryAdvance.update({ where: { id: a.id }, data: { paused, history: push(a.history, { by: ctx.userId, what: paused ? "Recovery paused" : "Recovery restarted", reason: reason.trim() }) } });
  await writeAudit(tx, ctx, { action: paused ? "salary-advance-paused" : "salary-advance-restarted", recordType: "Salary Advance", recordId: a.id, before: { paused: a.paused }, after: { paused, reason: reason.trim() } });
}

/** A new monthly installment from the next payroll. */
export async function changeInstallment(tx: Tx, ctx: SchoolContext, id: string, installmentPaise: bigint, reason: string) {
  const a = await getAdvance(tx, id);
  if (!["APPROVED", "ACTIVE"].includes(a.status)) throw new MoneyProblem("This advance is closed.");
  if (installmentPaise <= ZERO) throw new MoneyProblem("Enter the monthly installment.", "installment");
  if (installmentPaise > balanceOf(a) && a.status === "ACTIVE") throw new MoneyProblem(`The installment is more than the balance of ${formatRupees(balanceOf(a))}.`, "installment");
  if (reason.trim().length < 3) throw new MoneyProblem("Give a reason.", "reason");
  await tx.salaryAdvance.update({ where: { id: a.id }, data: { installmentPaise, history: push(a.history, { by: ctx.userId, what: `Installment ${formatRupees(a.installmentPaise)} → ${formatRupees(installmentPaise)}`, reason: reason.trim() }) } });
  await writeAudit(tx, ctx, { action: "salary-advance-installment-changed", recordType: "Salary Advance", recordId: a.id, before: { installment: formatRupees(a.installmentPaise) }, after: { installment: formatRupees(installmentPaise), reason: reason.trim() } });
}

/** Close as repaid in cash: the balance comes in through the Day Book and the advance closes. */
export async function closeRepaidInCash(tx: Tx, ctx: SchoolContext, id: string, input: { date: Date; reason: string; today: Date }) {
  const a = await getAdvance(tx, id);
  if (a.status !== "ACTIVE") throw new MoneyProblem("Only an active advance can be closed.");
  if (input.date > input.today) throw new MoneyProblem("The date cannot be in the future.", "date");
  if (input.reason.trim().length < 3) throw new MoneyProblem("Give a reason.", "reason");
  const balance = balanceOf(a);
  if (balance > ZERO) await assertBooksOpen(tx, ctx, input.date, "date");
  const staff = await tx.staff.findFirst({ where: { id: a.staffId }, select: { fullName: true } });
  if (balance > ZERO) {
    const head = await systemHead(tx, ctx, "salary");
    const rec = await tx.salaryRecovery.create({ data: { schoolId: ctx.schoolId, advanceId: a.id, kind: "CASH", runId: null, date: input.date, amountPaise: balance, createdById: ctx.userId } });
    await postToDayBook(tx, ctx, {
      date: input.date, direction: "IN", amountPaise: balance, mode: "CASH", section: "salary-advance", headName: a.type === "LOAN" ? "Staff loan repaid" : "Salary advance repaid",
      accountHeadId: head?.id ?? null, accountId: await accountForMode(tx, ctx, "CASH"), sourceType: "salary-advance", sourceId: a.id, sourceKey: `salary-advance:${a.id}:cash:${rec.id}`, staffId: a.staffId,
      partyName: `${staff?.fullName ?? "Staff"} · ${a.number}`, note: input.reason.trim(),
    });
  }
  await tx.salaryAdvance.update({ where: { id: a.id }, data: { status: "CLOSED", closedAt: new Date(), recoveredPaise: a.amountPaise, history: push(a.history, { by: ctx.userId, what: `Closed: ${formatRupees(balance)} repaid in cash`, reason: input.reason.trim() }) } });
  await writeAudit(tx, ctx, { action: "salary-advance-closed", recordType: "Salary Advance", recordId: a.id, before: { status: "ACTIVE", balance: formatRupees(balance) }, after: { status: "CLOSED", how: "repaid in cash", reason: input.reason.trim() } });
}
