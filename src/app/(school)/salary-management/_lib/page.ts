// What every Salary Management page starts with: the signed-in person,
// checked on the server, their level here (full, view or own), today in the
// school's time zone, the shared date filter and the person's own staff record.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { reachFor } from "@/lib/permissions";
import { periodSetup } from "@/lib/period-setup";
import { todayIn } from "@/lib/staff/dates";
import { ensureSalaryDefaults } from "@/lib/salary/settings";
import { SALARY_PAGES, salaryLevel, salaryPageAllowed, type SalaryPageKey } from "@/lib/salary/access";

export const MODULE = "salary-management" as const;
export const BASE = "/salary-management";
export { qs, one, financePeriod as salaryPeriod, type SearchParams } from "../../finance-management/_lib/page";

export const salaryPage = cache(async () => {
  const current = await requirePage(MODULE);
  const dates = await periodSetup(current);
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const level = salaryLevel(current.permissions)!;
  const data = await withSchool(current.ctx, async (tx) => {
    if (level === "full") await ensureSalaryDefaults(tx, current.ctx);
    const [me, campuses, school] = await Promise.all([
      tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true, fullName: true, staffCode: true, campusId: true } }),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, isMain: true } }),
      tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true } }),
    ]);
    return { me, campuses, school };
  });
  const p = current.permissions;
  const can = {
    create: reachFor(p, MODULE, "create") === "all",
    edit: reachFor(p, MODULE, "edit") === "all",
    approve: reachFor(p, MODULE, "approve") === "all",
    export: level !== "own" && reachFor(p, MODULE, "export") !== "none",
  };
  /** Amounts show only with full Salary Management; HR's View is days, leave and loss of pay. */
  const money = level === "full";
  const may = (page: SalaryPageKey) => salaryPageAllowed(p, page);
  return { current, dates, tz, today, level, money, can, change: level === "full" && (can.create || can.edit), may, ...data };
});

export type SalaryPage = Awaited<ReturnType<typeof salaryPage>>;

const TABS: { key: SalaryPageKey; label: string }[] = [
  { key: "generate", label: "Generate Salary" },
  { key: "structures", label: "Salary Structures" },
  { key: "slips", label: "Salary Slips" },
  { key: "advances", label: "Advances & Loans" },
  { key: "history", label: "Salary History" },
  { key: "settings", label: "Salary Settings" },
];

/** Salary Management's pages in the order of the approved design (mod-salary.jsx); pages a person may not open are hidden. */
export async function salaryTabs() {
  const p = await salaryPage();
  if (p.level === "own") return null;
  return TABS.filter((t) => p.may(t.key)).map((t) => ({ href: `${BASE}/${t.key}`, label: t.label }));
}

/** A Salary page this person may open; anything else is a plain "no access" page. */
export async function salaryGuard(page: SalaryPageKey) {
  const p = await salaryPage();
  if (!p.may(page)) redirect(`/no-access?m=${MODULE}`);
  return p;
}

export const ALL_PAGES = Object.keys(SALARY_PAGES) as SalaryPageKey[];
