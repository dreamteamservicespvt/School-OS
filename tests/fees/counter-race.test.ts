// Delivery audit 2026-10-31: the same money action sent twice at the same moment (double click
// that beats the button, or two tabs) must happen once. Counter payment: with open rows the row lock
// did it, but a student who owes nothing (advance only) had no row to lock, so both went through.
// Cancel and "Mark refunded" read the status before waiting for the rows' lock, so the second one
// took the money off the student's dues again; two refund requests could both take the same amount.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/fees/handlers";
import { cancelPayment } from "@/lib/fees/cancel";
import { markRefunded, requestRefund } from "@/lib/fees/refunds";
import { giveConcession, revokeConcession } from "@/lib/fees/concessions";
import { collect, dues, feature, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
beforeAll(async () => { f = await makeFeeSchool(); }, 120_000);

const posted = (studentId: string) => withSchool(f.ctx, async (tx) => {
  const list = await tx.payment.findMany({ where: { studentId, status: "POSTED" } });
  const receipts = await tx.receipt.findMany({ where: { paymentId: { in: list.map((p) => p.id) } } });
  return list.map((p) => ({ ...p, receipt: receipts.find((r) => r.paymentId === p.id) ?? null }));
});

describe("one counter payment sent twice at once", () => {
  it("posts once when the student has open rows", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    const r = await Promise.allSettled([1, 2, 3].map(() => collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(1000) })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const p = await posted(f.ravi.id);
    expect(p).toHaveLength(1);
    expect(p[0].receipt).not.toBeNull();
  });

  it("posts once when the student owes nothing and it is all advance", async () => {
    await feature(f.ctx, "fee-advance", true);
    const open = await dues(f.ctx, f.sita.id);
    const total = open.reduce((s, d) => s + d.balancePaise, BigInt(0));
    await collect(f.ctx, { studentId: f.sita.id, dueIds: open.map((d) => d.id), amountPaise: total });
    expect((await dues(f.ctx, f.sita.id)).filter((d) => d.balancePaise > BigInt(0))).toHaveLength(0);
    const r = await Promise.allSettled([1, 2].map(() => collect(f.ctx, { studentId: f.sita.id, dueIds: [], amountPaise: R(500) })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason?.message)).toMatch(/Collect again\?/);
    const advance = (await posted(f.sita.id)).filter((p) => p.amountPaise === R(500));
    expect(advance).toHaveLength(1);
    await feature(f.ctx, "fee-advance", false);
  });
});

let seq = 0;
async function freshStudent() {
  seq++;
  return withSchool(f.ctx, async (tx) => {
    const s = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: `R${Date.now()}${seq}`, firstName: "Race", fullName: `Race Student ${seq}` } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s.id, academicYearId: f.year.id, classId: f.cls.id, sectionId: f.a.id } });
    const { assignToStudent } = await import("@/lib/fees/structure");
    await assignToStudent(tx, f.ctx, s.id, f.structureId, null);
    return s.id;
  });
}
const due = (id: string) => withSchool(f.ctx, (tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id } }));

describe("cancels and refunds sent twice at once", () => {
  it("a payment cancelled twice at once reopens the dues once", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000) });
    const tries = await Promise.allSettled([1, 2].map(() => withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, r.payment.id, { reason: "Wrong student", note: null }))));
    expect(tries.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const d = await due(open[0].id);
    expect(d.paidPaise).toBe(BigInt(0));
    expect(d.balancePaise).toBe(open[0].balancePaise);
  });

  it("two refund requests at once cannot take more than was paid", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000) });
    const tries = await Promise.allSettled([1, 2].map(() => withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: r.payment.id, amountPaise: R(4000), reason: "Leaving school", mode: "CASH" }))));
    expect(tries.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((tries.find((x) => x.status === "rejected") as PromiseRejectedResult).reason?.message)).toMatch(/Maximum refund ₹2,000/);
  });

  it("\"Mark refunded\" twice at once takes the refund off the dues once", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000) });
    const refund = await withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: r.payment.id, amountPaise: R(1000), reason: "Leaving school", mode: "CASH" }));
    const waiting = await withSchool(f.ctx, (tx) => tx.refund.findUniqueOrThrow({ where: { id: refund.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, waiting.approvalId!, "approve", null));
    const tries = await Promise.allSettled([1, 2].map(() => withSchool(f.ctx, (tx) => markRefunded(tx, f.ctx, refund.id, { date: r.payment.paymentDate, reference: null, accountId: null }))));
    expect(tries.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const d = await due(open[0].id);
    expect(d.paidPaise).toBe(R(5000));
    const out = await withSchool(f.ctx, (tx) => tx.dayBookEntry.findMany({ where: { sourceType: "refund", sourceId: refund.id } }));
    expect(out).toHaveLength(1);
  });
});

// Security audit run-2, lead L2: "Take it off" pressed twice at once took the
// concession off the student's rows twice (the status was read before the
// rows' lock), so the family was charged more than the fee.
describe("one concession taken off twice at once", () => {
  it("is taken off once, and the rows go back to the full fee", async () => {
    const owed = async () => (await dues(f.ctx, f.anil.id)).reduce((t, d) => t + d.balancePaise, BigInt(0));
    const before = await owed();
    const given = await withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, { studentId: f.anil.id, type: "DISCOUNT", mode: "amount", amountPaise: R(500), percentBp: 0, feeHeadIds: [f.tuition.id], periodFrom: null, periodTo: null, reason: "Sibling in school" }));
    expect(given.waiting).toBe(false);
    expect(await owed()).toBe(before - R(500));
    const r = await Promise.allSettled([1, 2].map(() => withSchool(f.ctx, (tx) => revokeConcession(tx, f.ctx, given.concession.id, "Given by mistake"))));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await owed()).toBe(before);
    const rows = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId: f.anil.id }, select: { concessionPaise: true } }));
    expect(rows.every((d) => d.concessionPaise >= BigInt(0))).toBe(true);
  });
});
