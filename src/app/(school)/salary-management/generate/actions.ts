"use server";

import "@/lib/approval-handlers";
import { decide } from "@/lib/approvals";
import { dateOf, id, needRupees, optionalId, optionalText, str, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { formatDate, formatRupees } from "@/lib/format";
import { todayIn } from "@/lib/staff/dates";
import { addAdjustment, archiveAdjustment, calculateRun, getRun, lockRun, markPaid, openRun, reversePayment, sendForApproval, takeBack } from "@/lib/salary/payroll";
import { setTds } from "@/lib/salary/structures";
import { adjustmentLabel, monthName, parseMonthKey } from "@/lib/salary/words";
import { salaryAction } from "../_lib/action";

const tz = (c: { school: { timeZone: string } }) => todayIn(c.school.timeZone);

export async function openMonthAction(_prev: unknown, fd: FormData) {
  return salaryAction("create", fd, async (tx, ctx, current) => {
    const month = parseMonthKey(str(fd, "month"));
    if (!month) throw new MoneyProblem("Choose the month.", "month");
    const run = await openRun(tx, ctx, { campusId: id(fd, "campusId", "campus"), month, today: tz(current) });
    await calculateRun(tx, ctx, run.id, tz(current));
    return { id: run.id, month: monthName(run.month) };
  }, (r) => ({ message: `${r.month} opened and calculated. Attendance and leave come in as the month goes.`, link: { href: `/salary-management/generate?run=${r.id}`, label: "Open it" } }));
}

export async function calculateAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const run = await calculateRun(tx, ctx, id(fd, "runId", "salary month"), tz(current));
    return { month: monthName(run.month), staff: run.staffCount };
  }, (r) => `${r.month} worked out again with attendance and leave up to today · ${r.staff} staff.`);
}

export async function addAdjustmentAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const type = str(fd, "type");
    const r = await addAdjustment(tx, ctx, { runId: id(fd, "runId", "salary month"), staffId: id(fd, "staffId", "staff member"), type, amountPaise: needRupees(fd, "amount", "Amount"), reason: str(fd, "reason") }, tz(current));
    return { what: `${adjustmentLabel(type)} of ${formatRupees(r.adj.amountPaise)} added for ${r.staff}`, reason: r.adj.reason };
  }, (r) => `${r.what}. Reason kept with it: “${r.reason}”.`);
}

export async function removeAdjustmentAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const a = await archiveAdjustment(tx, ctx, id(fd, "adjustmentId", "adjustment"), tz(current));
    return adjustmentLabel(a.type);
  }, (t) => `${t} taken off. It stays in the audit log.`);
}

export async function sendRunAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const run = await sendForApproval(tx, ctx, id(fd, "runId", "salary month"));
    return monthName(run.month);
  }, (m) => `${m} salary sent for approval. The approver gets it in Approvals.`);
}

export async function takeBackAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => monthName((await takeBack(tx, ctx, id(fd, "runId", "salary month"))).month),
    (m) => `${m} taken back from approval. You can change it and send it again.`);
}

/** Approve or send back: the approval's own rules apply (nobody approves a run they sent). */
export async function decideRunAction(_prev: unknown, fd: FormData) {
  return salaryAction("approve", fd, async (tx, ctx) => {
    const run = await getRun(tx, id(fd, "runId", "salary month"));
    if (run.status !== "WAITING" || !run.approvalId) throw new MoneyProblem("This month is not waiting for approval.");
    const decision = str(fd, "decision") === "approve" ? "approve" : "ask-change";
    await decide(tx, ctx, run.approvalId, decision, decision === "approve" ? null : text(fd, "reason", "Reason", { min: 5, max: 500 }));
    const after = await getRun(tx, run.id);
    return { month: monthName(after.month), approved: decision === "approve", count: await tx.payslip.count({ where: { runId: run.id } }) };
  }, (r) => r.approved ? `${r.month} salary approved. ${r.count} salary slips made and each staff member is told. Amounts are now frozen.` : `${r.month} sent back with your reason.`);
}

export async function markPaidAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const mode = str(fd, "mode");
    const reference = mode === "CASH" ? null : optionalText(fd, "reference", "Reference", 60);
    if (reference && !/^[A-Za-z0-9 /,.-]{4,60}$/.test(reference)) throw new MoneyProblem("This does not look like a bank reference. Use 6 to 24 letters or digits.", "reference");
    const run = await markPaid(tx, ctx, id(fd, "runId", "salary month"), { date: dateOf(fd, "date", "Date paid"), mode, reference, accountId: mode === "CASH" ? null : optionalId(fd, "accountId"), today: tz(current) });
    return { month: monthName(run.month), net: formatRupees(run.netPaise), date: formatDate(run.paidOn!) };
  }, (r) => `${r.month} marked paid. ${r.net} added to the Day Book on ${r.date} as one salary entry.`);
}

export async function reversePaymentAction(_prev: unknown, fd: FormData) {
  return salaryAction("archive", fd, async (tx, ctx, current) => monthName((await reversePayment(tx, ctx, id(fd, "runId", "salary month"), str(fd, "reason"), tz(current))).month),
    (m) => `${m} payment reversed in today’s Day Book. The month is approved again; mark it paid when it is really paid.`);
}

export async function lockRunAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => monthName((await lockRun(tx, ctx, id(fd, "runId", "salary month"))).month),
    (m) => `${m} locked. Corrections from now on are adjustments in a following month.`);
}

export async function tdsAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const from = parseMonthKey(str(fd, "from"));
    if (!from) throw new MoneyProblem("Choose the month it starts.", "from");
    const amount = needRupees(fd, "tds", "TDS per month", { allowZero: true });
    const staffId = id(fd, "staffId", "staff member");
    await setTds(tx, ctx, staffId, amount, from, optionalText(fd, "reason", "Reason", 200) ?? "TDS per month entered");
    const runId = optionalId(fd, "runId");
    if (runId) {
      const run = await getRun(tx, runId);
      if (run.status === "OPEN" || run.status === "CALCULATED") await calculateRun(tx, ctx, run.id, tz(current));
    }
    const s = await tx.staff.findFirst({ where: { id: staffId }, select: { fullName: true } });
    return { who: s?.fullName ?? "", amount: formatRupees(amount) };
  }, (r) => `TDS ${r.amount} a month saved for ${r.who}. On every slip until changed.`);
}
