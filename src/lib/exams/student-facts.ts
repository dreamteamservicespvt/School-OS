// What Examination & Results tells Student Management (08 §4 Sends: "results
// for promotion"): each student's published final result of a year, for the
// promotion suggestion ("pass required") and the Student List's Result
// column. Draft results never leave this module. Listed in
// src/lib/students/fact-sources.ts.
import "server-only";

import type { Tx } from "../db";
import type { Current } from "../current";
import type { FactViewer, ListSource, PromotionSource, ResultKind } from "../students/hooks";
import { showPercent } from "./common";
import { finalOutcomes } from "./profile";
import { examScope, resultSubjects, seesResults, seesSection } from "./scope";

const KIND: Record<string, ResultKind> = { Pass: "pass", Fail: "fail", Compartment: "compartment" };

/** "Pass, 78%" */
function described(r: { outcome: string | null; percent: number | null }) {
  return [r.outcome, showPercent(r.percent)].filter(Boolean).join(", ") || null;
}

async function finals(tx: Tx, academicYearId: string, studentIds: string[]) {
  const rows = await finalOutcomes(tx, academicYearId, studentIds);
  return new Map([...rows].map(([id, r]) => [id, { result: r.outcome ? KIND[r.outcome] ?? null : null, resultText: described(r) }]));
}

export const promotionFacts: PromotionSource = async (tx, _ctx, q) => {
  const found = await finals(tx, q.academicYearId, q.studentIds);
  // Students with no published final result: null, so the page can say so.
  return new Map(q.studentIds.map((id) => [id, found.get(id) ?? { result: null, resultText: null }]));
};

/**
 * The Result column: the published final result, for students whose class
 * results this person sees (full reach, or the class teacher of the section;
 * a subject teacher sees only their own subjects' marks, never the overall
 * result, 12 Oct 2026 rules in ./scope.ts).
 */
export const listFacts: ListSource = {
  covers: "results",
  allowed: (who) => seesResults(who),
  load: async (tx, who: FactViewer, q) => {
    const scope = await examScope(tx, who as unknown as Pick<Current, "permissions" | "roles" | "ctx" | "features">, q.academicYearId);
    if (!scope.results) return new Map();
    const enrolments = await tx.enrolment.findMany({ where: { studentId: { in: q.studentIds }, academicYearId: q.academicYearId, archivedAt: null }, select: { studentId: true, sectionId: true } });
    const visible = enrolments.filter((e) => seesSection(scope, e.sectionId) && resultSubjects(scope, e.sectionId) === null).map((e) => e.studentId);
    return visible.length ? finals(tx, q.academicYearId, visible) : new Map();
  },
};
