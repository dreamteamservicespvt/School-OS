// A school that starts part way through the year (workflow 15; gap list G14):
// the whole year's plan has installments due before go-live. Past receipts pay
// them first; what is still unpaid is inside the old dues or was collected in
// the old software, so "Settle" takes it off and it is never billed twice.
// Late fees never count the days before go-live.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { importKind, previewImport, runImport } from "@/lib/importer";
import "@/lib/fees/import";
import { beforeGoLive, settleBeforeGoLive, undoSettleBeforeGoLive, SETTLED_REASON } from "@/lib/fees/before-go-live";
import { addLateFees } from "@/lib/fees/late-fees";
import { dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const GO_LIVE = new Date("2026-11-01T00:00:00Z");
const RECEIPT_COLS = { admissionNo: 0, oldReceiptNo: 1, date: 2, amount: 3, mode: 4, feeHead: 5 };
const DUES_COLS = { admissionNo: 0, feeHead: 1, amount: 2, dueDate: 3, note: 4 };
const rupees = (p: bigint) => Number(p) / 100;

async function bringIn(key: string, rows: string[][], match: Record<string, number>) {
  const kind = importKind(key)!;
  await withSchool(f.ctx, async (tx) => {
    const preview = await previewImport(tx, f.ctx, kind, rows, match);
    expect(preview.bad).toEqual([]);
    await runImport(tx, f.ctx, kind, "old.csv", preview);
  });
}

const check = () => withSchool(f.ctx, (tx) => beforeGoLive(tx, f.ctx, GO_LIVE));
const balances = async (studentId: string) => (await dues(f.ctx, studentId)).filter((d) => d.kind === "FEE").map((d) => rupees(d.balancePaise));

beforeAll(async () => {
  // Quarterly tuition of ₹6,000: 10 April, 10 July, 10 October and 10 January.
  f = await makeFeeSchool();
  await withSchool(f.ctx, (tx) => tx.moveInPlan.create({ data: { schoolId: f.school.id, goLiveDate: GO_LIVE } }));
  // Ravi paid ₹7,000 in the old software and still owed ₹5,000 there; Anil owed ₹2,500 from last year; Sita has neither.
  await bringIn("fee-past-receipts", [[f.ravi.admissionNo, "OLD-1", "15-04-2026", "7000", "Cash", ""]], RECEIPT_COLS);
  await bringIn("fee-old-dues", [[f.ravi.admissionNo, "", "5000", "31-10-2026", "Unpaid on go-live"], [f.anil.admissionNo, "", "2500", "31-03-2026", "From 2025-26"]], DUES_COLS);
}, 120_000);

describe("fees due before go-live", () => {
  it("shows what past receipts did not pay, and where old dues may count the same months twice", async () => {
    expect(await balances(f.ravi.id)).toEqual([0, 5000, 6000, 6000]);
    const c = await check();
    // Ravi 5,000 + 6,000; Sita and Anil 6,000 x 3 each.
    expect(c.owed).toEqual({ rows: 8, students: 3, paise: R(47000) });
    expect(c.withOldDues).toEqual({ rows: 5, students: 2, paise: R(29000) });
    expect(c.settled).toEqual({ rows: 0, students: 0, paise: R(0) });
  });

  it("settles them for students with old dues brought in, as adjustments with the reason, never in the Day Book", async () => {
    const before = await withSchool(f.ctx, (tx) => tx.dayBookEntry.count());
    const r = await withSchool(f.ctx, (tx) => settleBeforeGoLive(tx, f.ctx, { scope: "old-dues", goLive: GO_LIVE }));
    expect(r).toMatchObject({ rows: 5, students: 2, paise: R(29000) });
    // The receipt's row stays paid; the January quarter after go-live is still owed; the old dues are untouched.
    expect(await balances(f.ravi.id)).toEqual([0, 0, 0, 6000]);
    expect(await balances(f.anil.id)).toEqual([0, 0, 0, 6000]);
    expect(await balances(f.sita.id)).toEqual([6000, 6000, 6000, 6000]);
    const old = (await dues(f.ctx, f.ravi.id)).find((d) => d.kind === "OLD_DUES")!;
    expect(old.balancePaise).toBe(R(5000));
    const adj = await withSchool(f.ctx, (tx) => tx.feeAdjustment.findMany({ where: { studentId: f.ravi.id }, orderBy: { amountPaise: "asc" } }));
    expect(adj.map((a) => [rupees(a.amountPaise), a.reason])).toEqual([[-6000, `${SETTLED_REASON} on 01-11-2026`], [-5000, `${SETTLED_REASON} on 01-11-2026`]]);
    expect(await withSchool(f.ctx, (tx) => tx.dayBookEntry.count())).toBe(before);
    const c = await check();
    expect(c.owed).toEqual({ rows: 3, students: 1, paise: R(18000) });
    expect(c.settled).toEqual({ rows: 5, students: 2, paise: R(29000) });
    // Nothing left to settle for them.
    await expect(withSchool(f.ctx, (tx) => settleBeforeGoLive(tx, f.ctx, { scope: "old-dues", goLive: GO_LIVE }))).rejects.toThrow(/Nothing is owed on fees due before 01-11-2026/);
  });

  it("undo puts the amounts back", async () => {
    const r = await withSchool(f.ctx, (tx) => undoSettleBeforeGoLive(tx, f.ctx));
    expect(r).toMatchObject({ rows: 5, students: 2, paise: R(29000) });
    expect(await balances(f.ravi.id)).toEqual([0, 5000, 6000, 6000]);
    expect((await check()).owed.paise).toBe(R(47000));
    expect((await check()).settled.rows).toBe(0);
  });

  it("settles every student's, and an unpaid late fee on a settled row comes off with it", async () => {
    const [q1] = await dues(f.ctx, f.sita.id);
    const late = await withSchool(f.ctx, (tx) => tx.studentFeeDue.create({ data: { schoolId: f.school.id, studentId: f.sita.id, academicYearId: q1.academicYearId, feeHeadId: q1.feeHeadId, kind: "LATE_FEE", label: "Late fee", dueDate: new Date("2026-05-01"), amountPaise: R(200), balancePaise: R(200), parentDueId: q1.id } }));
    const r = await withSchool(f.ctx, (tx) => settleBeforeGoLive(tx, f.ctx, { scope: "all", goLive: GO_LIVE }));
    expect(r).toMatchObject({ rows: 8, students: 3, paise: R(47000), lateFeesRemoved: 1 });
    expect(await balances(f.sita.id)).toEqual([0, 0, 0, 6000]);
    expect((await withSchool(f.ctx, (tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id: late.id } }))).state).toBe("REMOVED");
    expect((await check()).owed.rows).toBe(0);
  });
});

describe("late fees after a mid-year start", () => {
  it("never count the days before go-live", async () => {
    await withSchool(f.ctx, (tx) => undoSettleBeforeGoLive(tx, f.ctx));
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { lateFeeOn: true, lateFeeType: "per-day", lateFeePaise: R(10), graceDays: 0, lateFeeMaxPaise: null } }));
    // Five days after go-live: ₹10 a day for 5 days, not for the 200 days since 10 April.
    await withSchool(f.ctx, (tx) => addLateFees(tx, f.ctx, new Date("2026-11-06T00:00:00Z")));
    const late = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId: f.anil.id, kind: "LATE_FEE", state: "OPEN" } }));
    expect(late.map((l) => rupees(l.amountPaise))).toEqual([50, 50, 50]);
  });
});
