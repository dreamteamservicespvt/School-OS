// Who sees what in Finance Management (05-roles.md, and the approved
// prototype's role audit, design/ui-prototype/src/config.js):
//   Full (Accountant, Principal, School Admin): every page.
//   View (Vice Principal): Day Book, Income, Expenses, Cash & Bank, Budget and
//   Finance Reports. Not Accounts or Finance Settings.
// Staff pay (salary and salary advances) shows only to people who may see
// everyone's salary in Salary Management. Everyone else sees Finance with
// those entries left out: the Vice Principal's Finance View has no staff pay.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import type { PermissionMap } from "../permissions";

export type FinanceLevel = "view" | "full";

export function financeLevel(permissions: PermissionMap): FinanceLevel | null {
  const a = permissions["finance-management"];
  if (a.see === "none") return null;
  return a.change === "all" ? "full" : "view";
}

export const FINANCE_PAGES = {
  "day-book": ["view", "full"],
  income: ["view", "full"],
  expenses: ["view", "full"],
  "cash-bank": ["view", "full"],
  budget: ["view", "full"],
  accounts: ["full"],
  reports: ["view", "full"],
  settings: ["full"],
} as const satisfies Record<string, readonly FinanceLevel[]>;

export type FinancePageKey = keyof typeof FINANCE_PAGES;

export function financePageAllowed(permissions: PermissionMap, page: FinancePageKey) {
  const level = financeLevel(permissions);
  return level !== null && (FINANCE_PAGES[page] as readonly FinanceLevel[]).includes(level);
}

/** Staff pay shows only to people who see everyone's salary (Salary Management, Full or View). */
export function seesStaffPay(permissions: PermissionMap) {
  return permissions["salary-management"].see === "all";
}

export const PAY_SECTIONS = ["salary", "salary-advance"];
export const PAY_SOURCES = ["payroll", "salary-advance", "statutory-payment", "statutory-cancel"];

/**
 * The account heads that are staff pay (the Salaries head and any head under
 * "Staff costs" marked as salary), or null when this person may see staff pay.
 * An empty list still hides the salary sections of the Day Book.
 */
export async function hiddenPayHeads(tx: Tx, permissions: PermissionMap): Promise<string[] | null> {
  if (seesStaffPay(permissions)) return null;
  const heads = await tx.accountHead.findMany({ where: { systemKey: "salary" }, select: { id: true } });
  return heads.map((h) => h.id);
}

/** Day Book entries without staff pay. Careful with the nullable head: NULL heads stay in. */
export function dayBookWithoutPay(heads: string[]): Prisma.DayBookEntryWhereInput {
  return {
    AND: [
      { section: { notIn: PAY_SECTIONS } },
      { sourceType: { notIn: PAY_SOURCES } },
      ...(heads.length ? [{ OR: [{ accountHeadId: null }, { accountHeadId: { notIn: heads } }] }] : []),
    ],
  };
}

/** Expenses without staff pay. */
export function expensesWithoutPay(heads: string[]): Prisma.ExpenseWhereInput {
  return heads.length ? { accountHeadId: { notIn: heads } } : {};
}
