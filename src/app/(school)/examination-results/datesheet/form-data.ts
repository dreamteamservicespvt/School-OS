// Everything the datesheet form needs: classes with their subjects and
// subject teachers, exam types, terms, grade scales, staff for invigilation,
// each class's default pattern, and the exam being edited.
import "server-only";

import { withSchool } from "@/lib/db";
import { isoDay } from "@/lib/academic/common";
import { subjectsForClass } from "@/lib/academic/subjects";
import { examSettings, gradeScales } from "@/lib/exams/settings";
import { campusHolidays, examDetail, marksExist } from "@/lib/exams/datesheet";
import { inCampus } from "@/lib/campus";
import type { ExamPage } from "../_lib/page";

export type FormClass = { id: string; name: string; pattern: string; subjects: { id: string; name: string; gradeOnly: boolean; teacherId: string | null }[] };
export type FormRow = { classId: string; subjectId: string; date: string; startTime: string; durationMin: number; room: string; invigilatorId: string; maxMarks: number; pattern: string };
export type FormData = {
  yearId: string; yearName: string; yearStart: string; yearEnd: string; today: string;
  classes: FormClass[]; types: { id: string; name: string }[]; terms: { id: string; name: string; start: string; end: string }[];
  scales: { id: string; name: string }[]; staff: { id: string; name: string }[];
  holidays: { from: string; to: string; title: string }[];
  exam: null | { id: string; title: string; examTypeId: string; pattern: string; termId: string; startDate: string; endDate: string; classIds: string[]; gradeScaleId: string; rows: FormRow[]; locked: boolean; status: string };
};

export async function datesheetFormData(page: ExamPage, examId: string | null): Promise<FormData | null> {
  const year = page.year!;
  return withSchool(page.current.ctx, async (tx) => {
    const detail = examId ? await examDetail(tx, examId, { scope: page.scope }) : null;
    if (examId && !detail) return null;
    const [settings, types, terms, scales, sections, staff, holidays] = await Promise.all([
      examSettings(tx, page.current.ctx),
      tx.examType.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
      tx.term.findMany({ where: { academicYearId: year.id, archivedAt: null }, orderBy: { sortOrder: "asc" } }),
      gradeScales(tx, page.current.ctx),
      tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null }, include: { schoolClass: true }, orderBy: { schoolClass: { sortOrder: "asc" } } }),
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...inCampus(page.current) }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
      tx.calendarEntry.findMany({ where: { ...campusHolidays(page.campusId), startDate: { lte: year.endDate }, endDate: { gte: year.startDate } }, select: { startDate: true, endDate: true, title: true } }),
    ]);
    const classMap = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const s of sections) if (!s.schoolClass.archivedAt) classMap.set(s.classId, { id: s.classId, name: s.schoolClass.name, sortOrder: s.schoolClass.sortOrder });
    const allocs = await tx.teacherAllocation.findMany({ where: { academicYearId: year.id, archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] });
    const sectionClass = new Map(sections.map((s) => [s.id, s.classId]));
    const when = detail ? detail.exam.startDate : page.today;
    const classes: FormClass[] = [];
    for (const c of [...classMap.values()].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const subjects = await subjectsForClass(tx, c.id, when);
      classes.push({
        id: c.id, name: c.name, pattern: settings.classPatterns[c.id] ?? "PERCENTAGE",
        subjects: subjects.map((s) => ({ id: s.id, name: s.name, gradeOnly: s.gradeOnly, teacherId: allocs.find((a) => a.subjectId === s.id && sectionClass.get(a.sectionId) === c.id)?.staffId ?? null })),
      });
    }
    const today = isoDay(page.today);
    return {
      yearId: year.id, yearName: year.name, yearStart: isoDay(year.startDate), yearEnd: isoDay(year.endDate), today,
      classes, types: types.map((t) => ({ id: t.id, name: t.name })),
      terms: terms.map((t) => ({ id: t.id, name: t.name, start: isoDay(t.startDate), end: isoDay(t.endDate) })),
      scales: scales.map((s) => ({ id: s.id, name: s.name })), staff: staff.map((s) => ({ id: s.id, name: s.fullName })),
      holidays: holidays.map((h) => ({ from: isoDay(h.startDate), to: isoDay(h.endDate), title: h.title })),
      exam: detail ? {
        id: detail.exam.id, title: detail.exam.title, examTypeId: detail.exam.examTypeId, pattern: detail.exam.pattern, termId: detail.exam.termId,
        startDate: isoDay(detail.exam.startDate), endDate: isoDay(detail.exam.endDate), classIds: detail.exam.classIds, gradeScaleId: detail.exam.gradeScaleId ?? "",
        rows: detail.entries.map((e) => ({ classId: e.classId, subjectId: e.subjectId, date: isoDay(e.date), startTime: e.startTime, durationMin: e.durationMin, room: e.room ?? "", invigilatorId: e.invigilatorId ?? "", maxMarks: e.maxMarks, pattern: e.pattern ?? "" })),
        locked: await marksExist(tx, detail.exam.id), status: detail.exam.status,
      } : null,
    };
  });
}
