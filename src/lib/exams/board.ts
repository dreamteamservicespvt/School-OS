// The Datesheet page's summary (08 §2 Datesheet): one card per exam with its
// dates, students, subjects, who saved or published it and what is still to
// do, and the numbers at the top for the exam that comes next.
import "server-only";

import type { Tx } from "../db";
import { formatDate } from "../format";
import { examKey, shownExamStatus, type ShownExamStatus } from "./common";
import type { ExamScope } from "./scope";

export type DatesheetCard = {
  id: string; title: string; classes: string[]; classIds: string[]; term: string; pattern: string; status: ShownExamStatus; archived: boolean;
  startDate: Date; endDate: Date; students: number; subjects: number; papers: number; note: string; extra: string;
};

async function names(tx: Tx, userIds: string[]) {
  const rows = await tx.userLogin.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

/** Extra words for each card: who did what last, and what is left to do. */
export async function cardNotes(tx: Tx, exams: { id: string; status: string; startDate: Date; endDate: Date; classIds: string[]; academicYearId?: string; createdById: string | null; updatedById: string | null; publishedById: string | null; publishedAt: Date | null; updatedAt: Date; resultsPublishedAt: Date | null }[], students: Map<string, number>, today: Date, tz: string) {
  const ids = exams.map((e) => e.id);
  const [people, missing, prints, results, scheduled, sectionCounts] = await Promise.all([
    names(tx, [...new Set(exams.flatMap((e) => [e.updatedById ?? e.createdById, e.publishedById]).filter((x): x is string => Boolean(x)))]),
    tx.datesheetEntry.groupBy({ by: ["examId"], where: { examId: { in: ids }, archivedAt: null, OR: [{ room: null }, { invigilatorId: null }] }, _count: true }),
    tx.admitCardPrint.groupBy({ by: ["examId"], where: { examId: { in: ids }, studentId: null }, _sum: { count: true } }),
    tx.result.groupBy({ by: ["key", "sectionId"], where: { key: { in: ids.map(examKey) }, status: "PUBLISHED" } }),
    tx.resultPublication.findMany({ where: { examId: { in: ids }, status: "scheduled" }, orderBy: { publishOn: "asc" } }),
    tx.section.groupBy({ by: ["classId"], where: { classId: { in: [...new Set(exams.flatMap((e) => e.classIds))] }, archivedAt: null, ...(exams[0]?.academicYearId ? { academicYearId: exams[0].academicYearId } : {}) }, _count: true }),
  ]);
  const out = new Map<string, { note: string; extra: string; printed: number; sections: number }>();
  for (const e of exams) {
    const shown = shownExamStatus(e as never, today);
    const by = (id: string | null) => (id ? people.get(id) : null);
    const sections = sectionCounts.filter((s) => e.classIds.includes(s.classId)).reduce((n, s) => n + s._count, 0);
    const printed = prints.find((p) => p.examId === e.id)?._sum.count ?? 0;
    const pub = results.filter((r) => r.key === examKey(e.id)).length;
    const sched = scheduled.find((s) => s.examId === e.id);
    const n = students.get(e.id) ?? 0;
    let note = "";
    let extra = "";
    if (shown === "Draft") {
      const who = by(e.updatedById ?? e.createdById);
      note = `Saved ${formatDate(e.updatedAt, tz)}${who ? ` by ${who}` : ""}`;
      const m = missing.find((x) => x.examId === e.id)?._count ?? 0;
      extra = m ? `Room or invigilator not set for ${m} ${m === 1 ? "paper" : "papers"}` : "Ready to publish";
    } else if (shown === "Results published") {
      note = `Results published ${e.resultsPublishedAt ? formatDate(e.resultsPublishedAt, tz) : ""}`.trim();
      extra = "Report cards on Parent Link";
    } else if (shown === "Completed") {
      note = pub ? `Results published for ${pub} of ${sections} sections` : "Marks entry and results in progress";
      extra = sched ? `The rest publish on ${formatDate(sched.publishOn, tz)}` : pub ? "The rest are waiting to be published" : "Results not published yet";
    } else {
      const who = by(e.publishedById);
      note = `Published ${e.publishedAt ? formatDate(e.publishedAt, tz) : ""}${who ? ` by ${who}` : ""}`;
      extra = `${Math.min(printed, n)} of ${n} admit cards printed`;
    }
    out.set(e.id, { note, extra, printed, sections });
  }
  return out;
}

/** Students sitting each exam (studying in its classes this year). */
export async function studentsPerExam(tx: Tx, yearId: string, exams: { id: string; classIds: string[] }[]) {
  const counts = await tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: yearId, classId: { in: [...new Set(exams.flatMap((e) => e.classIds))] }, archivedAt: null, status: "STUDYING" }, _count: true });
  return new Map(exams.map((e) => [e.id, counts.filter((c) => e.classIds.includes(c.classId)).reduce((n, c) => n + c._count, 0)]));
}

/**
 * The exam the top of the page is about: the one running now, else the next
 * published one, else the next draft. Null when there is none ahead.
 */
export async function nextExam(tx: Tx, yearId: string, today: Date, onlyClassIds: string[] | null) {
  const where = { academicYearId: yearId, archivedAt: null, endDate: { gte: today }, ...(onlyClassIds ? { classIds: { hasSome: onlyClassIds } } : {}) };
  return (await tx.exam.findFirst({ where: { ...where, status: { not: "DRAFT" } }, orderBy: { startDate: "asc" } }))
    ?? tx.exam.findFirst({ where: { ...where, status: "DRAFT" }, orderBy: { startDate: "asc" } });
}

/** The numbers for the top of the Datesheet page, for the next exam. */
export async function nextExamNumbers(tx: Tx, exam: { id: string; classIds: string[]; academicYearId: string }, scope: ExamScope) {
  const [entries, sections, students, prints] = await Promise.all([
    tx.datesheetEntry.findMany({ where: { examId: exam.id, archivedAt: null }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    tx.section.findMany({ where: { classId: { in: exam.classIds }, academicYearId: exam.academicYearId, archivedAt: null }, include: { schoolClass: { select: { name: true } } } }),
    tx.enrolment.findMany({ where: { classId: { in: exam.classIds }, academicYearId: exam.academicYearId, archivedAt: null, status: "STUDYING" }, select: { sectionId: true, student: { select: { photoFileId: true } } } }),
    tx.admitCardPrint.aggregate({ where: { examId: exam.id, studentId: null }, _sum: { count: true } }),
  ]);
  const papers = entries.reduce((n, e) => n + sections.filter((s) => s.classId === e.classId).length, 0);
  const perClass = entries.length / Math.max(1, new Set(entries.map((e) => e.classId)).size);
  const mine = scope.teaches ? entries.filter((e) => scope.teaches!.some((t) => t.subjectId === e.subjectId && sections.some((s) => s.id === t.sectionId && s.classId === e.classId))) : [];
  const duties = scope.staffId ? entries.filter((e) => e.invigilatorId === scope.staffId) : [];
  const subjects = await tx.subject.findMany({ where: { id: { in: [...new Set([...mine, ...duties].map((e) => e.subjectId))] } }, select: { id: true, name: true } });
  const classNames = new Map(sections.map((s) => [s.classId, s.schoolClass.name]));
  return {
    papers, perClass: Math.round(perClass), sections: sections.length, students: students.length,
    noPhoto: students.filter((s) => !s.student.photoFileId).length,
    printed: Math.min(students.length, prints._sum.count ?? 0),
    first: entries[0] ?? null,
    mine: mine.map((e) => ({ date: e.date, subject: subjects.find((s) => s.id === e.subjectId)?.name ?? "", className: classNames.get(e.classId) ?? "", due: e.marksDueDate })),
    duties: duties.map((e) => ({ date: e.date, startTime: e.startTime, room: e.room, subject: subjects.find((s) => s.id === e.subjectId)?.name ?? "", className: classNames.get(e.classId) ?? "" })),
  };
}
