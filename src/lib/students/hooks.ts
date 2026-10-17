// Where other modules plug into student work, without this module knowing
// them. Each is a small registry; a module adds one call when it is built.
//
// - Examination & Results, Attendance and Fee Management give the facts the
//   promotion suggestion uses (registerPromotionFacts).
// - Fee Management applies the class fee plan when a student is added,
//   imported or promoted (onEnrolled, automation A13).
// - Attendance and Fee Management say whether anything is recorded for a
//   student in a year, which stops a promotion being undone (registerYearActivity).
// - Examination & Results moves a student's marks, draft results and report
//   cards with them when they change section, or the change is undone (onSectionChanged).
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

export type SectionChangedEvent = { studentId: string; academicYearId: string; fromSectionId: string; toSectionId: string };
type SectionChangedFn = (tx: Tx, ctx: SchoolContext, e: SectionChangedEvent) => Promise<void>;
const sectionChangedHandlers: SectionChangedFn[] = [];
export function onSectionChanged(fn: SectionChangedFn) {
  sectionChangedHandlers.push(fn);
}
/** Runs in the same transaction as the section change, so both happen or neither. */
export async function runSectionChanged(tx: Tx, ctx: SchoolContext, e: SectionChangedEvent) {
  for (const fn of sectionChangedHandlers) await fn(tx, ctx, e);
}

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

// ---------------------------------------------------------------------------
// The Student List's Attendance and Fees columns, the "Has dues" and "Overdue"
// filter, and the same facts on Parents & Guardians (design: students.jsx).
// Attendance Management and Fee Management each register one provider when they
// are built; until then the columns show "–" and the fee filter is not offered.
//
//   registerListFacts({ attendance: true }, async (tx, ctx, q) => new Map([[id, { attendancePct: 94 }]]));
//   registerListFacts({ fees: true }, async (tx, ctx, q) => new Map([[id, { feeDuePaise: 1095000n, feeOverdue: true }]]));
//   registerFeeFilter(async (tx, ctx, { academicYearId, kind }) => studentIdsWithDues);
export type ListFacts = {
  /** Present days as a share of school days so far this year, 0 to 100. */
  attendancePct?: number | null;
  /** What is still to pay this year, in paise; 0n when everything is paid. */
  feeDuePaise?: bigint | null;
  /** True when some of the dues are past their due date. */
  feeOverdue?: boolean;
};
type ListFactsFn = (tx: Tx, ctx: SchoolContext, q: { studentIds: string[]; academicYearId: string }) => Promise<Map<string, ListFacts>>;
const listFactProviders: { covers: { attendance?: boolean; fees?: boolean }; fn: ListFactsFn }[] = [];
export function registerListFacts(covers: { attendance?: boolean; fees?: boolean }, fn: ListFactsFn) {
  listFactProviders.push({ covers, fn });
}
/** Facts for the students shown, and which columns have a source at all. */
export async function listFacts(tx: Tx, ctx: SchoolContext, studentIds: string[], academicYearId: string | null) {
  const out = new Map<string, ListFacts>();
  const has = { attendance: listFactProviders.some((p) => p.covers.attendance), fees: listFactProviders.some((p) => p.covers.fees) };
  if (!academicYearId || !studentIds.length) return { facts: out, has };
  for (const p of listFactProviders) {
    const part = await p.fn(tx, ctx, { studentIds, academicYearId });
    for (const [id, f] of part) out.set(id, { ...out.get(id), ...f });
  }
  return { facts: out, has };
}

type FeeFilterFn = (tx: Tx, ctx: SchoolContext, q: { academicYearId: string; kind: "dues" | "overdue" }) => Promise<string[]>;
let feeFilter: FeeFilterFn | null = null;
export function registerFeeFilter(fn: FeeFilterFn) {
  feeFilter = fn;
}
export const feeFilterAvailable = () => feeFilter !== null;
/** Students with dues (or overdue dues) this year; null when no module can say. */
export async function studentsWithDues(tx: Tx, ctx: SchoolContext, academicYearId: string, kind: "dues" | "overdue") {
  return feeFilter ? feeFilter(tx, ctx, { academicYearId, kind }) : null;
}
