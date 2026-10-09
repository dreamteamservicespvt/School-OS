// Timed and background work of Examination & Results. Imported by
// src/lib/job-registry.ts. Each one is safe to run twice.
// - Results set to publish on a date publish by themselves (A9).
// - Exam reminders to parents before each exam day (A10), and a reminder to
//   subject teachers when marks are due.
// - Report cards for a whole class as one PDF (P9), made in the background.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineJob, defineSchedule } from "../jobs";
import { notify } from "../notifications";
import { fileStore } from "../storage";
import { formatDate } from "../format";
import { todayIn, addDays, isoDay, plural } from "../academic/common";
import { publishDue } from "./results";
import { messageParents } from "./notify-parents";
import { renderReportCards } from "./report-cards";
import { sectionInfo } from "./results";
import { findPeriod } from "./report-cards";
import { sectionStudents, sitters } from "./roster";
import { isDone } from "./marks";
import { time12 } from "../academic/common";

async function schoolToday(tx: Tx, schoolId: string, now: Date) {
  const s = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
  return todayIn(s?.timeZone ?? "Asia/Kolkata", now);
}

/** Reminds parents of the papers on the exam day that is `reminderDaysBefore` away. One message per student per day. */
export async function sendExamReminders(tx: Tx, ctx: SchoolContext, today: Date) {
  const settings = await tx.examSettings.findUnique({ where: { schoolId: ctx.schoolId } });
  const before = settings?.reminderDaysBefore ?? 1;
  if (before <= 0) return 0;
  const day = addDays(today, before);
  const entries = await tx.datesheetEntry.findMany({ where: { date: day, archivedAt: null, reminderSentAt: null, exam: { archivedAt: null, status: { not: "DRAFT" } } }, include: { exam: true } });
  if (entries.length === 0) return 0;
  const subjects = await tx.subject.findMany({ where: { id: { in: entries.map((e) => e.subjectId) } } });
  let sent = 0;
  const byClass = new Map<string, typeof entries>();
  for (const e of entries) byClass.set(`${e.examId}|${e.classId}`, [...(byClass.get(`${e.examId}|${e.classId}`) ?? []), e]);
  for (const list of byClass.values()) {
    const exam = list[0].exam;
    const sections = await tx.section.findMany({ where: { classId: list[0].classId, academicYearId: exam.academicYearId, archivedAt: null }, select: { id: true } });
    const roster = await sectionStudents(tx, sections.map((s) => s.id), exam.academicYearId);
    // Each student is told only of the papers they write.
    const perStudent = new Map<string, string[]>();
    for (const e of list.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      const subject = subjects.find((s) => s.id === e.subjectId);
      if (!subject) continue;
      for (const s of sitters(roster, subject)) perStudent.set(s.studentId, [...(perStudent.get(s.studentId) ?? []), `${subject.name} at ${time12(e.startTime)}`]);
    }
    const groups = new Map<string, string[]>();
    for (const [studentId, papers] of perStudent) groups.set(papers.join(", "), [...(groups.get(papers.join(", ")) ?? []), studentId]);
    for (const [papers, studentIds] of groups) {
      const r = await messageParents(tx, ctx, {
        template: "exam-reminder", studentIds,
        idempotencyKey: `exam-reminder:${exam.id}:${list[0].classId}:${isoDay(day)}:${papers}`,
        vars: { exam: exam.title, date: formatDate(day), papers },
        text: `Reminder: ${exam.title} on ${formatDate(day)}: ${papers}. Please carry the admit card.`,
      });
      sent += r.recipients;
    }
    await tx.datesheetEntry.updateMany({ where: { id: { in: list.map((e) => e.id) } }, data: { reminderSentAt: new Date() } });
  }
  return sent;
}

/** Tells subject teachers, once, on the day their marks are due, which papers are not submitted. */
export async function remindMarksDue(tx: Tx, ctx: SchoolContext, today: Date) {
  const entries = await tx.datesheetEntry.findMany({ where: { marksDueDate: today, archivedAt: null, exam: { archivedAt: null, status: "PUBLISHED" } }, include: { exam: true } });
  let told = 0;
  for (const e of entries) {
    const sections = await tx.section.findMany({ where: { classId: e.classId, academicYearId: e.exam.academicYearId, archivedAt: null }, include: { schoolClass: true } });
    const papers = await tx.marksPaper.findMany({ where: { entryId: e.id } });
    const subject = await tx.subject.findFirst({ where: { id: e.subjectId } });
    if (!subject) continue;
    const roster = await sectionStudents(tx, sections.map((s) => s.id), e.exam.academicYearId);
    const marks = await tx.marks.findMany({ where: { entryId: e.id }, select: { studentId: true, sectionId: true, absent: true, total: true, grade: true } });
    for (const s of sections) {
      const p = papers.find((x) => x.sectionId === s.id);
      if (p && (p.status === "SUBMITTED" || p.status === "LOCKED")) continue;
      const sits = sitters(roster.filter((r) => r.sectionId === s.id), subject);
      const done = sits.filter((x) => isDone(marks.find((m) => m.studentId === x.studentId && m.sectionId === s.id), subject.gradeOnly)).length;
      const allocs = await tx.teacherAllocation.findMany({ where: { sectionId: s.id, subjectId: e.subjectId, archivedAt: null }, select: { staffId: true } });
      const staff = await tx.staff.findMany({ where: { id: { in: allocs.map((a) => a.staffId) }, userLoginId: { not: null } }, select: { userLoginId: true } });
      for (const t of staff) {
        await notify(tx, ctx, {
          to: t.userLoginId!, type: "marks-due",
          text: `${e.exam.title}: ${subject.name} marks for ${s.schoolClass.name} ${s.name} are due today. ${done} of ${plural(sits.length, "student")} entered.`,
          link: `/examination-results/marks-entry/${e.id}/${s.id}`,
          groupKey: `marks-due:${e.id}:${s.id}:${isoDay(today)}`,
        });
        told++;
      }
    }
  }
  return told;
}

/** Makes the report cards of a section as one PDF, keeps it as a file and tells the person who asked. */
export async function makeReportCardsPdf(tx: Tx, ctx: SchoolContext, payload: { sectionId: string; period: string; studentIds: string[] }) {
  const section = await sectionInfo(tx, payload.sectionId);
  const option = await findPeriod(tx, section.academicYearId, section.classId, payload.period);
  if (!option) throw new Error("The report card period was not found.");
  const doc = await renderReportCards(tx, ctx, payload.studentIds.map((studentId) => ({ studentId, sectionId: payload.sectionId })), payload.period);
  const body = await doc.pdf();
  const name = `report-cards-${section.label}-${option.label}`.replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 120) + ".pdf";
  const id = crypto.randomUUID();
  const key = `${ctx.schoolId}/report-cards/${id}`;
  await fileStore().put(key, body, "application/pdf");
  const file = await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: name, contentType: "application/pdf", sizeBytes: body.length, purpose: "report-cards", uploadedById: ctx.userId } });
  if (ctx.userId) {
    await notify(tx, ctx, {
      to: ctx.userId, type: "report-cards-ready",
      text: `Report cards for ${section.label} (${option.label}) are ready: ${plural(payload.studentIds.length, "student")} in one PDF.`,
      link: `/examination-results/report-cards/file/${file.id}`,
    });
  }
  return { fileId: file.id, count: payload.studentIds.length };
}

defineSchedule("exam-results-publish", 10, (tx, ctx, now) => publishDue(tx, ctx, now));
defineSchedule("exam-reminders", 60, async (tx, ctx, now) => sendExamReminders(tx, ctx, await schoolToday(tx, ctx.schoolId, now)));
defineSchedule("exam-marks-due", 6 * 60, async (tx, ctx, now) => remindMarksDue(tx, ctx, await schoolToday(tx, ctx.schoolId, now)));
defineJob("exams:report-cards-pdf", "Report cards PDF", async (tx, ctx, payload) => {
  const r = await makeReportCardsPdf(tx, ctx, payload as { sectionId: string; period: string; studentIds: string[] });
  return r;
}, { ownTransaction: true });
