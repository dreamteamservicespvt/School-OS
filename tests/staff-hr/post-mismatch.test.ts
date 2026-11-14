// Owner, 14 Nov 2026: Add Staff chose "Teacher" for everyone, so a Librarian showed "Teacher" under her name in
// every list. The Staff List now names people whose post does not fit their login's roles.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { postsNotMatchingRoles } from "@/lib/staff/link-login";
import { d, makeHrSchool } from "./fixture";
import { makeUser } from "../helpers";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });
let librarianStaffId = "";
let classTeacherStaffId = "";

beforeAll(async () => {
  f = await makeHrSchool();
  const librarian = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["librarian"] }], name: "Lakshmi Librarian" });
  const classTeacher = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["class-teacher"] }], name: "Kusuma Class" });
  await withSchool(as(null), async (tx) => {
    const make = (name: string, phone: string, login: string) => tx.staff.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, staffCode: `PM-${phone.slice(-3)}`, firstName: name, lastName: "", fullName: name, phone, designation: "Teacher", joiningDate: d("2026-06-01"), userLoginId: login } });
    librarianStaffId = (await make("Lakshmi Librarian", "9123400991", librarian.id)).id;
    classTeacherStaffId = (await make("Kusuma Class", "9123400992", classTeacher.id)).id;
  });
}, 120_000);

describe("posts that do not fit the login's roles", () => {
  it("names a Librarian saved with the post Teacher, and not a teacher or a class teacher", async () => {
    const list = await withSchool(as(f.principal.id), (tx) => postsNotMatchingRoles(tx, as(f.principal.id)));
    const ids = list.map((x) => x.staffId);
    expect(ids).toContain(librarianStaffId);
    expect(list.find((x) => x.staffId === librarianStaffId)).toMatchObject({ designation: "Teacher", roleNames: ["Librarian"] });
    expect(ids).not.toContain(classTeacherStaffId);
    expect(ids).not.toContain(f.teacher);
  });
});
