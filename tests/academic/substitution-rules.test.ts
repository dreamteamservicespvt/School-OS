// Substitutions (04 §2 and §6, 05-roles.md, gap G31): the Office Staff
// template arranges substitutions, the Academic Settings switch for leave is
// obeyed, a republished Time Table keeps its covers, and a staff member
// marked absent in Staff Attendance raises the periods needing cover.
import { describe, expect, it } from "vitest";
import { academicScope, arrangesTimetable, ownPageRedirect } from "@/lib/academic/scope";
import { markAbsent, needsOn } from "@/lib/academic/substitutions";
import { raiseSubstitutions } from "@/lib/staff/leave";
import { makeUser } from "../helpers";
import { academicSchool, d } from "./fixture";

type School = Awaited<ReturnType<typeof academicSchool>>;

/** An approved day of leave for a staff member (as the approval leaves it). */
async function approvedLeave(s: School, staffId: string, from: Date, to = from) {
  return s.run(async (tx) => {
    const type = (await tx.leaveType.findFirst({ where: { schoolId: s.school.id, code: "CL" } }))
      ?? await tx.leaveType.create({ data: { schoolId: s.school.id, forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 12 } });
    return tx.leaveRequest.create({ data: { schoolId: s.school.id, staffId, leaveTypeId: type.id, fromDate: from, toDate: to, days: 1, reason: "Family function", status: "APPROVED" } });
  });
}

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

describe("the Academic Settings switch 'Raise substitutions automatically' (04 §6)", () => {
  it("when off, approved leave lists nothing by itself, and marking the teacher absent lists their periods", async () => {
    const s = await academicSchool();
    const monday = d("2026-11-16");
    await s.run((tx) => tx.academicSettings.create({ data: { schoolId: s.school.id, campusId: s.campusId, autoSubstitutions: false } }));
    const leave = await approvedLeave(s, s.staff[0].id, monday);
    // The leave approval's step raises nothing.
    expect(await s.run((tx) => raiseSubstitutions(tx, s.ctx, leave, { id: s.staff[0].id, campusId: s.campusId }, null))).toBe(0);
    expect(await s.run((tx) => tx.substitution.count({ where: { absentStaffId: s.staff[0].id } }))).toBe(0);
    // Substitutions and the Dashboard (both read needsOn) show nothing for her.
    expect((await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday))).rows).toEqual([]);
    // The office lists her periods by hand; the rows stay linked to the leave, so cancelling the leave releases them.
    const r = await s.run((tx) => markAbsent(tx, s.ctx, { staffId: s.staff[0].id, date: monday, note: null }));
    expect(r.raised).toBe(2);
    const { rows } = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, monday));
    expect(rows.map((x) => `${x.periodNo} ${x.sectionLabel}`)).toEqual(["1 Class 5 A", "2 Class 5 B"]);
    expect(await s.run((tx) => tx.substitution.count({ where: { absentStaffId: s.staff[0].id, leaveRequestId: leave.id } }))).toBe(2);
    // Marking her a second time is refused.
    await expect(s.run((tx) => markAbsent(tx, s.ctx, { staffId: s.staff[0].id, date: monday, note: null }))).rejects.toThrow(/already marked away/);
  });

  it("when on (the default), approved leave lists the periods and marking absent again is refused", async () => {
    const s = await academicSchool();
    const tuesday = d("2026-11-17");
    const leave = await approvedLeave(s, s.staff[1].id, tuesday);
    expect(await s.run((tx) => raiseSubstitutions(tx, s.ctx, leave, { id: s.staff[1].id, campusId: s.campusId }, null))).toBe(2);
    expect((await s.run((tx) => needsOn(tx, s.ctx, s.campusId, tuesday))).rows.map((x) => x.reason)).toEqual(["leave", "leave"]);
    await expect(s.run((tx) => markAbsent(tx, s.ctx, { staffId: s.staff[1].id, date: tuesday, note: null }))).rejects.toThrow(/already marked away on 17-11-2026 \(leave\)/);
  });
});
