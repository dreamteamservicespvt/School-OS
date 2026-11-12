// Security audit run-2, lead L1: reducing a fee row by Adjust on the student
// ledger lowered any row to zero at once, with only a reason, while a
// concession of the same amount above the school's limit waits for the
// Principal. Owner decision taken overnight (to confirm): a reduction above the
// concession limit goes to Approvals the same way a concession does (the
// "Discount or concession" request, the same approvers), and is made on the row
// only once approved, with the approver recorded. Up to the limit it is made at
// once, as before. Calls the real ledger action.
import { beforeAll, describe, expect, it, vi } from "vitest";
// Loaded before the first decision, so loading every module's follow-ups never eats the decision's transaction time.
import "@/lib/approval-handlers";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { decide } from "@/lib/approvals";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";
import { makeUser } from "../helpers";

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
const ledger = await import("@/app/(school)/fee-management/ledger/[studentId]/actions");

let f: FeeSchool;
let admin: { id: string };
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };
const as = (u: { id: string }) => { who.userId = u.id; who.schoolId = f.school.id; };
const sys = () => ({ schoolId: f.school.id, userId: null });
const row = (id: string) => withSchool(sys(), (tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id } }));
const adjustmentsOn = (dueId: string) => withSchool(sys(), (tx) => tx.feeAdjustment.findMany({ where: { dueId }, orderBy: { createdAt: "asc" } }));
const reduce = (studentId: string, dueId: string, rupees: number, reason = "Fee corrected after review") =>
  ledger.adjustAction(null, form({ studentId, dueId, how: "reduce", amount: String(rupees), reason }));

let seq = 0;
async function freshStudent() {
  seq++;
  return withSchool(f.ctx, async (tx) => {
    const s = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: `ADJ${Date.now()}${seq}`, firstName: "Adjust", fullName: `Adjust Student ${seq}` } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s.id, academicYearId: f.year.id, classId: f.cls.id, sectionId: f.a.id } });
    const { assignToStudent } = await import("@/lib/fees/structure");
    await assignToStudent(tx, f.ctx, s.id, f.structureId, null);
    return s.id;
  });
}

beforeAll(async () => {
  f = await makeFeeSchool();
  admin = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["school-admin"] }], name: "School Admin Person" });
}, 120_000);

describe("L1: a reduction above the concession limit waits for approval", () => {
  // The school's limit is the default ₹1,000; each Tuition row is ₹6,000.
  it("sends the Accountant's large reduction to the Principal and leaves the row as it was", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.accountant);
    const r = await reduce(s, first.id, 5000);
    expect(r?.ok).toBe(true);
    expect(r?.message).toMatch(/Sent for approval/);
    expect((await row(first.id)).balancePaise).toBe(R(6000));
    const [adj] = await adjustmentsOn(first.id);
    expect(adj.status).toBe("WAITING");
    expect(adj.amountPaise).toBe(-R(5000));
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: adj.approvalId! } }));
    expect(approval).toMatchObject({ type: "concession", recordType: "Fee Adjustment", recordId: adj.id, status: "WAITING", currentApproverRole: "principal", askedById: f.accountant.id });
    expect(approval.amountPaise).toBe(R(5000));

    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, approval.id, "approve", null));
    expect((await row(first.id)).balancePaise).toBe(R(1000));
    const [done] = await adjustmentsOn(first.id);
    expect(done.status).toBe("APPLIED");
    expect(done.decidedById).toBe(f.principal.id);
    expect(done.createdById).toBe(f.accountant.id);
  }, 120_000);

  it("makes a reduction up to the limit at once, as before", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.accountant);
    const r = await reduce(s, first.id, 1000);
    expect(r?.ok).toBe(true);
    expect((await row(first.id)).balancePaise).toBe(R(5000));
    const [adj] = await adjustmentsOn(first.id);
    expect(adj).toMatchObject({ status: "APPLIED", approvalId: null, decidedById: f.accountant.id });
    // Adding to a row never needs approval.
    expect((await ledger.adjustAction(null, form({ studentId: s, dueId: first.id, how: "add", amount: "9000", reason: "Fee corrected after review" })))?.ok).toBe(true);
    expect((await row(first.id)).balancePaise).toBe(R(14000));
  }, 120_000);

  it("leaves the row as it was when the request is not approved", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.accountant);
    await reduce(s, first.id, 4000);
    const [adj] = await adjustmentsOn(first.id);
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, adj.approvalId!, "reject", "Not agreed by the management"));
    expect((await row(first.id)).balancePaise).toBe(R(6000));
    const [after] = await adjustmentsOn(first.id);
    expect(after).toMatchObject({ status: "REJECTED", decidedById: f.principal.id });
  }, 120_000);

  it("takes off no more than is still unpaid when the row was paid while waiting", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.accountant);
    await reduce(s, first.id, 5000);
    await collect(f.ctx, { studentId: s, dueIds: [first.id], amountPaise: R(4000) });
    const [adj] = await adjustmentsOn(first.id);
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, adj.approvalId!, "approve", null));
    const after = await row(first.id);
    expect(after.balancePaise).toBe(BigInt(0));
    expect(after.adjustmentPaise).toBe(-R(2000));
    expect((await adjustmentsOn(first.id))[0]).toMatchObject({ status: "APPLIED", amountPaise: -R(2000) });
  }, 120_000);

  it("sends the Principal's own large reduction to someone else, never approving it themselves", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.principal);
    const r = await reduce(s, first.id, 3000);
    expect(r?.ok).toBe(true);
    expect((await row(first.id)).balancePaise).toBe(R(6000));
    const [adj] = await adjustmentsOn(first.id);
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: adj.approvalId! } }));
    expect(approval.currentApproverRole).toBe("school-admin");
    await expect(withSchool(f.pctx, (tx) => decide(tx, f.pctx, approval.id, "approve", null))).rejects.toThrow(/own request/);
    const actx = { schoolId: f.school.id, userId: admin.id };
    await withSchool(actx, (tx) => decide(tx, actx, approval.id, "approve", null));
    expect((await row(first.id)).balancePaise).toBe(R(3000));
  }, 120_000);
});

// Owner decision 2026-11-12: Adjust "remove" follows the same rule as "reduce".
// The amount that disappears (what is still unpaid on the row, with its unpaid
// late fee rows) above the concession limit goes to Approvals; the row stays as
// it is until approved. Up to the limit it is removed at once, as before.
describe("Owner 2026-11-12: removing a row above the concession limit waits for approval", () => {
  const remove = (studentId: string, dueId: string, reason = "Charged twice by mistake") =>
    ledger.adjustAction(null, form({ studentId, dueId, how: "remove", reason }));
  const ledgerOf = async (studentId: string) => {
    const { studentLedger } = await import("@/lib/fees/ledger");
    return withSchool(sys(), (tx) => studentLedger(tx, studentId, new Date(), "Asia/Kolkata"));
  };

  it("sends the Accountant's removal of a ₹6,000 row to the Principal, keeps the row, and removes it once approved", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.accountant);
    const r = await remove(s, first.id);
    expect(r?.ok).toBe(true);
    expect(r?.message).toMatch(/Sent for approval/);
    const kept = await row(first.id);
    expect(kept.state).toBe("OPEN");
    expect(kept.balancePaise).toBe(R(6000));
    const [adj] = await adjustmentsOn(first.id);
    expect(adj).toMatchObject({ status: "WAITING", removes: true, createdById: f.accountant.id });
    expect(adj.amountPaise).toBe(-R(6000));
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: adj.approvalId! } }));
    expect(approval).toMatchObject({ type: "concession", recordType: "Fee Adjustment", recordId: adj.id, status: "WAITING", currentApproverRole: "principal", askedById: f.accountant.id });
    expect(approval.amountPaise).toBe(R(6000));

    // The ledger shows it waiting: not in the balance, the row still counted.
    const before = await ledgerOf(s);
    expect(before.installments.find((i) => i.id === first.id)).toMatchObject({ status: expect.not.stringMatching(/Removed/), removalWaiting: true });
    const entry = before.entries.find((e) => e.key === `adj:${adj.id}`);
    expect(entry).toMatchObject({ kind: "adjust", waiting: true });
    expect(entry?.title).toMatch(/^Removal/);
    expect(entry?.sub).toMatch(/Waiting for approval/);

    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, approval.id, "approve", null));
    const gone = await row(first.id);
    expect(gone.state).toBe("REMOVED");
    expect(gone.removedReason).toBe("Charged twice by mistake");
    expect(gone.removedById).toBe(f.accountant.id);
    const [done] = await adjustmentsOn(first.id);
    expect(done).toMatchObject({ status: "APPLIED", decidedById: f.principal.id });
    const after = await ledgerOf(s);
    expect(after.installments.find((i) => i.id === first.id)).toMatchObject({ status: "Removed", removalWaiting: false });
    // The adjustment is not a second credit: the Removed entry carries who asked and who approved.
    expect(after.entries.find((e) => e.key === `adj:${adj.id}`)).toBeUndefined();
    expect(after.entries.find((e) => e.key === `removed:${first.id}`)?.sub).toMatch(/approved by Principal Person/);
  }, 120_000);

  it("removes a row up to the limit at once, as before", async () => {
    const s = await freshStudent();
    const { addCharge } = await import("@/lib/fees/structure");
    const charge = await withSchool(f.ctx, (tx) => addCharge(tx, f.ctx, { studentId: s, feeHeadId: f.tuition.id, amountPaise: R(800), dueDate: new Date("2026-06-01"), label: "Lost book", reason: "Lost library book" }));
    as(f.accountant);
    const r = await remove(s, charge.id);
    expect(r?.ok).toBe(true);
    expect(r?.message).toMatch(/removed from the fees/);
    expect((await row(charge.id)).state).toBe("REMOVED");
    expect(await adjustmentsOn(charge.id)).toHaveLength(0);
  }, 120_000);

  it("leaves the row as it was when the removal is rejected or withdrawn", async () => {
    const s = await freshStudent();
    const [first, second] = await dues(f.ctx, s);
    as(f.accountant);
    await remove(s, first.id);
    await remove(s, second.id);
    const [a1] = await adjustmentsOn(first.id);
    const [a2] = await adjustmentsOn(second.id);
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, a1.approvalId!, "reject", "Not agreed by the management"));
    await withSchool(f.ctx, (tx) => decide(tx, f.ctx, a2.approvalId!, "withdraw", null));
    for (const [d, a] of [[first, a1], [second, a2]] as const) {
      const now = await row(d.id);
      expect(now.state).toBe("OPEN");
      expect(now.balancePaise).toBe(R(6000));
      expect((await adjustmentsOn(d.id)).find((x) => x.id === a.id)?.status).toBe("REJECTED");
    }
    const L = await ledgerOf(s);
    expect(L.installments.find((i) => i.id === first.id)?.removalWaiting).toBe(false);
  }, 120_000);

  it("does not remove a row that was paid on while it waited, and the payment stays", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.accountant);
    await remove(s, first.id);
    await collect(f.ctx, { studentId: s, dueIds: [first.id], amountPaise: R(1000) });
    const [adj] = await adjustmentsOn(first.id);
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, adj.approvalId!, "approve", null));
    const now = await row(first.id);
    expect(now.state).toBe("OPEN");
    expect(now.paidPaise).toBe(R(1000));
    expect(now.balancePaise).toBe(R(5000));
    expect((await adjustmentsOn(first.id))[0].status).toBe("REJECTED");
  }, 120_000);

  it("refuses a second removal of a row already waiting, and keeps refusing rows with payments", async () => {
    const s = await freshStudent();
    const [first, second] = await dues(f.ctx, s);
    as(f.accountant);
    await remove(s, first.id);
    const again = await remove(s, first.id);
    expect(again?.ok).toBe(false);
    expect(again?.message).toMatch(/already waiting for approval/);
    await collect(f.ctx, { studentId: s, dueIds: [second.id], amountPaise: R(100) });
    const paid = await remove(s, second.id);
    expect(paid?.ok).toBe(false);
    expect(paid?.message).toMatch(/payments against it/);
  }, 120_000);

  it("sends the Principal's own large removal to someone else, never approving it themselves", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    as(f.principal);
    expect((await remove(s, first.id))?.message).toMatch(/Sent for approval/);
    expect((await row(first.id)).state).toBe("OPEN");
    const [adj] = await adjustmentsOn(first.id);
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: adj.approvalId! } }));
    expect(approval.currentApproverRole).toBe("school-admin");
    await expect(withSchool(f.pctx, (tx) => decide(tx, f.pctx, approval.id, "approve", null))).rejects.toThrow(/own request/);
    const actx = { schoolId: f.school.id, userId: admin.id };
    await withSchool(actx, (tx) => decide(tx, actx, approval.id, "approve", null));
    expect((await row(first.id)).state).toBe("REMOVED");
  }, 120_000);
});
