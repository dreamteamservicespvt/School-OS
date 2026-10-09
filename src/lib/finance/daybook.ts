// The Day Book (07 §2, rule 10): every rupee received and spent on a date,
// filled in only by the software. Each source record posts once (its source
// key); a cancellation posts a reversing entry and the original stays.
//
// Other modules post through postToDayBook(). For example Salary Management,
// when a payroll run is marked Paid (A6, D12):
//
//   await postToDayBook(tx, ctx, {
//     date: paidOn, direction: "OUT", amountPaise: run.netPaise, mode: "BANK_TRANSFER",
//     section: "salary", headName: "Salaries", accountHeadId: (await systemHead(tx, ctx, "salary"))?.id,
//     accountId: bankAccountId, sourceType: "payroll", sourceId: run.id, sourceKey: `payroll:${run.id}`,
//     partyName: "Salary for September 2026",
//   });
import "server-only";

import type { DayBookEntry, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { assertBooksOpen, financialYearOf } from "./years";

export type DayBookSection = "fees-full" | "fees-partial" | "other-fees" | "other-income" | "expense" | "salary" | "salary-advance" | "refund" | "reversal" | "opening" | "transfer";

export type PostInput = {
  date: Date;
  direction: "IN" | "OUT";
  amountPaise: bigint;
  penaltyPaise?: bigint;
  mode: string;
  section: DayBookSection;
  headName: string;
  feeHeadIds?: string[];
  accountHeadId?: string | null;
  accountId: string | null;
  depositAccountId?: string | null;
  sourceType: string;
  sourceId: string;
  /** Unique per posting: posting the same source key again does nothing. */
  sourceKey: string;
  studentId?: string | null;
  classId?: string | null;
  sectionId?: string | null;
  staffId?: string | null;
  vendorId?: string | null;
  costCentreId?: string | null;
  partyName: string;
  reference?: string | null;
  note?: string | null;
  reversesEntryId?: string | null;
  /** Skip the closed-books check (only for opening balances set by the software). */
  skipBooksCheck?: boolean;
};

/** Posts one Day Book entry, once. Returns the entry and whether it was new. */
export async function postToDayBook(tx: Tx, ctx: SchoolContext, input: PostInput): Promise<{ entry: DayBookEntry; created: boolean }> {
  const existing = await tx.dayBookEntry.findUnique({ where: { schoolId_sourceKey: { schoolId: ctx.schoolId, sourceKey: input.sourceKey } } });
  if (existing) return { entry: existing, created: false };
  const fy = input.skipBooksCheck
    ? await financialYearOf(tx, ctx, input.date)
    : await assertBooksOpen(tx, ctx, input.date);
  const entry = await tx.dayBookEntry.create({
    data: {
      schoolId: ctx.schoolId,
      financialYearId: fy.id,
      date: input.date,
      direction: input.direction,
      amountPaise: input.amountPaise,
      penaltyPaise: input.penaltyPaise ?? BigInt(0),
      mode: input.mode,
      section: input.section,
      headName: input.headName.slice(0, 300),
      feeHeadIds: input.feeHeadIds ?? [],
      accountHeadId: input.accountHeadId ?? null,
      accountId: input.accountId,
      depositAccountId: input.depositAccountId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceKey: input.sourceKey,
      studentId: input.studentId ?? null,
      classId: input.classId ?? null,
      sectionId: input.sectionId ?? null,
      staffId: input.staffId ?? null,
      vendorId: input.vendorId ?? null,
      costCentreId: input.costCentreId ?? null,
      partyName: input.partyName.slice(0, 200),
      reference: input.reference ?? null,
      note: input.note ?? null,
      reversesEntryId: input.reversesEntryId ?? null,
      createdById: ctx.userId,
    },
  });
  return { entry, created: true };
}

/**
 * Reverses every entry a source posted, on the given date: a new entry the
 * other way for each, pointing at the one it reverses. The originals stay.
 * Safe to run twice.
 */
export async function reverseSource(tx: Tx, ctx: SchoolContext, input: { sourceType: string; sourceId: string; date: Date; reversalType: string; note: string }) {
  const originals = await tx.dayBookEntry.findMany({ where: { schoolId: ctx.schoolId, sourceType: input.sourceType, sourceId: input.sourceId, reversesEntryId: null } });
  const made: DayBookEntry[] = [];
  for (const o of originals) {
    const { entry } = await postToDayBook(tx, ctx, {
      date: input.date,
      direction: o.direction === "IN" ? "OUT" : "IN",
      amountPaise: o.amountPaise,
      penaltyPaise: o.penaltyPaise,
      mode: o.mode,
      section: "reversal",
      headName: o.headName,
      feeHeadIds: o.feeHeadIds,
      accountHeadId: o.accountHeadId,
      accountId: o.accountId,
      depositAccountId: o.depositAccountId,
      sourceType: input.reversalType,
      sourceId: input.sourceId,
      sourceKey: `${o.sourceKey}:reversal`,
      studentId: o.studentId,
      classId: o.classId,
      sectionId: o.sectionId,
      staffId: o.staffId,
      vendorId: o.vendorId,
      costCentreId: o.costCentreId,
      partyName: o.partyName,
      reference: o.reference,
      note: input.note,
      reversesEntryId: o.id,
    });
    made.push(entry);
  }
  return made;
}

/** Sections that are not income or expense: moving money and opening balances. */
const NEUTRAL = new Set(["opening", "transfer"]);

/**
 * Totals of a set of entries: income (money in, less reversals of money in),
 * expense (money out, less reversals of money out) and the net balance.
 */
export function dayBookTotals(entries: Pick<DayBookEntry, "direction" | "section" | "amountPaise">[]) {
  let income = BigInt(0), expense = BigInt(0), incomeCount = 0, expenseCount = 0;
  for (const e of entries) {
    if (NEUTRAL.has(e.section)) continue;
    if (e.section === "reversal") {
      if (e.direction === "OUT") income -= e.amountPaise;
      else expense -= e.amountPaise;
      continue;
    }
    if (e.direction === "IN") { income += e.amountPaise; incomeCount++; }
    else { expense += e.amountPaise; expenseCount++; }
  }
  return { income, expense, net: income - expense, incomeCount, expenseCount };
}

export type DayBookFilter = { financialYearId: string; from: Date; to: Date; classId?: string | null; accountId?: string | null; depositAccountId?: string | null };

export function dayBookWhere(f: DayBookFilter): Prisma.DayBookEntryWhereInput {
  return {
    financialYearId: f.financialYearId,
    date: { gte: f.from, lte: f.to },
    ...(f.classId ? { classId: f.classId } : {}),
    ...(f.accountId ? { accountId: f.accountId } : {}),
    ...(f.depositAccountId ? { depositAccountId: f.depositAccountId } : {}),
  };
}

/** The Day Book for a date or range, with the income groups and mode pills of 07 §2. */
export async function dayBook(tx: Tx, f: DayBookFilter) {
  const entries = await tx.dayBookEntry.findMany({ where: { ...dayBookWhere(f), section: { notIn: ["opening", "transfer"] } }, orderBy: [{ date: "asc" }, { postedAt: "asc" }] });
  const totals = dayBookTotals(entries);
  const fees = entries.filter((e) => e.direction === "IN" && ["fees-full", "fees-partial", "other-fees"].includes(e.section));
  const sum = (list: DayBookEntry[]) => list.reduce((s, e) => s + e.amountPaise, BigInt(0));
  const online = fees.filter((e) => e.mode === "GATEWAY");
  const offline = fees.filter((e) => e.mode !== "GATEWAY");
  const groups = [
    { key: "online", label: "Online fees", amount: sum(online), count: online.length },
    { key: "full", label: "Full payments", amount: sum(offline.filter((e) => e.section === "fees-full")), count: offline.filter((e) => e.section === "fees-full").length },
    { key: "partial", label: "Partial payments", amount: sum(offline.filter((e) => e.section === "fees-partial")), count: offline.filter((e) => e.section === "fees-partial").length },
    { key: "other-fees", label: "Other fee types", amount: sum(offline.filter((e) => e.section === "other-fees")), count: offline.filter((e) => e.section === "other-fees").length },
    { key: "other-income", label: "Other income", amount: sum(entries.filter((e) => e.section === "other-income")), count: entries.filter((e) => e.section === "other-income").length },
  ];
  const modes = new Map<string, bigint>();
  for (const e of entries) if (e.direction === "IN" && e.section !== "reversal") modes.set(e.mode, (modes.get(e.mode) ?? BigInt(0)) + e.amountPaise);
  const feesFull = sum(fees.filter((e) => e.section !== "fees-partial"));
  const feesPartial = sum(fees.filter((e) => e.section === "fees-partial"));
  return { entries, totals, groups, modes: [...modes.entries()].map(([mode, amount]) => ({ mode, amount })), feesFull, feesPartial };
}

/** Which Day Book section an entry is shown in. */
export function displaySection(e: Pick<DayBookEntry, "section">): string {
  if (e.section === "refund" || e.section === "reversal") return "refunds";
  if (e.section === "salary-advance") return "salary";
  return e.section;
}

/**
 * The cash book or bank book of one account for a period: opening balance
 * (everything before, in every year, so a new year opens with the last
 * year's closing), receipts, payments, closing, and each entry in time order.
 */
export async function accountBook(tx: Tx, accountId: string, from: Date, to: Date) {
  // A go-live opening balance dated on the first day shown is the opening, not a receipt (07 §9, 12).
  const openingWhere = { accountId, OR: [{ date: { lt: from } }, { date: from, section: "opening" }] };
  const before = await tx.dayBookEntry.groupBy({ by: ["direction"], where: openingWhere, _sum: { amountPaise: true } });
  const val = (rows: typeof before, d: "IN" | "OUT") => rows.find((r) => r.direction === d)?._sum.amountPaise ?? BigInt(0);
  const opening = val(before, "IN") - val(before, "OUT");
  const entries = await tx.dayBookEntry.findMany({ where: { accountId, date: { gte: from, lte: to }, NOT: { date: from, section: "opening" } }, orderBy: [{ date: "asc" }, { postedAt: "asc" }] });
  let receipts = BigInt(0), payments = BigInt(0), running = opening;
  const lines = entries.map((e) => {
    if (e.direction === "IN") { receipts += e.amountPaise; running += e.amountPaise; }
    else { payments += e.amountPaise; running -= e.amountPaise; }
    return { ...e, balance: running };
  });
  return { opening, receipts, payments, closing: opening + receipts - payments, lines };
}

/** Current balance of each cash and bank account. */
export async function accountBalances(tx: Tx, ctx: SchoolContext) {
  const rows = await tx.dayBookEntry.groupBy({ by: ["accountId", "direction"], where: { schoolId: ctx.schoolId, accountId: { not: null } }, _sum: { amountPaise: true } });
  const out = new Map<string, bigint>();
  for (const r of rows) {
    const v = r._sum.amountPaise ?? BigInt(0);
    out.set(r.accountId!, (out.get(r.accountId!) ?? BigInt(0)) + (r.direction === "IN" ? v : -v));
  }
  return out;
}
