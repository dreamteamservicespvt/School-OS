// Report card periods and their status (08 §2 Report Cards): a report card
// is for one exam, a term (all its exams) or the whole year (the final
// result). It is Ready once every result it shows is published, and goes back
// to Not ready if a result is unpublished. Printed and Sent are kept.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { examKey, finalKey, periodKey, type Period } from "./common";

export type PeriodOption = { key: string; period: Period; label: string; examIds: string[]; resultKeys: string[] };

/** The report card periods of a class in a year: each exam, each term with exams, and the whole year. */
export async function periodsForClass(tx: Tx, yearId: string, classId: string): Promise<PeriodOption[]> {
  const [exams, terms] = await Promise.all([
    tx.exam.findMany({ where: { academicYearId: yearId, archivedAt: null, classIds: { has: classId }, status: { not: "DRAFT" } }, orderBy: { startDate: "asc" } }),
    tx.term.findMany({ where: { academicYearId: yearId, archivedAt: null }, orderBy: { sortOrder: "asc" } }),
  ]);
  const out: PeriodOption[] = exams.map((e) => ({ key: periodKey({ kind: "exam", examId: e.id }), period: { kind: "exam", examId: e.id }, label: e.title, examIds: [e.id], resultKeys: [examKey(e.id)] }));
  for (const t of terms) {
    const inTerm = exams.filter((e) => e.termId === t.id);
    if (inTerm.length > 1) out.push({ key: periodKey({ kind: "term", termId: t.id }), period: { kind: "term", termId: t.id }, label: `${t.name} (${inTerm.map((e) => e.title).join(", ")})`, examIds: inTerm.map((e) => e.id), resultKeys: inTerm.map((e) => examKey(e.id)) });
  }
  if (exams.length) out.push({ key: "year", period: { kind: "year" }, label: "Whole year (final result)", examIds: exams.map((e) => e.id), resultKeys: [...exams.map((e) => examKey(e.id)), finalKey(yearId)] });
  return out;
}

/** True when every result a report card shows is published for this student. */
export async function periodPublished(tx: Tx, studentId: string, option: PeriodOption) {
  const needed = option.period.kind === "year" ? option.resultKeys.filter((k) => k.startsWith("final:")) : option.resultKeys;
  if (needed.length === 0) return false;
  const rows = await tx.result.findMany({ where: { studentId, key: { in: needed }, status: "PUBLISHED" }, select: { key: true } });
  return needed.every((k) => rows.some((r) => r.key === k));
}

/** Brings report card rows of some sections in step with their results. Safe to run twice. */
export async function refreshReportCards(tx: Tx, ctx: SchoolContext, yearId: string, sectionIds: string[]) {
  for (const sectionId of sectionIds) {
    const section = await tx.section.findFirst({ where: { id: sectionId }, select: { classId: true } });
    if (!section) continue;
    const options = await periodsForClass(tx, yearId, section.classId);
    const enrolments = await tx.enrolment.findMany({ where: { sectionId, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true } });
    const studentIds = enrolments.map((e) => e.studentId);
    const published = await tx.result.findMany({ where: { studentId: { in: studentIds }, status: "PUBLISHED" }, select: { key: true, studentId: true } });
    const cards = await tx.reportCard.findMany({ where: { sectionId, academicYearId: yearId } });
    for (const o of options) {
      const needed = o.period.kind === "year" ? o.resultKeys.filter((k) => k.startsWith("final:")) : o.resultKeys;
      for (const studentId of studentIds) {
        const ok = needed.length > 0 && needed.every((k) => published.some((p) => p.studentId === studentId && p.key === k));
        const card = cards.find((c) => c.studentId === studentId && c.period === o.key);
        if (!card) {
          if (ok) await tx.reportCard.create({ data: { schoolId: ctx.schoolId, academicYearId: yearId, studentId, sectionId, period: o.key, status: "READY" } });
          continue;
        }
        const status = !ok ? "NOT_READY" : card.status === "NOT_READY" ? "READY" : card.status;
        if (status !== card.status) await tx.reportCard.update({ where: { id: card.id }, data: { status } });
      }
    }
  }
}
