// Student Leave (05 §2, §5, workflow 6), percentages and flags (Done when 6),
// and Staff Attendance with what reaches Salary (Done when 10).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/attendance/handlers";
import { cancelStudentLeave, decideStudentLeave, quotaFor, recordStudentLeave } from "@/lib/attendance/student-leave";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { afterAttendanceSaved } from "@/lib/attendance/alerts";
import { attendanceSummary, dayStatus } from "@/lib/attendance/summary";
import { setAttendanceFeature, statusList, statusMap } from "@/lib/attendance/settings";
import { recordOvertime, saveStaffAttendance, staffDay, staffMonthForSalary } from "@/lib/attendance/staff";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => { f = await makeAttendanceSchool("Leave and Staff School"); });

const leave = (studentId: string, from: string, to: string, extra: Partial<{ approveNow: boolean; halfDay: boolean }> = {}) => ({
  studentId, leaveTypeId: f.medical.id, from: d(from), to: d(to), halfDay: false, reason: "Fever", documentFileId: null, approveNow: false, ...extra,
});

describe("student leave", () => {
  it("is recorded by the office for any student and goes to the class teacher within the limit", async () => {
    const access = await accessFor(f, f.officeLogin.id);
    const r = await withSchool(as(f, f.officeLogin.id), (tx) => recordStudentLeave(tx, as(f, f.officeLogin.id), access, leave(f.studentsB[0].id, "2026-10-19", "2026-10-20")));
    expect(r.approved).toBe(false);
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findFirstOrThrow({ where: { recordId: r.request.id } }));
    expect(approval.currentApproverId).toBe(f.teacherB.id);
    expect(approval.summary).toBe("Medical leave: Aarav Sharma (Class 5 B), 19-10-2026 to 20-10-2026 (2 days)");
  });

  it("blocks overlapping dates with the existing leave's dates", async () => {
    const access = await accessFor(f, f.officeLogin.id);
    await expect(withSchool(as(f, f.officeLogin.id), (tx) => recordStudentLeave(tx, as(f, f.officeLogin.id), access, leave(f.studentsB[0].id, "2026-10-20", "2026-10-21"))))
      .rejects.toThrow("Aarav already has leave from 19-10-2026 to 20-10-2026. Change the existing leave instead.");
  });

  it("does not count holidays inside the range", async () => {
    const access = await accessFor(f, f.principal.id);
    // 1 Oct (Thu), 2 Oct holiday, 3 Oct (Sat), 4 Oct Sunday.
    const r = await withSchool(as(f, f.principal.id), (tx) => recordStudentLeave(tx, as(f, f.principal.id), access, leave(f.studentsA[1].id, "2026-10-01", "2026-10-04", { approveNow: true })));
    expect(Number(r.request.days)).toBe(2);
    expect(r.approved).toBe(true);
  });

  it("a class teacher cannot record leave for another section", async () => {
    const access = await accessFor(f, f.teacherA.id);
    await expect(withSchool(as(f, f.teacherA.id), (tx) => recordStudentLeave(tx, as(f, f.teacherA.id), access, leave(f.studentsB[2].id, "2026-10-21", "2026-10-21")))).rejects.toThrow(/own classes/);
  });

  it("the class teacher approves from Student Leave, and it leaves the Approvals list", async () => {
    const access = await accessFor(f, f.teacherB.id);
    const r = await withSchool(as(f, f.principal.id), (tx) => tx.leaveRequest.findFirstOrThrow({ where: { studentId: f.studentsB[0].id } }));
    await withSchool(as(f, f.teacherB.id), (tx) => decideStudentLeave(tx, as(f, f.teacherB.id), access, r.id, "approve", null));
    const after = await withSchool(as(f, f.principal.id), (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: r.id } }));
    expect(after.status).toBe("APPROVED");
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findUniqueOrThrow({ where: { id: r.approvalId! } }));
    expect(approval.status).toBe("APPROVED");
  });

  it("longer leave than the class teacher's limit goes to the principal", async () => {
    const access = await accessFor(f, f.teacherB.id);
    const r = await withSchool(as(f, f.teacherB.id), (tx) => recordStudentLeave(tx, as(f, f.teacherB.id), access, leave(f.studentsB[3].id, "2026-11-02", "2026-11-06", { approveNow: true })));
    expect(r.approved).toBe(false);
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findFirstOrThrow({ where: { recordId: r.request.id } }));
    expect(approval.currentApproverId).toBe(f.principal.id);
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "reject", "Please meet the principal first"));
    expect((await withSchool(as(f, f.principal.id), (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: r.request.id } }))).status).toBe("REJECTED");
  });

  it("cancelling waiting leave withdraws its approval", async () => {
    const access = await accessFor(f, f.officeLogin.id);
    const r = await withSchool(as(f, f.officeLogin.id), (tx) => recordStudentLeave(tx, as(f, f.officeLogin.id), access, leave(f.studentsB[4].id, "2026-11-10", "2026-11-10")));
    await withSchool(as(f, f.officeLogin.id), (tx) => cancelStudentLeave(tx, as(f, f.officeLogin.id), access, r.request.id, "Parent called back"));
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findFirstOrThrow({ where: { recordId: r.request.id } }));
    expect(approval.status).toBe("WITHDRAWN");
  });

  it("with quotas on, shows the balance and sends leave over the quota to Approvals", async () => {
    await withSchool(as(f, f.principal.id), async (tx) => {
      await setAttendanceFeature(tx, as(f, f.principal.id), "attendance-leave-quotas", true);
      await tx.studentLeaveQuota.create({ data: { schoolId: f.school.id, leaveTypeId: f.medical.id, days: 3, period: "term" } });
    });
    const q = await withSchool(as(f, f.principal.id), (tx) => quotaFor(tx, as(f, f.principal.id), f.studentsB[0].id, f.medical.id, d("2026-10-26")));
    expect(q).toMatchObject({ quota: 3, used: 2, left: 1, period: "term", periodName: "Term 2" });
    const bal = await withSchool(as(f, f.principal.id), (tx) => tx.leaveBalance.findFirst({ where: { studentId: f.studentsB[0].id, leaveTypeId: f.medical.id } }));
    expect(Number(bal?.daysGiven)).toBe(3);
    const access = await accessFor(f, f.teacherB.id);
    const r = await withSchool(as(f, f.teacherB.id), (tx) => recordStudentLeave(tx, as(f, f.teacherB.id), access, leave(f.studentsB[0].id, "2026-10-26", "2026-10-27", { approveNow: true })));
    expect(r.overQuota).toBe(true);
    expect(r.approved).toBe(false);
  });
});

describe("percentages", () => {
  it("counts a half day as half, leaves out not-counted statuses", async () => {
    const statuses = statusMap(await withSchool(as(f, f.principal.id), (tx) => statusList(tx, as(f, f.principal.id))));
    expect(dayStatus([{ statusKey: "absent", periodNo: 1 }, { statusKey: "present", periodNo: 2 }], statuses, "any")).toBe("present");
    expect(dayStatus([{ statusKey: "absent", periodNo: 1 }, { statusKey: "absent", periodNo: 2 }, { statusKey: "present", periodNo: 3 }], statuses, "most")).toBe("absent");
    expect(dayStatus([{ statusKey: "absent", periodNo: 0 }, { statusKey: "present", periodNo: 2 }], statuses, "any")).toBe("absent");
    const access = await accessFor(f, f.teacherA.id);
    const s = f.studentsA[0].id;
    const days: [string, string][] = [["2026-10-05", "present"], ["2026-10-06", "half-day"], ["2026-10-07", "excused"], ["2026-10-08", "absent"]];
    for (const [day, status] of days) {
      await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d(day), periodNo: 0, entries: f.studentsA.map((x) => ({ studentId: x.id, statusKey: x.id === s ? status : "present" })), now: at(day, "09:00"), timeZone: TZ }));
    }
    const sum = await withSchool(as(f, f.principal.id), (tx) => attendanceSummary(tx, as(f, f.principal.id), { studentId: s, from: d("2026-10-05"), to: d("2026-10-10") }));
    // 6 working days (Mon to Sat); 4 marked; excused not counted: (1 + 0.5 + 0) / 3.
    expect(sum.people.get(s)).toMatchObject({ workingDays: 6, markedDays: 4, countedDays: 3, present: 1.5, absent: 1, percent: 50 });
  });

  it("flags a student below 75% once to the class teacher and the principal (Done when 6)", async () => {
    const sys = { schoolId: f.school.id, userId: null };
    const s = f.studentsA[0].id;
    await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-08" }));
    // Below threshold needs 5 counted days; add one more absent day.
    const access = await accessFor(f, f.teacherA.id);
    await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d("2026-10-09"), periodNo: 0, entries: f.studentsA.map((x) => ({ studentId: x.id, statusKey: x.id === s ? "absent" : "present" })), now: at("2026-10-09", "09:00"), timeZone: TZ }));
    await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d("2026-10-10"), periodNo: 0, entries: f.studentsA.map((x) => ({ studentId: x.id, statusKey: x.id === s ? "absent" : "present" })), now: at("2026-10-10", "09:00"), timeZone: TZ }));
    const r1 = await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-10" }));
    const r2 = await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-10" }));
    expect(r1.flagged).toBeGreaterThanOrEqual(1);
    expect(r2.flagged).toBe(0);
    const flags = await withSchool(sys, (tx) => tx.attendanceFlag.findMany({ where: { studentId: s, kind: "below-threshold", clearedAt: null } }));
    expect(flags).toHaveLength(1);
    // One record for the concern: Early Warnings reviews this same flag (src/lib/attendance/flags.ts).
    expect(flags[0]).toMatchObject({ status: "NEW", closedAt: null });
    const notes = await withSchool(sys, (tx) => tx.notification.findMany({ where: { type: "attendance-flag", text: { contains: "below 75%" } } }));
    expect(new Set(notes.map((n) => n.userLoginId))).toEqual(new Set([f.teacherA.id, f.principal.id]));
    // Absent 3 school days in a row (8, 9 and 10 October) is flagged as well.
    expect(await withSchool(sys, (tx) => tx.attendanceFlag.count({ where: { studentId: s, kind: "absent-streak", clearedAt: null } }))).toBe(1);
  });
});

describe("staff attendance", () => {
  it("HR marks all present then the exceptions; late by the one late rule; staff on leave show On leave", async () => {
    const access = await accessFor(f, f.hrLogin.id);
    await withSchool(as(f, f.principal.id), async (tx) => {
      const cl = await tx.leaveType.create({ data: { schoolId: f.school.id, forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 12 } });
      await tx.leaveRequest.create({ data: { schoolId: f.school.id, staffId: f.staffOther.id, leaveTypeId: cl.id, fromDate: d("2026-10-12"), toDate: d("2026-10-12"), days: 1, reason: "Family", status: "APPROVED" } });
    });
    const date = d("2026-10-12");
    const r = await withSchool(as(f, f.hrLogin.id), (tx) => saveStaffAttendance(tx, as(f, f.hrLogin.id), access, {
      date, now: at("2026-10-12", "10:00"), timeZone: TZ,
      entries: [
        { staffId: f.staffA.id, statusKey: "present", inTime: "08:25" },
        { staffId: f.staffB.id, statusKey: "present", inTime: "08:55" },
        { staffId: f.staffPrincipal.id, statusKey: "present", inTime: "11:20" },
        { staffId: f.staffHr.id, statusKey: "absent" },
        { staffId: f.staffOther.id, statusKey: "present" },
      ],
    }));
    expect(r.changed).toBe(5);
    const rows = await withSchool(as(f, f.hrLogin.id), (tx) => staffDay(tx, as(f, f.hrLogin.id), access, date));
    const by = (id: string) => rows.find((x) => x.staffId === id)!;
    expect(by(f.staffA.id).mark?.statusKey).toBe("present");
    expect(by(f.staffB.id).mark).toMatchObject({ statusKey: "late", lateMinutes: 25 });
    expect(by(f.staffPrincipal.id).mark?.statusKey).toBe("half-day");
    expect(by(f.staffOther.id).onLeave).toBe(true);
    expect(by(f.staffOther.id).mark?.statusKey).toBe("leave");
  });

  it("a teacher sees only their own staff attendance and cannot mark others", async () => {
    const access = await accessFor(f, f.teacherA.id);
    expect(access.staff).toBe("self");
    const rows = await withSchool(as(f, f.teacherA.id), (tx) => staffDay(tx, as(f, f.teacherA.id), access, d("2026-10-12")));
    expect(rows.map((r) => r.staffId)).toEqual([f.staffA.id]);
    await expect(withSchool(as(f, f.teacherA.id), (tx) => saveStaffAttendance(tx, as(f, f.teacherA.id), access, { date: d("2026-10-12"), now: at("2026-10-12", "10:00"), timeZone: TZ, entries: [{ staffId: f.staffB.id, statusKey: "absent" }] }))).rejects.toThrow(/Only HR/);
  });

  it("after the lock HR cannot change a saved staff mark", async () => {
    const access = await accessFor(f, f.hrLogin.id);
    await expect(withSchool(as(f, f.hrLogin.id), (tx) => saveStaffAttendance(tx, as(f, f.hrLogin.id), access, { date: d("2026-10-12"), now: at("2026-10-12", "15:00"), timeZone: TZ, entries: [{ staffId: f.staffHr.id, statusKey: "present" }] }))).rejects.toThrow(/locked at 11:00 AM/);
  });

  it("the month reaches Salary with present days, leave, late marks and overtime (Done when 10)", async () => {
    const access = await accessFor(f, f.hrLogin.id);
    await withSchool(as(f, f.principal.id), (tx) => setAttendanceFeature(tx, as(f, f.principal.id), "attendance-overtime", true));
    await withSchool(as(f, f.hrLogin.id), (tx) => recordOvertime(tx, as(f, f.hrLogin.id), access, { staffId: f.staffB.id, date: d("2026-10-12"), minutes: 90, note: "Annual day practice", today: d("2026-10-12") }));
    const rows = await withSchool(as(f, f.hrLogin.id), (tx) => staffMonthForSalary(tx, as(f, f.hrLogin.id), { staffIds: [f.staffB.id, f.staffOther.id, f.staffPrincipal.id], from: d("2026-10-12"), to: d("2026-10-13") }));
    const b = rows.find((r) => r.staffId === f.staffB.id)!;
    expect(b).toMatchObject({ workingDays: 2, presentDays: 1, lateMarks: 1, overtimeMinutes: 90, notMarkedDays: 1 });
    expect(rows.find((r) => r.staffId === f.staffOther.id)!.leaveDays).toBe(1);
    expect(rows.find((r) => r.staffId === f.staffPrincipal.id)!).toMatchObject({ presentDays: 0.5, halfDays: 1 });
  });
});
