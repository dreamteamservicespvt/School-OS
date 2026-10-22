// Academic Management for other modules (04 §4 "Sends"): years, classes and
// sections, subjects, teachers' periods, holidays, free teachers and the
// leave hook. Import from "@/lib/academic" rather than the files inside.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { subjectsForClass } from "./subjects";

export { currentYear, chosenYear, isYearClosed, assertYearOpen, assertYearWritable, ClosedYearError, financialYearFor } from "./years";
export { isHoliday, dayOff, dayOffOf, holidaysBetween, examDayOn } from "./calendar";
export { periodsForStaffOnDate, periodsForSectionOnDate, effectiveVersion } from "./timetable";
export { freeTeachersAt, raiseForLeave, releaseForLeave, absentStaffOn } from "./substitutions";
export { subjectsForClass, mapActiveOn } from "./subjects";
export { allocationActiveOn, teacherWorkloads } from "./allocation";
export { academicSettings, mainCampusId, periodSlots } from "./settings";

/** The sections of a year in class order, with "Class 5 A" labels. */
export async function sectionsForYear(tx: Tx, ctx: SchoolContext, yearId: string, opts: { campusId?: string; sectionIds?: string[] | null } = {}) {
  const rows = await tx.section.findMany({
    where: {
      schoolId: ctx.schoolId, academicYearId: yearId, archivedAt: null,
      schoolClass: { archivedAt: null, ...(opts.campusId ? { campusId: opts.campusId } : {}) },
      ...(opts.sectionIds ? { id: { in: opts.sectionIds } } : {}),
    },
    include: { schoolClass: { select: { id: true, name: true, sortOrder: true, board: true } } },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id, name: s.name, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, board: s.schoolClass.board,
    seats: s.seats, classTeacherId: s.classTeacherId, room: s.room, streamId: s.streamId,
  }));
}

/** The subjects taught in a section's class on a date (from the subject map with dates). */
export async function subjectsForSection(tx: Tx, sectionId: string, date: Date) {
  const section = await tx.section.findFirst({ where: { id: sectionId }, select: { classId: true } });
  if (!section) return [];
  return subjectsForClass(tx, section.classId, date);
}

/** Teachers allocated to a section (who enters marks, who takes attendance), main teacher first. */
export async function teachersForSection(tx: Tx, sectionId: string, date: Date) {
  const rows = await tx.teacherAllocation.findMany({
    where: { sectionId, archivedAt: null, AND: [{ OR: [{ fromDate: null }, { fromDate: { lte: date } }] }, { OR: [{ toDate: null }, { toDate: { gte: date } }] }] },
    orderBy: { isMain: "desc" },
  });
  return rows.map((r) => ({ staffId: r.staffId, subjectId: r.subjectId, isMain: r.isMain }));
}
