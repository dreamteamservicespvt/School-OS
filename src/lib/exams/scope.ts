// Who may see and do what in Examination & Results (05-roles.md, 08 §1):
// - Full (Principal, School Admin, Exam In-charge, Academic Head, Vice
//   Principal): everything, including settings, locking and publishing.
// - Office Staff (Own): the datesheet and admit cards. No marks, no results.
// - Teacher (Own): marks entry for the subjects and sections given to them in
//   Teacher Allocation; results and analysis of their own sections.
// - Class Teacher (Own): as a teacher, plus remarks and report cards of
//   their own section.
import "server-only";

import type { Tx } from "../db";
import type { Current } from "../current";
import { reachFor } from "../permissions";
import { staffForUser } from "../people";

export type Who = Pick<Current, "permissions" | "roles" | "ctx" | "features">;

export type ExamScope = {
  see: "all" | "own";
  /** Full reach: settings, datesheets, locking, results, report cards for every section. */
  manage: boolean;
  /** Office Staff: datesheets and admit cards only. */
  office: boolean;
  /** Can make and change datesheets and print admit cards. */
  datesheets: boolean;
  /** May publish results (Exam Settings, "who can publish results"). */
  publish: boolean;
  staffId: string | null;
  /** Sections whose results, report cards and datesheets this person sees; null = every section. */
  sectionIds: string[] | null;
  /** Subject and section pairs this person enters marks for; null = every paper. */
  teaches: { sectionId: string; subjectId: string }[] | null;
  /** Sections this person is class teacher of (remarks, report cards). */
  classTeacherOf: string[];
  /** Can see results and analysis at all (not Office Staff on their own). */
  results: boolean;
};

export async function examScope(tx: Tx, who: Who, yearId: string | null): Promise<ExamScope> {
  const see = reachFor(who.permissions, "examination-results", "view");
  const change = reachFor(who.permissions, "examination-results", "edit");
  const roleKeys = who.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const office = see === "own" && roleKeys.includes("office-staff");
  const staff = await staffForUser(tx, who.ctx);
  const manage = change === "all";

  let teaches: ExamScope["teaches"] = null;
  let classTeacherOf: string[] = [];
  let sectionIds: string[] | null = null;
  if (staff && yearId) {
    const [allocs, ct] = await Promise.all([
      tx.teacherAllocation.findMany({ where: { academicYearId: yearId, staffId: staff.id, archivedAt: null }, select: { sectionId: true, subjectId: true } }),
      tx.section.findMany({ where: { academicYearId: yearId, classTeacherId: staff.id, archivedAt: null }, select: { id: true } }),
    ]);
    classTeacherOf = ct.map((s) => s.id);
    if (!manage) {
      teaches = allocs;
      sectionIds = [...new Set([...allocs.map((a) => a.sectionId), ...classTeacherOf])];
    }
  } else if (!manage) {
    teaches = [];
    sectionIds = [];
  }

  let publish = false;
  if (manage) {
    const settings = await tx.examSettings.findUnique({ where: { schoolId: who.ctx.schoolId }, select: { publishRoles: true } });
    const roles = settings?.publishRoles ?? ["principal", "school-admin", "exam-in-charge"];
    publish = roleKeys.some((k) => roles.includes(k));
  }

  return {
    see: see === "all" ? "all" : "own",
    manage,
    office,
    datesheets: manage || (office && change !== "none"),
    publish,
    staffId: staff?.id ?? null,
    // Office Staff prepare datesheets and admit cards for every class.
    sectionIds: office ? null : sectionIds,
    teaches: office ? [] : teaches,
    classTeacherOf,
    results: !office || manage,
  };
}

/** May this person enter marks for this subject in this section? Server check (08 §5). */
export function teachesPaper(scope: ExamScope, sectionId: string, subjectId: string) {
  if (scope.office && !scope.manage) return false;
  if (scope.teaches === null) return true;
  return scope.teaches.some((t) => t.sectionId === sectionId && t.subjectId === subjectId);
}

export function seesSection(scope: ExamScope, sectionId: string) {
  return scope.sectionIds === null || scope.sectionIds.includes(sectionId);
}

/** Remarks and report cards: full reach, or the class teacher of the section. */
export function writesReportCards(scope: ExamScope, sectionId: string) {
  return scope.manage || scope.classTeacherOf.includes(sectionId);
}

/** Optional parts switched on in Exam Settings (P19). */
export const EXAM_FEATURES = [
  { key: "exam-seating", label: "Seating arrangement", help: "Seat numbers per room by roll number, and seating charts. For larger schools." },
  { key: "exam-question-papers", label: "Question Papers", help: "A question bank by chapter and difficulty, and papers made from it." },
  { key: "exam-co-scholastic", label: "Co-scholastic grades", help: "Work education, art, health and physical education on CBSE-style report cards." },
  { key: "exam-competencies", label: "Competency-based assessment", help: "Competencies per subject and their levels on the report card." },
  { key: "exam-boards", label: "Grade scale and format per board", help: "For schools running two boards, such as State board to class 8 and CBSE for 9 to 12." },
] as const;

export type ExamFeature = (typeof EXAM_FEATURES)[number]["key"];

export function examFeatureOn(who: Pick<Current, "features">, key: ExamFeature) {
  return who.features.has(key);
}
