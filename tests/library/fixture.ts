// A small school for Library Management tests: the Admission test school
// (this year, a Principal, a Vice Principal, a Receptionist and a teacher)
// plus a Librarian, an Accountant and a School Admin, with Library
// Management switched on. Class 1 is a "Middle" class (3 books for 14 days by
// default) with one section this year and six students; the teacher and the
// librarian are staff members with staff codes.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { libCan, libViewer } from "@/lib/library/access";
import { addBook, type BookInput } from "@/lib/library/catalogue";
import { librarySettings } from "@/lib/library/settings";
import { memberByKey, type Member } from "@/lib/library/members";
import { admissionSchool, day } from "../admission/fixtures";
import { makeUser } from "../helpers";

export { day };
export const TZ = "Asia/Kolkata";
/** The desk's "today" in these tests: a Monday. */
export const TODAY = day("2026-10-12");
export const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export async function makeLibrarySchool(name = "Library Test School") {
  const a = await admissionSchool(name);
  const sid = a.school.id;
  const sys = { schoolId: sid, userId: null };
  await withSchool(sys, (tx) => tx.role.updateMany({ where: { key: { in: ["librarian", "accountant"] } }, data: { isEnabled: true } }));
  const librarian = await makeUser({ schools: [{ id: sid, roleKeys: ["librarian"] }], name: "Librarian" });
  const accountant = await makeUser({ schools: [{ id: sid, roleKeys: ["accountant"] }], name: "Accountant" });
  const admin = await makeUser({ schools: [{ id: sid, roleKeys: ["school-admin"] }], name: "Admin Person" });

  const ids = await withSchool(sys, async (tx) => {
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: sid, moduleKey: "library-management" } }, create: { schoolId: sid, moduleKey: "library-management", isOn: true }, update: { isOn: true } });
    await tx.schoolClass.update({ where: { id: a.c1 }, data: { level: "Middle" } });
    const campusId = a.school.campus.id;
    const section = await tx.section.create({ data: { schoolId: sid, classId: a.c1, academicYearId: a.yearId, name: "A" } });
    const names = ["Meena", "Ravi", "Sita", "Arjun", "Kavya", "Rahul"];
    const students = [];
    for (const [i, first] of names.entries()) {
      const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `ADM-10${i + 1}`, firstName: first, lastName: "Reddy", fullName: `${first} Reddy`, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: a.yearId, classId: a.c1, sectionId: section.id, rollNo: i + 1 } });
      students.push(st);
    }
    const staff = (u: { id: string }, code: string, first: string, phone: string) =>
      tx.staff.create({ data: { schoolId: sid, campusId, staffCode: code, firstName: first, lastName: "Rao", fullName: `${first} Rao`, phone, designation: "Teacher", joiningDate: day("2020-06-01"), userLoginId: u.id } });
    const teacherStaff = await staff(a.teacher, "S-21", "Kiran", "9876500121");
    const librarianStaff = await staff(librarian, "S-22", "Padma", "9876500122");
    const [meena, ravi, sita, arjun, kavya, rahul] = students;
    return { section, meena, ravi, sita, arjun, kavya, rahul, teacherStaff, librarianStaff };
  });
  return { ...a, librarian, accountant, admin, ...ids };
}

export type LibFixture = Awaited<ReturnType<typeof makeLibrarySchool>>;

export const as = (f: LibFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });
export const desk = (f: LibFixture) => as(f, f.librarian.id);

/** What a person may do in Library Management, worked out as the pages and actions do. */
export async function libFor(f: LibFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const v = libViewer({ ...view, user: { id: userId } });
  return { v, can: libCan(v), view };
}

let n = 0;
/** Adds a book with its copies, as the librarian. */
export async function addTestBook(f: LibFixture, title: string, copies = 1, over: Partial<BookInput> & { accessions?: string[] } = {}) {
  n++;
  const ctx = desk(f);
  return withSchool(ctx, (tx) => addBook(tx, ctx, {
    title, authors: [`Author ${n}`], publisher: null, isbn: null, categoryId: null, subject: null, language: "English", edition: null, pricePaise: BigInt(30000), shelf: null,
    copies, ...over,
  }));
}

/** A library member: "S:<student id>" or "T:<staff id>". */
export async function memberOf(f: LibFixture, key: string): Promise<Member> {
  const ctx = desk(f);
  const m = await withSchool(ctx, async (tx) => memberByKey(tx, ctx, await librarySettings(tx, ctx), key));
  if (!m) throw new Error(`no member ${key}`);
  return m;
}
export const student = (f: LibFixture, s: { id: string }) => memberOf(f, `S:${s.id}`);
export const staffMember = (f: LibFixture, s: { id: string }) => memberOf(f, `T:${s.id}`);
