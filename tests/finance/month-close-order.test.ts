// QA audit (MONEY-08): months close in order. The Close month sheet said "Close April
// 2026 first" but still closed May; the server must refuse it.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { closeMonth } from "@/lib/finance/accounts";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
const today = new Date("2026-10-16T00:00:00Z");
const month = (m: string) => new Date(`${m}-01T00:00:00Z`);

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("closing a month", () => {
  it("refuses a month while an earlier one is open, then closes them in order", async () => {
    await expect(withSchool(f.ctx, (tx) => closeMonth(tx, f.ctx, month("2026-05"), today))).rejects.toThrow("Close April 2026 first: months close in order.");
    await withSchool(f.ctx, (tx) => closeMonth(tx, f.ctx, month("2026-04"), today));
    await withSchool(f.ctx, (tx) => closeMonth(tx, f.ctx, month("2026-05"), today));
    await withSchool(f.ctx, async (tx) => expect(await tx.periodClose.count()).toBe(2));
  });
});
