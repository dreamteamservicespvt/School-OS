// Approval limits restrain the Accountant, so the Accountant cannot change them
// (security audit run-2, medium). The concession limit, "cancelling an older
// payment needs approval", verify-before-posting and the counter permissions
// in Fee Settings, and "Approved at once up to" and "Bill photo needed above"
// in Finance Settings, are changed only by someone with Settings change reach
// "all" (the Principal or the School Admin). The Accountant keeps the rest of
// those cards (receipt prefixes). Calls the real server actions.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { feeSettings } from "@/lib/fees/settings";
import { financeSettings } from "@/lib/finance/settings";
import { COUNTER_PERMISSIONS } from "@/lib/fees/words";
import { makeFeeSchool, type FeeSchool } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId } };
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));
const fees = await import("@/app/(school)/fee-management/settings/actions");
const finance = await import("@/app/(school)/finance-management/settings/actions");

let f: FeeSchool;
const form = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x); return fd; };
const as = (u: { id: string }) => { who.userId = u.id; who.schoolId = f.school.id; };
const rupees = (p: bigint) => String(p / BigInt(100));

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("approval limits are not the Accountant's to change", () => {
  it("refuses the Accountant's Payments card and leaves the limits as they were", async () => {
    const before = await withSchool(f.ctx, (tx) => feeSettings(tx, f.ctx));
    as(f.accountant);
    const r = await fees.paymentsAction(null, form({ limit: "999999", verifyMode: [] }));
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/Principal or the School Admin/);
    const after = await withSchool(f.ctx, (tx) => feeSettings(tx, f.ctx));
    expect(after.concessionLimitPaise).toBe(before.concessionLimitPaise);
    expect(after.cancelPastApproval).toBe(before.cancelPastApproval);
  });

  it("refuses the Accountant's counter permissions", async () => {
    const before = await withSchool(f.ctx, (tx) => feeSettings(tx, f.ctx));
    as(f.accountant);
    const fd: Record<string, string[]> = {};
    for (const p of COUNTER_PERMISSIONS) fd[p.key] = ["accountant"];
    const r = await fees.counterAction(null, form(fd));
    expect(r?.ok).toBe(false);
    const after = await withSchool(f.ctx, (tx) => feeSettings(tx, f.ctx));
    expect(after.counter).toEqual(before.counter);
  });

  it("refuses a change to the expense limits but saves the Accountant's prefixes", async () => {
    const s = await withSchool(f.ctx, (tx) => financeSettings(tx, f.ctx));
    as(f.accountant);
    const base = { billRequiredAbove: rupees(s.billRequiredAbove), expenseApproveUpTo: rupees(s.expenseApproveUpTo), incomeReceiptPrefix: s.incomeReceiptPrefix, journalPrefix: s.journalPrefix };
    const raised = await finance.billsAction(null, form({ ...base, expenseApproveUpTo: "999999" }));
    expect(raised?.ok).toBe(false);
    expect(raised?.message).toMatch(/Principal or the School Admin/);
    const noPhoto = await finance.billsAction(null, form({ ...base, billRequiredAbove: "999999" }));
    expect(noPhoto?.ok).toBe(false);
    expect((await withSchool(f.ctx, (tx) => financeSettings(tx, f.ctx))).expenseApproveUpTo).toBe(s.expenseApproveUpTo);

    const prefix = await finance.billsAction(null, form({ ...base, incomeReceiptPrefix: "INC" }));
    expect(prefix?.ok).toBe(true);
    expect((await withSchool(f.ctx, (tx) => financeSettings(tx, f.ctx))).incomeReceiptPrefix).toBe("INC");
  });

  it("refuses the Accountant switching 'Verify payments before posting' off, but not other fee features", async () => {
    as(f.principal);
    expect((await fees.featureAction(null, form({ key: "fee-verification", on: "1" })))?.ok).toBe(true);
    as(f.accountant);
    const off = await fees.featureAction(null, form({ key: "fee-verification", on: "0" }));
    expect(off?.ok).toBe(false);
    expect(off?.message).toMatch(/Principal or the School Admin/);
    const on = await withSchool(f.ctx, (tx) => tx.schoolFeature.findFirst({ where: { featureKey: "fee-verification" } }));
    expect(on?.isOn).toBe(true);
    expect((await fees.featureAction(null, form({ key: "fee-promises", on: "1" })))?.ok).toBe(true);
  });

  it("lets the Principal change them", async () => {
    as(f.principal);
    expect((await fees.paymentsAction(null, form({ limit: "2500", verifyMode: [] })))?.ok).toBe(true);
    expect((await withSchool(f.pctx, (tx) => feeSettings(tx, f.pctx))).concessionLimitPaise).toBe(BigInt(250000));
    const s = await withSchool(f.pctx, (tx) => financeSettings(tx, f.pctx));
    const r = await finance.billsAction(null, form({ billRequiredAbove: rupees(s.billRequiredAbove), expenseApproveUpTo: "7000", incomeReceiptPrefix: s.incomeReceiptPrefix, journalPrefix: s.journalPrefix }));
    expect(r?.ok).toBe(true);
    expect((await withSchool(f.pctx, (tx) => financeSettings(tx, f.pctx))).expenseApproveUpTo).toBe(BigInt(700000));
  });
});
