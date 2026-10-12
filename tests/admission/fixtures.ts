// A small school for Admission Management tests: this year and the next
// (admissions open for the next), Class 1 and Class 2 with one section each,
// and a login for each role that matters (05-roles.md, Admission Management):
// Principal (Full), Admission Counsellor (Full), Vice Principal (View),
// Receptionist (Own) and Teacher (none).
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { viewerFor } from "@/lib/admission/access";
import { loadSettings } from "@/lib/admission/settings";
import { makeSchool, makeUser } from "../helpers";

export const day = (s: string) => new Date(`${s}T00:00:00Z`);

export async function admissionSchool(name = "Admission Test School") {
  const school = await makeSchool(name);
  // Vice Principal and Admission Counsellor are templates: the school switches them on.
  await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.role.updateMany({ where: { key: { in: ["vice-principal", "admission-counsellor"] } }, data: { isEnabled: true } }));
  const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal" });
  const counsellor = await makeUser({ schools: [{ id: school.id, roleKeys: ["admission-counsellor"] }], name: "Counsellor" });
  const vp = await makeUser({ schools: [{ id: school.id, roleKeys: ["vice-principal"] }], name: "Vice Principal" });
  const frontdesk = await makeUser({ schools: [{ id: school.id, roleKeys: ["receptionist"] }], name: "Front Desk" });
  const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Teacher" });
  const ids = await withSchool({ schoolId: school.id, userId: null }, async (tx) => {
    const campusId = school.campus.id;
    const year = await tx.academicYear.create({ data: { schoolId: school.id, campusId, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    const next = await tx.academicYear.create({ data: { schoolId: school.id, campusId, name: "2027-28", startDate: day("2027-04-01"), endDate: day("2028-03-31"), status: "UPCOMING" } });
    const c1 = await tx.schoolClass.create({ data: { schoolId: school.id, campusId, name: "Class 1", sortOrder: 1 } });
    const c2 = await tx.schoolClass.create({ data: { schoolId: school.id, campusId, name: "Class 2", sortOrder: 2 } });
    await tx.section.create({ data: { schoolId: school.id, classId: c1.id, academicYearId: next.id, name: "A", seats: 30 } });
    await tx.section.create({ data: { schoolId: school.id, classId: c2.id, academicYearId: next.id, name: "A", seats: 30 } });
    const staff = async (u: { id: string }, code: string, nm: string, phone: string) =>
      (await tx.staff.create({ data: { schoolId: school.id, campusId, staffCode: code, firstName: nm, lastName: "Staff", fullName: `${nm} Staff`, phone, designation: "Office", joiningDate: day("2020-06-01"), userLoginId: u.id } })).id;
    const counsellorStaff = await staff(counsellor, "S-1", "Divya", "9876500101");
    const frontdeskStaff = await staff(frontdesk, "S-2", "Kavitha", "9876500102");
    await staff(principal, "S-3", "Lakshmi", "9876500103");
    return { yearId: year.id, nextYearId: next.id, c1: c1.id, c2: c2.id, campusId, counsellorStaff, frontdeskStaff };
  });
  /** The same "who is this" the server builds from the session: permissions, roles and the admission viewer. */
  const who = async (u: { id: string }) => {
    const access = await accessIn(u.id, school.id);
    const ctx: SchoolContext = { schoolId: school.id, userId: u.id };
    const current = { permissions: access!.permissions, roles: access!.roles, user: { id: u.id } } as Parameters<typeof viewerFor>[2];
    const v = await withSchool(ctx, (tx) => viewerFor(tx, ctx, current));
    const s = await withSchool(ctx, (tx) => loadSettings(tx, ctx));
    return { ctx, permissions: access!.permissions, v, s };
  };
  return { school, principal, counsellor, vp, frontdesk, teacher, ...ids, who };
}

let n = 0;
/** An application form as the counter or the online form reads it. */
export function applicationInput(yearId: string, classId: string, over: Record<string, unknown> = {}) {
  n++;
  return {
    classId, yearId, firstName: `Child${n}`, lastName: "Rao", dateOfBirth: day("2021-03-0" + ((n % 9) + 1)), gender: "Female",
    fatherName: `Father ${n}`, motherName: null, guardianName: null, guardianRelation: null,
    phone: `97${String(10000000 + n * 7919).slice(0, 8)}`, altPhone: null, email: null, address: "12 MG Road, Hyderabad",
    previousSchool: null, previousClass: null, previousMarks: null, preferences: {}, category: null, religion: null, motherTongue: null, occupation: null, aadhaar: null,
    ...over,
  };
}
