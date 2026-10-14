// A small school for Front Office tests: the Admission test school (this
// year and next, admissions open, a Principal, an Admission Counsellor, a
// Vice Principal, a Receptionist and a teacher) plus a School Admin, Office
// Staff, Gate Security and a school-made role with Front Office in full but
// no "see parent phone numbers". Two students of Class 1 A with their
// pickup lists: Aarav's father is on the list, his uncle may not collect him
// (a custody note) and his neighbour is not on the list at all.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { foCan, foViewer } from "@/lib/front-office/access";
import { admissionSchool, day } from "../admission/fixtures";
import { makeUser } from "../helpers";

export { day };
export const TZ = "Asia/Kolkata";
/** An instant in India time: at("2026-10-06", "09:15"). */
export const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00+05:30`);

export async function makeFrontOfficeSchool(name = "Front Office Test School") {
  const a = await admissionSchool(name);
  const sid = a.school.id;
  const sys = { schoolId: sid, userId: null };
  await withSchool(sys, async (tx) => {
    await tx.role.updateMany({ where: { key: { in: ["office-staff", "gate-security"] } }, data: { isEnabled: true } });
    const desk = ALL_ROLE_TEMPLATES.find((r) => r.key === "receptionist")!.permissions;
    await tx.role.create({ data: { schoolId: sid, name: "Evening desk", kind: "CUSTOM", permissions: desk } });
  });
  const admin = await makeUser({ schools: [{ id: sid, roleKeys: ["school-admin"] }], name: "Admin Person" });
  const office = await makeUser({ schools: [{ id: sid, roleKeys: ["office-staff"] }], name: "Office Person" });
  const gate = await makeUser({ schools: [{ id: sid, roleKeys: ["gate-security"] }], name: "Gate Person" });
  const classTeacher = await makeUser({ schools: [{ id: sid, roleKeys: ["class-teacher"] }], name: "Class Teacher" });
  // The school-made desk role has no key: link it by name.
  const custom = await makeUser({ schools: [{ id: sid, roleKeys: [] }], name: "Evening Desk" });
  await withSchool(sys, async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { name: "Evening desk" } });
    const access = await tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: custom.id } });
    await tx.schoolAccessRole.create({ data: { schoolId: sid, schoolAccessId: access.id, roleId: role.id } });
  });

  const ids = await withSchool(sys, async (tx) => {
    const campusId = a.school.campus.id;
    const ctStaff = await tx.staff.create({ data: { schoolId: sid, campusId, staffCode: "S-9", firstName: "Ravi", lastName: "Teja", fullName: "Ravi Teja", phone: "9876500109", designation: "Teacher", joiningDate: day("2020-06-01"), userLoginId: classTeacher.id } });
    const principalStaff = await tx.staff.findFirstOrThrow({ where: { userLoginId: a.principal.id } });
    await tx.staff.update({ where: { id: principalStaff.id }, data: { designation: "Principal" } });
    const section = await tx.section.create({ data: { schoolId: sid, classId: a.c1, academicYearId: a.yearId, name: "A", classTeacherId: ctStaff.id } });
    const mk = async (n: number, first: string) => {
      const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `ADM-${n}`, firstName: first, lastName: "Sharma", fullName: `${first} Sharma`, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: a.yearId, classId: a.c1, sectionId: section.id, rollNo: n } });
      return st;
    };
    const aarav = await mk(1, "Aarav");
    const diya = await mk(2, "Diya");
    const guardian = async (nm: string, rel: string, phone: string) => tx.guardian.create({ data: { schoolId: sid, name: nm, relationship: rel, phone } });
    const father = await guardian("Rajesh Sharma", "Father", "9849031277");
    const uncle = await guardian("Mahesh Sharma", "Uncle", "9849031288");
    const neighbour = await guardian("Suresh Neighbour", "Neighbour", "9849031299");
    await tx.studentGuardian.create({ data: { schoolId: sid, studentId: aarav.id, guardianId: father.id, relationship: "Father", isPrimary: true } });
    await tx.studentGuardian.create({ data: { schoolId: sid, studentId: aarav.id, guardianId: uncle.id, relationship: "Uncle", restriction: "Court order: may not collect the child." } });
    await tx.studentGuardian.create({ data: { schoolId: sid, studentId: aarav.id, guardianId: neighbour.id, relationship: "Neighbour", canPickUp: false } });
    await tx.studentGuardian.create({ data: { schoolId: sid, studentId: diya.id, guardianId: father.id, relationship: "Father", isPrimary: true } });
    return { ctStaff, principalStaff, section, aarav, diya, father, uncle, neighbour };
  });
  return { ...a, admin, office, gate, classTeacher, custom, ...ids };
}

export type FoFixture = Awaited<ReturnType<typeof makeFrontOfficeSchool>>;

export const as = (f: FoFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });

/** What a person may do in Front Office, worked out as the pages and actions do. */
export async function foFor(f: FoFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const v = foViewer({ ...view, user: { id: userId } });
  return { v, can: foCan(v) };
}

/** The part of the signed-in person the Front Office library needs, as the server actions pass it. */
export async function currentOf(f: FoFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const user = await withSchool(as(f, userId), (tx) => tx.userLogin.findUniqueOrThrow({ where: { id: userId } }));
  return { permissions: view.permissions, roles: view.roles, user };
}
