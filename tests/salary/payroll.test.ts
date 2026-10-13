// Salary Management's month (10 §2, Done when): PF on the ₹15,000 ceiling,
// ESI for staff within the limit, loss of pay from Staff Attendance and Leave
// Without Pay, one run a month per campus, adjustments with reasons, slips
// only after approval, the Day Book only on Paid (once), reversal with a
// reason, locking, loans recovered to zero, revisions kept as versions, TDS
// on every slip and PF and ESI statement totals.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { lopDays, workOutPay, professionalTax } from "@/lib/salary/calc";
import { DEFAULT_PT_SLABS } from "@/lib/salary/settings";
import { saveStructure, structureFor } from "@/lib/salary/structures";
import { openRun, calculateRun, addAdjustment, sendForApproval, markPaid, reversePayment, lockRun, takeBack } from "@/lib/salary/payroll";
import { giveAdvance, payAdvance } from "@/lib/salary/advances";
import { slipLines } from "@/lib/salary/slips";
import { statementRows, recordStatement, ecrText } from "@/lib/salary/statements";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

const STAT = { pfOn: true, pfEmployeeBp: 1200, pfEmployerBp: 1200, pfCeilingPaise: R(15000), esiOn: true, esiEmployeeBp: 75, esiEmployerBp: 325, esiLimitPaise: R(21000), ptOn: true };
const slabs = DEFAULT_PT_SLABS.map((s) => ({ fromPaise: s.fromPaise, toPaise: s.toPaise, taxPaise: s.taxPaise, specialMonth: null, specialPaise: null }));
const base = { pfApplies: true, esiApplies: true, tdsPaise: R(0), daysInMonth: 30, notEmployedDays: 0, lopDays: 0, statutory: STAT, ptSlabs: slabs, month: 9 };

describe("working out one person's pay", () => {
  it("takes PF on ₹15,000 when basic pay is ₹22,000: ₹1,800 (Done when 10)", () => {
    const p = workOutPay({ ...base, lines: lines(22000, 8000) });
    expect(p.pfWage).toBe(R(15000));
    expect(p.pf).toBe(R(1800));
    expect(p.erPf).toBe(R(1800));
    expect(p.pfCapped).toBe(true);
    expect(p.esiApplies).toBe(false);
    expect(p.pt).toBe(R(200));
    expect(p.net).toBe(R(30000 - 1800 - 200));
  });

  it("takes ESI at 0.75% for someone earning ₹18,000, and the school's 3.25%", () => {
    const p = workOutPay({ ...base, lines: lines(12000, 6000) });
    expect(p.esiApplies).toBe(true);
    expect(p.esi).toBe(R(135));
    expect(p.erEsi).toBe(R(585));
    expect(p.pf).toBe(R(1440));
    expect(p.pt).toBe(R(150));
  });

  it("cuts loss of pay by days, and three late marks make half a day", () => {
    expect(lopDays({ absentDays: 1, unpaidLeaveDays: 1, halfDays: 1, lateMarks: 7, lateMarksPerHalfDay: 3 })).toEqual({ total: 3.5, late: 1 });
    const p = workOutPay({ ...base, lines: lines(22000, 8000), lopDays: 2 });
    expect(p.lopPaise).toBe(R(2000));
    expect(p.gross).toBe(R(28000));
    expect(p.paidDays).toBe(28);
  });

  it("never takes net pay below zero for a recovery; the rest waits", () => {
    const p = workOutPay({ ...base, lines: lines(10000), tdsPaise: R(0), recoveries: [{ advanceId: "a", amountPaise: R(50000) }] });
    expect(p.net).toBe(R(0));
    expect(p.recoveryReduced).toBe(true);
  });

  it("uses the state's Professional Tax slab", () => {
    expect(professionalTax(slabs, R(15000), 9)).toBe(R(0));
    expect(professionalTax(slabs, R(15001), 9)).toBe(R(150));
    expect(professionalTax(slabs, R(25000), 9)).toBe(R(200));
  });
});

describe("a salary month from open to locked", () => {
  let f: SalaryFixture;
  const today = d("2026-10-13");
  const sep = d("2026-09-01");
  let runId = "";
  let loanId = "";

  beforeAll(async () => {
    f = await makeSalarySchool();
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => {
      await tx.statutorySetting.updateMany({ data: { ptOn: false } });
      await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(22000, 8000), pfApplies: true, esiApplies: true, tdsPaise: R(1000), reason: null });
      await saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-04-01"), lines: lines(12000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
      await saveStructure(tx, acc, { staffId: f.staffHr.id, effectiveFrom: d("2026-04-01"), lines: lines(20000), pfApplies: true, esiApplies: false, tdsPaise: R(0), reason: null });
      // Ravi was absent two days in September.
      for (const day of ["2026-09-07", "2026-09-08"]) await tx.attendanceMark.create({ data: { schoolId: f.school.id, staffId: f.staffA.id, date: d(day), statusKey: "absent" } });
    });
  });

  it("opens one month per campus: a second is refused with a link to the first", async () => {
    const acc = as(f, f.accountant.id);
    const run = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: sep, today }));
    runId = run.id;
    await expect(withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: sep, today }))).rejects.toThrow(/September 2026 salary already exists/);
  });

  it("calculates with loss of pay from attendance and flags missing structures", async () => {
    const acc = as(f, f.accountant.id);
    const run = await withSchool(acc, (tx) => calculateRun(tx, acc, runId, today));
    expect(run.status).toBe("CALCULATED");
    const ls = await withSchool(acc, (tx) => tx.payrollLine.findMany({ where: { runId } }));
    const ravi = ls.find((l) => l.staffId === f.staffA.id)!;
    expect(Number(ravi.lopDays)).toBe(2);
    expect(ravi.grossPaise).toBe(R(28000));
    expect(ravi.pfPaise).toBe(R(1800));
    expect(ravi.netPaise).toBe(R(28000 - 1800 - 1000));
    const kavitha = ls.find((l) => l.staffId === f.staffB.id)!;
    expect(kavitha.esiPaise).toBe(R(135));
    const lakshmi = ls.find((l) => l.staffId === f.staffPrincipal.id)!;
    expect(lakshmi.included).toBe(false);
    expect(lakshmi.flags).toContain("No salary structure");
    expect(run.staffCount).toBe(3);
  });

  it("needs a reason for an adjustment, and recalculates with it", async () => {
    const acc = as(f, f.accountant.id);
    await expect(withSchool(acc, (tx) => addAdjustment(tx, acc, { runId, staffId: f.staffB.id, type: "BONUS", amountPaise: R(2000), reason: "" }, today))).rejects.toThrow(/Give a reason for this bonus/);
    await withSchool(acc, (tx) => addAdjustment(tx, acc, { runId, staffId: f.staffB.id, type: "BONUS", amountPaise: R(2000), reason: "Sports day coach" }, today));
    const line = await withSchool(acc, (tx) => tx.payrollLine.findFirstOrThrow({ where: { runId, staffId: f.staffB.id } }));
    expect(line.grossPaise).toBe(R(20000));
    expect(line.flags).toContain("Adjustment added");
  });

  it("takes a loan's installment when the month is approved", async () => {
    const acc = as(f, f.accountant.id);
    const adv = await withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: f.staffHr.id, type: "LOAN", amountPaise: R(5000), installmentPaise: R(2500), startMonth: sep, reason: "Medical" }));
    loanId = adv.id;
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), adv.approvalId!, "approve", null));
    await withSchool(acc, (tx) => payAdvance(tx, acc, adv.id, { date: d("2026-09-05"), mode: "CASH", reference: null, accountId: null, today }));
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, today));
    const line = await withSchool(acc, (tx) => tx.payrollLine.findFirstOrThrow({ where: { runId, staffId: f.staffHr.id } }));
    expect(line.recoveryPaise).toBe(R(2500));
  });

  it("makes no slips and posts nothing before approval; slips and messages follow approval", async () => {
    const acc = as(f, f.accountant.id);
    const run = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    expect(run.status).toBe("WAITING");
    expect(await withSchool(acc, (tx) => tx.payslip.count({ where: { runId } }))).toBe(0);
    // Taken back and sent again.
    await withSchool(acc, (tx) => takeBack(tx, acc, runId));
    const again = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    // The accountant cannot approve their own request.
    await expect(withSchool(acc, (tx) => decide(tx, acc, again.approvalId!, "approve", null))).rejects.toThrow(/own request/);
    await expect(withSchool(acc, (tx) => markPaid(tx, acc, runId, { date: d("2026-09-30"), mode: "BANK_TRANSFER", reference: "UTR1", accountId: null, today }))).rejects.toThrow(/not approved yet/);
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), again.approvalId!, "approve", null));
    const slips = await withSchool(acc, (tx) => tx.payslip.findMany({ where: { runId } }));
    expect(slips).toHaveLength(3);
    const posted = await withSchool(acc, (tx) => tx.dayBookEntry.count({ where: { sourceType: "payroll", sourceId: runId } }));
    expect(posted).toBe(0);
    const told = await withSchool(acc, (tx) => tx.automationLog.count({ where: { ruleKey: "salary-slip" } }));
    const notes = await withSchool(acc, (tx) => tx.notification.count({ where: { type: "salary-slip" } }));
    expect(told + notes).toBeGreaterThan(0);
    const loan = await withSchool(acc, (tx) => tx.salaryAdvance.findUniqueOrThrow({ where: { id: loanId } }));
    expect(loan.recoveredPaise).toBe(R(2500));
  });

  it("refuses an adjustment in an approved month, pointing to the next month", async () => {
    const acc = as(f, f.accountant.id);
    await expect(withSchool(acc, (tx) => addAdjustment(tx, acc, { runId, staffId: f.staffB.id, type: "BONUS", amountPaise: R(100), reason: "Late bonus" }, today))).rejects.toThrow(/Add an adjustment in October 2026/);
  });

  it("shows TDS on every slip, even when it is ₹0", async () => {
    const acc = as(f, f.accountant.id);
    const ls = await withSchool(acc, (tx) => tx.payrollLine.findMany({ where: { runId, included: true } }));
    for (const l of ls) {
      const s = slipLines(l);
      expect(s.some((x) => x.label === "Income tax (TDS)")).toBe(true);
      const net = s.reduce((sum, x) => (x.kind === "earning" ? sum + x.amountPaise : sum - x.amountPaise), BigInt(0));
      expect(net).toBe(l.netPaise);
    }
  });

  it("posts to the Day Book once when paid, reverses with a reason, and locks", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, (tx) => markPaid(tx, acc, runId, { date: d("2026-09-30"), mode: "BANK_TRANSFER", reference: "UTR1", accountId: null, today }));
    await expect(withSchool(acc, (tx) => markPaid(tx, acc, runId, { date: d("2026-09-30"), mode: "BANK_TRANSFER", reference: "UTR1", accountId: null, today }))).rejects.toThrow(/already marked paid/);
    const run = await withSchool(acc, (tx) => tx.payrollRun.findUniqueOrThrow({ where: { id: runId } }));
    const entries = await withSchool(acc, (tx) => tx.dayBookEntry.findMany({ where: { sourceType: "payroll", sourceId: runId } }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: "OUT", amountPaise: run.netPaise, section: "salary" });
    await expect(withSchool(acc, (tx) => reversePayment(tx, acc, runId, "", today))).rejects.toThrow(/reason/);
    await withSchool(acc, (tx) => reversePayment(tx, acc, runId, "Bank returned the batch", today));
    const rev = await withSchool(acc, (tx) => tx.dayBookEntry.findMany({ where: { sourceId: runId, reversesEntryId: { not: null } } }));
    expect(rev).toHaveLength(1);
    await withSchool(acc, (tx) => markPaid(tx, acc, runId, { date: d("2026-10-01"), mode: "BANK_TRANSFER", reference: "UTR2", accountId: null, today }));
    expect(await withSchool(acc, (tx) => tx.dayBookEntry.count({ where: { sourceType: "payroll", sourceId: runId } }))).toBe(2);
    await withSchool(acc, (tx) => lockRun(tx, acc, runId));
    await expect(withSchool(acc, (tx) => reversePayment(tx, acc, runId, "Wrong again", today))).rejects.toThrow(/locked/);
  });

  it("makes PF and ESI statements whose totals match the month", async () => {
    const acc = as(f, f.accountant.id);
    const pf = await withSchool(acc, (tx) => statementRows(tx, runId, "PF"));
    const agg = await withSchool(acc, (tx) => tx.payrollLine.aggregate({ where: { runId, included: true }, _sum: { pfPaise: true, esiPaise: true } }));
    expect(pf.totals.employee).toBe(agg._sum.pfPaise);
    expect(ecrText(pf.rows).split("\n")).toHaveLength(pf.rows.length);
    const esi = await withSchool(acc, (tx) => recordStatement(tx, acc, runId, "ESI"));
    expect(esi.totals.employee).toBe(agg._sum.esiPaise);
    expect(esi.rows).toHaveLength(1);
  });

  it("keeps old slips when a structure is revised, and refuses a revision into an approved month", async () => {
    const acc = as(f, f.accountant.id);
    await expect(withSchool(acc, (tx) => saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-09-01"), lines: lines(14000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: "Raise" }))).rejects.toThrow(/paid as arrears/);
    const v2 = await withSchool(acc, (tx) => saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-10-01"), lines: lines(14000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: "Raise" }));
    expect(v2.version).toBe(2);
    expect((await withSchool(acc, (tx) => structureFor(tx, f.staffB.id, sep)))!.version).toBe(1);
    const line = await withSchool(acc, (tx) => tx.payrollLine.findFirstOrThrow({ where: { runId, staffId: f.staffB.id } }));
    expect(line.grossPaise).toBe(R(20000));
  });

  it("recovers the loan to zero and closes it", async () => {
    const acc = as(f, f.accountant.id);
    const oct = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: d("2026-10-01"), today }));
    await withSchool(acc, (tx) => calculateRun(tx, acc, oct.id, today));
    const sent = await withSchool(acc, (tx) => sendForApproval(tx, acc, oct.id));
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), sent.approvalId!, "approve", null));
    const loan = await withSchool(acc, (tx) => tx.salaryAdvance.findUniqueOrThrow({ where: { id: loanId } }));
    expect(loan.recoveredPaise).toBe(R(5000));
    expect(loan.status).toBe("CLOSED");
  });
});
