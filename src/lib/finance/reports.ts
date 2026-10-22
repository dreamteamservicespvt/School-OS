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
import { dayBookWithoutPay } from "./access";
import { accountBook } from "./daybook";
import { statutoryDues } from "../salary/statutory-payments";
import { monthName as salaryMonth } from "../salary/words";
import type { FinanceFeature } from "./words";

const ZERO = BigInt(0);
/** Money moved between accounts (and its cancelling) is neither income nor expense. */
const MOVES = ["transfer", "transfer-cancel"];

export type FinanceFilter = {
  financialYearId: string; yearStart: Date; from: Date; to: Date; group: "day" | "month"; by: "head" | "vendor" | "month" | "approver"; today: Date;
  /** Staff pay heads to leave out (src/lib/finance/access.ts); null shows staff pay. */
  hidePay?: string[] | null;
};
export type FinanceFilterKey = "dates" | "group" | "by";
export type FinanceReportDef = {
  key: string; label: string; about: string; filters: FinanceFilterKey[]; feature?: FinanceFeature;
  /** Only for full Finance Management (the Vice Principal's Finance View has no Accounts). */
  fullOnly?: boolean;
  run: (tx: Tx, ctx: SchoolContext, f: FinanceFilter) => Promise<ReportResult> };

const sum = <T>(list: T[], f: (x: T) => bigint) => list.reduce((s, x) => s + f(x), ZERO);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const monthName = (key: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
const periodOf = (d: Date, g: FinanceFilter["group"]) => (g === "month" ? monthKey(d) : d.toISOString().slice(0, 10));
const periodName = (k: string, g: FinanceFilter["group"]) => (g === "month" ? monthName(k) : formatDate(new Date(`${k}T00:00:00Z`)));

/** Money in and out by head for the period: Day Book (reversals net off) plus brought-in records, which are kept apart. */
async function byHead(tx: Tx, ctx: SchoolContext, f: FinanceFilter) {
  const { accounts, bySystem } = await chart(tx, ctx);
  const entries = await tx.dayBookEntry.findMany({ where: { financialYearId: f.financialYearId, date: { gte: f.from, lte: f.to }, section: { notIn: ["opening", "transfer"] }, sourceType: { notIn: MOVES }, ...(f.hidePay ? dayBookWithoutPay(f.hidePay) : {}) } });
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
  const oldExpenses = await tx.expense.findMany({ where: { broughtIn: true, status: "PAID", date: { gte: f.from, lte: f.to }, ...(f.hidePay?.length ? { accountHeadId: { notIn: f.hidePay } } : {}) }, select: { date: true, amountPaise: true, accountHeadId: true } });
  let broughtIn = ZERO;
  for (const p of oldFees) { lines.push({ key: feeHead ? `head:${feeHead}` : "unassigned", kind: "INCOME", date: p.paymentDate, amount: p.amountPaise }); broughtIn += p.amountPaise; }
  for (const e of oldExpenses) { lines.push({ key: `head:${e.accountHeadId}`, kind: "EXPENSE", date: e.date, amount: e.amountPaise }); broughtIn += e.amountPaise; }
  // Journal entries (Accounts) move amounts between heads, for example a wrong head corrected: a debit
  // raises an expense head and lowers an income head, a credit the other way. A reversal nets off its
  // original. Lines on a cash or bank account are not income or expense.
  const journals = await tx.journalLine.findMany({
    where: { accountHeadId: { not: null, ...(f.hidePay?.length ? { notIn: f.hidePay } : {}) }, entry: { financialYearId: f.financialYearId, date: { gte: f.from, lte: f.to } } },
    select: { accountHeadId: true, debitPaise: true, creditPaise: true, entry: { select: { date: true } } },
  });
  let journal = 0;
  for (const l of journals) {
    const key = `head:${l.accountHeadId}`;
    const kind = accounts.get(key)?.kind;
    if (kind !== "INCOME" && kind !== "EXPENSE") continue;
    const amount = kind === "EXPENSE" ? l.debitPaise - l.creditPaise : l.creditPaise - l.debitPaise;
    if (amount === ZERO) continue;
    lines.push({ key, kind, date: l.entry.date, amount });
    journal++;
  }
  return { accounts, lines, broughtIn, journal };
}

/** The report's note: records brought in from old software, journal entries. */
function headNote(broughtIn: bigint, journal: number) {
  const parts = [broughtIn > ZERO ? BROUGHT_IN_NOTE : null, journal ? JOURNAL_NOTE : null].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function isIncome(e: Pick<DayBookEntry, "section" | "direction">) {
  if (e.section === "reversal") return e.direction === "OUT";
  return e.direction === "IN";
}

const BROUGHT_IN_NOTE = "Includes records brought in from old software (they are not in the Day Book).";
const JOURNAL_NOTE = "Includes journal entries from Accounts (they move amounts between heads and are not in the Day Book).";

export const FINANCE_REPORTS: FinanceReportDef[] = [
  {
    key: "income-expense",
    label: "Income and expense",
    about: "By head and by month",
    filters: ["dates", "group"],
    run: async (tx, ctx, f) => {
      const { accounts, lines, broughtIn, journal } = await byHead(tx, ctx, f);
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
        note: headNote(broughtIn, journal),
      };
    },
  },
  {
    key: "profit-loss",
    label: "Profit and loss",
    about: "Income less expenses for the period",
    filters: ["dates"],
    run: async (tx, ctx, f) => {
      const { accounts, lines, broughtIn, journal } = await byHead(tx, ctx, f);
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
        note: headNote(broughtIn, journal),
        chart: [{ label: "Income", value: income }, { label: "Expenses", value: expense }],
      };
    },
  },
  {
    key: "expense-analysis",
    label: "Expense report",
    about: "By head, vendor, month or approver",
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
    about: "By department (cost centre)",
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
    about: "Waiting for approval or payment",
    filters: [],
    run: async (tx, ctx, f) => {
      const rows = (await payables(tx, f.today)).filter((r) => !f.hidePay?.includes(r.accountHeadId));
      // PF, ESI, Professional Tax and TDS taken from salary and not paid yet: staff pay, so only for people who see it.
      const gov = f.hidePay ? [] : await statutoryDues(tx, { open: true, today: f.today });
      return {
        columns: [{ key: "number", label: "Number" }, { key: "date", label: "Date", kind: "date" }, { key: "vendor", label: "Vendor" }, { key: "status", label: "Status" }, { key: "dueDate", label: "Bill due", kind: "date" }, { key: "balance", label: "To pay", kind: "money" }],
        rows: [
          ...rows.map((r) => ({ number: r.number, date: r.date, vendor: r.vendor, status: EXPENSE_STATUS_WORDS[r.status]?.label ?? r.status, dueDate: r.dueDate, balance: r.balance })),
          ...gov.map((g) => ({ number: `${g.label} · ${salaryMonth(g.month)} salary`, date: g.month, vendor: g.payee, status: "Taken from salary, to pay", dueDate: g.dueDate, balance: g.balance })),
        ],
        totals: { number: "Total", balance: sum(rows, (r) => r.balance) + sum(gov, (g) => g.balance) },
        note: gov.length ? "Includes PF, ESI, Professional Tax and TDS taken from salary and not yet paid to the government. Record them paid in Generate Salary." : undefined,
      };
    },
  },
  {
    key: "books",
    label: "Cash book and bank book",
    about: "Opening, receipts, payments, closing",
    filters: ["dates"],
    run: async (tx, ctx, f) => {
      const accounts = await tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { isMain: "desc" }, { name: "asc" }] });
      const rows: Record<string, Cell>[] = [];
      for (const a of accounts) {
        const b = await accountBook(tx, a.id, f.from, f.to);
        rows.push({ account: a.kind === "CASH" ? a.name : `${a.name}${a.accountLast4 ? ` ··${a.accountLast4}` : ""}`, opening: b.opening, receipts: b.receipts, payments: b.payments, closing: b.closing });
      }
      const t = (k: string) => sum(rows, (r) => r[k] as bigint);
      return {
        columns: [{ key: "account", label: "Account" }, { key: "opening", label: `Opening ${formatDate(f.from)}`, kind: "money" }, { key: "receipts", label: "Receipts", kind: "money" }, { key: "payments", label: "Payments", kind: "money" }, { key: "closing", label: "Closing", kind: "money" }],
        rows,
        totals: { account: "All accounts", opening: t("opening"), receipts: t("receipts"), payments: t("payments"), closing: t("closing") },
        note: "Payments include money moved between accounts, such as cash deposited in the bank. Day by day detail is on Cash & Bank.",
      };
    },
  },
  {
    key: "budget-actual",
    label: "Budget against actual",
    about: "Needs budgets switched on",
    filters: [],
    feature: "finance-budget",
    run: async (tx, ctx, f) => {
      const rows = await budgetsWithUse(tx, f.financialYearId, f.hidePay ?? null);
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
    about: "Every account’s balance (full accounts)",
    filters: ["dates"],
    feature: "finance-accounts",
    fullOnly: true,
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
    label: "Day Book for a range",
    about: "Every day’s totals",
    filters: ["dates", "group"],
    run: async (tx, ctx, f) => {
      const entries = await tx.dayBookEntry.findMany({ where: { financialYearId: f.financialYearId, date: { gte: f.from, lte: f.to }, section: { notIn: ["opening", "transfer"] }, sourceType: { notIn: MOVES }, ...(f.hidePay ? dayBookWithoutPay(f.hidePay) : {}) } });
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
    where: { cancelledAt: null, date: { gte: f.from, lte: f.to }, expense: { status: { not: "CANCELLED" }, ...(f.hidePay?.length ? { accountHeadId: { notIn: f.hidePay } } : {}) } },
    include: { expense: { select: { accountHeadId: true, vendorId: true, costCentreId: true, approvedById: true } } },
  });
  const old = await tx.expense.findMany({ where: { broughtIn: true, status: "PAID", date: { gte: f.from, lte: f.to }, ...(f.hidePay?.length ? { accountHeadId: { notIn: f.hidePay } } : {}) } });
  return [
    ...pays.map((p) => ({ date: p.date, amount: p.amountPaise, accountHeadId: p.expense.accountHeadId, vendorId: p.expense.vendorId, costCentreId: p.expense.costCentreId, approvedById: p.expense.approvedById, broughtIn: false })),
    ...old.map((e) => ({ date: e.date, amount: e.amountPaise, accountHeadId: e.accountHeadId, vendorId: e.vendorId, costCentreId: e.costCentreId, approvedById: null as string | null, broughtIn: true })),
  ];
}

/** In the order of the approved design (mod-finance.jsx FIN_REPORTS). */
const ORDER = ["income-expense", "profit-loss", "department", "expense-analysis", "pending-expenses", "books", "day-book-summary", "budget-actual", "trial-balance"];
FINANCE_REPORTS.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

export const findFinanceReport = (key: string) => FINANCE_REPORTS.find((r) => r.key === key) ?? null;
export type { Cell, ReportColumn, ReportResult };
