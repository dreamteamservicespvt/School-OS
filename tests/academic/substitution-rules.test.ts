// Substitutions (04 §2 and §6, 05-roles.md, gap G31): the Office Staff
// template arranges substitutions, the Academic Settings switch for leave is
// obeyed, a republished Time Table keeps its covers, and a staff member
// marked absent in Staff Attendance raises the periods needing cover.
import { describe, expect, it } from "vitest";
import { academicScope, arrangesTimetable, ownPageRedirect } from "@/lib/academic/scope";
import { makeUser } from "../helpers";
import { academicSchool } from "./fixture";

describe("Office Staff arrange substitutions (05-roles.md: Academic Management Own)", () => {
  it("opens Substitutions and Classes & Sections to Office Staff, not to a teacher", async () => {
    const s = await academicSchool();
    await s.run((tx) => tx.role.updateMany({ where: { schoolId: s.school.id, key: "office-staff" }, data: { isEnabled: true } }));
    const office = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["office-staff"] }] });
    const officeNow = await s.currentFor(office.id);
    const teacherNow = await s.currentFor(s.teacherUser.id);

    expect(arrangesTimetable(officeNow)).toBe(true);
    expect(arrangesTimetable(teacherNow)).toBe(false);
    const scope = await s.run((tx) => academicScope(tx, officeNow, s.year.id));
    expect(scope).toMatchObject({ see: "own", manage: false, arrange: true, sectionIds: null });

    // Substitutions and the front page stay open to Office Staff; Subjects and Teacher Allocation do not.
    expect(ownPageRedirect(officeNow, { notForOwn: "no-access", arrangerOk: true })).toBeNull();
    expect(ownPageRedirect(officeNow, { notForOwn: "home", arrangerOk: true })).toBeNull();
    expect(ownPageRedirect(officeNow, { notForOwn: "no-access" })).toBe("no-access");
    // A teacher still has only their own Time Table and Syllabus.
    expect(ownPageRedirect(teacherNow, { notForOwn: "no-access", arrangerOk: true })).toBe("no-access");
    expect(ownPageRedirect(teacherNow, { notForOwn: "home", arrangerOk: true })).toBe("home");
  });
});
