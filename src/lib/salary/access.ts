// Who sees what in Salary Management (05-roles.md, and the approved
// prototype's role audit, config.js VIEW / OWN and the design thread):
//   Full (Principal, School Admin, Accountant): every page, with amounts.
//   View (HR): Generate Salary and Salary History, to check that leave and
//   attendance reach the salary: days, leave and loss of pay, never money.
//   Own (everyone else, the Vice Principal too): My Salary Slips only.
import type { PermissionMap } from "../permissions";

export type SalaryLevel = "full" | "view" | "own";

export function salaryLevel(permissions: PermissionMap): SalaryLevel | null {
  const a = permissions["salary-management"];
  if (!a || a.see === "none") return null;
  if (a.see === "own") return "own";
  return a.change === "all" ? "full" : "view";
}

export const SALARY_PAGES = {
  generate: ["full", "view"],
  structures: ["full"],
  slips: ["full", "own"],
  advances: ["full"],
  history: ["full", "view"],
  settings: ["full"],
} as const satisfies Record<string, readonly SalaryLevel[]>;

export type SalaryPageKey = keyof typeof SALARY_PAGES;

export function salaryPageAllowed(permissions: PermissionMap, page: SalaryPageKey) {
  const level = salaryLevel(permissions);
  return level !== null && (SALARY_PAGES[page] as readonly SalaryLevel[]).includes(level);
}

/** Salary amounts (pay, deductions, net) show only with full Salary Management. HR's View is days, leave and loss of pay. */
export function seesMoney(permissions: PermissionMap) {
  return salaryLevel(permissions) === "full";
}
