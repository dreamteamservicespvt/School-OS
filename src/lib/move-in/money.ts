// The money in the go-live check (02-workflows.md, workflow 15, step 9, and
// "The totals do not match the old software": "Total old dues: ₹14,82,300 for
// 318 students."). What School OS now holds from the old software, beside the
// figures the school typed from it, so the owner can see the money matches
// before going live. Amounts are whole paise; screens show them with
// formatRupees. Read only: nothing here changes a record.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate, formatRupees } from "../format";
import { DEFAULT_GO_LIVE } from "../finance/go-live";
import { beforeGoLive, type BeforeGoLive } from "../fees/before-go-live";

const ZERO = BigInt(0);

/** The money figures the old software shows, typed on the go-live check: whole paise as text (JSON has no BigInt). */
export type MoneyExpected = { oldDues?: string | null; pastReceipts?: string | null; advances?: string | null; cash?: string | null; bank?: string | null };
export const MONEY_KEYS = ["oldDues", "pastReceipts", "advances", "cash", "bank"] as const;
export type MoneyKey = (typeof MONEY_KEYS)[number];

/** What each figure is, in school words, and where the list behind it is. */
export const MONEY_WORDS: Record<MoneyKey, { label: string; old: string; href: string }> = {
  oldDues: { label: "Old dues brought in", old: "old dues", href: "/fee-management/ledger/import?kind=fee-old-dues" },
  pastReceipts: { label: "Fees collected this year in the old software", old: "fees collected this year", href: "/fee-management/ledger/import?kind=fee-past-receipts" },
  advances: { label: "Advance paid ahead", old: "advance paid ahead", href: "/fee-management/ledger" },
  cash: { label: "Cash in hand on go-live", old: "cash in hand", href: "/finance-management/cash-bank" },
  bank: { label: "Bank balances on go-live", old: "bank balances", href: "/finance-management/cash-bank" },
};

export type MoneyTotals = {
  /** The go-live date typed on the check (or the day the school went live); null until one is typed. */
  goLive: Date | null;
  /** The day Finance Settings says records start. */
  financeGoLive: Date;
  oldDues: { students: number; paise: bigint };
  pastReceipts: { receipts: number; students: number; paise: bigint };
  advances: { students: number; paise: bigint };
  cash: { accounts: number; missing: string[]; paise: bigint };
  bank: { accounts: number; missing: string[]; paise: bigint };
  /** Fees due before go-live, once the go-live date is known. */
  before: BeforeGoLive | null;
};

export const paiseOf = (v: string | null | undefined): bigint | null => {
  if (v == null || v === "") return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
};

/** The money School OS holds from the old software, as of the go-live date. */
export async function moneyTotals(tx: Tx, ctx: SchoolContext, goLive: Date | null): Promise<MoneyTotals> {
  const [oldDues, receipts, holders, openings, accounts, finance, before] = await Promise.all([
    tx.studentFeeDue.findMany({ where: { kind: "OLD_DUES", broughtIn: true, state: "OPEN" }, select: { studentId: true, amountPaise: true } }),
    tx.payment.findMany({ where: { broughtIn: true, status: { not: "CANCELLED" } }, select: { studentId: true, amountPaise: true } }),
    tx.payment.findMany({
      where: { broughtIn: true, status: "POSTED", advancePaise: { gt: 0 } },
      select: { id: true, studentId: true, advancePaise: true, allocations: { where: { fromAdvance: true }, select: { amountPaise: true } } },
    }),
    tx.openingBalance.findMany({ where: { kind: { in: ["CASH", "BANK"] }, archivedAt: null, accountId: { not: null } }, select: { accountId: true, amountPaise: true } }),
    tx.bankAccount.findMany({ where: { archivedAt: null }, select: { id: true, kind: true, name: true }, orderBy: { name: "asc" } }),
    tx.financeSetting.findUnique({ where: { schoolId: ctx.schoolId }, select: { goLiveDate: true } }),
    goLive ? beforeGoLive(tx, ctx, goLive) : Promise.resolve(null),
  ]);
  const refunds = holders.length
    ? await tx.refund.findMany({ where: { paymentId: { in: holders.map((h) => h.id) }, status: "REFUNDED" }, select: { paymentId: true, advanceUsedPaise: true } })
    : [];
  // Advance still held on brought-in receipts: what was over, less what has been used for dues or refunded since.
  const held = new Map<string, bigint>();
  for (const h of holders) {
    const left = h.advancePaise - h.allocations.reduce((s, a) => s + a.amountPaise, ZERO) - refunds.filter((r) => r.paymentId === h.id).reduce((s, r) => s + r.advanceUsedPaise, ZERO);
    if (left > ZERO) held.set(h.studentId, (held.get(h.studentId) ?? ZERO) + left);
  }
  const book = (kind: "CASH" | "BANK") => {
    const mine = accounts.filter((a) => a.kind === kind);
    const set = new Map<string, bigint>();
    for (const o of openings) if (o.accountId && mine.some((a) => a.id === o.accountId)) set.set(o.accountId, (set.get(o.accountId) ?? ZERO) + o.amountPaise);
    return { accounts: mine.length, missing: mine.filter((a) => !set.has(a.id)).map((a) => a.name), paise: [...set.values()].reduce((s, p) => s + p, ZERO) };
  };
  return {
    goLive,
    financeGoLive: finance?.goLiveDate ?? new Date(`${DEFAULT_GO_LIVE}T00:00:00Z`),
    oldDues: { students: new Set(oldDues.map((d) => d.studentId)).size, paise: oldDues.reduce((s, d) => s + d.amountPaise, ZERO) },
    pastReceipts: { receipts: receipts.length, students: new Set(receipts.map((r) => r.studentId)).size, paise: receipts.reduce((s, r) => s + r.amountPaise, ZERO) },
    advances: { students: held.size, paise: [...held.values()].reduce((s, p) => s + p, ZERO) },
    cash: book("CASH"),
    bank: book("BANK"),
    before,
  };
}

/** Cash and bank lines belong to Finance Management; the others to Fee Management. */
export const isFinance = (key: MoneyKey) => key === "cash" || key === "bank";

/** Whole paise as rupees to type back into a form ("1482300" or "1482300.50"). */
export function rupeesText(p: bigint | null) {
  if (p === null) return "";
  const r = p / BigInt(100);
  const rest = p % BigInt(100);
  return rest === ZERO ? String(r) : `${r}.${String(rest).padStart(2, "0")}`;
}

/** School OS's figure for each money line. */
export function moneyFigure(m: MoneyTotals, key: MoneyKey): bigint {
  return key === "oldDues" ? m.oldDues.paise : key === "pastReceipts" ? m.pastReceipts.paise : key === "advances" ? m.advances.paise : key === "cash" ? m.cash.paise : m.bank.paise;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Plain warnings about the money: figures that differ from the old software, and what is still owed before go-live. None of them stops going live. */
export function moneyWarnings(m: MoneyTotals, expected: MoneyExpected, see: { fees: boolean; finance: boolean } = { fees: true, finance: true }): string[] {
  const out: string[] = [];
  for (const key of MONEY_KEYS) {
    if (!(isFinance(key) ? see.finance : see.fees)) continue;
    const said = paiseOf(expected[key]);
    if (said === null) continue;
    const have = moneyFigure(m, key);
    if (have === said) continue;
    const diff = have > said ? have - said : said - have;
    out.push(`Your old software says ${MONEY_WORDS[key].old} of ${formatRupees(said)}; School OS has ${formatRupees(have)} (${formatRupees(diff)} ${have > said ? "more" : "less"}).`);
  }
  const b = m.before;
  if (!see.fees) {
    // Fees due before go-live are for people who see fees.
  } else if (!m.goLive || !b) {
    out.push("Type the go-live date to see the fees due before it.");
  } else {
    if (b.withOldDues.rows > 0) {
      out.push(`${plural(b.withOldDues.students, "student has", "students have")} old dues brought in and ${formatRupees(b.withOldDues.paise)} of fees due before ${formatDate(m.goLive)} still owed on the fee plan. The same months may be counted twice: settle them under "Fees due before go-live".`);
    }
    const others = { rows: b.owed.rows - b.withOldDues.rows, students: b.owed.students - b.withOldDues.students, paise: b.owed.paise - b.withOldDues.paise };
    if (others.rows > 0) {
      out.push(`${formatRupees(others.paise)} of fees due before ${formatDate(m.goLive)} is still owed by ${plural(others.students, "student")} with no old dues brought in: no past receipt paid it. If the old software collected it, settle it under "Fees due before go-live"; otherwise it stays owed.`);
    }
  }
  if (see.finance && (m.cash.missing.length || m.bank.missing.length)) {
    const names = [...m.cash.missing, ...m.bank.missing];
    out.push(`${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} ${names.length === 1 ? "has" : "have"} no opening balance yet. Set it in Finance Management, Cash & Bank.`);
  }
  if (see.finance && m.goLive && m.financeGoLive.getTime() !== m.goLive.getTime()) {
    out.push(`Finance Settings says records start on ${formatDate(m.financeGoLive)}, not on the go-live date ${formatDate(m.goLive)}. Save the go-live date again here, or change it in Finance Management, Settings.`);
  }
  return out;
}

/** The money as confirmed on going live, kept with the go-live summary (paise as text). */
export function keptMoney(m: MoneyTotals) {
  return {
    goLive: m.goLive ? formatDate(m.goLive) : null,
    oldDues: String(m.oldDues.paise), pastReceipts: String(m.pastReceipts.paise), advances: String(m.advances.paise), cash: String(m.cash.paise), bank: String(m.bank.paise),
    owedBeforeGoLive: String(m.before?.owed.paise ?? 0), settledBeforeGoLive: String(m.before?.settled.paise ?? 0),
  };
}
