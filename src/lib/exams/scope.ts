// Who may see and do what in Examination & Results (05-roles.md, 08 §1):
// - Full (Principal, School Admin, Exam In-charge, Academic Head, Vice
//   Principal): everything, including settings, locking and publishing.
// - Office Staff (Own): the datesheet and admit cards. No marks, no results.
// - Teacher (Own): marks entry for the subjects and sections given to them in
//   Teacher Allocation; results and analysis of their own sections.
// - Class Teacher (Own): as a teacher, plus remarks and report cards of
//   their own section.
// A person limited to one campus ("One campus" in Users & Permissions) sees
// only that campus's sections and the exams of that campus's years.
import "server-only";

import type { Tx } from "../db";
import type { Current } from "../current";
import { reachFor } from "../permissions";
import { staffForUser } from "../people";
import { campusSectionIds } from "../campus";
import { campusYearIds } from "../academic/page-campus";
import { ExamRuleError } from "./common";

/** The signed-in person (Current satisfies it). `campusId`: the campus their access is limited to; null or left out for the whole school. */
export type Who = Pick<Current, "permissions" | "roles" | "ctx" | "features"> & { campusId?: string | null };

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
  /** Sections whose results, report cards and datesheets this person sees; null = every section (of every campus). */
  sectionIds: string[] | null;
  /** The academic years of the campus this person is limited to (an exam belongs to a year); null = the whole school. */
  yearIds: string[] | null;
  /** The campus this person is limited to ("One campus"); null = the whole school. */
  campusId: string | null;
  /** Subject and section pairs this person enters marks for; null = every paper. */
  teaches: { sectionId: string; subjectId: string }[] | null;
  /** Sections this person is class teacher of (remarks, report cards). */
  classTeacherOf: string[];
  /** Can see results and analysis at all (not Office Staff on their own). */
  results: boolean;
  /** Exam Analysis: whole-school reach only (not teachers, whose results show only their own subjects). */
  analysis: boolean;
  /** Writes principal remarks on report cards: the Principal (or the School Admin acting as head). */
  principal: boolean;
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

  // One campus: only that campus's sections, papers and class-teacher duties.
  const campusSections = await campusSectionIds(tx, who);
  if (campusSections) {
    const mine = new Set(campusSections);
    classTeacherOf = classTeacherOf.filter((id) => mine.has(id));
    if (teaches) teaches = teaches.filter((t) => mine.has(t.sectionId));
    if (sectionIds) sectionIds = sectionIds.filter((id) => mine.has(id));
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
    // Office Staff prepare datesheets and admit cards for every class (of their campus, when limited to one).
    sectionIds: office ? campusSections : sectionIds ?? campusSections,
    yearIds: await campusYearIds(tx, who.ctx, who),
    campusId: who.campusId ?? null,
    teaches: office ? [] : teaches,
    classTeacherOf,
    results: !office || manage,
    // Exam Analysis is for people who see whole classes; teachers (Own) see their results only (approved design: Own pages are Datesheet, Marks Entry, Results).
    analysis: (!office || manage) && see === "all",
    principal: manage && roleKeys.some((k) => k === "principal" || k === "school-admin"),
  };
}

/** Sees results at all: anyone with Examination & Results, except Office Staff on their own (datesheets and admit cards only). As examScope().results, without the database. */
export function seesResults(who: Pick<Current, "permissions"> & { roles: { key: string | null }[] }) {
  const see = reachFor(who.permissions, "examination-results", "view");
  if (see === "none") return false;
  const office = see === "own" && who.roles.some((r) => r.key === "office-staff");
  return !office || reachFor(who.permissions, "examination-results", "edit") === "all";
}

/** May this person enter marks for this subject in this section? Server check (08 §5). */
export function teachesPaper(scope: ExamScope, sectionId: string, subjectId: string) {
  if (scope.office && !scope.manage) return false;
  if (scope.teaches === null) return seesSection(scope, sectionId);
  return scope.teaches.some((t) => t.sectionId === sectionId && t.subjectId === subjectId);
}

/**
 * The subjects whose marks this person sees in a section's results (owner's
 * rules, 12 Oct 2026: subject teachers see only their own subjects). null =
 * every subject: full reach, or the class teacher of the section. Otherwise
 * only the subjects given to them there in Teacher Allocation, and no
 * totals, ranks or overall results, which would show the other subjects.
 */
export function resultSubjects(scope: ExamScope, sectionId: string): string[] | null {
  if (scope.manage || scope.teaches === null || scope.classTeacherOf.includes(sectionId)) return null;
  return [...new Set(scope.teaches.filter((t) => t.sectionId === sectionId).map((t) => t.subjectId))];
}

export function seesSection(scope: ExamScope, sectionId: string) {
  return scope.sectionIds === null || scope.sectionIds.includes(sectionId);
}

/** Remarks and report cards: full reach, or the class teacher of the section. */
export function writesReportCards(scope: ExamScope, sectionId: string) {
  return (scope.manage && seesSection(scope, sectionId)) || scope.classTeacherOf.includes(sectionId);
}

/** Exams of the years this person sees (every year, unless limited to one campus): for where-clauses on Exam. */
export function examInScope(scope: Pick<ExamScope, "yearIds">): { academicYearId?: { in: string[] } } {
  return scope.yearIds ? { academicYearId: { in: scope.yearIds } } : {};
}

/** Is this year one this person sees (an exam's or a section's year)? */
export function seesYear(scope: Pick<ExamScope, "yearIds">, academicYearId: string) {
  return scope.yearIds === null || scope.yearIds.includes(academicYearId);
}

/** A section, exam or paper of another campus is "not found" for a person limited to one campus, so it stays unknown. */
export function assertYearInScope(scope: Pick<ExamScope, "yearIds">, academicYearId: string | null | undefined, what = "exam") {
  if (academicYearId && !seesYear(scope, academicYearId)) throw new ExamRuleError(`This ${what} was not found.`);
}

const YEAR_OF = {
  exam: async (tx: Tx, id: string) => (await tx.exam.findFirst({ where: { id }, select: { academicYearId: true } }))?.academicYearId,
  paper: async (tx: Tx, id: string) => (await tx.datesheetEntry.findFirst({ where: { id }, select: { exam: { select: { academicYearId: true } } } }))?.exam.academicYearId,
  section: async (tx: Tx, id: string) => (await tx.section.findFirst({ where: { id }, select: { academicYearId: true } }))?.academicYearId,
};

/**
 * For an id from a form or a link: refuses an exam, paper (datesheet entry) or section of another campus than the
 * person's with the not-found words. Whole-school people, and ids that do not exist, pass (the work says not found).
 */
export async function assertInScope(tx: Tx, scope: Pick<ExamScope, "yearIds">, kind: keyof typeof YEAR_OF, id: string | null | undefined) {
  if (!scope.yearIds || !id || !/^[0-9a-f-]{36}$/i.test(id)) return;
  assertYearInScope(scope, await YEAR_OF[kind](tx, id), kind);
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

/** Is this class one of the person's campus? Always, for the whole school. (Questions and papers belong to a class.) */
export async function classInScope(tx: Tx, scope: Pick<ExamScope, "campusId">, classId: string) {
  if (!scope.campusId) return true;
  return (await tx.schoolClass.count({ where: { id: classId, campusId: scope.campusId } })) > 0;
}
