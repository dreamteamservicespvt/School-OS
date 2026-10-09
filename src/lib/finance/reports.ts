// Finance Reports (07 §7): income and expense by head and period, profit and
// loss, expense analysis (by head, vendor, month, approver), department-wise
// expenses, pending expenses, budget against actual, trial balance and the
// Day Book summary. All work by financial year, with a date range inside it.
// Each has a total line and export (P8).
import "server-only";

import type { DayBookEntry } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import type { Cell, ReportColumn, ReportResult } from "../fees/reports";
import { budgetsWithUse } from "./budgets";
import { chart, headSide, payables, trialBalance } from "./journals";
import { EXPENSE_STATUS_WORDS } from "./words";
import type { FinanceFeature } from "./words";

const ZERO = BigInt(0);

export type FinanceFilter = { financialYearId: string; yearStart: Date; from: Date; to: Date; group: "day" | "month"; by: "head" | "vendor" | "month" | "approver"; today: Date };
export type FinanceFilterKey = "dates" | "group" | "by";
export type FinanceReportDef = { key: string; label: string; about: string; filters: FinanceFilterKey[]; feature?: FinanceFeature; run: (tx: Tx, ctx: SchoolContext, f: FinanceFilter) => Promise<ReportResult> };

const sum = <T>(list: T[], f: (x: T) => bigint) => list.reduce((s, x) => s + f(x), ZERO);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const monthName = (key: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
const periodOf = (d: Date, g: FinanceFilter["group"]) => (g === "month" ? monthKey(d) : d.toISOString().slice(0, 10));
const periodName = (k: string, g: FinanceFilter["group"]) => (g === "month" ? monthName(k) : formatDate(new Date(`${k}T00:00:00Z`)));

/** Money in and out by head for the period: Day Book (reversals net off) plus brought-in records, which are kept apart. */
async function byHead(tx: Tx, ctx: SchoolContext, f: FinanceFilter) {
  const { accounts, bySystem } = await chart(tx, ctx);
  const entries = await tx.dayBookEntry.findMany({ where: { financialYearId: f.financialYearId, date: { gte: f.from, lte: f.to }, section: { notIn: ["opening", "transfer"] } } });
  const lines: { key: string; kind: "INCOME" | "EXPENSE"; date: Date; amount: bigint }[] = [];
  for (const e of entries) {
    const key = headSide(e, bySystem);
    const a = accounts.get(key);
    // Money in raises income; money out raises expense. A reversal is the other way, so it lowers the original's side.
    const kind: "INCOME" | "EXPENSE" = a?.kind === "INCOME" ? "INCOME" : a?.kind === "EXPENSE" ? "EXPENSE" : isIncome(e) ? "INCOME" : "EXPENSE";
    const sign = (kind === "INCOME") === (e.direction === "IN") ? BigInt(1) : BigInt(-1);
    lines.push({ key, kind, date: e.date, amount: e.amountPaise * sign });
  }
  // Brought-in fee receipts and past expenses (workflow 15) count in reports, never in the Day Book.
  const feeHead = bySystem.get("fees");
  const oldFees = await tx.payment.findMany({ where: { broughtIn: true, status: "POSTED", paymentDate: { gte: f.from, lte: f.to } }, select: { paymentDate: true, amountPaise: true } });
  const oldExpenses = await tx.expense.findMany({ where: { broughtIn: true, status: "PAID", date: { gte: f.from, lte: f.to } }, select: { date: true, amountPaise: true, accountHeadId: true } });
  let broughtIn = ZERO;
  for (const p of oldFees) { lines.push({ key: feeHead ? `head:${feeHead}` : "unassigned", kind: "INCOME", date: p.paymentDate, amount: p.amountPaise }); broughtIn += p.amountPaise; }
  for (const e of oldExpenses) { lines.push({ key: `head:${e.accountHeadId}`, kind: "EXPENSE", date: e.date, amount: e.amountPaise }); broughtIn += e.amountPaise; }
  return { accounts, lines, broughtIn };
}

function isIncome(e: Pick<DayBookEntry, "section" | "direction">) {
  if (e.section === "reversal") return e.direction === "OUT";
  return e.direction === "IN";
}

const BROUGHT_IN_NOTE = "Includes records brought in from old software (they are not in the Day Book).";

export const FINANCE_REPORTS: FinanceReportDef[] = [
  {
    key: "income-expense",
    label: "Income and expense by head",
    about: "Each income and expense head for the period, by day or month.",
    filters: ["dates", "group"],
    run: async (tx, ctx, f) => {
      const { accounts, lines, broughtIn } = await byHead(tx, ctx, f);
      const map = new Map<string, { period: string; key: string; kind: string; amount: bigint }>();
      for (const l of lines) {
        const p = periodOf(l.date, f.group);
        const k = `${p}|${l.key}`;
        const row = map.get(k) ?? { period: p, key: l.key, kind: l.kind, amount: ZERO };
        row.amount += l.amount;
        map.set(k, row);
      }
      const rows = [...map.values()].sort((a, b) => a.period.localeCompare(b.period) || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key)).map((r) => {
        const a = accounts.get(r.key);
        return { period: periodName(r.period, f.group), head: a?.name ?? "Not assigned to a head", group: a?.group ?? "Other", income: r.kind === "INCOME" ? r.amount : null, expense: r.kind === "EXPENSE" ? r.amount : null };
      });
      const income = sum(lines.filter((l) => l.kind === "INCOME"), (l) => l.amount);
      const expense = sum(lines.filter((l) => l.kind === "EXPENSE"), (l) => l.amount);
      return {
        columns: [{ key: "period", label: f.group === "month" ? "Month" : "Date" }, { key: "head", label: "Head" }, { key: "group", label: "Group" }, { key: "income", label: "Income", kind: "money" }, { key: "expense", label: "Expense", kind: "money" }],
        rows,
        totals: { period: "Total", income, expense },
        note: broughtIn > ZERO ? BROUGHT_IN_NOTE : undefined,
      };
    },
  },
  {
    key: "profit-loss",
    label: "Profit and loss",
    about: "Income and expense by head and group, and the surplus or deficit for the period.",
    filters: ["dates"],
    run: async (tx, ctx, f) => {
      const { accounts, lines, broughtIn } = await byHead(tx, ctx, f);
      const totals = new Map<string, bigint>();
      for (const l of lines) totals.set(l.key, (totals.get(l.key) ?? ZERO) + l.amount);
      const rowsFor = (kind: "INCOME" | "EXPENSE") =>
        [...totals.entries()]
          .filter(([key]) => (accounts.get(key)?.kind ?? (lines.find((l) => l.key === key)?.kind)) === kind)
          .map(([key, amount]) => ({ key, amount, a: accounts.get(key) }))
          .filter((r) => r.amount !== ZERO)
          .sort((x, y) => (x.a?.group ?? "").localeCompare(y.a?.group ?? "") || (x.a?.name ?? "").localeCompare(y.a?.name ?? ""));
      const inc = rowsFor("INCOME");
      const exp = rowsFor("EXPENSE");
      const income = sum(inc, (r) => r.amount);
      const expense = sum(exp, (r) => r.amount);
      const rows: Record<string, Cell>[] = [
        { section: "Income", group: "", head: "", amount: null },
        ...inc.map((r) => ({ section: "", group: r.a?.group ?? "Other", head: r.a?.name ?? "Not assigned to a head", amount: r.amount })),
        { section: "Total income", group: "", head: "", amount: income },
        { section: "Expenses", group: "", head: "", amount: null },
        ...exp.map((r) => ({ section: "", group: r.a?.group ?? "Other", head: r.a?.name ?? "Not assigned to a head", amount: r.amount })),
        { section: "Total expenses", group: "", head: "", amount: expense },
      ];
      return {
        columns: [{ key: "section", label: "" }, { key: "group", label: "Group" }, { key: "head", label: "Head" }, { key: "amount", label: "Amount", kind: "money" }],
        rows,
        totals: { section: income >= expense ? "Surplus" : "Deficit", amount: income >= expense ? income - expense : expense - income },
        note: broughtIn > ZERO ? BROUGHT_IN_NOTE : undefined,
        chart: [{ label: "Income", value: income }, { label: "Expenses", value: expense }],
      };
    },
  },
  {
    key: "expense-analysis",
    label: "Expense analysis",
    about: "Paid expenses by head, vendor, month or approver.",
    filters: ["dates", "by"],
    run: async (tx, ctx, f) => {
      const paid = await paidExpenses(tx, f);
      const [heads, vendors, users] = await Promise.all([
        tx.accountHead.findMany({ select: { id: true, name: true } }),
        tx.vendor.findMany({ select: { id: true, name: true } }),
        tx.userLogin.findMany({ where: { id: { in: paid.map((p) => p.approvedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
      ]);
      const label = (p: (typeof paid)[number]) =>
        f.by === "vendor" ? vendors.find((v) => v.id === p.vendorId)?.name ?? "No vendor"
        : f.by === "month" ? monthKey(p.date)
        : f.by === "approver" ? (p.broughtIn ? "Brought in" : p.approvedById ? users.find((u) => u.id === p.approvedById)?.displayName ?? "Approver" : "Approved at once (below the limit)")
        : heads.find((h) => h.id === p.accountHeadId)?.name ?? "Head";
      const map = new Map<string, { amount: bigint; count: number }>();
      for (const p of paid) {
        const k = label(p);
        const r = map.get(k) ?? { amount: ZERO, count: 0 };
        r.amount += p.amount;
        r.count++;
        map.set(k, r);
      }
      const total = sum(paid, (p) => p.amount);
      const rows = [...map.entries()]
        .sort((a, b) => (f.by === "month" ? a[0].localeCompare(b[0]) : Number(b[1].amount - a[1].amount)))
        .map(([k, r]) => ({ name: f.by === "month" ? monthName(k) : k, count: r.count, amount: r.amount, share: total > ZERO ? `${Math.round((Number(r.amount) * 1000) / Number(total)) / 10}%` : "0%" }));
      const byLabel = { head: "Expense head", vendor: "Vendor", month: "Month", approver: "Approved by" }[f.by];
      return {
        columns: [{ key: "name", label: byLabel }, { key: "count", label: "Payments", kind: "number" }, { key: "amount", label: "Amount", kind: "money" }, { key: "share", label: "Share" }],
        rows,
        totals: { name: "Total", count: paid.length, amount: total },
        note: paid.some((p) => p.broughtIn) ? BROUGHT_IN_NOTE : undefined,
        chart: rows.slice(0, 8).map((r) => ({ label: String(r.name), value: r.amount })),
      };
    },
  },
  {
    key: "department",
    label: "Department-wise expenses",
    about: "Paid expenses by department or cost centre, and by head inside each.",
    filters: ["dates"],
    run: async (tx, ctx, f) => {
      const paid = await paidExpenses(tx, f);
      const [heads, centres] = await Promise.all([tx.accountHead.findMany({ select: { id: true, name: true } }), tx.costCentre.findMany({ select: { id: true, name: true } })]);
      const map = new Map<string, bigint>();
      for (const p of paid) {
        const k = `${centres.find((c) => c.id === p.costCentreId)?.name ?? "No department"}|${heads.find((h) => h.id === p.accountHeadId)?.name ?? "Head"}`;
        map.set(k, (map.get(k) ?? ZERO) + p.amount);
      }
      const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, amount]) => {
        const [department, head] = k.split("|");
        return { department, head, amount };
      });
      return {
        columns: [{ key: "department", label: "Department" }, { key: "head", label: "Expense head" }, { key: "amount", label: "Amount", kind: "money" }],
        rows,
        totals: { department: "Total", amount: sum(paid, (p) => p.amount) },
      };
    },
  },
  {
    key: "pending-expenses",
    label: "Pending expenses",
    about: "Expenses waiting for approval, and approved ones not yet paid, oldest first.",
    filters: [],
    run: async (tx, ctx, f) => {
      const rows = await payables(tx, f.today);
      return {
        columns: [{ key: "number", label: "Number" }, { key: "date", label: "Date", kind: "date" }, { key: "vendor", label: "Vendor" }, { key: "status", label: "Status" }, { key: "dueDate", label: "Bill due", kind: "date" }, { key: "balance", label: "To pay", kind: "money" }],
        rows: rows.map((r) => ({ number: r.number, date: r.date, vendor: r.vendor, status: EXPENSE_STATUS_WORDS[r.status]?.label ?? r.status, dueDate: r.dueDate, balance: r.balance })),
        totals: { number: "Total", balance: sum(rows, (r) => r.balance) },
      };
    },
  },
  {
    key: "budget-actual",
    label: "Budget against actual",
    about: "Each budget with spent, committed, remaining and % used. Heads at 80% and over 100% are marked.",
    filters: [],
    feature: "finance-budget",
    run: async (tx, ctx, f) => {
      const rows = await budgetsWithUse(tx, f.financialYearId);
      const [heads, centres] = await Promise.all([tx.accountHead.findMany({ select: { id: true, name: true } }), tx.costCentre.findMany({ select: { id: true, name: true } })]);
      return {
        columns: [{ key: "head", label: "Expense head" }, { key: "department", label: "Department" }, { key: "budget", label: "Budget", kind: "money" }, { key: "spent", label: "Spent", kind: "money" }, { key: "committed", label: "Committed", kind: "money" }, { key: "remaining", label: "Remaining", kind: "money" }, { key: "used", label: "% used" }, { key: "alert", label: "Alert" }],
        rows: rows.map((b) => ({
          head: heads.find((h) => h.id === b.accountHeadId)?.name ?? "Head", department: centres.find((c) => c.id === b.costCentreId)?.name ?? "All",
          budget: b.amountPaise, spent: b.spent, committed: b.committed, remaining: b.remaining, used: `${b.pct}%`, alert: b.alert === "over" ? "Over budget" : b.alert === "near" ? "80% used" : "",
        })),
        totals: { head: "Total", budget: sum(rows, (b) => b.amountPaise), spent: sum(rows, (b) => b.spent), committed: sum(rows, (b) => b.committed), remaining: sum(rows, (b) => b.remaining) },
      };
    },
  },
  {
    key: "trial-balance",
    label: "Trial balance",
    about: "Each account's debit or credit balance at the end of the period.",
    filters: ["dates"],
    feature: "finance-accounts",
    run: async (tx, ctx, f) => {
      const tb = await trialBalance(tx, ctx, f.yearStart, f.to);
      return {
        columns: [{ key: "group", label: "Group" }, { key: "account", label: "Account" }, { key: "debit", label: "Debit", kind: "money" }, { key: "credit", label: "Credit", kind: "money" }],
        rows: tb.rows.map((r) => ({ group: r.account.group, account: r.account.name, debit: r.debit || null, credit: r.credit || null })),
        totals: { group: "Total", debit: tb.debit, credit: tb.credit },
        note: tb.balanced ? undefined : "Debits and credits do not match. Tell School OS support.",
      };
    },
  },
  {
    key: "day-book-summary",
    label: "Day Book summary",
    about: "Income, expense and net for each day or month of the period.",
    filters: ["dates", "group"],
    run: async (tx, ctx, f) => {
      const entries = await tx.dayBookEntry.findMany({ where: { financialYearId: f.financialYearId, date: { gte: f.from, lte: f.to }, section: { notIn: ["opening", "transfer"] } } });
      const map = new Map<string, { income: bigint; expense: bigint }>();
      for (const e of entries) {
        const p = periodOf(e.date, f.group);
        const r = map.get(p) ?? { income: ZERO, expense: ZERO };
        if (e.section === "reversal") { if (e.direction === "OUT") r.income -= e.amountPaise; else r.expense -= e.amountPaise; }
        else if (e.direction === "IN") r.income += e.amountPaise;
        else r.expense += e.amountPaise;
        map.set(p, r);
      }
      const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([p, r]) => ({ period: periodName(p, f.group), income: r.income, expense: r.expense, net: r.income - r.expense }));
      return {
        columns: [{ key: "period", label: f.group === "month" ? "Month" : "Date" }, { key: "income", label: "Income", kind: "money" }, { key: "expense", label: "Expense", kind: "money" }, { key: "net", label: "Net", kind: "money" }],
        rows,
        totals: { period: "Total", income: sum(rows, (r) => r.income), expense: sum(rows, (r) => r.expense), net: sum(rows, (r) => r.net) },
        chart: rows.slice(-12).map((r) => ({ label: r.period, value: r.net > ZERO ? r.net : ZERO })),
      };
    },
  },
];

/** Paid expense amounts in the period: each payment on its date, and brought-in expenses on theirs. */
async function paidExpenses(tx: Tx, f: FinanceFilter) {
  const pays = await tx.expensePayment.findMany({
    where: { cancelledAt: null, date: { gte: f.from, lte: f.to }, expense: { status: { not: "CANCELLED" } } },
    include: { expense: { select: { accountHeadId: true, vendorId: true, costCentreId: true, approvedById: true } } },
  });
  const old = await tx.expense.findMany({ where: { broughtIn: true, status: "PAID", date: { gte: f.from, lte: f.to } } });
  return [
    ...pays.map((p) => ({ date: p.date, amount: p.amountPaise, accountHeadId: p.expense.accountHeadId, vendorId: p.expense.vendorId, costCentreId: p.expense.costCentreId, approvedById: p.expense.approvedById, broughtIn: false })),
    ...old.map((e) => ({ date: e.date, amount: e.amountPaise, accountHeadId: e.accountHeadId, vendorId: e.vendorId, costCentreId: e.costCentreId, approvedById: null as string | null, broughtIn: true })),
  ];
}

export const findFinanceReport = (key: string) => FINANCE_REPORTS.find((r) => r.key === key) ?? null;
export type { Cell, ReportColumn, ReportResult };
