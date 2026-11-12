// Owner decision 2026-11-12 (self-test A14): nobody approves a salary month that pays themselves
// an adjustment (bonus, arrears…). Like fee approvals, it goes to the next approver: the School
// Admin when the Principal has the bonus. A month with no adjustment for the Principal still
// goes to the Principal.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { saveStructure } from "@/lib/salary/structures";
import { openRun, calculateRun, addAdjustment, sendForApproval, takeBack } from "@/lib/salary/payroll";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

describe("a salary month with a bonus for the approver", () => {
  let f: SalaryFixture;
  const today = d("2026-11-12");
  let runId = "";

  beforeAll(async () => {
    f = await makeSalarySchool("Own Adjustment School");
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => {
      await tx.statutorySetting.updateMany({ data: { ptOn: false } });
      await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(22000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
      await saveStructure(tx, acc, { staffId: f.staffPrincipal.id, effectiveFrom: d("2026-04-01"), lines: lines(60000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
    });
    const run = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: d("2026-10-01"), today }));
    runId = run.id;
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, today));
  });

  it("goes to the Principal when the Principal's pay has no adjustment", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, (tx) => addAdjustment(tx, acc, { runId, staffId: f.staffA.id, type: "BONUS", amountPaise: R(500), reason: "Sports day duty" }, today));
    const run = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    const a = await withSchool(acc, (tx) => tx.approval.findUniqueOrThrow({ where: { id: run.approvalId! } }));
    expect(a.currentApproverRole).toBe("principal");
    await withSchool(acc, (tx) => takeBack(tx, acc, runId));
  });

  it("goes to the School Admin, not the Principal, when the Principal gets a bonus in it", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, (tx) => addAdjustment(tx, acc, { runId, staffId: f.staffPrincipal.id, type: "BONUS", amountPaise: R(500), reason: "Exam committee" }, today));
    const run = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    const a = await withSchool(acc, (tx) => tx.approval.findUniqueOrThrow({ where: { id: run.approvalId! } }));
    expect(a.currentApproverRole).not.toBe("principal");
    const pr = as(f, f.principal.id);
    await expect(withSchool(pr, (tx) => decide(tx, pr, run.approvalId!, "approve", null))).rejects.toThrow();
    const admin = as(f, f.admin.id);
    await withSchool(admin, (tx) => decide(tx, admin, run.approvalId!, "approve", null));
    const after = await withSchool(acc, (tx) => tx.payrollRun.findUniqueOrThrow({ where: { id: runId } }));
    expect(after.status).toBe("APPROVED");
  });
});
