// A small school for Attendance tests: one year, a holiday, two sections of
// Class 5 with five students each (and their parents), a class teacher for
// each, a principal, an HR person and an office person, staff, and the
// student leave types.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { attendanceAccess, type AccessSource } from "@/lib/attendance/access";
import { ensureAttendanceDefaults } from "@/lib/attendance/settings";
import { makeSchool, makeUser } from "../helpers";

export const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** An instant in India time: at("2026-10-06", "09:15"). */
export const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00+05:30`);
export const TZ = "Asia/Kolkata";

export async function makeAttendanceSchool(name = "Attendance Test School") {
  const school = await makeSchool(name);
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal Person" });
  const teacherA = await makeUser({ schools: [{ id: school.id, roleKeys: ["class-teacher"] }], name: "Ravi Teja" });
  const teacherB = await makeUser({ schools: [{ id: school.id, roleKeys: ["class-teacher"] }], name: "Kavitha Nair" });
  const admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Admin Person" });
  const hrLogin = await makeUser({ schools: [{ id: school.id, roleKeys: ["hr"] }], name: "HR Person" });
  const officeLogin = await makeUser({ schools: [{ id: school.id, roleKeys: ["office-staff"] }], name: "Office Person" });
  const sid = school.id;
  const campusId = school.campus.id;
  const ctx = { schoolId: sid, userId: null };
  const ids = await withSchool(ctx, async (tx) => {
    // Role templates start switched off; switch on the two used here.
    await tx.role.updateMany({ where: { key: { in: ["hr", "office-staff"] } }, data: { isEnabled: true } });
    const year = await tx.academicYear.create({ data: { schoolId: sid, campusId, name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31"), status: "ACTIVE" } });
    await tx.term.create({ data: { schoolId: sid, academicYearId: year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-09-30"), sortOrder: 1 } });
    await tx.term.create({ data: { schoolId: sid, academicYearId: year.id, name: "Term 2", startDate: d("2026-10-01"), endDate: d("2027-03-31"), sortOrder: 2 } });
    await tx.calendarEntry.create({ data: { schoolId: sid, campusId, academicYearId: year.id, type: "holiday", title: "Gandhi Jayanti", startDate: d("2026-10-02"), endDate: d("2026-10-02") } });
    const mkStaff = (first: string, last: string, code: string, login: string | null) =>
      tx.staff.create({ data: { schoolId: sid, campusId, staffCode: code, firstName: first, lastName: last, fullName: `${first} ${last}`, phone: `98765${code.replace(/\D/g, "").padStart(5, "0")}`, designation: "Teacher", joiningDate: d("2020-06-01"), userLoginId: login } });
    const staffA = await mkStaff("Ravi", "Teja", "ST-001", teacherA.id);
    const staffB = await mkStaff("Kavitha", "Nair", "ST-002", teacherB.id);
    const staffPrincipal = await mkStaff("Lakshmi", "Rao", "ST-003", principal.id);
    const staffHr = await mkStaff("Hema", "Latha", "ST-004", hrLogin.id);
    const staffOther = await mkStaff("Ganesh", "Rao", "ST-005", null);
    const cls = await tx.schoolClass.create({ data: { schoolId: sid, campusId, name: "Class 5", sortOrder: 5 } });
    const sectionA = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "A", classTeacherId: staffA.id } });
    const sectionB = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "B", classTeacherId: staffB.id } });
    const studentsA: { id: string; name: string; guardianId: string }[] = [];
    const studentsB: { id: string; name: string; guardianId: string }[] = [];
    const names = ["Aarav Sharma", "Diya Reddy", "Ishaan Kumar", "Meera Iyer", "Rohan Das"];
    let n = 0;
    for (const [section, list] of [[sectionA, studentsA], [sectionB, studentsB]] as const) {
      for (const [i, full] of names.entries()) {
        n++;
        const [first, last] = full.split(" ");
        const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `ADM-${String(n).padStart(3, "0")}`, firstName: first, lastName: last, fullName: full, status: "ACTIVE" } });
        const g = await tx.guardian.create({ data: { schoolId: sid, name: `Parent of ${first}`, relationship: "Father", phone: `90000${String(n).padStart(5, "0")}` } });
        await tx.studentGuardian.create({ data: { schoolId: sid, studentId: st.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
        await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: year.id, classId: cls.id, sectionId: section.id, rollNo: i + 1 } });
        list.push({ id: st.id, name: full, guardianId: g.id });
      }
    }
    await ensureAttendanceDefaults(tx, { schoolId: sid, userId: null });
    const medical = await tx.leaveType.findFirstOrThrow({ where: { forWhom: "student", code: "MED" } });
    return { year, cls, sectionA, sectionB, studentsA, studentsB, staffA, staffB, staffPrincipal, staffHr, staffOther, medical };
  });
  return { school, principal, admin, teacherA, teacherB, hrLogin, officeLogin, ...ids };
}

export type Fixture = Awaited<ReturnType<typeof makeAttendanceSchool>>;

export const as = (f: Fixture, userId: string): SchoolContext => ({ schoolId: f.school.id, userId });

/** What the person may do in Attendance, as the pages work it out. */
export async function accessFor(f: Fixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const source = { ...view, user: { id: userId } } as unknown as AccessSource;
  return withSchool(as(f, userId), (tx) => attendanceAccess(tx, as(f, userId), source));
}
