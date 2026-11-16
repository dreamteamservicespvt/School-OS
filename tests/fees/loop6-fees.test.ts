// Layman loop 6 (2026-11-16), fee money words that must match the ledger:
// L6-19 a reprinted receipt says the balance as at that receipt, not today's;
// L6-26 an ageing group's view says the money and the days IN that group;
// L6-27 the Collection report says "before refunds" and the net number;
// L6-28 the Users list's two-step status follows the same rule as My profile.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/fees/handlers";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { feeViewer } from "@/lib/fees/access";
import { balanceAfterPayment, studentLedger } from "@/lib/fees/ledger";
import { defaulterLists } from "@/lib/fees/defaulters";
import { ageingIndexOf, feeSettings } from "@/lib/fees/settings";
import { FEE_REPORTS } from "@/lib/fees/reports";
import { markRefunded, requestRefund } from "@/lib/fees/refunds";
import { twoStepStateOf } from "@/lib/settings/user-list";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const TODAY = new Date("2026-11-16T00:00:00Z");

const viewerOf = async (userId: string) => {
  const view = await accessIn(userId, f.school.id);
  const current = { ...view!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
  return withSchool(f.ctx, (tx) => feeViewer(tx, f.ctx, current));
};

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("L6-19: balance after a receipt", () => {
  it("is the running balance on that payment's line, not today's balance", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    const first = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(1000) });
    const second = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(500) });
    const led = await withSchool(f.ctx, (tx) => studentLedger(tx, f.ravi.id, TODAY, "Asia/Kolkata"));
    const afterFirst = balanceAfterPayment(led.entries, first.payment.id);
    const afterSecond = balanceAfterPayment(led.entries, second.payment.id);
    expect(afterFirst).not.toBeNull();
    // The first receipt left ₹500 more than the second one did; the second matches today's balance.
    expect(afterFirst! - afterSecond!).toBe(R(500));
    expect(afterSecond).toBe(led.balanceNow);
    expect(afterFirst).not.toBe(led.balanceNow);
    expect(balanceAfterPayment(led.entries, "00000000-0000-0000-0000-000000000000")).toBeNull();
  }, 120_000);
});

describe("L6-26: an ageing group's own days and money", () => {
  it("keeps, per group, the money and the oldest due date that fall in it", async () => {
    const viewer = await viewerOf(f.accountant.id);
    const { rows, ageing, settings } = await withSchool(f.ctx, async (tx) => {
      const settings = await feeSettings(tx, f.ctx);
      const [all] = await defaulterLists(tx, f.ctx, viewer, TODAY, [{}]);
      return { rows: all.rows, ageing: settings.ageing, settings };
    });
    expect(settings).toBeTruthy();
    const sita = rows.find((r) => r.studentId === f.sita.id)!;
    expect(sita).toBeTruthy();
    const open = (await dues(f.ctx, f.sita.id)).filter((d) => d.dueDate < TODAY);
    expect(open.length).toBeGreaterThan(1);
    for (const d of open) {
      const days = Math.floor((TODAY.getTime() - d.dueDate.getTime()) / 86_400_000);
      const g = ageingIndexOf(ageing, days);
      // Each group's oldest date is never older than its own rows: a 0-30 group never says 159 days.
      const oldest = sita.oldestByAge[g]!;
      expect(oldest).not.toBeNull();
      const inGroup = open.filter((x) => ageingIndexOf(ageing, Math.floor((TODAY.getTime() - x.dueDate.getTime()) / 86_400_000)) === g);
      expect(oldest.getTime()).toBe(Math.min(...inGroup.map((x) => x.dueDate.getTime())));
      expect(sita.overdueByAge[g]).toBe(inGroup.reduce((s, x) => s + x.balancePaise, BigInt(0)));
    }
    // The groups add up to the student's whole overdue.
    expect(sita.overdueByAge.reduce((s, x) => s + x, BigInt(0))).toBe(sita.overduePaise);
  });
});

describe("L6-27: Collection report, before and net of refunds", () => {
  it("names the refunds paid in the period and the net amount", async () => {
    const open = await dues(f.ctx, f.anil.id);
    const r = await collect(f.ctx, { studentId: f.anil.id, dueIds: [open[0].id], amountPaise: R(6000) });
    const refund = await withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: r.payment.id, amountPaise: R(1000), reason: "Paid twice", mode: "CASH" }));
    const waiting = await withSchool(f.ctx, (tx) => tx.refund.findUniqueOrThrow({ where: { id: refund.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, waiting.approvalId!, "approve", null));
    await withSchool(f.ctx, (tx) => markRefunded(tx, f.ctx, refund.id, { date: r.payment.paymentDate, reference: null, accountId: null }));
    const viewer = await viewerOf(f.accountant.id);
    const report = FEE_REPORTS.find((x) => x.key === "collection")!;
    const from = new Date(r.payment.paymentDate.getTime() - 86_400_000);
    const to = new Date(r.payment.paymentDate.getTime() + 86_400_000);
    const out = await withSchool(f.ctx, (tx) => report.run(tx, f.ctx, { from, to, classId: null, feeHeadId: null, mode: null, collectorId: null, group: "month", today: to }, viewer));
    const collected = out.totals!.amount as bigint;
    expect(out.note).toContain("Collected is before refunds.");
    expect(out.note).toContain("₹1,000 paid back");
    const net = (collected - R(1000)) / BigInt(100);
    expect(out.note).toContain(`net of refunds ₹${Number(net).toLocaleString("en-IN")}`);
  }, 120_000);
});

describe("L6-28: two-step login status", () => {
  const base = { featureOn: true, roleNeeds: true, chosen: false, email: null, phone: "9876500000", mailReady: false, smsReady: false };
  it("is not 'On' when no code can reach the person", () => {
    expect(twoStepStateOf(base)).toBe("no-code");
    expect(twoStepStateOf({ ...base, smsReady: true })).toBe("on");
    expect(twoStepStateOf({ ...base, email: "a@b.in", mailReady: true })).toBe("on");
  });
  it("is off when the school switched the feature off, unless the person chose it", () => {
    expect(twoStepStateOf({ ...base, featureOn: false, smsReady: true })).toBe("off");
    expect(twoStepStateOf({ ...base, featureOn: false, chosen: true, smsReady: true })).toBe("on");
    expect(twoStepStateOf({ ...base, roleNeeds: false })).toBe("off");
  });
});
