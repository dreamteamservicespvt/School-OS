// Advances & Loans (10 §4): asked with a reason, approved by someone else,
// paid through the Day Book, paused and restarted with a reason, and closed
// when repaid in cash with a receipt in the Day Book. Nothing is deleted.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { balanceOf, changeInstallment, closeRepaidInCash, giveAdvance, payAdvance, setPaused } from "@/lib/salary/advances";
import { buildSalaryReport } from "@/lib/salary/reports";
import { as, d, makeSalarySchool, R, type SalaryFixture } from "./fixture";

describe("an advance from asking to closing", () => {
  let f: SalaryFixture;
  const today = d("2026-10-13");
  let id = "";

  beforeAll(async () => {
    f = await makeSalarySchool("Salary Advances School");
  });

  it("refuses an installment above the amount and an empty reason", async () => {
    const acc = as(f, f.accountant.id);
    await expect(withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: f.staffB.id, type: "ADVANCE", amountPaise: R(5000), installmentPaise: R(6000), startMonth: d("2026-11-01"), reason: "Festival" }))).rejects.toThrow(/more than the amount/);
    await expect(withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: f.staffB.id, type: "ADVANCE", amountPaise: R(5000), installmentPaise: R(5000), startMonth: d("2026-11-01"), reason: "" }))).rejects.toThrow(/reason/);
  });

  it("cannot be paid before approval, and the asker cannot approve it", async () => {
    const acc = as(f, f.accountant.id);
    const a = await withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: f.staffB.id, type: "LOAN", amountPaise: R(12000), installmentPaise: R(2000), startMonth: d("2026-11-01"), reason: "Medical" }));
    id = a.id;
    await expect(withSchool(acc, (tx) => payAdvance(tx, acc, id, { date: today, mode: "CASH", reference: null, accountId: null, today }))).rejects.toThrow(/waiting/);
    await expect(withSchool(acc, (tx) => decide(tx, acc, a.approvalId!, "approve", null))).rejects.toThrow(/own request/);
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), a.approvalId!, "approve", null));
    await withSchool(acc, (tx) => payAdvance(tx, acc, id, { date: d("2026-10-09"), mode: "CASH", reference: null, accountId: null, today }));
    const out = await withSchool(acc, (tx) => tx.dayBookEntry.findMany({ where: { sourceType: "salary-advance", sourceId: id } }));
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("OUT");
    expect(out[0].amountPaise).toBe(R(12000));
  });

  it("pauses and changes the installment only with a reason", async () => {
    const acc = as(f, f.accountant.id);
    await expect(withSchool(acc, (tx) => setPaused(tx, acc, id, true, ""))).rejects.toThrow(/reason/);
    await withSchool(acc, (tx) => setPaused(tx, acc, id, true, "Unpaid leave in November"));
    await expect(withSchool(acc, (tx) => changeInstallment(tx, acc, id, R(20000), "Faster"))).rejects.toThrow(/more than the balance/);
    await withSchool(acc, (tx) => changeInstallment(tx, acc, id, R(3000), "Asked to repay faster"));
    const a = await withSchool(acc, (tx) => tx.salaryAdvance.findUniqueOrThrow({ where: { id } }));
    expect(a.paused).toBe(true);
    expect(a.installmentPaise).toBe(R(3000));
    expect((a.history as unknown[]).length).toBeGreaterThanOrEqual(4);
  });

  it("closes when repaid in cash, with a receipt in the Day Book", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, (tx) => closeRepaidInCash(tx, acc, id, { date: today, reason: "Repaid from the Diwali bonus", today }));
    const a = await withSchool(acc, (tx) => tx.salaryAdvance.findUniqueOrThrow({ where: { id } }));
    expect(a.status).toBe("CLOSED");
    expect(balanceOf(a)).toBe(R(0));
    const inn = await withSchool(acc, (tx) => tx.dayBookEntry.findMany({ where: { sourceType: "salary-advance", sourceId: id, direction: "IN" } }));
    expect(inn).toHaveLength(1);
    expect(inn[0].amountPaise).toBe(R(12000));
    await expect(withSchool(acc, (tx) => closeRepaidInCash(tx, acc, id, { date: today, reason: "Again", today }))).rejects.toThrow(/active/);
  });

  it("gives HR's View the days report only, never a money report", async () => {
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => {
      expect(await buildSalaryReport(tx, "summary", { from: null, to: null, money: false })).toBeNull();
      expect(await buildSalaryReport(tx, "deductions", { from: null, to: null, money: false })).toBeNull();
      const days = await buildSalaryReport(tx, "days", { from: null, to: null, money: false });
      expect(days?.columns.map((c) => c.label)).not.toContain("Net");
    });
  });
});
