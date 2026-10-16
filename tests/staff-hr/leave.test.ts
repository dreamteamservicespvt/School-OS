// Staff Leave rules (09 §5) and "Done when" 4, 5, 10, 11: balance math,
// overlaps, approvals, substitutions on approval (A5), cancelling.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/staff/handlers";
import { adjustBalance, applyLeave, balancesFor, calendarLabel, cancelLeave, carryForward, countLeaveDays, LeaveProblem, onLeaveOn, teacherPeriods } from "@/lib/staff/leave";
import { d, makeHrSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
beforeAll(async () => { f = await makeHrSchool(); });

const as = (userId: string) => ({ schoolId: f.school.id, userId });
const base = { halfDayPart: null, reason: "Family function", documentFileId: null, onBehalf: false } as const;

async function balance(staffId: string, typeId: string) {
  return withSchool(as(f.principal.id), async (tx) => (await balancesFor(tx, as(f.principal.id), [staffId], f.year.id)).get(staffId)!.find((r) => r.type.id === typeId)!);
}

describe("counting leave days", () => {
  it("leaves out Sundays and School Calendar holidays, and counts a half day as 0.5", () => {
    const holidays = new Set(["2026-12-25"]);
    expect(countLeaveDays(d("2026-11-14"), d("2026-11-16"), holidays)).toBe(2); // Sat, (Sun), Mon
    expect(countLeaveDays(d("2026-12-24"), d("2026-12-26"), holidays)).toBe(2); // Thu, (Fri holiday), Sat
    expect(countLeaveDays(d("2026-12-24"), d("2026-12-26"), holidays, { countsHolidays: true })).toBe(3);
    expect(countLeaveDays(d("2026-11-11"), d("2026-11-11"), holidays, { halfDay: true })).toBe(0.5);
  });
});

describe("a teacher's casual leave, approved by the Principal (Done when 4)", () => {
  let requestId: string;
  let approvalId: string;

  it("applies for 2 days and goes to the Principal when the department has no head", async () => {
    const r = await withSchool(as(f.teacherLogin.id), (tx) => applyLeave(tx, as(f.teacherLogin.id), { ...base, staffId: f.teacher.id, leaveTypeId: f.cl.id, from: d("2026-11-11"), to: d("2026-11-12") }));
    expect(r.days).toBe(2);
    expect(r.periods).toBe(5);
    expect(r.approval.currentApproverRole).toBe("principal");
    requestId = r.request.id;
    approvalId = r.approval.id;
    const b = await balance(f.teacher.id, f.cl.id);
    expect(b.waiting).toBe(2);
    expect(b.left).toBe(12);
  });

  it("cannot be approved by the teacher themselves", async () => {
    await expect(withSchool(as(f.teacherLogin.id), (tx) => decide(tx, as(f.teacherLogin.id), approvalId, "approve", null))).rejects.toThrow(/own request/);
  });

  it("blocks overlapping leave", async () => {
    await expect(withSchool(as(f.teacherLogin.id), (tx) => applyLeave(tx, as(f.teacherLogin.id), { ...base, staffId: f.teacher.id, leaveTypeId: f.sl.id, from: d("2026-11-12"), to: d("2026-11-13") })))
      .rejects.toThrow("You already have leave on 12-11-2026");
  });

  it("on approval the balance drops by 2 and the teacher's periods need substitutes", async () => {
    await withSchool(as(f.principal.id), (tx) => decide(tx, as(f.principal.id), approvalId, "approve", null));
    const b = await balance(f.teacher.id, f.cl.id);
    expect(b.used).toBe(2);
    expect(b.left).toBe(10);
    await withSchool(as(f.principal.id), async (tx) => {
      const leave = await tx.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(leave.status).toBe("APPROVED");
      const subs = await tx.substitution.findMany({ where: { leaveRequestId: requestId } });
      expect(subs).toHaveLength(5);
      expect(subs.every((s) => s.status === "NEEDED" && s.absentStaffId === f.teacher.id)).toBe(true);
      expect((await onLeaveOn(tx, as(f.principal.id), d("2026-11-12"))).has(f.teacher.id)).toBe(true);
      const told = await tx.notification.findFirst({ where: { userLoginId: f.teacherLogin.id, type: "approval-decided" } });
      expect(told?.text).toMatch(/approved/);
    });
  });

  it("cancelling before it starts gives the days back and cancels the substitutions", async () => {
    const r = await withSchool(as(f.teacherLogin.id), (tx) => cancelLeave(tx, as(f.teacherLogin.id), requestId, "Function postponed", d("2026-11-01")));
    expect(r.kind).toBe("cancelled");
    expect(r.substitutionsCancelled).toBe(5);
    expect((await balance(f.teacher.id, f.cl.id)).left).toBe(12);
  });
});

describe("leave rules", () => {
  it("refuses leave beyond the balance, in plain words", async () => {
    await expect(withSchool(as(f.teacherLogin.id), (tx) => applyLeave(tx, as(f.teacherLogin.id), { ...base, staffId: f.teacher.id, leaveTypeId: f.cl.id, from: d("2026-11-16"), to: d("2026-11-30") })))
      .rejects.toThrow("Casual Leave left: 12 days. You asked for 13 days.");
  });

  it("saves days beyond the balance as loss of pay when the leave type allows it", async () => {
    await withSchool(as(f.admin.id), (tx) => tx.leaveTypeRule.update({ where: { leaveTypeId: f.cl.id }, data: { lossOfPay: true } }));
    const r = await withSchool(as(f.teacherLogin.id), (tx) => applyLeave(tx, as(f.teacherLogin.id), { ...base, staffId: f.teacher.id, leaveTypeId: f.cl.id, from: d("2026-11-16"), to: d("2026-11-30") }));
    expect(r.days).toBe(13);
    expect(r.lopDays).toBe(1);
    await withSchool(as(f.teacherLogin.id), (tx) => cancelLeave(tx, as(f.teacherLogin.id), r.request.id, "Changed plans", d("2026-11-01")));
    await withSchool(as(f.admin.id), (tx) => tx.leaveTypeRule.update({ where: { leaveTypeId: f.cl.id }, data: { lossOfPay: false } }));
  });

  it("asks for a document after the leave type's number of days", async () => {
    await expect(withSchool(as(f.teacherLogin.id), (tx) => applyLeave(tx, as(f.teacherLogin.id), { ...base, staffId: f.teacher.id, leaveTypeId: f.sl.id, from: d("2027-01-04"), to: d("2027-01-06") })))
      .rejects.toThrow(/needs a document/);
  });

  it("skips holidays when raising substitutions, and a half day covers only its half", async () => {
    await withSchool(as(f.principal.id), async (tx) => {
      const both = await teacherPeriods(tx, as(f.principal.id), f.teacher, d("2026-12-24"), d("2026-12-25"));
      expect(both.map((p) => p.periodNo).sort()).toEqual([1, 3, 5]); // Thursday only; Friday is Christmas.
      const first = await teacherPeriods(tx, as(f.principal.id), f.teacher, d("2026-12-24"), d("2026-12-24"), "first");
      expect(first.map((p) => p.periodNo).sort()).toEqual([1, 3]);
      const second = await teacherPeriods(tx, as(f.principal.id), f.teacher, d("2026-12-24"), d("2026-12-24"), "second");
      expect(second.map((p) => p.periodNo)).toEqual([5]);
    });
  });

  it("cannot cancel leave that has ended; HR adjusts instead", async () => {
    const r = await withSchool(as(f.teacherLogin.id), (tx) => applyLeave(tx, as(f.teacherLogin.id), { ...base, staffId: f.teacher.id, leaveTypeId: f.cl.id, from: d("2026-10-05"), to: d("2026-10-05") }));
    await withSchool(as(f.principal.id), (tx) => decide(tx, as(f.principal.id), r.approval.id, "approve", null));
    await expect(withSchool(as(f.teacherLogin.id), (tx) => cancelLeave(tx, as(f.teacherLogin.id), r.request.id, "Wrong day", d("2026-10-09")))).rejects.toThrow("This leave has ended. Ask HR to adjust the balance.");
  });
});

describe("head of department (Done when 11)", () => {
  it("sends a Science teacher's leave to the Science head first", async () => {
    const r = await withSchool(as(f.admin.id), (tx) => applyLeave(tx, as(f.admin.id), { ...base, onBehalf: true, staffId: f.scienceTeacher.id, leaveTypeId: f.cl.id, from: d("2026-11-18"), to: d("2026-11-18") }));
    expect(r.approval.currentApproverId).toBe(f.headLogin.id);
    await withSchool(as(f.headLogin.id), (tx) => decide(tx, as(f.headLogin.id), r.approval.id, "reject", "Exam duty that day"));
    await withSchool(as(f.admin.id), async (tx) => {
      expect((await tx.leaveRequest.findUniqueOrThrow({ where: { id: r.request.id } })).status).toBe("REJECTED");
    });
  });
});

describe("balances: adjustments and carry-forward", () => {
  it("adjusts with a reason and carries forward up to the maximum, once", async () => {
    await expect(withSchool(as(f.admin.id), (tx) => adjustBalance(tx, as(f.admin.id), { staffId: f.teacher.id, leaveTypeId: f.el.id, academicYearId: f.year.id, days: 2, reason: "no" }))).rejects.toThrow(LeaveProblem);
    await withSchool(as(f.admin.id), (tx) => adjustBalance(tx, as(f.admin.id), { staffId: f.teacher.id, leaveTypeId: f.el.id, academicYearId: f.year.id, days: -3, reason: "Taken before the software" }));
    expect((await balance(f.teacher.id, f.el.id)).left).toBe(12);
    const first = await withSchool(as(f.admin.id), (tx) => carryForward(tx, as(f.admin.id), f.year.id));
    const again = await withSchool(as(f.admin.id), (tx) => carryForward(tx, as(f.admin.id), f.year.id));
    expect(first.moved).toBeGreaterThan(0);
    expect(again.moved).toBe(0);
    const next = await withSchool(as(f.admin.id), async (tx) => (await balancesFor(tx, as(f.admin.id), [f.teacher.id], f.next.id)).get(f.teacher.id)!.find((r) => r.type.id === f.el.id)!);
    expect(next.adjusted).toBe(10); // 12 left, at most 10 carried
    expect(next.left).toBe(25);
  });
});

describe("the shared leave calendar (Done when 10)", () => {
  it("shows sensitive leave only as On leave to colleagues; the Principal sees the type", () => {
    expect(calendarLabel({ typeName: "Sick Leave", sensitive: true, viewerIsHr: false, viewerIsStaff: false, viewerIsApprover: false })).toBe("On leave");
    expect(calendarLabel({ typeName: "Sick Leave", sensitive: true, viewerIsHr: true, viewerIsStaff: false, viewerIsApprover: false })).toBe("Sick Leave");
    expect(calendarLabel({ typeName: "Sick Leave", sensitive: true, viewerIsHr: false, viewerIsStaff: true, viewerIsApprover: false })).toBe("Sick Leave");
    expect(calendarLabel({ typeName: "Casual Leave", sensitive: false, viewerIsHr: false, viewerIsStaff: false, viewerIsApprover: false })).toBe("Casual Leave");
  });

  it("marks sick leave sensitive by default", async () => {
    await withSchool(as(f.admin.id), async (tx) => {
      expect((await tx.leaveTypeRule.findUniqueOrThrow({ where: { leaveTypeId: f.sl.id } })).sensitive).toBe(true);
      expect((await tx.leaveTypeRule.findUniqueOrThrow({ where: { leaveTypeId: f.cl.id } })).sensitive).toBe(false);
    });
  });
});
