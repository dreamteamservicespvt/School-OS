// The go-live check's money (workflow 15, step 9; gap list G14): old dues, past
// receipts, advance, and the cash and bank opening balances School OS holds,
// beside the figures typed from the old software, with plain warnings when they
// differ and when fees due before go-live are still owed. The go-live date is
// entered once: finance records start on it too.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { importKind, previewImport, runImport } from "@/lib/importer";
import "@/lib/fees/import";
import { setOpeningBalance } from "@/lib/finance/accounts";
import { financialYearOf } from "@/lib/finance/years";
import { goLive, goLiveSummary, saveExpected, MoveInProblem } from "@/lib/move-in/service";
import { moneyWarnings } from "@/lib/move-in/money";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const GO_LIVE = new Date("2026-11-01T00:00:00Z");
const RECEIPT_COLS = { admissionNo: 0, oldReceiptNo: 1, date: 2, amount: 3, mode: 4, feeHead: 5 };
const DUES_COLS = { admissionNo: 0, feeHead: 1, amount: 2, dueDate: 3, note: 4 };
const P = (rupees: number) => String(R(rupees));

async function bringIn(key: string, rows: string[][], match: Record<string, number>) {
  const kind = importKind(key)!;
  await withSchool(f.ctx, async (tx) => {
    const preview = await previewImport(tx, f.ctx, kind, rows, match);
    expect(preview.bad).toEqual([]);
    await runImport(tx, f.ctx, kind, "old.csv", preview);
  });
}

const summary = () => withSchool(f.pctx, (tx) => goLiveSummary(tx, f.pctx));

beforeAll(async () => {
  f = await makeFeeSchool();
  // What the old software shows: old dues ₹7,500, ₹10,000 collected this year (it really is ₹37,000), cash ₹12,345.
  await withSchool(f.pctx, (tx) => saveExpected(tx, f.pctx, { oldSoftware: "Old ERP", goLiveDate: GO_LIVE, expected: { students: 3, staff: null, guardians: null, oldDues: P(7500), pastReceipts: P(10000), cash: P(12345) } }));
  await bringIn("fee-past-receipts", [
    [f.ravi.admissionNo, "OLD-1", "15-04-2026", "7000", "Cash", ""],
    [f.sita.admissionNo, "OLD-2", "20-04-2026", "30000", "UPI", ""],
  ], RECEIPT_COLS);
  await bringIn("fee-old-dues", [[f.ravi.admissionNo, "", "5000", "31-10-2026", ""], [f.anil.admissionNo, "", "2500", "31-03-2026", ""]], DUES_COLS);
  await withSchool(f.ctx, async (tx) => {
    const cash = await tx.bankAccount.findFirstOrThrow({ where: { kind: "CASH" } });
    await setOpeningBalance(tx, f.ctx, { accountId: cash.id, amountPaise: R(12345), date: GO_LIVE, note: null });
  });
}, 120_000);

describe("the money in the go-live check", () => {
  it("adds up old dues, past receipts, advance and opening balances", async () => {
    const m = (await summary()).money;
    expect(m.goLive).toEqual(GO_LIVE);
    expect(m.oldDues).toEqual({ students: 2, paise: R(7500) });
    expect(m.pastReceipts).toEqual({ receipts: 2, students: 2, paise: R(37000) });
    // Sita paid ₹30,000 against ₹24,000 of fees: ₹6,000 is held as advance.
    expect(m.advances).toEqual({ students: 1, paise: R(6000) });
    expect(m.cash).toEqual({ accounts: 1, missing: [], paise: R(12345) });
    // The main bank account Finance Management starts with has no opening balance yet.
    expect(m.bank).toEqual({ accounts: 1, missing: ["Main bank account"], paise: R(0) });
    // Ravi's July and October quarters (₹5,000 + ₹6,000), Anil's first three (₹18,000): both have old dues.
    expect(m.before?.owed).toEqual({ rows: 5, students: 2, paise: R(29000) });
    expect(m.before?.withOldDues).toEqual({ rows: 5, students: 2, paise: R(29000) });
  });

  it("warns in plain words where the money differs from the old software, and where months may count twice", async () => {
    const s = await summary();
    const w = moneyWarnings(s.money, s.expected).join("\n");
    expect(w).toContain("Your old software says fees collected this year of ₹10,000; School OS has ₹37,000 (₹27,000 more).");
    expect(w).not.toMatch(/says old dues/);
    expect(w).not.toMatch(/says cash in hand/);
    expect(w).toContain("2 students have old dues brought in and ₹29,000 of fees due before 01-11-2026 still owed on the fee plan. The same months may be counted twice");
    expect(w).toContain("Main bank account has no opening balance yet.");
    // Someone who does not see fees is not told about them.
    expect(moneyWarnings(s.money, s.expected, { fees: false, finance: true }).join(" ")).not.toMatch(/fees|old dues/);
  });

  it("enters the go-live date once: finance records start on it too, never after a record already made", async () => {
    const fin = await withSchool(f.ctx, (tx) => tx.financeSetting.findUniqueOrThrow({ where: { schoolId: f.school.id } }));
    expect(fin.goLiveDate).toEqual(GO_LIVE);
    await withSchool(f.ctx, async (tx) => {
      const day = new Date("2026-11-20T00:00:00Z");
      const fy = await financialYearOf(tx, f.ctx, day);
      await tx.dayBookEntry.create({ data: { schoolId: f.school.id, financialYearId: fy.id, date: day, direction: "IN", amountPaise: R(100), mode: "CASH", section: "other-income", headName: "Other", sourceType: "income", sourceId: "test", sourceKey: "test:income", partyName: "Test" } });
    });
    await expect(withSchool(f.pctx, (tx) => saveExpected(tx, f.pctx, { oldSoftware: "Old ERP", goLiveDate: new Date("2026-12-01T00:00:00Z"), expected: {} }))).rejects.toThrow(MoveInProblem);
    await expect(withSchool(f.pctx, (tx) => saveExpected(tx, f.pctx, { oldSoftware: "Old ERP", goLiveDate: new Date("2026-12-01T00:00:00Z"), expected: {} }))).rejects.toThrow(/Finance records start on 20-11-2026/);
  });

  it("keeps the money it went live with", async () => {
    // A save that leaves the money out (a person who does not see fees) keeps the figures typed before.
    await withSchool(f.pctx, (tx) => saveExpected(tx, f.pctx, { oldSoftware: "Old ERP", goLiveDate: GO_LIVE, expected: { students: 3 } }));
    await withSchool(f.pctx, (tx) => goLive(tx, f.pctx), { timeout: 60_000 });
    const plan = await withSchool(f.ctx, (tx) => tx.moveInPlan.findUniqueOrThrow({ where: { schoolId: f.school.id } }));
    expect(plan.goLiveDate).toEqual(GO_LIVE);
    expect(plan.liveSummary).toMatchObject({ money: { goLive: "01-11-2026", oldDues: P(7500), pastReceipts: P(37000), advances: P(6000), cash: P(12345), bank: "0", owedBeforeGoLive: P(29000) } });
    const e = (plan.expected ?? {}) as Record<string, unknown>;
    expect(e.oldDues).toBe(P(7500));
  });
});
