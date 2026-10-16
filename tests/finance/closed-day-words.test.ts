// QA audit (MONEY-07): after a day is closed, income or an expense payment dated that
// day goes into the next open day's Day Book. The message must say so, not name the
// closed day as the Day Book date.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { closeDay, expectedCash } from "@/lib/finance/day-close";
import { recordExpense } from "@/lib/finance/expenses";
import { formatDate } from "@/lib/format";
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
const { recordIncomeAction } = await import("@/app/(school)/finance-management/income/actions");
const { payExpenseAction } = await import("@/app/(school)/finance-management/expenses/actions");

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");
const day = today.toISOString().slice(0, 10);
const next = formatDate(new Date(today.getTime() + 86_400_000));
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("entries dated a closed day", () => {
  it("say which day's Day Book they went into", async () => {
    const { incomeHead, expenseId } = await withSchool(f.ctx, async (tx) => {
      const incomeHead = await tx.accountHead.findFirstOrThrow({ where: { kind: "INCOME", name: "Hall rent" } });
      const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", name: "Stationery" } });
      const e = await recordExpense(tx, f.ctx, { date: today, accountHeadId: head.id, amountPaise: R(300), vendorId: null, costCentreId: null, billFileId: null, note: "Demo chalk", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null }, null);
      await closeDay(tx, f.ctx, { date: today, countedPaise: await expectedCash(tx, f.ctx, today), reason: null, today });
      return { incomeHead: incomeHead.id, expenseId: e.expense.id };
    });
    who.userId = f.accountant.id; who.schoolId = f.school.id;

    const income = await recordIncomeAction(null, form({ mode: "CASH", amount: "1500", post: "on", date: day, accountHeadId: incomeHead, receivedFrom: "Demo Lions Club" }));
    expect(income?.ok).toBe(true);
    expect(income?.message).toContain(`${formatDate(today)} was already closed, so it is in the Day Book for ${next}.`);

    const paid = await payExpenseAction(null, form({ expenseId, date: day, mode: "CASH" }));
    expect(paid?.ok).toBe(true);
    expect(paid?.message).toContain(`was already closed, so it is in the Day Book for ${next}.`);
  });
});
