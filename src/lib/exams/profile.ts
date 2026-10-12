// Hand-off to Student Management (08 §4 Sends: "marks, results and report
// cards on the profile; results for promotion"). The Student Profile's Exams
// tab calls studentExamsTab(); the lead wires it in. It shows only what the
// viewer may see: full reach sees every result, a teacher sees students of
// their own sections, and draft results are marked as drafts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { examKey, finalKey, REPORT_STATUS_WORDS } from "./common";
import type { SubjectResult } from "./compute";
import { periodsForClass } from "./report-status";
import { seesSection, type ExamScope } from "./scope";

export type StudentExamsTab = {
  years: {
    yearId: string; year: string; section: string; sectionId: string;
    exams: { examId: string; title: string; from: Date; percent: number | null; grade: string | null; rank: number | null; outcome: string | null; status: "DRAFT" | "PUBLISHED"; complete: boolean; subjects: SubjectResult[] }[];
    final: { percent: number | null; grade: string | null; outcome: string | null; status: "DRAFT" | "PUBLISHED" } | null;
    reportCards: { period: string; label: string; status: string; ready: boolean }[];
  }[];
};

/** The Exams tab of a Student Profile: each year's exams with marks, the final result and report cards. */
export async function studentExamsTab(tx: Tx, ctx: SchoolContext, scope: ExamScope, studentId: string): Promise<StudentExamsTab | null> {
  if (!scope.results) return null;
  const rows = await tx.enrolment.findMany({ where: { studentId, archivedAt: null } });
  const [yearRows, sectionRows] = await Promise.all([
    tx.academicYear.findMany({ where: { id: { in: rows.map((r) => r.academicYearId) } }, select: { id: true, name: true, startDate: true } }),
    tx.section.findMany({ where: { id: { in: rows.map((r) => r.sectionId) } }, include: { schoolClass: true } }),
  ]);
  const enrolments = rows
    .map((r) => ({ ...r, academicYear: yearRows.find((y) => y.id === r.academicYearId)!, section: sectionRows.find((s) => s.id === r.sectionId)! }))
    .filter((r) => r.academicYear && r.section)
    .sort((a, b) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime());
  const visible = enrolments.filter((e) => seesSection(scope, e.sectionId));
  if (visible.length === 0) return null;
  const results = await tx.result.findMany({ where: { studentId, academicYearId: { in: visible.map((e) => e.academicYearId) } } });
  const exams = await tx.exam.findMany({ where: { id: { in: results.map((r) => r.examId).filter((x): x is string => Boolean(x)) } }, select: { id: true, title: true, startDate: true } });
  const cards = await tx.reportCard.findMany({ where: { studentId } });
  const years: StudentExamsTab["years"] = [];
  for (const e of visible) {
    const mine = results.filter((r) => r.academicYearId === e.academicYearId);
    const final = mine.find((r) => r.key === finalKey(e.academicYearId));
    const options = await periodsForClass(tx, e.academicYearId, e.section.classId);
    years.push({
      yearId: e.academicYearId, year: e.academicYear.name, section: `${e.section.schoolClass.name} ${e.section.name}`, sectionId: e.sectionId,
      exams: exams
        .filter((x) => mine.some((r) => r.key === examKey(x.id)))
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
        .map((x) => {
          const r = mine.find((m) => m.key === examKey(x.id))!;
          return { examId: x.id, title: x.title, from: x.startDate, percent: r.percent, grade: r.grade, rank: r.rank, outcome: r.outcome, status: r.status, complete: r.complete, subjects: (r.subjects as unknown as SubjectResult[]) ?? [] };
        }),
      final: final && final.complete ? { percent: final.percent, grade: final.grade, outcome: final.outcome, status: final.status } : null,
      reportCards: options.map((o) => {
        const c = cards.find((x) => x.period === o.key && x.academicYearId === e.academicYearId);
        const status = c?.status ?? "NOT_READY";
        return { period: o.key, label: o.label, status: REPORT_STATUS_WORDS[status], ready: status !== "NOT_READY" };
      }),
    });
  }
  return { years };
}

/** Results for promotion (Student Management): the published final outcome of each student in a year. */
export async function finalOutcomes(tx: Tx, yearId: string, studentIds: string[]) {
  const rows = await tx.result.findMany({ where: { key: finalKey(yearId), studentId: { in: studentIds }, status: "PUBLISHED" }, select: { studentId: true, outcome: true, percent: true, grade: true } });
  return new Map(rows.map((r) => [r.studentId, { outcome: r.outcome, percent: r.percent, grade: r.grade }]));
}
