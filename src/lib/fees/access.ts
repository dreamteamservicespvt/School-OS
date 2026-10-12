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

export async function feeViewer(tx: Tx, ctx: SchoolContext, current: Pick<Current, "permissions" | "roles" | "user">): Promise<FeeViewer> {
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
