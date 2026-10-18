// Fee counter permissions (06 Fee Settings, Counter permissions; G02): the
// school can let a role collect at the counter without assigning fees,
// changing a student's fees or giving discounts, and the server holds to it on
// the Student Fee Ledger and Collect Fee too, not only on Fee Structure. And a
// login limited to one campus can never act on another campus's student or
// payment (a receipt sent again reaches only its own campus's parents).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});

import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { addChargeAction, adjustAction, assignPlanAction } from "@/app/(school)/fee-management/ledger/[studentId]/actions";
import { askDiscountApproval, collectFee, resendReceipt } from "@/app/(school)/fee-management/collect/[studentId]/actions";
import { makeUser } from "../helpers";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
let paymentId = "";
let northStudent = "";

const currentFor = async (userId: string): Promise<Current> => {
  const access = await accessIn(userId, f.school.id);
  return { ...access!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
};
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

beforeAll(async () => {
  f = await makeFeeSchool();
  const open = await dues(f.ctx, f.ravi.id);
  paymentId = (await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: open[0].amountPaise })).payment.id;
  northStudent = await withSchool(f.ctx, async (tx) => {
    // Only the Principal assigns fees, changes a student's fees and gives discounts here (Fee Settings).
    await tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { counterPermissions: { "assign-fees": ["principal"], "edit-student-fees": ["principal"], "give-discount": ["principal"] } } });
    const north = await tx.campus.create({ data: { schoolId: f.school.id, name: "North Campus" } });
    const s = await tx.student.create({ data: { schoolId: f.school.id, campusId: north.id, admissionNo: `N${randomUUID().slice(0, 6)}`, firstName: "Neha", fullName: "Neha North" } });
    return s.id;
  });
}, 180_000);

describe("counter permissions on the ledger and at the counter", () => {
  it("refuses an accountant who may collect but not change fees", async () => {
    who.current = await currentFor(f.accountant.id);
    const open = await dues(f.ctx, f.ravi.id);
    const charge = await addChargeAction(undefined, form({ studentId: f.ravi.id, feeHeadId: f.tuition.id, amount: "500", dueDate: "2026-10-01" }));
    expect(charge?.ok).toBe(false);
    expect(charge?.message).toContain("cannot change a student’s fees");
    const add = await adjustAction(undefined, form({ studentId: f.ravi.id, dueId: open[0].id, how: "add", amount: "100", reason: "Extra books" }));
    expect(add?.message).toContain("cannot change a student’s fees");
    const remove = await adjustAction(undefined, form({ studentId: f.ravi.id, dueId: open[0].id, how: "remove", reason: "Left the bus" }));
    expect(remove?.message).toContain("cannot assign fees");
    const plan = await assignPlanAction(undefined, form({ studentId: f.ravi.id, structureId: f.structureId }));
    expect(plan?.message).toContain("cannot assign fees");
    const discount = await askDiscountApproval(undefined, form({ studentId: f.ravi.id, discount: "500", discountReason: "Sibling discount", dueId: open[0].id }));
    expect(discount?.message).toContain("give discount");
    // Nothing changed.
    expect((await dues(f.ctx, f.ravi.id)).map((d) => d.amountPaise)).toEqual(open.map((d) => d.amountPaise));
  });

  it("lets the role the school chose do it", async () => {
    who.current = await currentFor(f.principal.id);
    const r = await addChargeAction(undefined, form({ studentId: f.ravi.id, feeHeadId: f.tuition.id, amount: "500", dueDate: "2026-10-01" }));
    expect(r?.ok).toBe(true);
    expect((await dues(f.ctx, f.ravi.id)).some((d) => d.amountPaise === R(500))).toBe(true);
  });
});

describe("an accountant limited to the North campus", () => {
  let north: Current;
  beforeAll(async () => {
    const person = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["accountant"] }], name: "North Accountant" });
    await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
      const campus = await tx.student.findUniqueOrThrow({ where: { id: northStudent }, select: { campusId: true } });
      await tx.schoolAccess.updateMany({ where: { userLoginId: person.id }, data: { scope: "CAMPUS", campusId: campus.campusId } });
    });
    north = await currentFor(person.id);
  });

  it("cannot send the main campus's receipt again, collect from or charge its students", async () => {
    who.current = north;
    const resend = await resendReceipt(undefined, form({ paymentId }));
    expect(resend?.ok).toBe(false);
    expect(resend?.message).toBe("Only a posted payment's receipt can be sent.");
    const open = await dues(f.ctx, f.sita.id);
    const pay = await collectFee(undefined, form({ studentId: f.sita.id, dueId: open[0].id, amount: "6000", mode: "CASH" }));
    expect(pay?.ok).toBe(false);
    expect(pay?.message).toContain("not found");
    const charge = await addChargeAction(undefined, form({ studentId: f.sita.id, feeHeadId: f.tuition.id, amount: "500", dueDate: "2026-10-01" }));
    expect(charge?.message).toContain("not found");
  });

  it("still works on its own campus's students", async () => {
    who.current = north;
    // The counter permission is the Principal's, so the charge is refused for that reason, not as another campus's student.
    const charge = await addChargeAction(undefined, form({ studentId: northStudent, feeHeadId: f.tuition.id, amount: "500", dueDate: "2026-10-01" }));
    expect(charge?.message).toContain("cannot change a student’s fees");
  });
});
