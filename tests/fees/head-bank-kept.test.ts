// Self-test 14 Nov: with bank accounts per fee head switched off the form has no Bank account field, and
// editing a head cleared the account it had. Left out (undefined), the head now keeps it.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveFeeHead } from "@/lib/fees/structure";
import { makeFeeSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeFeeSchool>>;
beforeAll(async () => { f = await makeFeeSchool(); }, 120_000);

describe("fee head bank account", () => {
  it("is kept when the edit leaves it out, and cleared only when sent empty", async () => {
    await withSchool(f.ctx, async (tx) => {
      const bank = await tx.bankAccount.create({ data: { schoolId: f.school.id, kind: "BANK", name: "Head bank" } });
      const head = await saveFeeHead(tx, f.ctx, { name: "Lab fee", kind: "other", taxable: false, gstRateBp: null, sacCode: null, bankAccountId: bank.id, lateFeeApplies: false });
      await saveFeeHead(tx, f.ctx, { name: "Lab fee renamed", kind: "other", taxable: false, gstRateBp: null, sacCode: null, lateFeeApplies: false }, head.id);
      expect((await tx.feeHead.findUniqueOrThrow({ where: { id: head.id } })).bankAccountId).toBe(bank.id);
      await saveFeeHead(tx, f.ctx, { name: "Lab fee renamed", kind: "other", taxable: false, gstRateBp: null, sacCode: null, bankAccountId: null, lateFeeApplies: false }, head.id);
      expect((await tx.feeHead.findUniqueOrThrow({ where: { id: head.id } })).bankAccountId).toBeNull();
    });
  });
});
