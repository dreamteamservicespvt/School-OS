// Who may see and do what in Fee and Finance Management (05-roles.md, 06 §1).
// "Own" reach (a class teacher given fee access) means the fee status of the
// students of their own sections only; they never collect, cancel or refund.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import type { Reach } from "../permissions";
import { classTeacherSectionIds, ownSectionIds } from "../people";
import { currentYear } from "../academic/years";
import { MoneyProblem } from "./problem";

export type FeeViewer = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  /** For "own" reach: the sections whose students they may see. */
  sectionIds: string[] | null;
  yearId: string | null;
};

export async function feeViewer(tx: Tx, ctx: SchoolContext, current: Pick<Current, "permissions"> & { roles: { key: string | null }[]; user: { id: string } }): Promise<FeeViewer> {
  const access = current.permissions["fee-management"];
  const year = await currentYear(tx, ctx);
  let sectionIds: string[] | null = null;
  if (access.see === "own" && year) {
    const own = await classTeacherSectionIds(tx, ctx, year.id);
    sectionIds = own.length ? own : await ownSectionIds(tx, ctx, year.id);
  }
  return {
    userId: current.user.id,
    see: access.see,
    change: access.change,
    roleKeys: current.roles.map((r) => r.key).filter((k): k is string => Boolean(k)),
    sectionIds,
    yearId: year?.id ?? null,
  };
}

/** Students a viewer may see: everyone, or those enrolled in their own sections this year. */
export function studentScope(v: FeeViewer): Prisma.StudentWhereInput {
  if (v.see === "all") return {};
  return { enrolments: { some: { sectionId: { in: v.sectionIds ?? [] }, archivedAt: null, ...(v.yearId ? { academicYearId: v.yearId } : {}) } } };
}

export async function canSeeStudent(tx: Tx, v: FeeViewer, studentId: string) {
  if (v.see === "all") return true;
  if (v.see === "none") return false;
  const n = await tx.student.count({ where: { id: studentId, ...studentScope(v) } });
  return n > 0;
}

/** Collecting, cancelling, concessions and refunds need full Fee Management (not "own"). */
export function requireFeeStaff(v: Pick<FeeViewer, "change">, what = "this") {
  if (v.change !== "all") throw new MoneyProblem(`Your role can see fee status but cannot do ${what}. Ask the accountant.`);
}

const FULL_VIEW_ROLES = ["principal", "school-admin", "accountant", "vice-principal"];

/**
 * The Admission Counsellor sees only the application and admission fee status
 * (05-roles.md): no ledgers, payments, defaulters or reports.
 */
export function admissionOnly(v: Pick<FeeViewer, "roleKeys" | "change">) {
  return v.roleKeys.includes("admission-counsellor") && !v.roleKeys.some((k) => FULL_VIEW_ROLES.includes(k)) && v.change !== "all";
}

/** Refuses fee details to a viewer who may see only admission fees. */
export function requireFeeDetails(v: Pick<FeeViewer, "roleKeys" | "change">) {
  if (admissionOnly(v)) throw new MoneyProblem("Your role sees only admission fee status. Ask the accountant for other fee details.");
}

/**
 * How much of Fee Management a person sees (the approved prototype's role
 * audit): the Admission Counsellor only "Admission Fees"; View (Vice Principal)
 * the Fee Dashboard, Defaulters and Fee Reports; Own the ledgers and defaulters
 * of their own sections; Full everything.
 */
export type FeeLevel = "admission" | "own" | "view" | "full";

export function feeLevel(v: Pick<FeeViewer, "roleKeys" | "change" | "see">): FeeLevel | null {
  if (v.see === "none") return null;
  if (admissionOnly(v)) return "admission";
  if (v.change === "all") return "full";
  if (v.see === "own") return "own";
  return "view";
}

export const FEE_PAGES = {
  dashboard: ["admission", "view", "full"],
  collect: ["full"],
  payments: ["full"],
  ledger: ["own", "full"],
  documents: ["own", "view", "full"],
  defaulters: ["own", "view", "full"],
  structure: ["full"],
  concessions: ["full"],
  reports: ["view", "full"],
  settings: ["full"],
} as const satisfies Record<string, readonly FeeLevel[]>;

export type FeePageKey = keyof typeof FEE_PAGES;

export function feePageAllowed(v: Pick<FeeViewer, "roleKeys" | "change" | "see">, page: FeePageKey) {
  const level = feeLevel(v);
  return level !== null && (FEE_PAGES[page] as readonly FeeLevel[]).includes(level);
}

/** The same Admission Counsellor rule from the signed-in person alone (no database), for menus and profile tabs. */
export function admissionOnlyFor(current: { permissions: Record<string, { change: Reach }>; roles?: { key: string | null }[] }) {
  const roleKeys = (current.roles ?? []).map((r) => r.key).filter((k): k is string => Boolean(k));
  return admissionOnly({ roleKeys, change: current.permissions["fee-management"]?.change ?? "none" });
}

/**
 * May this person see students' fees outside Fee Management (the Student
 * List's fee column and "Has dues" filter, Parent 360, the amounts on
 * Promotion)? Anyone with Fee Management, except the Admission Counsellor.
 * "Own" reach still sees only their own sections' students.
 */
export function seesStudentFees(current: { permissions: Record<string, { see: Reach; change: Reach }>; roles?: { key: string | null }[] }) {
  return (current.permissions["fee-management"]?.see ?? "none") !== "none" && !admissionOnlyFor(current);
}

/** feePageAllowed from the signed-in person alone (no database), for links from other modules. */
export function feePageAllowedFor(current: { permissions: Record<string, { see: Reach; change: Reach }>; roles?: { key: string | null }[] }, page: FeePageKey) {
  const roleKeys = (current.roles ?? []).map((r) => r.key).filter((k): k is string => Boolean(k));
  const a = current.permissions["fee-management"] ?? { see: "none", change: "none" };
  return feePageAllowed({ roleKeys, see: a.see, change: a.change }, page);
}
