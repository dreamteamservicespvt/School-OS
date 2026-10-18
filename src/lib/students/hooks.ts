// Where other modules plug into student work, without this module knowing
// them.
//
// - Examination & Results, Attendance and Fee Management give the facts the
//   promotion suggestion, the Student List and Parent 360 use (final result,
//   attendance %, fees due), and say whether anything is recorded for a
//   student in a year, which stops a promotion being undone. They are named in
//   one explicit list, ./fact-sources.ts, which the functions below load
//   themselves: a page, action or job that asks for facts always gets every
//   source, even on a server that has just started (gap lists G01 and G20).
// - Fee Management applies the class fee plan when a student is added,
//   imported or promoted (onEnrolled, automation A13).
// - Examination & Results moves a student's marks, draft results and report
//   cards with them when they change section, or the change is undone (onSectionChanged).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { PermissionMap } from "../permissions";

/** A published final result: pass, fail, or the school's own "compartment". */
export type ResultKind = "pass" | "fail" | "compartment";

export type PromotionFacts = {
  /** The year's published final result; null when it is not published. */
  result?: ResultKind | null;
  /** How the result is shown, e.g. "Pass, 78%". */
  resultText?: string | null;
  attendancePct?: number | null;
  /** Still to pay for the year and any earlier year, in paise; 0n when everything is paid. */
  feeDuePaise?: bigint | null;
};

export type FactQuery = { studentIds: string[]; academicYearId: string };
export type PromotionSource = (tx: Tx, ctx: SchoolContext, q: FactQuery) => Promise<Map<string, PromotionFacts>>;
/** Plain words for what is recorded in the year ("fees are paid for 2 students"), or null. */
export type ActivitySource = (tx: Tx, ctx: SchoolContext, q: FactQuery) => Promise<string | null>;

/** The modules' sources, loaded on first use (their files import types from this one). */
const sources = () => import("./fact-sources");

/** Final result, attendance % and fees due of each student in a year, for the promotion suggestion. */
export async function promotionFacts(tx: Tx, ctx: SchoolContext, studentIds: string[], academicYearId: string) {
  const out = new Map<string, PromotionFacts>(studentIds.map((id) => [id, {}]));
  if (!studentIds.length) return out;
  for (const fn of (await sources()).promotionSources) {
    const part = await fn(tx, ctx, { studentIds, academicYearId });
    for (const [id, facts] of part) out.set(id, { ...out.get(id), ...facts });
  }
  return out;
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

/** Plain words for what is recorded, e.g. "attendance is marked for 12 students", or null when nothing is. */
export async function yearActivity(tx: Tx, ctx: SchoolContext, studentIds: string[], academicYearId: string) {
  if (!studentIds.length) return null;
  for (const fn of (await sources()).activitySources) {
    const problem = await fn(tx, ctx, { studentIds, academicYearId });
    if (problem) return problem;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The Student List's Attendance, Result and Fees columns, its "Has dues" and
// "Overdue" filter, and the same facts on Parent 360 (design: students.jsx).
// Each source says who may see its column, and leaves out any student the
// person may not see it for: fee facts reach only people allowed to see fees
// (03 §2, Student List), results only people who see that class's results.
export type ListFacts = {
  /** Present days as a share of school days so far this year, 0 to 100; null when nothing is marked. */
  attendancePct?: number | null;
  /** Fees fallen due (by today + 30 days, as on Fees by class) and not paid, in paise; 0n when paid; null when nothing has fallen due. */
  feeDuePaise?: bigint | null;
  /** True when some of the dues are past their due date. */
  feeOverdue?: boolean;
  /** The year's published final result. */
  result?: ResultKind | null;
  resultText?: string | null;
};
export type ListColumn = "attendance" | "fees" | "results";
/** The person asking: what they may see decides which facts they get. */
export type FactViewer = { ctx: SchoolContext; permissions: PermissionMap; roles: { key: string | null }[] };
export type ListSource = {
  covers: ListColumn;
  /** May this person see the column at all (their roles' permissions)? */
  allowed: (who: FactViewer) => boolean;
  load: (tx: Tx, who: FactViewer, q: FactQuery) => Promise<Map<string, ListFacts>>;
};
/** Students who owe fees (or owe overdue fees), within what this person may see; null when they may not see fees. */
export type FeeFilterSource = (tx: Tx, who: FactViewer, q: { academicYearId: string; kind: "dues" | "overdue" }) => Promise<string[] | null>;

/** Facts for the students shown, and which columns this person may see. */
export async function listFacts(tx: Tx, who: FactViewer, studentIds: string[], academicYearId: string | null) {
  const out = new Map<string, ListFacts>();
  const shown = (await sources()).listSources.filter((p) => p.allowed(who));
  const shows: Record<ListColumn, boolean> = { attendance: false, fees: false, results: false };
  for (const p of shown) shows[p.covers] = true;
  if (!academicYearId || !studentIds.length) return { facts: out, shows };
  for (const p of shown) {
    const part = await p.load(tx, who, { studentIds, academicYearId });
    for (const [id, f] of part) out.set(id, { ...out.get(id), ...f });
  }
  return { facts: out, shows };
}

/** Students with dues (or overdue dues) this year; null when this person may not see fees. */
export async function studentsWithDues(tx: Tx, who: FactViewer, academicYearId: string, kind: "dues" | "overdue") {
  return (await sources()).feeFilter(tx, who, { academicYearId, kind });
}
