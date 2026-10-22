// PF, ESI, Professional Tax and TDS to pay to the government (gap list G34;
// 10 §6 "Statutory deductions", D9; 07 §2 Accounts "Payables").
//
// When a month's salary is marked paid, what it took from staff for the
// government (employee PF and ESI, Professional Tax, TDS) and the school's own
// PF and ESI share are owed to the government. They stay money to pay until
// the Accountant records each one paid (with the challan number), which posts
// it to the Day Book on the date paid under Salaries, because that is when the
// money leaves (D12). A wrong payment is cancelled with a reason and a
// reversal, never deleted.
//
// Schools that had salary before this was added switch it on in Salary
// Settings from a month they choose, so months they already paid (often as
// expenses) are never asked for again.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { MoneyProblem } from "../fees/problem";
import { postToDayBook, reverseSource } from "../finance/daybook";
import { accountForMode, systemHead } from "../finance/settings";
import { assertNotFuture, financialYearOf } from "../finance/years";
import { monthName } from "./words";

const ZERO = BigInt(0);

export const STATUTORY_KINDS = ["PF", "ESI", "PT", "TDS"] as const;
export type StatutoryKind = (typeof STATUTORY_KINDS)[number];

export const STATUTORY_WORDS: Record<StatutoryKind, { label: string; payee: string; parts: string }> = {
  PF: { label: "PF", payee: "EPFO", parts: "Staff share and the school's share" },
  ESI: { label: "ESI", payee: "ESIC", parts: "Staff share and the school's share" },
  PT: { label: "Professional Tax", payee: "State Professional Tax", parts: "Taken from salary" },
  TDS: { label: "TDS", payee: "Income Tax Department", parts: "Income tax taken from salary" },
};

export const STATUTORY_MODES = [
  { value: "BANK_TRANSFER", label: "Bank transfer or online challan" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
] as const;

/** Due by (inferred, the usual Indian dates): PF and ESI by the 15th, TDS by the 7th of the next month. Professional Tax differs by state. */
export function statutoryDueDate(month: Date, kind: StatutoryKind): Date | null {
  const day = kind === "PF" || kind === "ESI" ? 15 : kind === "TDS" ? 7 : null;
  return day ? new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, day)) : null;
}

/** The first salary month whose PF, ESI, Professional Tax and TDS are tracked, or null when not tracked. */
export async function duesTrackedFrom(tx: Tx) {
  const s = await tx.salarySetting.findFirst({ select: { statutoryDuesFrom: true } });
  return s?.statutoryDuesFrom ?? null;
}

/** Switches tracking on from a month (first day), or off (null). Payments already recorded stay. */
export async function setDuesTracking(tx: Tx, ctx: SchoolContext, from: Date | null) {
  const s = await tx.salarySetting.findFirst();
  if (!s) throw new MoneyProblem("Salary Settings are not set up yet.");
  const month = from ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)) : null;
  await tx.salarySetting.update({ where: { id: s.id }, data: { statutoryDuesFrom: month } });
  await writeAudit(tx, ctx, {
    action: month ? "statutory-dues-on" : "statutory-dues-off", recordType: "Salary Setting", recordId: s.id,
    before: { trackedFrom: s.statutoryDuesFrom ? monthName(s.statutoryDuesFrom) : "Off" }, after: { trackedFrom: month ? monthName(month) : "Off" },
  });
  return month;
}

export type StatutoryDue = {
  runId: string; campusId: string; month: Date; kind: StatutoryKind; label: string; payee: string;
  /** Taken from staff. */
  staffShare: bigint;
  /** The school's own share (PF and ESI only). */
  schoolShare: bigint;
  owed: bigint; paid: bigint; balance: bigint; dueDate: Date | null; overdue: boolean;
};

/**
 * What each paid salary month owes the government, kind by kind, with what is
 * paid and what is left. Only months marked paid (or locked), from the month
 * tracking starts. `open` keeps only what is left to pay.
 */
export async function statutoryDues(tx: Tx, opts: { runId?: string; from?: Date; to?: Date; open?: boolean; today?: Date } = {}): Promise<StatutoryDue[]> {
  const since = await duesTrackedFrom(tx);
  if (!since) return [];
  const runs = await tx.payrollRun.findMany({
    where: {
      status: { in: ["PAID", "LOCKED"] },
      ...(opts.runId ? { id: opts.runId } : {}),
      month: { gte: opts.from && opts.from > since ? opts.from : since, ...(opts.to ? { lte: opts.to } : {}) },
    },
    orderBy: [{ month: "asc" }, { createdAt: "asc" }],
    select: { id: true, campusId: true, month: true },
  });
  if (!runs.length) return [];
  const ids = runs.map((r) => r.id);
  const [sums, pays] = await Promise.all([
    tx.payrollLine.groupBy({ by: ["runId"], where: { runId: { in: ids }, included: true }, _sum: { pfPaise: true, erPfPaise: true, esiPaise: true, erEsiPaise: true, ptPaise: true, tdsPaise: true } }),
    tx.statutoryPayment.groupBy({ by: ["runId", "kind"], where: { runId: { in: ids }, cancelledAt: null }, _sum: { amountPaise: true } }),
  ]);
  const out: StatutoryDue[] = [];
  for (const r of runs) {
    const s = sums.find((x) => x.runId === r.id)?._sum;
    const parts: Record<StatutoryKind, [bigint, bigint]> = {
      PF: [s?.pfPaise ?? ZERO, s?.erPfPaise ?? ZERO],
      ESI: [s?.esiPaise ?? ZERO, s?.erEsiPaise ?? ZERO],
      PT: [s?.ptPaise ?? ZERO, ZERO],
      TDS: [s?.tdsPaise ?? ZERO, ZERO],
    };
    for (const kind of STATUTORY_KINDS) {
      const [staffShare, schoolShare] = parts[kind];
      const owed = staffShare + schoolShare;
      const paid = pays.find((p) => p.runId === r.id && p.kind === kind)?._sum.amountPaise ?? ZERO;
      if (owed === ZERO && paid === ZERO) continue;
      const balance = owed - paid;
      if (opts.open && balance <= ZERO) continue;
      const dueDate = statutoryDueDate(r.month, kind);
      out.push({
        runId: r.id, campusId: r.campusId, month: r.month, kind, label: STATUTORY_WORDS[kind].label, payee: STATUTORY_WORDS[kind].payee,
        staffShare, schoolShare, owed, paid, balance, dueDate, overdue: Boolean(opts.today && dueDate && balance > ZERO && dueDate < opts.today),
      });
    }
  }
  return out;
}

export type StatutoryPayInput = { runId: string; kind: string; amountPaise: bigint; date: Date; mode: string; reference: string | null; accountId: string | null };

/** Records PF, ESI, Professional Tax or TDS of one salary month paid to the government; it goes into the Day Book on the date paid. */
export async function payStatutory(tx: Tx, ctx: SchoolContext, input: StatutoryPayInput) {
  if (!(STATUTORY_KINDS as readonly string[]).includes(input.kind)) throw new MoneyProblem("Choose what is being paid: PF, ESI, Professional Tax or TDS.", "kind");
  const kind = input.kind as StatutoryKind;
  const words = STATUTORY_WORDS[kind];
  const run = await tx.payrollRun.findFirst({ where: { id: input.runId } });
  if (!run) throw new MoneyProblem("This salary month was not found.");
  const month = monthName(run.month);
  const since = await duesTrackedFrom(tx);
  if (!since || run.month < since) throw new MoneyProblem(`PF, ESI, Professional Tax and TDS for ${month} are not tracked here. Switch it on in Salary Settings from that month.`);
  if (run.status !== "PAID" && run.status !== "LOCKED") throw new MoneyProblem(`${month} salary is not marked paid yet, so nothing has been taken from it for the government.`);
  const due = (await statutoryDues(tx, { runId: run.id })).find((d) => d.kind === kind);
  if (!due || due.balance <= ZERO) throw new MoneyProblem(due ? `${words.label} for ${month} is already paid in full.` : `${month} salary took no ${words.label}.`, "kind");
  if (input.amountPaise <= ZERO) throw new MoneyProblem("Amount must be more than ₹0.", "amount");
  if (input.amountPaise > due.balance) throw new MoneyProblem(`Only ${formatRupees(due.balance)} of ${words.label} for ${month} is left to pay.`, "amount");
  if (!STATUTORY_MODES.some((m) => m.value === input.mode)) throw new MoneyProblem("Choose how it was paid.", "mode");
  const reference = input.reference?.trim() || null;
  if (input.mode !== "CASH" && !reference) throw new MoneyProblem("Enter the challan or reference number.", "reference");
  await assertNotFuture(tx, ctx, input.date, "date", "The date paid");
  if (input.date < run.month) throw new MoneyProblem(`The date paid is before ${month} began.`, "date");
  const fy = await financialYearOf(tx, ctx, input.date);
  const accountId = await accountForMode(tx, ctx, input.mode, input.accountId);
  const head = await systemHead(tx, ctx, "salary");
  const p = await tx.statutoryPayment.create({
    data: {
      schoolId: ctx.schoolId, runId: run.id, campusId: run.campusId, month: run.month, kind, amountPaise: input.amountPaise, paidOn: input.date,
      mode: input.mode, reference, accountId, financialYearId: fy.id, paidById: ctx.userId,
    },
  });
  // Posting checks the books are open on that date (a closed day moves it to the next open day).
  const { entry } = await postToDayBook(tx, ctx, {
    date: input.date, direction: "OUT", amountPaise: input.amountPaise, mode: input.mode, section: "salary", headName: `${words.label} paid`,
    accountHeadId: head?.id ?? null, accountId, sourceType: "statutory-payment", sourceId: p.id, sourceKey: `statutory:${p.id}`,
    partyName: `${words.label} for ${month} · ${words.payee}`, reference, note: kind === "PF" || kind === "ESI" ? words.parts : null,
  });
  if (entry.financialYearId !== fy.id) await tx.statutoryPayment.update({ where: { id: p.id }, data: { financialYearId: entry.financialYearId } });
  await writeAudit(tx, ctx, {
    action: "statutory-paid", recordType: "Statutory Payment", recordId: p.id,
    after: { what: `${words.label} for ${month}`, amount: formatRupees(input.amountPaise), paidOn: formatDate(input.date), reference, leftToPay: formatRupees(due.balance - input.amountPaise) },
  });
  return { payment: p, label: words.label, month, left: due.balance - input.amountPaise, dayBookDate: entry.date as Date };
}

/** A payment recorded by mistake: cancelled with a reason; a reversal goes into today's Day Book and the amount is to pay again. */
export async function cancelStatutoryPayment(tx: Tx, ctx: SchoolContext, id: string, reason: string, today: Date) {
  const why = reason.trim();
  if (why.length < 5) throw new MoneyProblem("Give a reason of at least 5 characters.", "reason");
  const p = await tx.statutoryPayment.findFirst({ where: { id } });
  if (!p) throw new MoneyProblem("This payment was not found.");
  if (p.cancelledAt) throw new MoneyProblem("This payment is already cancelled.");
  const label = STATUTORY_WORDS[p.kind as StatutoryKind]?.label ?? p.kind;
  const done = await tx.statutoryPayment.updateMany({ where: { id: p.id, cancelledAt: null }, data: { cancelledAt: new Date(), cancelReason: why, cancelledById: ctx.userId } });
  if (done.count === 0) throw new MoneyProblem("This payment is already cancelled.");
  await reverseSource(tx, ctx, { sourceType: "statutory-payment", sourceId: p.id, date: today, reversalType: "statutory-cancel", note: `${label} payment cancelled: ${why}` });
  await writeAudit(tx, ctx, { action: "statutory-cancelled", recordType: "Statutory Payment", recordId: p.id, before: { amount: formatRupees(p.amountPaise), paidOn: formatDate(p.paidOn) }, after: { reason: why } });
  return { label, month: monthName(p.month), amount: p.amountPaise };
}

/** The payments recorded for one salary month, newest first, with who recorded them. */
export async function statutoryPaymentsOf(tx: Tx, runId: string) {
  const rows = await tx.statutoryPayment.findMany({ where: { runId }, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] });
  const users = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.paidById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
  return rows.map((r) => ({ ...r, label: STATUTORY_WORDS[r.kind as StatutoryKind]?.label ?? r.kind, paidBy: users.find((u) => u.id === r.paidById)?.displayName ?? "" }));
}
