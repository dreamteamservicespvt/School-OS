// QA (Chaitanya EM School audit), end-to-end simulations: the Grade 5 A week
// in small. Class 5 A is taken on 12, 13 and 14 Oct 2026; on 14 Oct (today)
// Aarav present, Diya absent, Ishaan on leave, Meera late, Rohan present.
// Then Aarav leaves by transfer with the leaving date 14 Oct (his marks stay
// stored), and Varun joins 5 A after the register was saved, with no mark.
// Class 5 B is not taken.
import { withSchool } from "@/lib/db";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { accessFor, as, at, d, makeAttendanceSchool, TZ } from "./fixture";

export const WEEK = ["2026-10-12", "2026-10-13", "2026-10-14"];
export const TODAY = "2026-10-14";

export async function makeSimSchool(name: string) {
  const f = await makeAttendanceSchool(name);
  const access = await accessFor(f, f.teacherA.id);
  const ctx = as(f, f.teacherA.id);
  for (const day of WEEK) {
    const today = day === TODAY;
    await withSchool(ctx, (tx) => saveClassAttendance(tx, ctx, access, {
      sectionId: f.sectionA.id, date: d(day), periodNo: 0, timeZone: TZ, now: at(day, "09:00"),
      entries: f.studentsA.map((s, i) => ({ studentId: s.id, statusKey: today ? ["present", "absent", "leave", "late", "present"][i] : "present" })),
    }));
  }
  const sys = { schoolId: f.school.id, userId: null };
  const ids = await withSchool(sys, async (tx) => {
    const aarav = f.studentsA[0].id;
    // What completing a transfer does (src/lib/students/leaving.ts completeLeaving).
    await tx.student.update({ where: { id: aarav }, data: { status: "TRANSFERRED", leavingDate: d(TODAY), leavingReason: "Family moved" } });
    await tx.enrolment.updateMany({ where: { studentId: aarav }, data: { status: "LEFT" } });
    const st = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: "ADM-NEW-1", firstName: "Varun", lastName: "Teja", fullName: "Varun Teja", status: "ACTIVE" } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.year.id, classId: f.cls.id, sectionId: f.sectionA.id, rollNo: 6 } });
    return { leaverId: aarav, newcomerId: st.id };
  });
  return { ...f, ...ids };
}

export type SimFixture = Awaited<ReturnType<typeof makeSimSchool>>;
