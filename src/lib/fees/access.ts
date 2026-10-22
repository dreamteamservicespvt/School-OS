// Who may see and do what in Fee and Finance Management (05-roles.md, 06 §1).
// "Own" reach (a class teacher given fee access) means the fee status of the
// students of their own sections only; they never collect, cancel or refund.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import type { Reach } from "../permissions";
import { classTeacherSectionIds, ownSectionIds } from "../people";
import { currentYear, yearsFor } from "../academic/years";
import { personCampusId } from "../campus";
import { MoneyProblem } from "./problem";

export type FeeViewer = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  /** For "own" reach: the sections whose students they may see. */
  sectionIds: string[] | null;
  /** The current year of the person's own campus (defaults, such as a new plan's year). */
  yearId: string | null;
  /** The current year of every campus they see, one each: "this year" for a student is their own campus's. */
  yearIds: string[];
  /** The campus their access is limited to ("One campus"); null for the whole school. */
  campusId: string | null;
};

export async function feeViewer(tx: Tx, ctx: SchoolContext, current: Pick<Current, "permissions"> & { roles: { key: string | null }[]; user: { id: string }; campusId?: string | null }): Promise<FeeViewer> {
  const access = current.permissions["fee-management"];
  const campusId = current.campusId ?? null;
  const [year, years] = await Promise.all([currentYear(tx, ctx, await personCampusId(tx, ctx, current)), yearsFor(tx, ctx, campusId)]);
  const yearIds = years.map((y) => y.id);
  let sectionIds: string[] | null = null;
  if (access.see === "own") {
    const own = (await Promise.all(yearIds.map((y) => classTeacherSectionIds(tx, ctx, y)))).flat();
    sectionIds = own.length ? own : (await Promise.all(yearIds.map((y) => ownSectionIds(tx, ctx, y)))).flat();
  }
  return {
    userId: current.user.id,
    see: access.see,
    change: access.change,
    roleKeys: current.roles.map((r) => r.key).filter((k): k is string => Boolean(k)),
    sectionIds,
    yearId: year?.id ?? null,
    yearIds,
    campusId,
  };
}

/**
 * Students a viewer may see: everyone (on their campus, when their access is
 * limited to one), or those enrolled in their own sections this year.
 */
export function studentScope(v: Pick<FeeViewer, "see" | "sectionIds" | "yearIds" | "campusId">): Prisma.StudentWhereInput {
  const campus = v.campusId ? { campusId: v.campusId } : {};
  if (v.see === "all") return campus;
  return { ...campus, enrolments: { some: { sectionId: { in: v.sectionIds ?? [] }, archivedAt: null, academicYearId: { in: v.yearIds } } } };
}

export async function canSeeStudent(tx: Tx, v: FeeViewer, studentId: string) {
  if (v.see === "none") return false;
  if (v.see === "all" && !v.campusId) return true;
  const n = await tx.student.count({ where: { id: studentId, ...studentScope(v) } });
  return n > 0;
}

/**
 * For lists of records that hang off a student (payments, dues, refunds,
 * reminders): `{ studentId: { in: ... } }` with the students of the viewer's
 * campus when their access is limited to one; nothing for the whole school.
 */
export async function feeStudentFilter(tx: Tx, v: Pick<FeeViewer, "campusId">): Promise<{ studentId?: { in: string[] } }> {
  if (!v.campusId) return {};
  const rows = await tx.student.findMany({ where: { campusId: v.campusId }, select: { id: true } });
  return { studentId: { in: rows.map((r) => r.id) } };
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
