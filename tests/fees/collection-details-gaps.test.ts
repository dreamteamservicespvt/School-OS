// Collection details lists posted payments only. A cancelled payment keeps its
// receipt number (fee payments are never deleted), so the receipt numbers in
// the list jump: 00002, 00004. The report must say which receipts are not in
// the list and why, so an accountant does not think a receipt is missing
// (live test as Principal, 17 Nov 2026).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { findFeeReport } from "@/lib/fees/reports";
import type { FeeViewer } from "@/lib/fees/access";
import { cancelPayment } from "@/lib/fees/cancel";
import { formatDate } from "@/lib/format";
import { todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const TZ = "Asia/Kolkata";
const today = todayIn(TZ);

const viewerOf = (s: FeeSchool): FeeViewer => ({ userId: s.accountant.id, see: "all", change: "all", roleKeys: ["accountant"], sectionIds: null, yearId: s.year.id, yearIds: [s.year.id], campusId: null });
const filter = { from: today, to: today, classId: null, feeHeadId: null, mode: null, collectorId: null, group: "day" as const, today };

beforeAll(async () => {
  f = await makeFeeSchool();
}, 180_000);

describe("Collection details explains the receipt numbers that are not in the list", () => {
  it("says nothing when every receipt of the period is in the list", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(1000) });
    await withSchool(f.ctx, async (tx) => {
      const details = await findFeeReport("collection-details")!.run(tx, f.ctx, filter, viewerOf(f));
      expect(details.rows.length).toBe(1);
      expect(details.note ?? "").not.toContain("not in this list");
    });
  });

  it("names each cancelled receipt and the day it was cancelled, and leaves the total alone", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    const gone = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(500), confirmDuplicate: true });
    const kept = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(300), confirmDuplicate: true });
    await withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, gone.payment.id, { reason: "Wrong amount", note: null }));
    await withSchool(f.ctx, async (tx) => {
      const numberOf = async (paymentId: string) => (await tx.receipt.findUniqueOrThrow({ where: { paymentId } })).number;
      const goneNo = await numberOf(gone.payment.id);
      const keptNo = await numberOf(kept.payment.id);
      const details = await findFeeReport("collection-details")!.run(tx, f.ctx, filter, viewerOf(f));
      const listed = details.rows.map((r) => r.receipt);
      expect(listed).toContain(keptNo);
      expect(listed).not.toContain(goneNo);
      // The cancelled receipt is named under the table with the day it was cancelled (school time).
      expect(details.note).toContain(`Receipts not in this list: ${goneNo} (cancelled ${formatDate(new Date(), TZ)})`);
      expect(details.note).toContain("Cancelled payments report");
      // The money total is still the posted payments only: 1,000 + 300.
      expect(details.totals?.amount).toBe(R(1300));
    });
  });

  it("keeps to the filters on screen: another mode's cancelled receipt is not named", async () => {
    await withSchool(f.ctx, async (tx) => {
      const details = await findFeeReport("collection-details")!.run(tx, f.ctx, { ...filter, mode: "UPI" }, viewerOf(f));
      expect(details.rows.length).toBe(0);
      expect(details.note ?? "").not.toContain("not in this list");
    });
  });
});
