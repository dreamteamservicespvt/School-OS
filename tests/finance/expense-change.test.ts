// QA audit (MONEY-06): an expense the approver sends back goes to Draft "to be changed
// and sent again" (07 §2). The Change action changes it, keeps the bill already attached,
// and sends it for approval again; nothing reaches the Day Book until it is paid.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { recordExpense } from "@/lib/finance/expenses";
import { todayIn } from "@/lib/staff/dates";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";

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
const { changeExpenseAction } = await import("@/app/(school)/finance-management/expenses/actions");

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("changing an expense that was sent back", () => {
  it("changes it, keeps its bill and sends it for approval again", async () => {
    const { id, headId, billId, firstApproval } = await withSchool(f.ctx, async (tx) => {
      const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", name: "Stationery" } });
      const bill = await tx.storedFile.create({ data: { id: randomUUID(), schoolId: f.school.id, storageKey: `qa/${randomUUID()}`, fileName: "bill.png", contentType: "image/png", sizeBytes: 10, purpose: "expense-bill", uploadedById: f.accountant.id } });
      const r = await recordExpense(tx, f.ctx, {
        date: today, accountHeadId: head.id, amountPaise: R(8000), vendorId: null, costCentreId: null, billFileId: bill.id,
        note: "Demo projector lamp", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null,
      }, null);
      expect(r.outcome).toBe("waiting");
      const saved = await tx.expense.findUniqueOrThrow({ where: { id: r.expense.id } });
      return { id: saved.id, headId: head.id, billId: bill.id, firstApproval: saved.approvalId! };
    });
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, firstApproval, "reject", "Get a second quote"));
    await withSchool(f.ctx, async (tx) => expect((await tx.expense.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT"));

    who.userId = f.accountant.id; who.schoolId = f.school.id;
    const r = await changeExpenseAction(null, form({ expenseId: id, amount: "7200", date: today.toISOString().slice(0, 10), what: "Demo projector lamp (second quote)", accountHeadId: headId, vendorName: "" }));
    expect(r?.ok).toBe(true);

    await withSchool(f.ctx, async (tx) => {
      const e = await tx.expense.findUniqueOrThrow({ where: { id } });
      expect(e.status).toBe("WAITING");
      expect(e.amountPaise).toBe(R(7200));
      expect(e.billFileId).toBe(billId);
      expect(e.rejectReason).toBeNull();
      expect(e.approvalId).not.toBe(firstApproval);
      expect(await tx.expensePayment.count({ where: { expenseId: id } })).toBe(0);
    });

    // Not a draft any more: a second Change is refused in plain words.
    const again = await changeExpenseAction(null, form({ expenseId: id, amount: "100", date: today.toISOString().slice(0, 10), what: "Demo projector lamp", accountHeadId: headId, vendorName: "" }));
    expect(again?.ok).toBe(false);
  });
});
