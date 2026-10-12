// The Day Book as shown on screen and exported (07 §2, mod-finance.jsx
// DayBookPage): entries in their sections with the number of the record they
// came from, the class, the time, the account; totals, income groups, modes,
// fees by bank account, and payments still waiting for verification.
import "server-only";

import type { DayBookEntry, Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { classOfStudents } from "../fees/dues";
import { dayBookTotals } from "./daybook";
import { dayBookWithoutPay } from "./access";

const ZERO = BigInt(0);

export type DayBookFilter = {
  from: Date; to: Date; classId: string | null; depositAccountId: string | null; waiting: boolean;
  /** Staff pay heads to leave out (src/lib/finance/access.ts); null or missing shows staff pay. */
  hidePay?: string[] | null;
};

export type DayRow = {
  id: string;
  source: "fee" | "income" | "expense" | "salary" | "reversal";
  section: string;
  date: Date;
  at: Date;
  who: string;
  number: string | null;
  classLabel: string;
  head: string;
  amount: bigint;
  penalty: bigint;
  /** Signed: money in positive, money out positive in its own section, reversals negative. */
  total: bigint;
  mode: string;
  reference: string | null;
  account: string | null;
  depositAccount: string | null;
  note: string | null;
  waiting: boolean;
  cancelled: boolean;
  studentId: string | null;
  sourceType: string;
  sourceId: string;
};

const SECTION_OF: Record<string, DayRow["source"]> = {
  "fees-full": "fee", "fees-partial": "fee", "other-fees": "fee", "online-fees": "fee", daycare: "fee",
  "other-income": "income", expense: "expense", salary: "salary", "salary-advance": "salary", refund: "reversal", reversal: "reversal",
};

export async function dayBookView(tx: Tx, f: DayBookFilter) {
  const filtered = Boolean(f.classId || f.depositAccountId);
  const where: Prisma.DayBookEntryWhereInput = {
    date: { gte: f.from, lte: f.to },
    section: { notIn: ["opening", "transfer"] },
    ...(filtered ? { studentId: { not: null } } : {}),
    ...(f.classId ? { classId: f.classId } : {}),
    ...(f.depositAccountId ? { OR: [{ depositAccountId: f.depositAccountId }, { depositAccountId: null, accountId: f.depositAccountId }] } : {}),
    ...(f.hidePay ? dayBookWithoutPay(f.hidePay) : {}),
  };
  const entries = await tx.dayBookEntry.findMany({ where, orderBy: [{ date: "asc" }, { postedAt: "asc" }] });
  const waitingPays = f.waiting
    ? await tx.payment.findMany({
      where: { status: "WAITING", paymentDate: { gte: f.from, lte: f.to }, ...(f.classId ? { studentId: { in: (await tx.enrolment.findMany({ where: { classId: f.classId, archivedAt: null }, select: { studentId: true } })).map((e) => e.studentId) } } : {}) },
      orderBy: { paidAt: "asc" },
    })
    : [];

  // Names and numbers for each entry.
  const ids = (type: string) => entries.filter((e) => e.sourceType === type).map((e) => e.sourceId);
  const payIds = [...ids("payment"), ...ids("payment-cancel"), ...waitingPays.map((p) => p.id)];
  const [receipts, incomes, expensePays, accounts, students, cancelled] = await Promise.all([
    tx.receipt.findMany({ where: { paymentId: { in: payIds } }, select: { paymentId: true, number: true } }),
    tx.income.findMany({ where: { id: { in: [...ids("income"), ...ids("income-cancel")] } }, select: { id: true, receiptNo: true } }),
    tx.expensePayment.findMany({ where: { id: { in: [...ids("expense-payment"), ...ids("expense-cancel")] } }, select: { id: true, expense: { select: { id: true, number: true } } } }),
    tx.bankAccount.findMany({ select: { id: true, name: true } }),
    tx.student.findMany({ where: { id: { in: waitingPays.map((p) => p.studentId) } }, select: { id: true, fullName: true } }),
    tx.dayBookEntry.findMany({ where: { reversesEntryId: { in: entries.map((e) => e.id) } }, select: { reversesEntryId: true } }),
  ]);
  const classes = await classOfStudents(tx, [...new Set([...entries.map((e) => e.studentId), ...waitingPays.map((p) => p.studentId)].filter((x): x is string => Boolean(x)))]);
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const reversed = new Set(cancelled.map((c) => c.reversesEntryId));
  const numberOf = (e: DayBookEntry) => {
    if (e.sourceType.startsWith("payment")) return receipts.find((r) => r.paymentId === e.sourceId)?.number ?? null;
    if (e.sourceType.startsWith("income")) return incomes.find((i) => i.id === e.sourceId)?.receiptNo ?? null;
    if (e.sourceType.startsWith("expense")) return expensePays.find((x) => x.id === e.sourceId)?.expense.number ?? null;
    return null;
  };

  const rows: DayRow[] = entries.map((e) => {
    const source = SECTION_OF[e.section] ?? "income";
    const isRev = e.section === "reversal" || e.section === "refund";
    const total = isRev ? -e.amountPaise : e.amountPaise;
    return {
      id: e.id, source, section: isRev ? "refunds" : e.section === "salary-advance" ? "salary" : e.section === "online-fees" ? "fees-full" : e.section,
      date: e.date, at: e.postedAt, who: e.partyName, number: numberOf(e), classLabel: e.studentId ? classes.get(e.studentId)?.label ?? "" : "",
      head: e.headName, amount: e.amountPaise - e.penaltyPaise, penalty: e.penaltyPaise, total, mode: e.mode, reference: e.reference,
      account: e.accountId ? acc.get(e.accountId) ?? null : null, depositAccount: e.depositAccountId ? acc.get(e.depositAccountId) ?? null : null,
      note: e.note, waiting: false, cancelled: reversed.has(e.id), studentId: e.studentId, sourceType: e.sourceType, sourceId: e.sourceId,
    };
  });
  const waitingRows: DayRow[] = waitingPays.map((p) => ({
    id: `w:${p.id}`, source: "fee", section: p.isPartial ? "fees-partial" : "fees-full", date: p.paymentDate, at: p.paidAt,
    who: students.find((s) => s.id === p.studentId)?.fullName ?? "Student", number: null, classLabel: classes.get(p.studentId)?.label ?? "",
    head: "Waiting for verification", amount: p.amountPaise - p.lateFeePaise, penalty: p.lateFeePaise, total: p.amountPaise, mode: p.mode, reference: p.reference ?? p.chequeNo,
    account: null, depositAccount: null, note: null, waiting: true, cancelled: false, studentId: p.studentId, sourceType: "payment", sourceId: p.id,
  }));

  const all = [...rows, ...waitingRows].sort((a, b) => a.date.getTime() - b.date.getTime() || a.at.getTime() - b.at.getTime());
  const by = (s: string) => all.filter((r) => r.section === s);
  const sections = {
    full: [...by("fees-full")], partial: by("fees-partial"), otherFees: by("other-fees"), daycare: by("daycare"),
    income: by("other-income"), expense: by("expense"), salary: by("salary"), refunds: by("refunds"),
  };
  const totals = dayBookTotals(entries);
  const sum = (list: DayRow[]) => list.reduce((s, r) => s + r.total, ZERO);
  const posted = rows.filter((r) => r.source === "fee" && !r.cancelled);
  const online = posted.filter((r) => r.mode === "GATEWAY");
  const offline = posted.filter((r) => r.mode !== "GATEWAY");
  const groups = [
    { key: "online", label: "Online fees", amount: sum(online), count: online.length },
    { key: "full", label: "Full payments", amount: sum(offline.filter((r) => r.section === "fees-full")), count: offline.filter((r) => r.section === "fees-full").length },
    { key: "partial", label: "Partial payments", amount: sum(offline.filter((r) => r.section === "fees-partial")), count: offline.filter((r) => r.section === "fees-partial").length },
    { key: "daycare", label: "Daycare", amount: sum(sections.daycare), count: sections.daycare.length },
    { key: "other-fees", label: "Other fee types", amount: sum(offline.filter((r) => r.section === "other-fees")), count: offline.filter((r) => r.section === "other-fees").length },
    { key: "other-income", label: "Other income", amount: sum(sections.income), count: sections.income.length },
  ];
  const modes = new Map<string, bigint>();
  for (const r of rows) if (r.total > ZERO && (r.source === "fee" || r.source === "income") && !r.cancelled) modes.set(r.mode, (modes.get(r.mode) ?? ZERO) + r.total);
  const byAccount = new Map<string, { amount: bigint; count: number }>();
  for (const r of posted) {
    const k = r.depositAccount ?? r.account ?? "Not set";
    const g = byAccount.get(k) ?? { amount: ZERO, count: 0 };
    g.amount += r.total; g.count += 1;
    byAccount.set(k, g);
  }
  return {
    filtered, sections, totals, groups,
    modes: [...modes.entries()].map(([mode, amount]) => ({ mode, amount })).sort((a, b) => (b.amount > a.amount ? 1 : -1)),
    byAccount: [...byAccount.entries()].map(([name, v]) => ({ name, ...v })),
    feesFull: sum(posted.filter((r) => r.section !== "fees-partial")), feesPartial: sum(posted.filter((r) => r.section === "fees-partial")),
    reversed: sum(sections.refunds),
    waiting: { count: waitingPays.length, amount: waitingPays.reduce((s, p) => s + p.amountPaise, ZERO) },
    rows: all,
  };
}

/** Fees collected on one day as the Fee Dashboard counts them, to show both agree. */
export async function feeDashboardMatch(tx: Tx, day: Date) {
  const [posted, waiting] = await Promise.all([
    tx.payment.aggregate({ where: { status: "POSTED", broughtIn: false, paymentDate: day }, _sum: { amountPaise: true }, _count: { _all: true } }),
    tx.payment.aggregate({ where: { status: "WAITING", paymentDate: day }, _sum: { amountPaise: true }, _count: { _all: true } }),
  ]);
  return {
    posted: { amount: posted._sum.amountPaise ?? ZERO, count: posted._count._all },
    waiting: { amount: waiting._sum.amountPaise ?? ZERO, count: waiting._count._all },
  };
}
