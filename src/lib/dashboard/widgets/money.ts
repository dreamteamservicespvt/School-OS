// Fee Management and Finance Management on the Dashboard: today's fee
// collection, cheques waiting, defaulters and overdue fees, failed online
// payments, the collection by month, recent payments, money today and
// expenses waiting for approval. Each number is the same filter as the page
// it opens, and only pages the person's role may open are linked
// (src/lib/fees/access.ts, src/lib/finance/access.ts). The Admission
// Counsellor sees no fee details here; staff pay is left out unless the role
// sees salaries.
import "server-only";

import { formatRupees, formatRupeesShort } from "../../format";
import { feeViewer, feePageAllowed, admissionOnlyFor, feePageAllowedFor, type FeeViewer, type FeePageKey } from "../../fees/access";
import { feeTiles, monthlyTrend, recentPayments } from "../../fees/dashboard";
import { failedOnline } from "../../fees/online";
import { financePageAllowed, hiddenPayHeads, expensesWithoutPay, type FinancePageKey } from "../../finance/access";
import { accountBalances } from "../../finance/daybook";
import { n, plural, someNames, addDays, shortDate } from "../common";
import type { DashContext, Viewer, Widget } from "../types";
import { doesWork } from "../../duty";

const FEES = "/fee-management";
const FIN = "/finance-management";
const ZERO = BigInt(0);
const DAY = 86_400_000;

function fees(c: DashContext): Promise<FeeViewer> {
  return c.memo("fee-viewer", () => feeViewer(c.tx, c.viewer.ctx, c.viewer as unknown as Parameters<typeof feeViewer>[2]));
}

/** Sits at the fee counter: may collect, and collecting is their desk work. */
export const collects = (c: Pick<DashContext, "viewer">, v: FeeViewer) => feePageAllowed(v, "collect") && doesWork(c.viewer, "fee-management", "collect");

/** Fee details (amounts) for this person: never for the Admission Counsellor. */
const feeDetails = (page: FeePageKey) => (v: Viewer) => !admissionOnlyFor(v) && feePageAllowedFor(v, page);
const finance = (page: FinancePageKey) => (v: Viewer) => financePageAllowed(v.permissions, page);

function tiles(c: DashContext) {
  return c.memo("fee-tiles", async () => feeTiles(c.tx, await fees(c), c.today));
}

const collectedToday: Widget<"band"> = {
  id: "fees.collected-today",
  module: "fee-management",
  kind: "band",
  homes: ["leader", "accountant"],
  allowed: feeDetails("dashboard"),
  async load(c) {
    const t = (await tiles(c)).today;
    const upi = await c.tx.payment.count({ where: { status: "POSTED", broughtIn: false, paymentDate: c.today, mode: "UPI" } });
    return {
      id: "fees.collected-today", label: "Fees collected today", big: formatRupeesShort(t.amount),
      foot: t.count ? `${plural(t.count, "payment")}${upi ? ` · ${n(upi)} by UPI` : ""}` : "No payments yet today",
      href: `${FEES}/dashboard?period=today`,
    };
  },
};

const chequesToVerify: Widget<"band"> = {
  id: "fees.cheques-to-verify",
  module: "fee-management",
  kind: "band",
  homes: ["accountant"],
  allowed: feeDetails("payments"),
  async load(c) {
    const where = { status: "WAITING" as const, broughtIn: false };
    const [agg, oldest] = await Promise.all([
      c.tx.payment.aggregate({ where, _sum: { amountPaise: true }, _count: { _all: true } }),
      c.tx.payment.findFirst({ where, orderBy: { paymentDate: "asc" }, select: { paymentDate: true } }),
    ]);
    const count = agg._count._all;
    return {
      id: "fees.cheques-to-verify", label: "Waiting for verification", big: n(count),
      foot: count ? `${formatRupees(agg._sum.amountPaise ?? ZERO)} · oldest ${shortDate(oldest!.paymentDate)}` : "Nothing to verify",
      href: `${FEES}/dashboard?status=WAITING&period=acyear`,
    };
  },
};

async function overdueStudents(c: DashContext) {
  return c.memo("fee-overdue", async () => {
    // The same per-class rows as the Fee Dashboard and Fees by class (fees/by-class.ts).
    const t = await tiles(c);
    return { amount: t.overdue, students: t.overdueStudents, over30: t.over30 };
  });
}

const defaulters: Widget<"band"> = {
  id: "fees.defaulters",
  module: "fee-management",
  kind: "band",
  homes: ["accountant"],
  allowed: feeDetails("defaulters"),
  async load(c) {
    const o = await overdueStudents(c);
    return {
      id: "fees.defaulters", label: "Defaulters", big: n(o.students),
      foot: o.students ? `${formatRupeesShort(o.amount)} overdue${o.over30 ? ` · ${n(o.over30)} over 30 days` : ""}` : "No fees overdue",
      href: `${FEES}/defaulters`,
    };
  },
};

const overdue: Widget<"attention"> = {
  id: "fees.overdue",
  module: "fee-management",
  kind: "attention",
  homes: ["leader"],
  allowed: feeDetails("defaulters"),
  async load(c) {
    const o = await overdueStudents(c);
    if (!o.students) return null;
    return {
      id: "fees.overdue", tone: o.over30 ? "warn" : "info", icon: "CreditCard",
      title: `${formatRupees(o.amount)} overdue from ${plural(o.students, "student")}`,
      detail: o.over30 ? `${plural(o.over30, "student")} more than 30 days late` : "All of it less than 30 days late",
      action: "Defaulters", href: `${FEES}/defaulters`, value: `${o.students}:${o.amount}`,
    };
  },
};

const failed: Widget<"attention"> = {
  id: "fees.failed-online",
  module: "fee-management",
  kind: "attention",
  homes: ["leader", "accountant"],
  allowed: feeDetails("dashboard"),
  async load(c) {
    const f = await failedOnline(c.tx, addDays(c.today, -7));
    const rows = [...f.failed, ...f.stuck];
    if (!rows.length) return null;
    const students = await c.tx.student.findMany({ where: { id: { in: rows.slice(0, 2).map((r) => r.studentId) } }, select: { fullName: true } });
    return {
      id: "fees.failed-online", tone: "bad", icon: "TriangleAlert",
      title: `${plural(rows.length, "online payment")} failed or not confirmed`,
      detail: `No receipt was made in the last 7 days · ${someNames(students.map((s) => s.fullName))}${rows.length > 2 ? ` and ${n(rows.length - 2)} more` : ""}`,
      action: "Check", href: `${FEES}/dashboard?period=last7`, value: String(rows.length),
    };
  },
};

const collectionChart: Widget<"panel"> = {
  id: "fees.collection-chart",
  module: "fee-management",
  kind: "panel",
  homes: ["leader"],
  allowed: (v) => feeDetails("dashboard")(v) && v.permissions["fee-management"].see === "all",
  async load(c) {
    if (!c.year) return null;
    const end = c.year.endDate < c.today ? c.year.endDate : c.today;
    // Collected so far against due so far, at the end of each month: payments
    // made early or late still count against the dues they paid.
    const trend = await monthlyTrend(c.tx, c.year.startDate, end);
    let paidSoFar = ZERO, dueSoFar = ZERO;
    const months = trend.map((m) => ({ ...m, paidSoFar: (paidSoFar += m.collected), dueSoFar: (dueSoFar += m.due) })).filter((m) => m.dueSoFar > ZERO);
    const pct = (a: bigint, b: bigint) => (b > ZERO ? Math.min(100, Math.round((Number(a) * 100) / Number(b))) : 0);
    // "Collected this year" has one meaning: the Fee Dashboard's (fees/by-class.ts), paid on
    // the fees due so far. The same words show the same numbers on both screens.
    const year = (await tiles(c)).year;
    return {
      slot: "main",
      panel: {
        kind: "bars", title: "Fee collection", icon: "CreditCard",
        // Each bar: share of the fees due so far that was collected by the end of that month.
        sub: year.due > ZERO ? `${formatRupeesShort(year.paid)} of ${formatRupeesShort(year.due)} due so far · ${Math.round(year.percent)}%` : `${c.year.name}: nothing due yet`,
        rows: months.map((m) => ({ key: m.key, label: m.label, value: pct(m.paidSoFar, m.dueSoFar) })),
        goal: 90, lowBelow: 75, href: `${FEES}/reports`, linkLabel: "Reports",
        empty: "No fees have fallen due this year yet.",
      },
    };
  },
};

const recent: Widget<"panel"> = {
  id: "fees.recent-payments",
  module: "fee-management",
  kind: "panel",
  homes: ["leader", "accountant"],
  allowed: feeDetails("payments"),
  async load(c) {
    const v = await fees(c);
    const from = c.year && c.year.startDate < c.today ? c.year.startDate : addDays(c.today, -30);
    const list = await recentPayments(c.tx, v, { from, to: c.today }, 5);
    const word: Record<string, string> = { POSTED: "", WAITING: "Waiting", CANCELLED: "Cancelled", FAILED: "Failed" };
    const tone = { POSTED: "ok", WAITING: "warn", CANCELLED: "neutral", FAILED: "bad" } as const;
    return {
      slot: "side",
      panel: {
        kind: "list", title: "Recent payments", sub: c.year ? `Latest in ${c.year.name}` : "Last 30 days", icon: "CreditCard",
        rows: list.rows.map((r) => ({
          id: r.id, title: r.student?.fullName ?? "Student",
          sub: [r.classLabel, r.receiptNo, shortDate(r.paymentDate)].filter(Boolean).join(" · "),
          href: `${FEES}/payments/${r.id}`,
          right: word[r.status] ? `${formatRupees(r.amountPaise)} · ${word[r.status]}` : formatRupees(r.amountPaise),
          rightTone: tone[r.status as keyof typeof tone] ?? "neutral",
        })),
        // Collect Fee is the module's first page; the Principal and School Admin never sit at the counter (src/lib/duty.ts).
        href: collects(c, v) ? FEES : `${FEES}/dashboard`,
        linkLabel: collects(c, v) ? "Collect fee" : "Fee Dashboard",
        empty: "No fee payments yet this year.",
      },
    };
  },
};

/** Staff pay heads to leave out for this person (Vice Principal), or null. */
function payHeads(c: DashContext) {
  return c.memo("pay-heads", () => hiddenPayHeads(c.tx, c.viewer.permissions));
}

const moneyToday: Widget<"panel"> = {
  id: "finance.money-today",
  module: "finance-management",
  kind: "panel",
  homes: ["accountant"],
  allowed: finance("day-book"),
  async load(c) {
    const hidden = await payHeads(c);
    const [t, waiting, spent, balances, cashAccounts] = await Promise.all([
      tiles(c),
      c.tx.payment.aggregate({ where: { status: "WAITING", broughtIn: false }, _sum: { amountPaise: true }, _count: { _all: true } }),
      c.tx.expensePayment.aggregate({ where: { date: c.today, cancelledAt: null, ...(hidden ? { expense: expensesWithoutPay(hidden) } : {}) }, _sum: { amountPaise: true }, _count: { _all: true } }),
      accountBalances(c.tx, c.viewer.ctx),
      c.tx.bankAccount.findMany({ where: { kind: "CASH", archivedAt: null }, select: { id: true } }),
    ]);
    const cash = cashAccounts.reduce((s, a) => s + (balances.get(a.id) ?? ZERO), ZERO);
    const v = c.viewer;
    const feeOk = !admissionOnlyFor(v) && feePageAllowedFor(v, "dashboard");
    const rows = [
      feeOk && { id: "collected", title: "Fees collected today", sub: plural(t.today.count, "payment"), right: formatRupees(t.today.amount), rightTone: "ok" as const, href: `${FEES}/dashboard?period=today` },
      feeOk && { id: "cheques", title: "Waiting for verification", sub: plural(waiting._count._all, "payment"), right: formatRupees(waiting._sum.amountPaise ?? ZERO), rightTone: waiting._count._all ? "warn" as const : "neutral" as const, href: `${FEES}/dashboard?status=WAITING&period=acyear` },
      { id: "spent", title: "Expenses paid today", sub: plural(spent._count._all, "payment"), right: formatRupees(spent._sum.amountPaise ?? ZERO), rightTone: "neutral" as const, href: `${FIN}/expenses?period=today` },
      { id: "cash", title: "Cash in hand", sub: "All cash accounts", right: formatRupees(cash), rightTone: cash < ZERO ? "bad" as const : "neutral" as const, href: financePageAllowed(v.permissions, "cash-bank") ? `${FIN}/cash-bank` : undefined },
    ].filter((r): r is Exclude<typeof r, false> => Boolean(r));
    return {
      slot: "first",
      panel: { kind: "list", title: "Money today", sub: shortDate(c.today), icon: "CreditCard", rows, href: `${FIN}/day-book`, linkLabel: "Day Book", empty: "Nothing yet today." },
    };
  },
};

const dayBook: Widget<"band"> = {
  id: "finance.day-book",
  module: "finance-management",
  kind: "band",
  homes: ["accountant"],
  allowed: finance("day-book"),
  async load(c) {
    const hidden = await payHeads(c);
    const rows = await c.tx.dayBookEntry.groupBy({
      by: ["direction"],
      where: {
        date: c.today, sourceType: { notIn: ["transfer", "transfer-cancel"] },
        ...(hidden ? { AND: [{ section: { notIn: ["salary", "salary-advance"] } }, { sourceType: { notIn: ["payroll", "salary-advance"] } }, { OR: [{ accountHeadId: null }, { accountHeadId: { notIn: hidden } }] }] } : {}),
      },
      _sum: { amountPaise: true }, _count: { _all: true },
    });
    const sum = (d: "IN" | "OUT") => rows.find((r) => r.direction === d)?._sum.amountPaise ?? ZERO;
    const count = rows.reduce((s, r) => s + r._count._all, 0);
    const net = sum("IN") - sum("OUT");
    return {
      id: "finance.day-book", label: "Day Book today", big: formatRupeesShort(net),
      foot: count ? `${formatRupeesShort(sum("IN"))} in · ${formatRupeesShort(sum("OUT"))} out` : "No entries yet today",
      href: `${FIN}/day-book`,
    };
  },
};

const expenses: Widget<"attention"> = {
  id: "finance.expenses",
  module: "finance-management",
  kind: "attention",
  homes: ["leader"],
  allowed: finance("expenses"),
  async load(c) {
    const hidden = await payHeads(c);
    const where = { status: "WAITING" as const, ...(hidden ? expensesWithoutPay(hidden) : {}) };
    const [agg, rows] = await Promise.all([
      c.tx.expense.aggregate({ where, _sum: { amountPaise: true }, _count: { _all: true } }),
      c.tx.expense.findMany({ where, orderBy: { date: "asc" }, take: 2, select: { note: true, date: true, amountPaise: true } }),
    ]);
    const count = agg._count._all;
    if (!count) return null;
    const oldest = rows[0];
    const days = Math.max(0, Math.round((c.today.getTime() - oldest.date.getTime()) / DAY));
    return {
      id: "finance.expenses", tone: days > 3 ? "warn" : "info", icon: "ClipboardCheck",
      title: `${plural(count, "expense")} waiting for approval · ${formatRupees(agg._sum.amountPaise ?? ZERO)}`,
      detail: `${someNames(rows.map((r) => `${r.note ?? "Expense"} (${formatRupees(r.amountPaise)})`))}${count > 2 ? ` and ${n(count - 2)} more` : ""}${days ? ` · oldest ${shortDate(oldest.date)}` : ""}`,
      action: "Review", href: `${FIN}/expenses?status=WAITING`, value: `${count}:${agg._sum.amountPaise ?? ZERO}`,
    };
  },
};

export const MONEY_WIDGETS: Widget[] = [collectedToday, chequesToVerify, defaulters, overdue, failed, collectionChart, recent, moneyToday, dayBook, expenses] as Widget[];
