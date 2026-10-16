// The students who sit a paper: the section's students in roll order. For an
// optional or elective subject, only those who chose it, once choices are
// recorded for the section (Student Management, Enrolment).
import "server-only";

import type { Tx } from "../db";

export type RosterStudent = {
  studentId: string;
  name: string;
  rollNo: number | null;
  admissionNo: string;
  photoFileId: string | null;
  optionalSubjects: string[];
  gender: string | null;
  dateOfBirth: Date | null;
  sectionId: string;
  classId: string;
};

export async function sectionStudents(tx: Tx, sectionIds: string[], yearId: string): Promise<RosterStudent[]> {
  if (sectionIds.length === 0) return [];
  const rows = await tx.enrolment.findMany({
    where: { sectionId: { in: sectionIds }, academicYearId: yearId, archivedAt: null, status: "STUDYING", student: { archivedAt: null } },
    include: { student: { select: { id: true, fullName: true, admissionNo: true, photoFileId: true, gender: true, dateOfBirth: true } } },
  });
  return rows
    .map((r) => ({
      studentId: r.student.id, name: r.student.fullName, rollNo: r.rollNo, admissionNo: r.student.admissionNo, photoFileId: r.student.photoFileId,
      optionalSubjects: r.optionalSubjects, gender: r.student.gender, dateOfBirth: r.student.dateOfBirth, sectionId: r.sectionId, classId: r.classId,
    }))
    .sort((a, b) => (a.sectionId === b.sectionId ? (a.rollNo ?? 9999) - (b.rollNo ?? 9999) || a.name.localeCompare(b.name) : a.sectionId.localeCompare(b.sectionId)));
}

/** Who sits a subject: everyone, or for an optional subject with recorded choices, only those who chose it. */
export function sitters(students: RosterStudent[], subject: { id: string; type: string }): RosterStudent[] {
  if (subject.type !== "OPTIONAL" && subject.type !== "ELECTIVE") return students;
  const chose = students.filter((s) => s.optionalSubjects.includes(subject.id));
  const anyChoices = students.some((s) => s.optionalSubjects.length > 0);
  return anyChoices ? chose : students;
}
