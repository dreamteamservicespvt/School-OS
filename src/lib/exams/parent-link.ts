// Hand-off to Communication's Parent Link (08 §3, D4): published datesheets,
// and report cards once results are published, never before. Communication
// owns the page and decides which students a guardian's link covers; these
// loaders take those student ids and return only what parents may see.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import { time12, DAY_NAMES, weekday } from "../academic/common";
import { durationWords, endTime } from "./common";
import { periodsForClass, periodPublished } from "./report-status";
import { renderReportCards } from "./report-cards";

export type ParentDatesheet = {
  studentId: string; examId: string; title: string; from: string; to: string;
  papers: { date: string; day: string; time: string; subject: string; duration: string; maxMarks: string; room: string | null }[];
};

/** Published datesheets of this year (and not yet over by more than 30 days) for each student's class. */
export async function parentDatesheets(tx: Tx, ctx: SchoolContext, studentIds: string[], today: Date): Promise<ParentDatesheet[]> {
  void ctx;
  if (studentIds.length === 0) return [];
  const enrolments = await tx.enrolment.findMany({ where: { studentId: { in: studentIds }, archivedAt: null, status: "STUDYING" } });
  const years = await tx.academicYear.findMany({ where: { id: { in: enrolments.map((e) => e.academicYearId) }, status: "ACTIVE" }, select: { id: true } });
  const current = enrolments.filter((e) => years.some((y) => y.id === e.academicYearId));
  const cutoff = new Date(today.getTime() - 30 * 86_400_000);
  const out: ParentDatesheet[] = [];
  for (const e of current) {
    const exams = await tx.exam.findMany({
      where: { academicYearId: e.academicYearId, archivedAt: null, status: { not: "DRAFT" }, classIds: { has: e.classId }, endDate: { gte: cutoff } },
      include: { entries: { where: { classId: e.classId, archivedAt: null }, orderBy: [{ date: "asc" }, { startTime: "asc" }] } },
      orderBy: { startDate: "asc" },
    });
    const subjects = await tx.subject.findMany({ where: { id: { in: exams.flatMap((x) => x.entries.map((y) => y.subjectId)) } } });
    for (const x of exams) {
      const papers = x.entries.filter((p) => {
        const s = subjects.find((y) => y.id === p.subjectId);
        if (!s) return false;
        if ((s.type === "OPTIONAL" || s.type === "ELECTIVE") && e.optionalSubjects.length > 0) return e.optionalSubjects.includes(s.id);
        return true;
      });
      out.push({
        studentId: e.studentId, examId: x.id, title: x.title, from: formatDate(x.startDate), to: formatDate(x.endDate),
        papers: papers.map((p) => {
          const s = subjects.find((y) => y.id === p.subjectId)!;
          return { date: formatDate(p.date), day: DAY_NAMES[weekday(p.date)], time: `${time12(p.startTime)} to ${time12(endTime(p.startTime, p.durationMin))}`, subject: s.name, duration: durationWords(p.durationMin), maxMarks: s.gradeOnly ? "Graded" : String(p.maxMarks), room: p.room };
        }),
      });
    }
  }
  return out;
}

export type ParentReportCard = { studentId: string; yearId: string; year: string; period: string; label: string; publishedOn: string | null };

/** Report cards a guardian can download: only those whose results are all published. */
export async function parentReportCards(tx: Tx, ctx: SchoolContext, studentIds: string[]): Promise<ParentReportCard[]> {
  void ctx;
  if (studentIds.length === 0) return [];
  const enrolments = await tx.enrolment.findMany({ where: { studentId: { in: studentIds }, archivedAt: null } });
  const years = await tx.academicYear.findMany({ where: { id: { in: enrolments.map((e) => e.academicYearId) } }, select: { id: true, name: true, startDate: true } });
  const out: ParentReportCard[] = [];
  for (const e of enrolments) {
    const year = years.find((y) => y.id === e.academicYearId);
    if (!year) continue;
    for (const o of await periodsForClass(tx, e.academicYearId, e.classId)) {
      if (!(await periodPublished(tx, e.studentId, o))) continue;
      const last = await tx.result.findFirst({ where: { studentId: e.studentId, key: { in: o.resultKeys }, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { publishedAt: true } });
      out.push({ studentId: e.studentId, yearId: e.academicYearId, year: year.name, period: o.key, label: o.label, publishedOn: last?.publishedAt ? formatDate(last.publishedAt) : null });
    }
  }
  return out.sort((a, b) => b.year.localeCompare(a.year));
}

/**
 * The report card PDF for a guardian. Returns null unless every result on it
 * is published (08 Done when 11), so an unpublished result is never shown.
 */
export async function parentReportCardPdf(tx: Tx, ctx: SchoolContext, studentId: string, yearId: string, period: string) {
  const e = await tx.enrolment.findFirst({ where: { studentId, academicYearId: yearId, archivedAt: null } });
  if (!e) return null;
  const option = (await periodsForClass(tx, yearId, e.classId)).find((o) => o.key === period);
  if (!option || !(await periodPublished(tx, studentId, option))) return null;
  const doc = await renderReportCards(tx, ctx, [{ studentId, sectionId: e.sectionId }], period);
  return { body: await doc.pdf(), fileName: `report-card-${option.label}`.replace(/[^\w-]+/g, "-").toLowerCase() + ".pdf" };
}
