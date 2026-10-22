// PF, ESI, Professional Tax and TDS to pay to the government (gap list G34,
// 10 §6 D9, 07 §2 Accounts "Payables"): what a paid salary month took for the
// government stays to pay until recorded paid; paying posts to the Day Book on
// the date paid; a wrong payment is cancelled with a reversal; a school that
// had salary before chooses the month tracking starts.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { saveStructure } from "@/lib/salary/structures";
import { openRun, calculateRun, sendForApproval, markPaid, reversePayment } from "@/lib/salary/payroll";
import { cancelStatutoryPayment, payStatutory, setDuesTracking, statutoryDues } from "@/lib/salary/statutory-payments";
import { findFinanceReport } from "@/lib/finance/reports";
import { financialYearOf } from "@/lib/finance/years";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

let f: SalaryFixture;
let runId = "";
const today = d("2026-10-13");
const sep = d("2026-09-01");

beforeAll(async () => {
  f = await makeSalarySchool("Statutory Dues School");
  const acc = as(f, f.accountant.id);
  await withSchool(acc, async (tx) => {
    await tx.statutorySetting.updateMany({ data: { ptOn: false } });
    await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(22000, 8000), pfApplies: true, esiApplies: true, tdsPaise: R(1000), reason: null });
    await saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-04-01"), lines: lines(12000, 6000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
  });
  const run = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: sep, today }));
  runId = run.id;
  await withSchool(acc, (tx) => calculateRun(tx, acc, runId, today));
  const sent = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
  await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), sent.approvalId!, "approve", null));
}, 180_000);

const acc = () => as(f, f.accountant.id);
const dues = () => withSchool(acc(), (tx) => statutoryDues(tx, { runId, today }));
const pay = (kind: string, rupees: number, extra: { mode?: string; reference?: string | null } = {}) =>
  withSchool(acc(), (tx) => payStatutory(tx, acc(), { runId, kind, amountPaise: R(rupees), date: d("2026-10-10"), mode: extra.mode ?? "BANK_TRANSFER", reference: extra.reference === undefined ? "TRRN123456" : extra.reference, accountId: null }));

describe("PF, ESI, Professional Tax and TDS to pay", () => {
  it("owes nothing before the month's salary is marked paid", async () => {
    expect(await dues()).toEqual([]);
    await expect(pay("PF", 100)).rejects.toThrow("September 2026 salary is not marked paid yet");
  });

  it("owes the staff share and the school's share once paid, due by the 15th (TDS by the 7th)", async () => {
    await withSchool(acc(), (tx) => markPaid(tx, acc(), runId, { date: d("2026-09-30"), mode: "BANK_TRANSFER", reference: "UTR1", accountId: null, today }));
    const list = await dues();
    const pf = list.find((x) => x.kind === "PF")!;
    // Ravi: PF on the ₹15,000 ceiling, ₹1,800 each side; Kavitha: 12% of ₹12,000, ₹1,440 each side.
    expect(pf.staffShare).toBe(R(1800 + 1440));
    expect(pf.schoolShare).toBe(R(1800 + 1440));
    expect(pf.balance).toBe(R(6480));
    expect(pf.dueDate).toEqual(d("2026-10-15"));
    const esi = list.find((x) => x.kind === "ESI")!;
    expect(esi.staffShare).toBe(R(135));
    expect(esi.schoolShare).toBe(R(585));
    const tds = list.find((x) => x.kind === "TDS")!;
    expect(tds.balance).toBe(R(1000));
    expect(tds.dueDate).toEqual(d("2026-10-07"));
    expect(tds.overdue).toBe(true);
    expect(list.some((x) => x.kind === "PT")).toBe(false);
  });

  it("records part of it paid, into the Day Book on the date paid under Salaries; never more than is left", async () => {
    await expect(pay("PF", 7000)).rejects.toThrow("Only ₹6,480 of PF for September 2026 is left to pay.");
    await expect(pay("PF", 1000, { reference: null })).rejects.toThrow("Enter the challan or reference number.");
    const r = await pay("PF", 6000);
    expect(r.left).toBe(R(480));
    await withSchool(acc(), async (tx) => {
      const e = await tx.dayBookEntry.findFirstOrThrow({ where: { sourceType: "statutory-payment", sourceId: r.payment.id } });
      expect(e).toMatchObject({ direction: "OUT", amountPaise: R(6000), section: "salary", headName: "PF paid", partyName: "PF for September 2026 · EPFO" });
      expect(e.date).toEqual(d("2026-10-10"));
      const salaries = await tx.accountHead.findFirstOrThrow({ where: { systemKey: "salary" } });
      expect(e.accountHeadId).toBe(salaries.id);
    });
    expect((await dues()).find((x) => x.kind === "PF")!.balance).toBe(R(480));
    await pay("PF", 480);
    expect((await dues()).find((x) => x.kind === "PF")!.balance).toBe(R(0));
    await expect(pay("PF", 1)).rejects.toThrow("PF for September 2026 is already paid in full.");
  });

  it("lists what is left in Pending expenses, and not for people who may not see staff pay", async () => {
    const fy = await withSchool(acc(), (tx) => financialYearOf(tx, acc(), today));
    const filter = { financialYearId: fy.id, yearStart: fy.startDate, from: fy.startDate, to: today, group: "month" as const, by: "head" as const, today };
    const seen = await withSchool(acc(), (tx) => findFinanceReport("pending-expenses")!.run(tx, acc(), { ...filter, hidePay: null }));
    expect(seen.rows.map((r) => r.number)).toEqual(expect.arrayContaining(["ESI · September 2026 salary", "TDS · September 2026 salary"]));
    expect(seen.rows.some((r) => String(r.number).startsWith("PF"))).toBe(false);
    const hidden = await withSchool(acc(), (tx) => findFinanceReport("pending-expenses")!.run(tx, acc(), { ...filter, hidePay: [] }));
    expect(hidden.rows.some((r) => String(r.number).includes("salary"))).toBe(false);
  });

  it("keeps the month's payment from being reversed while PF is recorded paid; a cancelled payment is to pay again", async () => {
    await expect(withSchool(acc(), (tx) => reversePayment(tx, acc(), runId, "Bank returned the batch", today))).rejects.toThrow("PF for September 2026 is already recorded paid to the government. Cancel that payment first.");
    const first = await withSchool(acc(), (tx) => tx.statutoryPayment.findFirstOrThrow({ where: { runId, kind: "PF", amountPaise: R(480) } }));
    await expect(withSchool(acc(), (tx) => cancelStatutoryPayment(tx, acc(), first.id, "no", today))).rejects.toThrow("Give a reason of at least 5 characters.");
    await withSchool(acc(), (tx) => cancelStatutoryPayment(tx, acc(), first.id, "Challan entered twice", today));
    await expect(withSchool(acc(), (tx) => cancelStatutoryPayment(tx, acc(), first.id, "Challan entered twice", today))).rejects.toThrow("already cancelled");
    expect((await dues()).find((x) => x.kind === "PF")!.balance).toBe(R(480));
    await withSchool(acc(), async (tx) => {
      expect(await tx.statutoryPayment.count({ where: { runId } })).toBe(2);
      const rev = await tx.dayBookEntry.findFirstOrThrow({ where: { sourceType: "statutory-cancel", sourceId: first.id } });
      expect(rev).toMatchObject({ direction: "IN", amountPaise: R(480) });
    });
  });

  it("tracks only from the month the school chooses, and nothing when it is off", async () => {
    await withSchool(acc(), (tx) => setDuesTracking(tx, acc(), d("2026-10-01")));
    expect(await dues()).toEqual([]);
    await expect(pay("TDS", 1000)).rejects.toThrow("PF, ESI, Professional Tax and TDS for September 2026 are not tracked here.");
    await withSchool(acc(), (tx) => setDuesTracking(tx, acc(), null));
    expect(await withSchool(acc(), (tx) => statutoryDues(tx))).toEqual([]);
    await withSchool(acc(), (tx) => setDuesTracking(tx, acc(), sep));
    expect((await dues()).find((x) => x.kind === "TDS")!.balance).toBe(R(1000));
  });
});
