// QA audit (MONEY-09): sending salary slips by WhatsApp when WhatsApp is switched off
// said "a problem on our side". It must say, in plain words, that WhatsApp is off,
// and nothing is marked sent.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { saveStructure } from "@/lib/salary/structures";
import { calculateRun, openRun, sendForApproval } from "@/lib/salary/payroll";
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
const { sendSlipsAction } = await import("@/app/(school)/salary-management/slips/actions");

let f: SalaryFixture;
let runId = "";
const today = d("2026-10-13");
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

beforeAll(async () => {
  f = await makeSalarySchool("Salary Slip Sending School");
  const acc = as(f, f.accountant.id);
  await withSchool(acc, async (tx) => {
    await saveStructure(tx, acc, { staffId: f.staffA.id, effectiveFrom: d("2026-04-01"), lines: lines(22000, 8000), pfApplies: true, esiApplies: true, tdsPaise: R(0), reason: null });
    await tx.messagingChannel.updateMany({ data: { isOn: false } });
  });
  const run = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: d("2026-09-01"), today }));
  runId = run.id;
  await withSchool(acc, (tx) => calculateRun(tx, acc, run.id, today));
  const sent = await withSchool(acc, (tx) => sendForApproval(tx, acc, run.id));
  await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), sent.approvalId!, "approve", null));
}, 180_000);

describe("sending salary slips while WhatsApp is switched off", () => {
  it("says so in plain words and marks nothing sent", async () => {
    who.userId = f.accountant.id; who.schoolId = f.school.id;
    const r = await sendSlipsAction(null, form({ runId, how: "whatsapp" }));
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/WhatsApp is switched off/);
    await withSchool(as(f, null), async (tx) => expect(await tx.payslip.count({ where: { runId, status: "SENT" } })).toBe(0));
  });
});
