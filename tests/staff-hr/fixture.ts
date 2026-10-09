// A small school for Staff & HR tests: one year, a holiday, two teachers with
// logins and a published Time Table, a principal, and the staff leave types.
import { withSchool } from "@/lib/db";
import { ensureHrDefaults } from "@/lib/staff/settings";
import { makeSchool, makeUser } from "../helpers";

export const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function makeHrSchool() {
  const school = await makeSchool("HR Test School");
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal Person" });
  const admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Admin Person" });
  const teacherLogin = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Ravi Teja" });
  const headLogin = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Science Head" });
  const ctx = { schoolId: school.id, userId: null };
  const ids = await withSchool(ctx, async (tx) => {
    const year = await tx.academicYear.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31"), status: "ACTIVE" } });
    const next = await tx.academicYear.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "2027-28", startDate: d("2027-04-01"), endDate: d("2028-03-31"), status: "UPCOMING" } });
    await tx.calendarEntry.create({ data: { schoolId: school.id, campusId: school.campus.id, academicYearId: year.id, type: "holiday", title: "Christmas", startDate: d("2026-12-25"), endDate: d("2026-12-25") } });
    const science = await tx.department.create({ data: { schoolId: school.id, name: "Science" } });
    const maths = await tx.department.create({ data: { schoolId: school.id, name: "Mathematics" } });
    const mk = (first: string, last: string, dept: string, login: string | null, phone: string) =>
      tx.staff.create({ data: { schoolId: school.id, campusId: school.campus.id, staffCode: `T-${phone.slice(-3)}`, firstName: first, lastName: last, fullName: `${first} ${last}`, phone, designation: "Teacher", departmentId: dept, joiningDate: d("2020-06-01"), userLoginId: login } });
    const teacher = await mk("Ravi", "Teja", maths.id, teacherLogin.id, "9876500001");
    const head = await mk("Divya", "Menon", science.id, headLogin.id, "9876500002");
    const scienceTeacher = await mk("Prakash", "Kulkarni", science.id, null, "9876500003");
    const principalStaff = await mk("Lakshmi", "Rao", maths.id, principal.id, "9876500004");
    await tx.department.update({ where: { id: science.id }, data: { headStaffId: head.id } });

    const cls = await tx.schoolClass.create({ data: { schoolId: school.id, campusId: school.campus.id, name: "Class 5", sortOrder: 5 } });
    const section = await tx.section.create({ data: { schoolId: school.id, classId: cls.id, academicYearId: year.id, name: "A", classTeacherId: teacher.id } });
    const maths5 = await tx.subject.create({ data: { schoolId: school.id, code: "MAT", name: "Mathematics" } });
    await tx.subjectClass.create({ data: { schoolId: school.id, subjectId: maths5.id, classId: cls.id, periodsPerWeek: 6 } });
    const alloc = await tx.teacherAllocation.create({ data: { schoolId: school.id, academicYearId: year.id, staffId: teacher.id, sectionId: section.id, subjectId: maths5.id } });
    const version = await tx.timetableVersion.create({ data: { schoolId: school.id, academicYearId: year.id, campusId: school.campus.id, name: "TT", status: "PUBLISHED", effectiveFrom: d("2026-06-01") } });
    // Ravi teaches periods 1 and 5 every weekday (Monday to Saturday); period 3 on Thursday too.
    for (let day = 1; day <= 6; day++) {
      for (const p of [1, 5]) await tx.timetablePeriod.create({ data: { schoolId: school.id, versionId: version.id, sectionId: section.id, dayOfWeek: day, periodNo: p, startTime: "09:00", endTime: "09:40", subjectId: maths5.id, staffId: teacher.id } });
      await tx.timetablePeriod.create({ data: { schoolId: school.id, versionId: version.id, sectionId: section.id, dayOfWeek: day, periodNo: 8, startTime: "14:20", endTime: "15:00", subjectId: maths5.id, staffId: null } });
    }
    await tx.timetablePeriod.create({ data: { schoolId: school.id, versionId: version.id, sectionId: section.id, dayOfWeek: 4, periodNo: 3, startTime: "10:00", endTime: "10:40", subjectId: maths5.id, staffId: teacher.id } });

    const cl = await tx.leaveType.create({ data: { schoolId: school.id, forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 12 } });
    const sl = await tx.leaveType.create({ data: { schoolId: school.id, forWhom: "staff", name: "Sick Leave", code: "SL", daysPerYear: 10, needsDocAfter: 2 } });
    const el = await tx.leaveType.create({ data: { schoolId: school.id, forWhom: "staff", name: "Earned Leave", code: "EL", daysPerYear: 15, carryForward: true, maxCarry: 10 } });
    const lwp = await tx.leaveType.create({ data: { schoolId: school.id, forWhom: "staff", name: "Leave Without Pay", code: "LWP", daysPerYear: 0, paid: false } });
    await ensureHrDefaults(tx, ctx);
    return { year, next, science, maths, teacher, head, scienceTeacher, principalStaff, section, maths5, alloc, version, cl, sl, el, lwp };
  });
  return { school, principal, admin, teacherLogin, headLogin, ...ids };
}
