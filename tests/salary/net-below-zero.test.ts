// Generate Salary (10 §2, rule 11): a correction of an earlier month or a
// one-time deduction can be larger than a person's pay. Their net pay below
// zero is listed under "Check before sending" (the line's flag), and the
// month is refused for approval, and refused at approval, with the person's
// name and amount, until the Accountant changes the adjustment. Through the
// real server actions, as the Accountant and the Principal.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { saveStructure } from "@/lib/salary/structures";
import { BELOW_ZERO, belowZero, calculateRun, openRun } from "@/lib/salary/payroll";
import { as, d, lines, makeSalarySchool, R, type SalaryFixture } from "./fixture";

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

const { addAdjustmentAction, decideRunAction, removeAdjustmentAction, sendRunAction } = await import("@/app/(school)/salary-management/generate/actions");

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
type State = { ok: boolean; message?: string } | null;

let f: SalaryFixture;
let runId = "";
const today = d("2026-10-13");
const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };
const lineOf = (staffId: string) => withSchool(as(f, null), (tx) => tx.payrollLine.findFirstOrThrow({ where: { runId, staffId } }));
const run = () => withSchool(as(f, null), (tx) => tx.payrollRun.findUniqueOrThrow({ where: { id: runId } }));

beforeAll(async () => {
  f = await makeSalarySchool("Net Below Zero School");
  const acc = as(f, f.accountant.id);
  runId = await withSchool(acc, async (tx) => {
    await tx.statutorySetting.updateMany({ data: { ptOn: false, pfOn: false, esiOn: false } });
    await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(20000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
    await saveStructure(tx, acc, { staffId: f.staffB.id, effectiveFrom: d("2026-04-01"), lines: lines(12000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null });
    const r = await openRun(tx, acc, { campusId: f.school.campus.id, month: d("2026-09-01"), today });
    await calculateRun(tx, acc, r.id, today);
    return r.id;
  });
});

describe("net pay below zero", () => {
  it("a one-time deduction larger than the pay flags the person, says so, and the month is not sent", async () => {
    asUser(f.accountant.id);
    const added = (await addAdjustmentAction(null, form({ runId, staffId: f.staffB.id, type: "DEDUCTION", amount: "13500", reason: "Laptop damaged" }))) as State;
    expect(added?.ok).toBe(true);
    expect(added?.message).toMatch(/net pay is now -₹1,500, below zero/);
    const line = await lineOf(f.staffB.id);
    expect(line.netPaise).toBe(R(-1500));
    expect(line.flags).toContain(BELOW_ZERO);
    expect(await withSchool(as(f, null), (tx) => belowZero(tx, runId))).toEqual([{ staffId: f.staffB.id, name: expect.any(String), netPaise: R(-1500) }]);

    const sent = (await sendRunAction(null, form({ runId }))) as State;
    expect(sent?.ok).toBe(false);
    expect(sent?.message).toMatch(/Net pay is below zero for .*\(-₹1,500\)\. Change or remove the adjustment/);
    expect((await run()).status).toBe("CALCULATED");
    expect(await withSchool(as(f, null), (tx) => tx.approval.count({ where: { recordId: runId } }))).toBe(0);
  });

  it("a recovery correction of an earlier month counts too, and both names are given", async () => {
    await withSchool(as(f, f.accountant.id), (tx) => tx.payrollAdjustment.create({
      data: { schoolId: f.school.id, runId, staffId: f.staffA.id, type: "DEDUCTION", amountPaise: R(21000), reason: "August 2026 salary: loss of pay found later", forMonth: d("2026-08-01"), lopDays: 31 },
    }));
    await withSchool(as(f, f.accountant.id), (tx) => calculateRun(tx, as(f, f.accountant.id), runId, today));
    expect((await lineOf(f.staffA.id)).netPaise).toBe(R(-1000));
    asUser(f.accountant.id);
    const sent = (await sendRunAction(null, form({ runId }))) as State;
    expect(sent?.ok).toBe(false);
    expect(sent?.message).toContain("(-₹1,000)");
    expect(sent?.message).toContain("(-₹1,500)");
  });

  it("goes once the Accountant changes the adjustments", async () => {
    asUser(f.accountant.id);
    const adjs = await withSchool(as(f, null), (tx) => tx.payrollAdjustment.findMany({ where: { runId, archivedAt: null } }));
    for (const a of adjs) expect(((await removeAdjustmentAction(null, form({ adjustmentId: a.id }))) as State)?.ok).toBe(true);
    expect(((await addAdjustmentAction(null, form({ runId, staffId: f.staffB.id, type: "DEDUCTION", amount: "2000", reason: "Laptop damaged, first part" }))) as State)?.ok).toBe(true);
    expect((await lineOf(f.staffB.id)).flags).not.toContain(BELOW_ZERO);
    const sent = (await sendRunAction(null, form({ runId }))) as State;
    expect(sent?.ok, sent?.message).toBe(true);
    expect((await run()).status).toBe("WAITING");
  });

  it("a month already waiting with a net pay below zero is refused at approval, and nothing changes", async () => {
    // As if sent before this check: one line below zero while the month waits.
    await withSchool(as(f, null), (tx) => tx.payrollLine.updateMany({ where: { runId, staffId: f.staffB.id }, data: { netPaise: R(-700) } }));
    asUser(f.principal.id);
    const refused = (await decideRunAction(null, form({ runId, decision: "approve" }))) as State;
    expect(refused?.ok).toBe(false);
    expect(refused?.message).toMatch(/Net pay is below zero for .*\(-₹700\), so this month cannot be approved/);
    const r = await run();
    expect(r.status).toBe("WAITING");
    expect(await withSchool(as(f, null), (tx) => tx.approval.findUniqueOrThrow({ where: { id: r.approvalId! } }))).toMatchObject({ status: "WAITING" });
    expect(await withSchool(as(f, null), (tx) => tx.payslip.count({ where: { runId } }))).toBe(0);
    // Sent back, the Accountant can fix it.
    const back = (await decideRunAction(null, form({ runId, decision: "back", reason: "Net pay below zero for one person" }))) as State;
    expect(back?.ok, back?.message).toBe(true);
    expect((await run()).status).toBe("CALCULATED");
  });
});
