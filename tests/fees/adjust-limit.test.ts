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
