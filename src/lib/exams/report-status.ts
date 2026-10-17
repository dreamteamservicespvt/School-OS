// Report card periods and their status (08 §2 Report Cards): a report card
// is for one exam, a term (all its exams) or the whole year (the final
// result). It is Ready once every result it shows is published, and goes back
// to Not ready if a result is unpublished. Printed and Sent are kept.
// A student who joined after an exam ("Joined after this exam") gets no report
// card for that exam; a term card shows the term's other exams.
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

/** The results a report card waits for: the final result for the year, else each exam of the period. */
export function neededKeys(option: PeriodOption) {
  return option.period.kind === "year" ? option.resultKeys.filter((k) => k.startsWith("final:")) : option.resultKeys;
}

/**
 * Is a report card ready, from one student's results: every result it needs is
 * published, or (on a term card) left out because the student joined after
 * that exam, as long as at least one is published.
 */
export function cardReady(needed: string[], rows: { key: string; status: string; leftOut: boolean }[]) {
  if (needed.length === 0) return false;
  const published = (k: string) => rows.some((r) => r.key === k && r.status === "PUBLISHED");
  const leftOut = (k: string) => rows.some((r) => r.key === k && r.leftOut);
  return needed.some(published) && needed.every((k) => published(k) || (needed.length > 1 && leftOut(k)));
}

/** True when every result a report card shows is published for this student. */
export async function periodPublished(tx: Tx, studentId: string, option: PeriodOption) {
  const needed = neededKeys(option);
  if (needed.length === 0) return false;
  const rows = await tx.result.findMany({ where: { studentId, key: { in: needed } }, select: { key: true, status: true, leftOut: true } });
  return cardReady(needed, rows);
}

/** Brings report card rows of some sections in step with their results. Safe to run twice. */
export async function refreshReportCards(tx: Tx, ctx: SchoolContext, yearId: string, sectionIds: string[]) {
  for (const sectionId of sectionIds) {
    const section = await tx.section.findFirst({ where: { id: sectionId }, select: { classId: true } });
    if (!section) continue;
    const options = await periodsForClass(tx, yearId, section.classId);
    const enrolments = await tx.enrolment.findMany({ where: { sectionId, academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true } });
    const studentIds = enrolments.map((e) => e.studentId);
    const results = await tx.result.findMany({ where: { studentId: { in: studentIds }, academicYearId: yearId, OR: [{ status: "PUBLISHED" }, { leftOut: true }] }, select: { key: true, studentId: true, status: true, leftOut: true } });
    // Found by student, not by section: a report card (with its remarks) follows a student who changed section (G23).
    const cards = await tx.reportCard.findMany({ where: { studentId: { in: studentIds }, academicYearId: yearId } });
    for (const o of options) {
      const needed = neededKeys(o);
      for (const studentId of studentIds) {
        const ok = cardReady(needed, results.filter((r) => r.studentId === studentId));
        const card = cards.find((c) => c.studentId === studentId && c.period === o.key);
        if (!card) {
          if (ok) await tx.reportCard.create({ data: { schoolId: ctx.schoolId, academicYearId: yearId, studentId, sectionId, period: o.key, status: "READY" } });
          continue;
        }
        const status = !ok ? "NOT_READY" : card.status === "NOT_READY" ? "READY" : card.status;
        if (status !== card.status || card.sectionId !== sectionId) await tx.reportCard.update({ where: { id: card.id }, data: { status, sectionId } });
      }
    }
  }
}
