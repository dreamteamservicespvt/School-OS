// Where other modules plug into student work, without this module knowing
// them. Each is a small registry; a module adds one call when it is built.
//
// - Examination & Results, Attendance and Fee Management give the facts the
//   promotion suggestion uses (registerPromotionFacts).
// - Fee Management applies the class fee plan when a student is added,
//   imported or promoted (onEnrolled, automation A13).
// - Attendance and Fee Management say whether anything is recorded for a
//   student in a year, which stops a promotion being undone (registerYearActivity).
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type PromotionFacts = {
  /** Final result: "pass", "fail" or null when results are not published. */
  result?: "pass" | "fail" | null;
  /** How the result is shown, e.g. "Pass, 78%". */
  resultText?: string | null;
  attendancePct?: number | null;
  feeDuePaise?: bigint | null;
};

type FactsFn = (tx: Tx, ctx: SchoolContext, q: { studentIds: string[]; academicYearId: string }) => Promise<Map<string, PromotionFacts>>;
const factProviders: FactsFn[] = [];
export function registerPromotionFacts(fn: FactsFn) {
  factProviders.push(fn);
}
export async function promotionFacts(tx: Tx, ctx: SchoolContext, studentIds: string[], academicYearId: string) {
  const out = new Map<string, PromotionFacts>(studentIds.map((id) => [id, {}]));
  for (const fn of factProviders) {
    const part = await fn(tx, ctx, { studentIds, academicYearId });
    for (const [id, facts] of part) out.set(id, { ...out.get(id), ...facts });
  }
  return { facts: out, hasProviders: factProviders.length > 0 };
}

export type EnrolledEvent = {
  studentId: string;
  enrolmentId: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  how: "added" | "imported" | "promoted";
  /** "Apply the class fee plan" on the add and import forms (on by default). */
  applyFeePlan: boolean;
};
type EnrolledFn = (tx: Tx, ctx: SchoolContext, e: EnrolledEvent) => Promise<void>;
const enrolledHandlers: EnrolledFn[] = [];
export function onEnrolled(fn: EnrolledFn) {
  enrolledHandlers.push(fn);
}
export async function runEnrolled(tx: Tx, ctx: SchoolContext, e: EnrolledEvent) {
  for (const fn of enrolledHandlers) await fn(tx, ctx, e);
}
/** True once a module (Fee Management) applies fee plans, so the form can say so. */
export const feePlanApplies = () => enrolledHandlers.length > 0;

type ActivityFn = (tx: Tx, ctx: SchoolContext, q: { studentIds: string[]; academicYearId: string }) => Promise<string | null>;
const activityChecks: ActivityFn[] = [];
export function registerYearActivity(fn: ActivityFn) {
  activityChecks.push(fn);
}
/** Plain words for what is recorded, e.g. "attendance is marked for 12 students", or null when nothing is. */
export async function yearActivity(tx: Tx, ctx: SchoolContext, studentIds: string[], academicYearId: string) {
  for (const fn of activityChecks) {
    const problem = await fn(tx, ctx, { studentIds, academicYearId });
    if (problem) return problem;
  }
  return null;
}
