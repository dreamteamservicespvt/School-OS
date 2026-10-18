// Accounts (07 §2, optional, for schools keeping full accounts): journal
// entries, the general ledger, trial balance, payables and receivables.
//
// Every automatic posting already has its two sides in the Day Book: money
// into or out of a cash or bank account, against an income or expense head.
// The ledger reads those as journal lines (inferred: "every automatic posting
// also creates its journal lines"), so nothing is stored twice and the books
// always agree with the Day Book. Journal entries typed by a person move
// amounts between heads (for example a wrong head corrected); money in cash
// or bank only changes through fees, income, expenses and salary.
import "server-only";

import type { DayBookEntry } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatNumber, nextNumber } from "../sequences";
import { formatDate, formatRupees } from "../format";
import { MoneyProblem } from "../fees/problem";
import { assertBooksOpen, assertNotFuture } from "./years";
import { financeSettings } from "./settings";

const ZERO = BigInt(0);

export type JournalLineInput = { accountHeadId: string; debitPaise: bigint; creditPaise: bigint };

/** Adds a journal entry. Debits must equal credits; at least two lines. */
export async function addJournal(tx: Tx, ctx: SchoolContext, input: { date: Date; narration: string; lines: JournalLineInput[]; campusId?: string | null }) {
  const narration = input.narration.trim();
  if (narration.length < 3) throw new MoneyProblem("Write a narration: what this entry is for.", "narration");
  const lines = input.lines.filter((l) => l.accountHeadId && (l.debitPaise > ZERO || l.creditPaise > ZERO));
  if (lines.length < 2) throw new MoneyProblem("A journal entry needs at least two lines.", "lines");
  for (const l of lines) {
    if (l.debitPaise < ZERO || l.creditPaise < ZERO) throw new MoneyProblem("Amounts cannot be below ₹0.", "lines");
    if (l.debitPaise > ZERO && l.creditPaise > ZERO) throw new MoneyProblem("A line is either a debit or a credit, not both.", "lines");
  }
  const debits = lines.reduce((s, l) => s + l.debitPaise, ZERO);
  const credits = lines.reduce((s, l) => s + l.creditPaise, ZERO);
  if (debits !== credits) throw new MoneyProblem(`Debits ${formatRupees(debits)}, credits ${formatRupees(credits)}. They must be equal.`, "lines");
  const heads = await tx.accountHead.findMany({ where: { id: { in: lines.map((l) => l.accountHeadId) }, archivedAt: null } });
  if (heads.length !== new Set(lines.map((l) => l.accountHeadId)).size) throw new MoneyProblem("A head on this entry was not found or is archived. Choose it again.", "lines");
  await assertNotFuture(tx, ctx, input.date, "date", "The journal date");
  const fy = await assertBooksOpen(tx, ctx, input.date);
  const s = await financeSettings(tx, ctx);
  const n = await nextNumber(tx, ctx, `journal:${fy.name}`);
  const entry = await tx.journalEntry.create({
    data: {
      schoolId: ctx.schoolId, financialYearId: fy.id, number: formatNumber(`${s.journalPrefix}${fy.name}/`, n, 4), date: input.date, narration, campusId: input.campusId ?? null, createdById: ctx.userId,
      lines: { create: lines.map((l) => ({ schoolId: ctx.schoolId, accountHeadId: l.accountHeadId, debitPaise: l.debitPaise, creditPaise: l.creditPaise })) },
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Journal Entry", recordId: entry.id, after: { number: entry.number, date: formatDate(input.date), amount: formatRupees(debits), narration } });
  return entry;
}

/** Reverses a journal entry with a new one, the other way round. The original is never changed apart from the link. */
export async function reverseJournal(tx: Tx, ctx: SchoolContext, id: string, reason: string, date: Date) {
  const why = reason.trim();
  if (why.length < 3) throw new MoneyProblem("Give a reason for reversing.", "reason");
  const j = await tx.journalEntry.findFirst({ where: { id }, include: { lines: true } });
  if (!j) throw new MoneyProblem("This journal entry was not found.");
  if (j.reversesId) throw new MoneyProblem("This entry is itself a reversal. Add a new entry instead.");
  if (j.reversedById) throw new MoneyProblem("This entry is already reversed.");
  const rev = await addJournal(tx, ctx, {
    date,
    narration: `Reversal of ${j.number}: ${why}`,
    lines: j.lines.map((l) => ({ accountHeadId: l.accountHeadId!, debitPaise: l.creditPaise, creditPaise: l.debitPaise })),
    campusId: j.campusId,
  });
  await tx.journalEntry.update({ where: { id: rev.id }, data: { reversesId: j.id } });
  await tx.journalEntry.update({ where: { id: j.id }, data: { reversedById: rev.id } });
  await writeAudit(tx, ctx, { action: "reversed", recordType: "Journal Entry", recordId: j.id, after: { by: rev.number, reason: why } });
  return rev;
}

// ── Ledger ────────────────────────────────────────────────────────────────

export type LedgerAccount = { key: string; name: string; group: string; kind: "INCOME" | "EXPENSE" | "CASH" | "BANK" | "OTHER"; code: string | null };
export type LedgerLine = { date: Date; key: string; debit: bigint; credit: bigint; narration: string; ref: string; href: string | null };

const OPENING: LedgerAccount = { key: "opening", name: "Opening balances", group: "Capital", kind: "OTHER", code: null };
const CONTRA: LedgerAccount = { key: "contra", name: "Money moved (contra)", group: "Cash and bank", kind: "OTHER", code: null };
const UNASSIGNED: LedgerAccount = { key: "unassigned", name: "Not assigned to a head", group: "Other", kind: "OTHER", code: null };

export async function chart(tx: Tx, ctx: SchoolContext) {
  const [heads, banks] = await Promise.all([
    tx.accountHead.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { code: "asc" } }),
    tx.bankAccount.findMany({ where: { schoolId: ctx.schoolId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);
  const accounts = new Map<string, LedgerAccount>();
  for (const b of banks) accounts.set(`bank:${b.id}`, { key: `bank:${b.id}`, name: b.name, group: "Cash and bank", kind: b.kind, code: b.accountLast4 ? `…${b.accountLast4}` : null });
  for (const h of heads) accounts.set(`head:${h.id}`, { key: `head:${h.id}`, name: h.name, group: h.groupName, kind: h.kind === "INCOME" ? "INCOME" : "EXPENSE", code: h.code });
  for (const a of [OPENING, CONTRA, UNASSIGNED]) accounts.set(a.key, a);
  const bySystem = new Map(heads.filter((h) => h.systemKey).map((h) => [h.systemKey!, h.id]));
  return { accounts, bySystem };
}

/** The Day Book entry's own page, which shows and links to where it came from. */
function sourceHref(e: DayBookEntry) {
  return `/finance-management/day-book/${e.id}`;
}

/** The income or expense side of a Day Book entry: "head:<id>", or opening, contra, unassigned. */
export function headSide(e: Pick<DayBookEntry, "section" | "accountHeadId" | "studentId">, bySystem: Map<string, string>): string {
  if (e.section === "opening") return "opening";
  if (e.section === "transfer") return "contra";
  if (e.accountHeadId) return `head:${e.accountHeadId}`;
  const sys = ["fees-full", "fees-partial", "other-fees", "online-fees", "daycare"].includes(e.section) ? "fees" : e.section === "refund" ? "refunds" : e.section.startsWith("salary") ? "salary" : null;
  // Reversals carry the original's head; fee reversals have none, so they go back to Fees.
  const fallback = sys ?? (e.section === "reversal" && e.studentId ? "fees" : null);
  return fallback && bySystem.get(fallback) ? `head:${bySystem.get(fallback)}` : "unassigned";
}

/** The two sides of a Day Book entry as ledger lines. */
function dayBookLines(e: DayBookEntry, bySystem: Map<string, string>): LedgerLine[] {
  const money = e.accountId ? `bank:${e.accountId}` : "unassigned";
  const other = headSide(e, bySystem);
  const narration = `${e.headName}, ${e.partyName}${e.reference ? ` (${e.reference})` : ""}`;
  const ref = e.section === "reversal" ? "Reversal" : "Day Book";
  const href = sourceHref(e);
  return e.direction === "IN"
    ? [{ date: e.date, key: money, debit: e.amountPaise, credit: ZERO, narration, ref, href }, { date: e.date, key: other, debit: ZERO, credit: e.amountPaise, narration, ref, href }]
    : [{ date: e.date, key: other, debit: e.amountPaise, credit: ZERO, narration, ref, href }, { date: e.date, key: money, debit: ZERO, credit: e.amountPaise, narration, ref, href }];
}

/** Every ledger line between two dates: Day Book postings and journal entries. */
async function linesBetween(tx: Tx, ctx: SchoolContext, from: Date | null, to: Date) {
  const { accounts, bySystem } = await chart(tx, ctx);
  const date = from ? { gte: from, lte: to } : { lte: to };
  const [entries, journals] = await Promise.all([
    tx.dayBookEntry.findMany({ where: { date }, orderBy: [{ date: "asc" }, { postedAt: "asc" }] }),
    tx.journalEntry.findMany({ where: { date }, include: { lines: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const lines: LedgerLine[] = [];
  for (const e of entries) lines.push(...dayBookLines(e, bySystem));
  for (const j of journals) {
    for (const l of j.lines) {
      const key = l.accountHeadId ? `head:${l.accountHeadId}` : l.bankAccountId ? `bank:${l.bankAccountId}` : "unassigned";
      lines.push({ date: j.date, key, debit: l.debitPaise, credit: l.creditPaise, narration: j.narration, ref: j.number, href: `/finance-management/accounts?tab=journals&open=${j.id}` });
    }
  }
  lines.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { accounts, lines };
}

/** Balance sign: cash, bank and expenses are debit balances; income and capital are credit balances. */
const debitNature = (a: LedgerAccount) => a.kind === "CASH" || a.kind === "BANK" || a.kind === "EXPENSE";

/**
 * One account's entries and running balance for a period. Cash, bank and
 * balance-sheet accounts carry their balance from before; income and expense
 * heads start each financial year at zero (yearStart).
 */
export async function generalLedger(tx: Tx, ctx: SchoolContext, key: string, from: Date, to: Date, yearStart: Date) {
  const { accounts, lines } = await linesBetween(tx, ctx, null, to);
  const account = accounts.get(key);
  if (!account) return null;
  const carry = account.kind === "INCOME" || account.kind === "EXPENSE" ? yearStart : null;
  const mine = lines.filter((l) => l.key === key && (!carry || l.date >= carry));
  const sign = debitNature(account) ? BigInt(1) : BigInt(-1);
  let opening = ZERO;
  for (const l of mine) if (l.date < from) opening += (l.debit - l.credit) * sign;
  let running = opening, debit = ZERO, credit = ZERO;
  const rows = mine.filter((l) => l.date >= from).map((l) => {
    running += (l.debit - l.credit) * sign;
    debit += l.debit;
    credit += l.credit;
    return { ...l, balance: running };
  });
  return { account, opening, debit, credit, closing: running, rows, debitNature: debitNature(account) };
}

/** The accounts a ledger can be opened for, grouped. */
export async function ledgerAccounts(tx: Tx, ctx: SchoolContext) {
  const { accounts } = await chart(tx, ctx);
  return [...accounts.values()];
}

/**
 * Trial balance at a date: each account's debit or credit balance. Income and
 * expense heads count from the start of the financial year; the year's
 * result before that sits in Opening balances (inferred, simple form).
 */
export async function trialBalance(tx: Tx, ctx: SchoolContext, yearStart: Date, to: Date) {
  const { accounts, lines } = await linesBetween(tx, ctx, null, to);
  const sums = new Map<string, bigint>();
  let carried = ZERO;
  for (const l of lines) {
    const a = accounts.get(l.key) ?? UNASSIGNED;
    if ((a.kind === "INCOME" || a.kind === "EXPENSE") && l.date < yearStart) {
      carried += l.debit - l.credit; // earlier years' result moves to Opening balances
      continue;
    }
    sums.set(l.key, (sums.get(l.key) ?? ZERO) + l.debit - l.credit);
  }
  if (carried !== ZERO) sums.set("opening", (sums.get("opening") ?? ZERO) + carried);
  const rows = [...sums.entries()]
    .filter(([, v]) => v !== ZERO)
    .map(([key, v]) => ({ account: accounts.get(key) ?? UNASSIGNED, debit: v > ZERO ? v : ZERO, credit: v < ZERO ? -v : ZERO }))
    .sort((a, b) => a.account.group.localeCompare(b.account.group) || a.account.name.localeCompare(b.account.name));
  const debit = rows.reduce((s, r) => s + r.debit, ZERO);
  const credit = rows.reduce((s, r) => s + r.credit, ZERO);
  return { rows, debit, credit, balanced: debit === credit };
}

/** Payables: approved or waiting expenses and vendor bills not fully paid, by due date. */
export async function payables(tx: Tx, today: Date) {
  const rows = await tx.expense.findMany({ where: { status: { in: ["WAITING", "APPROVED"] }, broughtIn: false }, orderBy: [{ billDueDate: "asc" }, { date: "asc" }] });
  const vendors = await tx.vendor.findMany({ where: { id: { in: rows.map((r) => r.vendorId).filter((x): x is string => Boolean(x)) } } });
  return rows
    .map((e) => ({
      id: e.id, number: e.number, date: e.date, dueDate: e.billDueDate, billNo: e.billNo, status: e.status, accountHeadId: e.accountHeadId,
      vendor: vendors.find((v) => v.id === e.vendorId)?.name ?? "No vendor",
      amount: e.amountPaise, paid: e.paidPaise, balance: e.amountPaise - e.paidPaise,
      overdue: Boolean(e.billDueDate && e.billDueDate < today),
    }))
    .filter((r) => r.balance > ZERO);
}

/** Receivables: income recorded as Draft, not yet received (inferred: fees have their own ledger). */
export async function receivables(tx: Tx) {
  const rows = await tx.income.findMany({ where: { status: "DRAFT" }, orderBy: { date: "asc" } });
  const heads = await tx.accountHead.findMany({ where: { id: { in: rows.map((r) => r.accountHeadId) } } });
  return rows.map((i) => ({ id: i.id, date: i.date, from: i.receivedFrom, head: heads.find((h) => h.id === i.accountHeadId)?.name ?? "Income", amount: i.amountPaise, note: i.note }));
}

/** The journal entries of a period, newest first, with their lines. */
export async function journalList(tx: Tx, from: Date, to: Date) {
  const rows = await tx.journalEntry.findMany({ where: { date: { gte: from, lte: to } }, include: { lines: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 });
  const heads = await tx.accountHead.findMany({ where: { id: { in: rows.flatMap((r) => r.lines.map((l) => l.accountHeadId)).filter((x): x is string => Boolean(x)) } } });
  const users = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
  return rows.map((j) => ({
    ...j,
    amount: j.lines.reduce((s, l) => s + l.debitPaise, ZERO),
    createdBy: users.find((u) => u.id === j.createdById)?.displayName ?? "School OS",
    lines: j.lines.map((l) => ({ ...l, head: heads.find((h) => h.id === l.accountHeadId)?.name ?? "Head" })),
  }));
}
