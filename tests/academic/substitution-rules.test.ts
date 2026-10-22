// Substitutions (04 §2 and §6, 05-roles.md, gap G31): the Office Staff
// template arranges substitutions, the Academic Settings switch for leave is
// obeyed, a republished Time Table keeps its covers, and a staff member
// marked absent in Staff Attendance raises the periods needing cover.
import { describe, expect, it } from "vitest";
import { academicScope, arrangesTimetable, ownPageRedirect } from "@/lib/academic/scope";
import { assignSubstitute, markAbsent, needsOn, replanAfterPublish, replanWords } from "@/lib/academic/substitutions";
import { makeDraft, publishVersion } from "@/lib/academic/timetable";
import { raiseSubstitutions } from "@/lib/staff/leave";
import { arrangerLogins } from "@/lib/academic/arrangers";
import { attendanceAccess } from "@/lib/attendance/access";
import { saveStaffAttendance } from "@/lib/attendance/staff";
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

describe("republishing a Time Table keeps or plainly re-plans the covers (04 §2 Publish)", () => {
  it("moves covers to the new Time Table, frees a substitute who now has a class, and cancels covers whose period changed hands", async () => {
    const s = await academicSchool();
    const [mon, tue] = [d("2026-11-23"), d("2026-11-24")];
    const asha = s.staff[0], meera = s.staff[2], vikram = s.staff[3];
    const leave = await approvedLeave(s, asha.id, mon, tue);
    expect(await s.run((tx) => raiseSubstitutions(tx, s.ctx, leave, { id: asha.id, campusId: s.campusId }, null))).toBe(4);
    const arrange = async (date: Date, periodNo: number, substituteId: string) => {
      const row = (await s.run((tx) => needsOn(tx, s.ctx, s.campusId, date))).rows.find((r) => r.periodNo === periodNo)!;
      await s.run((tx) => assignSubstitute(tx, s.ctx, { campusId: s.campusId, date, periodIds: [row.id], substituteId, note: null }));
    };
    await arrange(mon, 1, vikram.id); // 5 A maths
    await arrange(mon, 2, meera.id); // 5 B maths
    await arrange(tue, 1, vikram.id); // 5 A maths; 5 B on Tuesday stays Needed

    // A new Time Table from Monday: on Mondays Vikram takes 6 A in period 1 and 5 B maths in period 2; Meera moves to 6 A period 2.
    const draft = await s.run(async (tx) => {
      const { version } = await makeDraft(tx, s.ctx, s.year.id, s.campusId, d("2026-11-20"));
      const set = (sectionId: string, periodNo: number, data: { staffId: string; subjectId: string }) => tx.timetablePeriod.updateMany({ where: { versionId: version.id, sectionId, dayOfWeek: 1, periodNo }, data });
      await set(s.s6a.id, 1, { staffId: vikram.id, subjectId: s.subjects.MAT });
      await set(s.s6a.id, 2, { staffId: meera.id, subjectId: s.subjects.SCI });
      await set(s.s5b.id, 2, { staffId: vikram.id, subjectId: s.subjects.MAT });
      return version;
    });
    const result = await s.run(async (tx) => {
      await publishVersion(tx, s.ctx, draft.id, mon, d("2026-11-20"));
      return replanAfterPublish(tx, s.ctx, draft.id, d("2026-11-20"));
    });
    expect(result).toEqual({ moved: 2, needAgain: 1, cancelled: 1, raised: 0 });
    expect(replanWords(result)).toBe(" Substitutions: 2 substitutions moved to the new Time Table; 1 period needs a new substitute (the substitute now has a class then); 1 substitution cancelled because the absent teacher no longer has that period.");

    // Nothing from the new Time Table's date onwards still points at the old one.
    const live = await s.run((tx) => tx.substitution.findMany({ where: { date: { gte: mon }, status: { not: "CANCELLED" }, archivedAt: null }, include: { period: true } }));
    expect(live.every((r) => r.period.versionId === draft.id)).toBe(true);
    const monday = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, mon));
    expect(monday.rows.map((r) => `${r.periodNo} ${r.sectionLabel} ${r.absentName} ${r.substitution?.status}`)).toEqual(["1 Class 5 A Asha Rao NEEDED"]);
    const tuesday = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, tue));
    expect(tuesday.rows.map((r) => `${r.periodNo} ${r.sectionLabel} ${r.substitution?.status} ${r.substitution?.substituteName ?? "-"}`)).toEqual(["1 Class 5 A ARRANGED Vikram Shah", "2 Class 5 B NEEDED -"]);
    // Meera's cover of 5 B on Monday is cancelled with the reason.
    const cancelled = await s.run((tx) => tx.substitution.findFirst({ where: { date: mon, substituteStaffId: meera.id } }));
    expect(cancelled).toMatchObject({ status: "CANCELLED", note: "The new Time Table changed this period" });
  });
});

describe("a teacher marked absent raises the periods needing cover (04 §2, A5)", () => {
  const TZ = "Asia/Kolkata";

  it("Staff Attendance 'Absent' today lists the teacher's periods and tells those who arrange cover; 'Present' again cancels them", async () => {
    const s = await academicSchool();
    const today = d("2026-11-30");
    const now = new Date("2026-11-30T04:30:00Z"); // 10:00 in India
    const principalNow = await s.currentFor(s.principal.id);
    const save = (statusKey: string) => s.run(async (tx) => saveStaffAttendance(tx, s.ctx, await attendanceAccess(tx, s.ctx, principalNow), { date: today, now, timeZone: TZ, entries: [{ staffId: s.staff[0].id, statusKey }] }));

    const r = await save("absent");
    expect(r.periodsToCover).toBe(2);
    const { rows } = await s.run((tx) => needsOn(tx, s.ctx, s.campusId, today));
    expect(rows.map((x) => `${x.periodNo} ${x.sectionLabel} ${x.reason} ${x.substitution?.status}`)).toEqual(["1 Class 5 A absent NEEDED", "2 Class 5 B absent NEEDED"]);
    // The only person who arranges cover here (the principal) saved it, and nobody is told about their own action.
    const told = await s.run((tx) => tx.notification.findMany({ where: { schoolId: s.school.id, type: "substitution" } }));
    expect(told).toEqual([]);

    // Marked in after all: the absence goes and the periods are no longer needed.
    await save("present");
    expect((await s.run((tx) => needsOn(tx, s.ctx, s.campusId, today))).rows).toEqual([]);
    expect(await s.run((tx) => tx.staffAbsence.count({ where: { staffId: s.staff[0].id, archivedAt: null } }))).toBe(0);
  });

  it("tells Office Staff and the Principal, not teachers, when periods need cover", async () => {
    const s = await academicSchool();
    await s.run((tx) => tx.role.updateMany({ where: { schoolId: s.school.id, key: "office-staff" }, data: { isEnabled: true } }));
    const office = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["office-staff"] }] });
    const admin = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["school-admin"] }] });
    const logins = await s.run((tx) => arrangerLogins(tx, s.ctx, s.campusId));
    expect(logins.sort()).toEqual([office.id, s.principal.id, admin.id].sort());
    expect(logins).not.toContain(s.teacherUser.id);

    // The school admin marks Kiran absent in Staff Attendance: the principal and the office hear, with the day's page.
    const today = d("2026-12-01");
    const adminCtx = { schoolId: s.school.id, userId: admin.id };
    const adminNow = await s.currentFor(admin.id);
    const r = await s.run(async (tx) => saveStaffAttendance(tx, adminCtx, await attendanceAccess(tx, adminCtx, adminNow), { date: today, now: new Date("2026-12-01T04:30:00Z"), timeZone: TZ, entries: [{ staffId: s.staff[1].id, statusKey: "absent" }] }));
    expect(r.periodsToCover).toBe(2);
    const told = await s.run((tx) => tx.notification.findMany({ where: { schoolId: s.school.id, type: "substitution" }, orderBy: { userLoginId: "asc" } }));
    expect(told.map((n) => n.userLoginId).sort()).toEqual([office.id, s.principal.id].sort());
    expect(told[0]).toMatchObject({ text: "Kiran Das is absent on 01-12-2026: 2 periods need a substitute.", link: "/academic-management/substitutions?date=2026-12-01" });
  });

  it("a teacher on approved leave marked absent is not listed twice", async () => {
    const s = await academicSchool();
    const today = d("2026-12-02");
    const leave = await approvedLeave(s, s.staff[2].id, today);
    await s.run((tx) => raiseSubstitutions(tx, s.ctx, leave, { id: s.staff[2].id, campusId: s.campusId }, null));
    const principalNow = await s.currentFor(s.principal.id);
    const r = await s.run(async (tx) => saveStaffAttendance(tx, s.ctx, await attendanceAccess(tx, s.ctx, principalNow), { date: today, now: new Date("2026-12-02T04:30:00Z"), timeZone: TZ, entries: [{ staffId: s.staff[2].id, statusKey: "absent" }] }));
    expect(r.periodsToCover).toBe(0);
    expect((await s.run((tx) => needsOn(tx, s.ctx, s.campusId, today))).rows.map((x) => x.reason)).toEqual(["leave"]);
  });
});
