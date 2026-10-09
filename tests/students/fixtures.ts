// A small school for Student Management tests: two years (current and next),
// Class 5 and Class 6 with sections A and B, a class teacher with a login.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { createStudent } from "@/lib/students/students";
import { makeSchool, makeUser } from "../helpers";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

export async function studentSchool() {
  const school = await makeSchool("Student Test School");
  const admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Admin" });
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal" });
  const teacherUser = await makeUser({ schools: [{ id: school.id, roleKeys: ["class-teacher"] }], name: "Teacher" });
  const accountantUser = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Accountant" });
  const ctx: SchoolContext = { schoolId: school.id, userId: admin.id };
  const ids = await withSchool({ schoolId: school.id, userId: null }, async (tx) => {
    const campusId = school.campus.id;
    const year = await tx.academicYear.create({ data: { schoolId: school.id, campusId, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    const next = await tx.academicYear.create({ data: { schoolId: school.id, campusId, name: "2027-28", startDate: day("2027-04-01"), endDate: day("2028-03-31"), status: "UPCOMING" } });
    const c5 = await tx.schoolClass.create({ data: { schoolId: school.id, campusId, name: "Class 5", sortOrder: 5 } });
    const c6 = await tx.schoolClass.create({ data: { schoolId: school.id, campusId, name: "Class 6", sortOrder: 6 } });
    const teacher = await tx.staff.create({ data: { schoolId: school.id, campusId, staffCode: "T-1", firstName: "Ravi", lastName: "Teja", fullName: "Ravi Teja", phone: "9876500004", designation: "Teacher", joiningDate: day("2020-06-01"), userLoginId: teacherUser.id } });
    const s5a = await tx.section.create({ data: { schoolId: school.id, classId: c5.id, academicYearId: year.id, name: "A", seats: 40, classTeacherId: teacher.id } });
    const s5b = await tx.section.create({ data: { schoolId: school.id, classId: c5.id, academicYearId: year.id, name: "B", seats: 40 } });
    const s6a = await tx.section.create({ data: { schoolId: school.id, classId: c6.id, academicYearId: year.id, name: "A", seats: 40 } });
    return { yearId: year.id, nextYearId: next.id, c5: c5.id, c6: c6.id, s5a: s5a.id, s5b: s5b.id, s6a: s6a.id, teacherStaffId: teacher.id };
  });
  const who = async (userId: string) => {
    const access = await accessIn(userId, school.id);
    return { ctx: { schoolId: school.id, userId }, permissions: access!.permissions, roles: access!.roles };
  };
  return { school, admin, principal, teacherUser, accountantUser, ctx, ...ids, who };
}

let n = 0;
export async function addStudent(ctx: SchoolContext, sectionId: string, over: Partial<Parameters<typeof createStudent>[2]> = {}) {
  n++;
  return withSchool(ctx, (tx) =>
    createStudent(tx, ctx, {
      fullName: `Student ${n} Kumar`,
      sectionId,
      dateOfBirth: day(`2016-0${(n % 9) + 1}-1${n % 9}`),
      gender: n % 2 ? "Male" : "Female",
      guardianName: `Parent ${n} Kumar`,
      guardianPhone: `98${String(10000000 + n * 7919).slice(0, 8)}`,
      admissionDate: day("2026-06-10"),
      applyFeePlan: true,
      ...over,
    }),
  );
}
