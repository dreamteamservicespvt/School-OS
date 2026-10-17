// Leave and attendance reaching salary (gap G22; 10 §2 steps 2 and 11, Done
// when 1 and 7; 09 A5): leave beyond the balance is loss of pay; a day marked
// absent and then given leave counts once, as leave, using the balance once;
// unpaid leave on an absent day is cut once; and a change after a month's
// salary is approved and paid comes into the next month as arrears or a
// deduction, with its reason, the month it belongs to, and PF and ESI by that
// month's rules. Made once, never twice; a correction the Accountant removes
// stays removed.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { applyLeave, balancesFor, cancelLeave } from "@/lib/staff/leave";
import { ensureHrDefaults } from "@/lib/staff/settings";
import { saveStructure } from "@/lib/salary/structures";
import { openRun, calculateRun, sendForApproval, markPaid, archiveAdjustment } from "@/lib/salary/payroll";
import { slipLines } from "@/lib/salary/slips";
import { statementRows } from "@/lib/salary/statements";
import { saveStaffAttendance } from "@/lib/attendance/staff";
import { accessFor, at, TZ } from "../attendance/fixture";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

let f: SalaryFixture;
let cl: { id: string };
let sl: { id: string };
let lwp: { id: string };
let sepId = "";
let octId = "";
const today = d("2026-10-13");
const sep = d("2026-09-01");
const oct = d("2026-10-01");
const leaveBase = { halfDayPart: null, reason: "Family function", documentFileId: null, onBehalf: false } as const;

const acc = () => as(f, f.accountant.id);
const boss = () => as(f, f.principal.id);
const line = (runId: string, staffId: string) => withSchool(acc(), (tx) => tx.payrollLine.findFirstOrThrow({ where: { runId, staffId } }));
const corrections = (runId: string, staffId?: string) => withSchool(acc(), (tx) => tx.payrollAdjustment.findMany({ where: { runId, forMonth: { not: null }, archivedAt: null, ...(staffId ? { staffId } : {}) } }));

async function applyAndApprove(login: string, staffId: string, leaveTypeId: string, from: string, to: string) {
  const r = await withSchool(as(f, login), (tx) => applyLeave(tx, as(f, login), { ...leaveBase, staffId, leaveTypeId, from: d(from), to: d(to) }));
  await withSchool(boss(), (tx) => decide(tx, boss(), r.approval.id, "approve", null));
  return r;
}

async function approveRun(runId: string) {
  const sent = await withSchool(acc(), (tx) => sendForApproval(tx, acc(), runId));
  await withSchool(boss(), (tx) => decide(tx, boss(), sent.approvalId!, "approve", null));
}

beforeAll(async () => {
  f = await makeSalarySchool("Salary Corrections School");
  await withSchool(acc(), async (tx) => {
    await tx.statutorySetting.updateMany({ data: { ptOn: false } });
    // Ravi and Kavitha earn ₹18,000 (basic ₹12,000): PF on basic, ESI on gross. Hema earns ₹20,000, no ESI.
    await saveStructure(tx, acc(), { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(12000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
    await saveStructure(tx, acc(), { staffId: f.staffB.id, effectiveFrom: d("2026-04-01"), lines: lines(12000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
    await saveStructure(tx, acc(), { staffId: f.staffHr.id, effectiveFrom: d("2026-04-01"), lines: lines(20000), pfApplies: true, esiApplies: false, tdsPaise: R(0), reason: null });
  });
  const sys = { schoolId: f.school.id, userId: null };
  await withSchool(sys, async (tx) => {
    cl = await tx.leaveType.create({ data: { schoolId: f.school.id, forWhom: "staff", name: "Casual Leave", code: "CL", daysPerYear: 2 } });
    sl = await tx.leaveType.create({ data: { schoolId: f.school.id, forWhom: "staff", name: "Sick Leave", code: "SL", daysPerYear: 10 } });
    lwp = await tx.leaveType.create({ data: { schoolId: f.school.id, forWhom: "staff", name: "Leave Without Pay", code: "LWP", daysPerYear: 0, paid: false } });
    await ensureHrDefaults(tx, sys);
    // Casual leave beyond the balance is allowed, as loss of pay (HR Settings).
    await tx.leaveTypeRule.update({ where: { leaveTypeId: cl.id }, data: { lossOfPay: true } });
    // Ravi was absent on Thursday 24 September; Hema on Tuesday 22 September, which also has approved Leave Without Pay.
    await tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffA.id, date: d("2026-09-24"), statusKey: "absent" } });
    await tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffHr.id, date: d("2026-09-22"), statusKey: "absent" } });
    await tx.leaveRequest.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, staffId: f.staffHr.id, leaveTypeId: lwp.id, fromDate: d("2026-09-22"), toDate: d("2026-09-22"), days: 1, reason: "Personal", status: "APPROVED" } });
    // Kavitha was absent on Monday 21 September, before she asked for leave.
    await tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffB.id, date: d("2026-09-21"), statusKey: "absent" } });
  });
});

describe("leave reaches salary once (Done when 1)", () => {
  it("deducts casual leave beyond the balance as loss of pay, on the leave's last days", async () => {
    // 4 days (Monday to Thursday) with 2 days of balance: 2 days loss of pay.
    const r = await applyAndApprove(f.teacherA.id, f.staffA.id, cl.id, "2026-09-14", "2026-09-17");
    expect(r.lopDays).toBe(2);
    const run = await withSchool(acc(), (tx) => openRun(tx, acc(), { campusId: f.school.campus.id, month: sep, today }));
    sepId = run.id;
    // Kavitha asks for casual leave for the day already marked absent; it is approved before the salary is worked out.
    await applyAndApprove(f.teacherB.id, f.staffB.id, cl.id, "2026-09-21", "2026-09-21");
    await withSchool(acc(), (tx) => calculateRun(tx, acc(), sepId, today));
    const ravi = await line(sepId, f.staffA.id);
    expect(Number(ravi.leaveLopDays)).toBe(2);
    expect(Number(ravi.absentDays)).toBe(1); // 24 September
    expect(Number(ravi.lopDays)).toBe(3);
    expect(ravi.grossPaise).toBe(R(18000 - 1800));
    expect(ravi.notes.join(" ")).toMatch(/2 days of leave beyond the balance \(loss of pay\)/);
  });

  it("a day marked absent and then given leave is leave: no loss of pay, and the balance is used once", async () => {
    await withSchool(boss(), async (tx) => {
      const mark = await tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffB.id, date: d("2026-09-21") } });
      expect(mark.statusKey).toBe("leave");
      expect(await tx.auditLogEntry.count({ where: { action: "staff-attendance-leave-approved" } })).toBeGreaterThanOrEqual(1);
      const b = (await balancesFor(tx, boss(), [f.staffB.id], f.year.id)).get(f.staffB.id)!.find((x) => x.type.id === cl.id)!;
      expect(b.used).toBe(1);
      expect(b.left).toBe(1);
    });
    const kavitha = await line(sepId, f.staffB.id);
    expect(Number(kavitha.absentDays)).toBe(0);
    expect(Number(kavitha.leaveDays)).toBe(1);
    expect(Number(kavitha.lopDays)).toBe(0);
    expect(kavitha.grossPaise).toBe(R(18000));
  });

  it("marking the leave day absent again keeps it On leave in Staff Attendance", async () => {
    const access = await accessFor(f, f.hrLogin.id);
    const r = await withSchool(as(f, f.hrLogin.id), (tx) => saveStaffAttendance(tx, as(f, f.hrLogin.id), access, { date: d("2026-09-21"), now: at("2026-09-21", "10:00"), timeZone: TZ, entries: [{ staffId: f.staffB.id, statusKey: "absent" }] }));
    expect(r.changed).toBe(0);
    const mark = await withSchool(boss(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffB.id, date: d("2026-09-21") } }));
    expect(mark.statusKey).toBe("leave");
  });

  it("unpaid leave on a day still marked absent is cut once, not twice", async () => {
    const hema = await line(sepId, f.staffHr.id);
    expect(Number(hema.unpaidLeaveDays)).toBe(1);
    expect(Number(hema.absentDays)).toBe(0);
    expect(Number(hema.lopDays)).toBe(1);
  });
});

describe("a change after September is paid comes into October (Done when 7)", () => {
  beforeAll(async () => {
    await approveRun(sepId);
    await withSchool(acc(), (tx) => markPaid(tx, acc(), sepId, { date: d("2026-09-30"), mode: "BANK_TRANSFER", reference: "UTR-SEP", accountId: null, today }));
    // After payment: Ravi's absence on 24 September becomes sick leave; Kavitha is found absent on 28
    // September; Hema's 29 September is marked absent by mistake.
    await applyAndApprove(f.teacherA.id, f.staffA.id, sl.id, "2026-09-24", "2026-09-24");
    await withSchool(acc(), async (tx) => {
      await tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffB.id, date: d("2026-09-28"), statusKey: "absent" } });
      await tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffHr.id, date: d("2026-09-29"), statusKey: "absent" } });
    });
    octId = (await withSchool(acc(), (tx) => openRun(tx, acc(), { campusId: f.school.campus.id, month: oct, today }))).id;
    await withSchool(acc(), (tx) => calculateRun(tx, acc(), octId, today));
  });

  it("never changes the paid September slip", async () => {
    const ravi = await line(sepId, f.staffA.id);
    expect(Number(ravi.lopDays)).toBe(3);
    expect(ravi.grossPaise).toBe(R(16200));
  });

  it("gives Ravi one day back as arrears for September, with PF and ESI by September's rules", async () => {
    const [a] = await corrections(octId, f.staffA.id);
    expect(a).toMatchObject({ type: "ARREARS", amountPaise: R(600), fromRunId: sepId });
    expect(a.forMonth).toEqual(sep);
    expect(Number(a.lopDays)).toBe(-1);
    expect(a.reason).toMatch(/^September 2026 salary: 1 day of loss of pay given back\./);
    expect(a.reason).toMatch(/absent 1 → 0 days/);
    // September basic earned ₹10,800 → ₹11,200: PF 12% on ₹400 more. ESI on ₹16,200 → ₹16,800, rounded up each time.
    expect(a).toMatchObject({ pfWagePaise: R(400), pfPaise: R(48), erPfPaise: R(48), esiWagePaise: R(600), esiPaise: R(4), erEsiPaise: R(19) });
    const oc = await line(octId, f.staffA.id);
    expect(oc.grossPaise).toBe(R(18600));
    expect(oc.pfPaise).toBe(R(1440 + 48));
    expect(oc.pfWagePaise).toBe(R(12400));
    expect(oc.esiPaise).toBe(R(135 + 4));
    expect(oc.erEsiPaise).toBe(R(585 + 19));
    expect(oc.netPaise).toBe(R(18600 - 1488 - 139));
    expect(oc.flags).toContain("Adjustment added");
    const added = await withSchool(acc(), (tx) => tx.auditLogEntry.count({ where: { action: "payroll-adjustment-added", recordId: a.id } }));
    expect(added).toBe(1);
  });

  it("recovers Kavitha's newly found absence as a deduction, with PF and ESI taken back", async () => {
    const [a] = await corrections(octId, f.staffB.id);
    expect(a).toMatchObject({ type: "DEDUCTION", amountPaise: R(600), pfPaise: R(-48), esiPaise: R(-4), erEsiPaise: R(-19) });
    expect(Number(a.lopDays)).toBe(1);
    expect(a.reason).toMatch(/^September 2026 salary: 1 day more loss of pay\./);
    const oc = await line(octId, f.staffB.id);
    expect(oc.cutPaise).toBe(R(600));
    expect(oc.pfPaise).toBe(R(1392));
    expect(oc.esiPaise).toBe(R(131));
    expect(oc.netPaise).toBe(R(18000 - 600 - 1392 - 131));
  });

  it("is made once: recalculating October changes nothing", async () => {
    const before = await withSchool(acc(), (tx) => tx.auditLogEntry.count({ where: { recordType: "Payroll Adjustment" } }));
    await withSchool(acc(), (tx) => calculateRun(tx, acc(), octId, today));
    expect(await corrections(octId, f.staffA.id)).toHaveLength(1);
    expect(await corrections(octId, f.staffB.id)).toHaveLength(1);
    expect(await withSchool(acc(), (tx) => tx.auditLogEntry.count({ where: { recordType: "Payroll Adjustment" } }))).toBe(before);
  });

  it("takes a correction away by itself when the change is undone before October is sent", async () => {
    expect(await corrections(octId, f.staffHr.id)).toHaveLength(1);
    await withSchool(acc(), (tx) => tx.attendanceMark.updateMany({ where: { staffId: f.staffHr.id, date: d("2026-09-29") }, data: { statusKey: "present" } }));
    await withSchool(acc(), (tx) => calculateRun(tx, acc(), octId, today));
    expect(await corrections(octId, f.staffHr.id)).toHaveLength(0);
    const gone = await withSchool(acc(), (tx) => tx.payrollAdjustment.findFirstOrThrow({ where: { runId: octId, staffId: f.staffHr.id } }));
    expect(gone.archivedAt).not.toBeNull();
    expect(gone.archivedById).toBeNull();
  });

  it("a correction the Accountant removes does not come back", async () => {
    const [a] = await corrections(octId, f.staffB.id);
    await withSchool(acc(), (tx) => archiveAdjustment(tx, acc(), a.id, today));
    await withSchool(acc(), (tx) => calculateRun(tx, acc(), octId, today));
    expect(await corrections(octId, f.staffB.id)).toHaveLength(0);
    expect((await line(octId, f.staffB.id)).netPaise).toBe(R(18000 - 1440 - 135));
  });

  it("shows the arrears for September on Ravi's October slip, and the PF statement matches the month", async () => {
    await approveRun(octId);
    const oc = await line(octId, f.staffA.id);
    const adj = await withSchool(acc(), (tx) => tx.payrollAdjustment.findMany({ where: { runId: octId, staffId: f.staffA.id, archivedAt: null } }));
    const s = slipLines(oc, adj);
    expect(s.find((x) => x.label === "Arrears for September 2026 (1 day)")?.amountPaise).toBe(R(600));
    const net = s.reduce((sum, x) => (x.kind === "earning" ? sum + x.amountPaise : sum - x.amountPaise), BigInt(0));
    expect(net).toBe(oc.netPaise);
    const pf = await withSchool(acc(), (tx) => statementRows(tx, octId, "PF"));
    const agg = await withSchool(acc(), (tx) => tx.payrollLine.aggregate({ where: { runId: octId, included: true }, _sum: { pfPaise: true } }));
    expect(pf.totals.employee).toBe(agg._sum.pfPaise);
  });

  it("does not carry September again once October is approved", async () => {
    const nov = await withSchool(acc(), (tx) => openRun(tx, acc(), { campusId: f.school.campus.id, month: d("2026-11-01"), today }));
    await withSchool(acc(), (tx) => calculateRun(tx, acc(), nov.id, today));
    expect(await corrections(nov.id)).toHaveLength(0);
  });
});

describe("ending leave early", () => {
  it("gives back the days beyond the balance first", async () => {
    // Hema: 5 days of casual leave with 2 days of balance (3 days loss of pay), ended after 3 days.
    // She was marked absent on 5 November, the day she comes back and ends the leave.
    await withSchool(acc(), (tx) => tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffHr.id, date: d("2026-11-05"), statusKey: "absent" } }));
    const r = await applyAndApprove(f.hrLogin.id, f.staffHr.id, cl.id, "2026-11-02", "2026-11-06");
    expect(r.lopDays).toBe(3);
    const mark = () => withSchool(boss(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffHr.id, date: d("2026-11-05") } }));
    expect((await mark()).statusKey).toBe("leave");
    await withSchool(as(f, f.hrLogin.id), (tx) => cancelLeave(tx, as(f, f.hrLogin.id), r.request.id, "Back early", d("2026-11-05")));
    // The day given back is absent again.
    expect((await mark()).statusKey).toBe("absent");
    await withSchool(boss(), async (tx) => {
      const detail = await tx.staffLeaveDetail.findUniqueOrThrow({ where: { leaveRequestId: r.request.id } });
      expect(Number(detail.lopDays)).toBe(1);
      const b = (await balancesFor(tx, boss(), [f.staffHr.id], f.year.id)).get(f.staffHr.id)!.find((x) => x.type.id === cl.id)!;
      expect(b.used).toBe(2);
      expect(b.left).toBe(0);
    });
  });
});
