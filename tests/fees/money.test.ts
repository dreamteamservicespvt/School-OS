// Fee money rules (06 §5, 04-data-model.md rules 6 to 13 and 35 to 39):
// collection, receipt numbers, overpayment, duplicates, cancellation with a
// Day Book reversal, refunds, concessions with approval, verification,
// online confirmation once only, and closed books.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/fees/handlers";
import { cancelPayment } from "@/lib/fees/cancel";
import { requestRefund, markRefunded } from "@/lib/fees/refunds";
import { giveConcession } from "@/lib/fees/concessions";
import { createPaymentLink, confirmGatewayPayment, feeDesk, recordGatewayFailure } from "@/lib/fees/online";
import { saveFeeRow, openDraft } from "@/lib/fees/structure";
import { checkSchedule } from "@/lib/fees/schedule";
import { MoneyProblem, MoneyWarning } from "@/lib/fees/problem";
import { closeFinancialYear } from "@/lib/finance/accounts";
import { assertBooksOpen, financialYearOf } from "@/lib/finance/years";
import { dayBookTotals } from "@/lib/finance/daybook";
import { collect, dues, feature, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
});

const dayBook = (sourceId: string) => withSchool(f.ctx, (tx) => tx.dayBookEntry.findMany({ where: { sourceId }, orderBy: { postedAt: "asc" } }));

describe("collecting at the counter (A1)", () => {
  it("posts the payment, makes the next receipt, updates the dues, the Day Book and messages the parent", async () => {
    const [first] = await dues(f.ctx, f.ravi.id);
    expect(first.balancePaise).toBe(R(6000));
    const r = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [first.id], amountPaise: R(6000) });
    expect(r.waiting).toBe(false);
    expect(r.receiptNo).toMatch(/\/2026-27\/00001$/);
    const after = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id: first.id } }));
    expect(after.paidPaise).toBe(R(6000));
    expect(after.balancePaise).toBe(BigInt(0));
    const entries = await dayBook(r.payment.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].direction).toBe("IN");
    expect(entries[0].amountPaise).toBe(R(6000));
    expect(entries[0].section).toBe("fees-full");
    const messages = await withSchool(f.ctx, (tx) => tx.message.findMany({ where: { sourceType: "Payment", sourceId: r.payment.id } }));
    expect(messages).toHaveLength(1);
  });

  it("gives receipt numbers in order and never twice", async () => {
    const open = await dues(f.ctx, f.sita.id);
    const a = await collect(f.ctx, { studentId: f.sita.id, dueIds: [open[0].id], amountPaise: R(1000) });
    const b = await collect(f.ctx, { studentId: f.sita.id, dueIds: [open[0].id], amountPaise: R(1500), confirmDuplicate: true });
    expect(a.receiptNo).not.toBe(b.receiptNo);
    const n = (s: string | null) => Number(s!.split("/").pop());
    expect(n(b.receiptNo)).toBe(n(a.receiptNo) + 1);
    // A cancelled receipt keeps its number; the next payment takes a new one.
    await withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, b.payment.id, { reason: "Wrong amount", note: null }));
    const c = await collect(f.ctx, { studentId: f.sita.id, dueIds: [open[0].id], amountPaise: R(1200) });
    expect(n(c.receiptNo)).toBe(n(b.receiptNo) + 1);
    const cancelled = await withSchool(f.ctx, (tx) => tx.receipt.findUniqueOrThrow({ where: { paymentId: b.payment.id } }));
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.number).toBe(b.receiptNo);
  });

  it("refuses more than is owed unless advances are on (Done when 3)", async () => {
    const open = await dues(f.ctx, f.anil.id);
    const total = open.reduce((s, d) => s + d.balancePaise, BigInt(0));
    await expect(collect(f.ctx, { studentId: f.anil.id, dueIds: open.map((d) => d.id), amountPaise: total + R(500) }))
      .rejects.toThrow(`Balance is ₹24,000. Advance payments are off in Fee Settings.`);
    await feature(f.ctx, "fee-advance", true);
    const r = await collect(f.ctx, { studentId: f.anil.id, dueIds: open.map((d) => d.id), amountPaise: total + R(500) });
    expect(r.payment.advancePaise).toBe(R(500));
    await feature(f.ctx, "fee-advance", false);
  });

  it("applies a partial amount to the oldest ticked row first", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[1].id, open[0].id], amountPaise: R(7000) });
    expect(r.payment.isPartial).toBe(true);
    const after = await dues(f.ctx, s);
    expect(after.find((d) => d.id === open[0].id)!.balancePaise).toBe(BigInt(0));
    expect(after.find((d) => d.id === open[1].id)!.balancePaise).toBe(R(5000));
  });

  it("warns when the same payment is entered twice within 10 minutes", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(2000) });
    const again = collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(2000) });
    await expect(again).rejects.toBeInstanceOf(MoneyWarning);
    await expect(collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(2000) })).rejects.toThrow(/was collected at .* by you\. Collect again\?/);
    const ok = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(2000), confirmDuplicate: true });
    expect(ok.receiptNo).toBeTruthy();
  });

  it("needs a reference for UPI and six digits for a cheque", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    await expect(collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(100), mode: "UPI" })).rejects.toThrow("Enter the transaction or UTR number for UPI.");
    await expect(collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(100), mode: "CHEQUE", chequeNo: "12", chequeBank: "SBI", chequeDate: new Date() })).rejects.toThrow("Cheque number is 6 digits.");
  });
});

describe("cancelling a payment (D2)", () => {
  it("keeps the payment, reopens the dues and reverses the Day Book on the cancel date (Done when 4)", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000) });
    const res = await withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, r.payment.id, { reason: "Wrong student", note: null }));
    expect(res.cancelled).toBe(true);
    const p = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    expect(p.status).toBe("CANCELLED");
    expect(p.amountPaise).toBe(R(6000));
    const due = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id: open[0].id } }));
    expect(due.balancePaise).toBe(R(6000));
    const entries = await dayBook(r.payment.id);
    expect(entries).toHaveLength(2);
    expect(entries[1].section).toBe("reversal");
    expect(entries[1].reversesEntryId).toBe(entries[0].id);
    expect(dayBookTotals(entries).net).toBe(BigInt(0));
    await expect(withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, r.payment.id, { reason: "Duplicate", note: null }))).rejects.toThrow("already cancelled");
  });

  it("cannot change or delete a payment, receipt number or Day Book entry in the database", async () => {
    const [p] = await withSchool(f.ctx, (tx) => tx.payment.findMany({ where: { status: "POSTED" }, take: 1 }));
    await expect(withSchool(f.ctx, (tx) => tx.payment.update({ where: { id: p.id }, data: { amountPaise: R(1) } }))).rejects.toThrow();
    await expect(withSchool(f.ctx, (tx) => tx.payment.delete({ where: { id: p.id } }))).rejects.toThrow();
    const [e] = await withSchool(f.ctx, (tx) => tx.dayBookEntry.findMany({ take: 1 }));
    await expect(withSchool(f.ctx, (tx) => tx.dayBookEntry.update({ where: { id: e.id }, data: { amountPaise: R(1) } }))).rejects.toThrow();
    const [rc] = await withSchool(f.ctx, (tx) => tx.receipt.findMany({ take: 1 }));
    await expect(withSchool(f.ctx, (tx) => tx.receipt.update({ where: { id: rc.id }, data: { number: "X-1" } }))).rejects.toThrow();
  });

  it("asks for approval to cancel a payment made before today", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    // Yesterday's payment, entered by someone with the "change payment date" permission.
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000), paidAt: new Date(Date.now() - 26 * 3600 * 1000) }, ["principal"]);
    const res = await withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, r.payment.id, { reason: "Duplicate", note: null }));
    expect(res.waiting).toBe(true);
    expect((await dayBook(r.payment.id))).toHaveLength(1);
    const p = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, p.cancelApprovalId!, "approve", null));
    const after = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    expect(after.status).toBe("CANCELLED");
    expect((await dayBook(r.payment.id))).toHaveLength(2);
  });
});

describe("refunds (rule 9)", () => {
  it("never more than paid, waits for approval, and posts money out once paid (Done when 9)", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000) });
    await expect(withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: r.payment.id, amountPaise: R(6001), reason: "Leaving school", mode: "CASH" }))).rejects.toThrow("Maximum refund ₹6,000");
    const refund = await withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: r.payment.id, amountPaise: R(4000), reason: "Leaving school", mode: "CASH" }));
    await expect(withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: r.payment.id, amountPaise: R(2500), reason: "Second refund", mode: "CASH" }))).rejects.toThrow("Maximum refund ₹2,000");
    await expect(withSchool(f.ctx, (tx) => markRefunded(tx, f.ctx, refund.id, { date: r.payment.paymentDate, reference: null, accountId: null }))).rejects.toThrow("only after it is approved");
    const waiting = await withSchool(f.ctx, (tx) => tx.refund.findUniqueOrThrow({ where: { id: refund.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, waiting.approvalId!, "approve", null));
    await withSchool(f.ctx, (tx) => markRefunded(tx, f.ctx, refund.id, { date: r.payment.paymentDate, reference: null, accountId: null }));
    const out = await withSchool(f.ctx, (tx) => tx.dayBookEntry.findMany({ where: { sourceType: "refund", sourceId: refund.id } }));
    expect(out).toHaveLength(1);
    expect(out[0].direction).toBe("OUT");
    expect(out[0].amountPaise).toBe(R(4000));
  });
});

describe("concessions and discounts with approval (Done when 7)", () => {
  it("applies small concessions at once and waits for approval above the limit", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const small = await withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, { studentId: s, type: "DISCOUNT", mode: "amount", amountPaise: R(500), percentBp: 0, feeHeadIds: [f.tuition.id], periodFrom: null, periodTo: null, reason: "Sibling in school" }));
    expect(small.waiting).toBe(false);
    const big = await withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, { studentId: s, type: "DISCOUNT", mode: "amount", amountPaise: R(5000), percentBp: 0, feeHeadIds: [f.tuition.id], periodFrom: null, periodTo: null, reason: "Hardship case" }));
    expect(big.waiting).toBe(true);
    const bigRow = await withSchool(f.ctx, (tx) => tx.concession.findUniqueOrThrow({ where: { id: big.concession.id } }));
    const total = async () => (await dues(f.ctx, s)).reduce((t, d) => t + d.balancePaise, BigInt(0));
    expect(await total()).toBe(R(24000 - 500));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, bigRow.approvalId!, "approve", null));
    expect(await total()).toBe(R(24000 - 5500));
    void open;
  });

  it("turns a counter discount above the limit into an approval request", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const attempt = collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(4000), discountPaise: R(2000), discountReason: "Hardship case" });
    await expect(attempt).rejects.toThrow(/need the principal's approval/);
    try {
      await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(4000), discountPaise: R(2000), discountReason: "Hardship case" });
    } catch (e) {
      expect((e as MoneyProblem).code).toBe("needs-approval");
    }
  });

  it("refuses a discount from someone without the permission", async () => {
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    await expect(collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(5500), discountPaise: R(500), discountReason: "Sibling discount" }, ["office-staff"])).rejects.toThrow('needs the "give discount" permission');
  });
});

describe("payment verification (optional)", () => {
  it("holds a cheque as Waiting with no receipt or Day Book entry until approved", async () => {
    await feature(f.ctx, "fee-verification", true);
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { verifyModes: ["CHEQUE"] } }));
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const r = await collect(f.ctx, { studentId: s, dueIds: [open[0].id], amountPaise: R(6000), mode: "CHEQUE", chequeNo: "123456", chequeBank: "SBI", chequeDate: new Date() });
    expect(r.waiting).toBe(true);
    expect(r.receiptNo).toBeNull();
    expect(await dayBook(r.payment.id)).toHaveLength(0);
    expect(await withSchool(f.ctx, (tx) => tx.receipt.count({ where: { paymentId: r.payment.id } }))).toBe(0);
    const p = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, p.verifyApprovalId!, "approve", null));
    const after = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    expect(after.status).toBe("POSTED");
    expect(await dayBook(r.payment.id)).toHaveLength(1);
    await feature(f.ctx, "fee-verification", false);
  });
});

describe("online payments (A8)", () => {
  it("posts once when the gateway confirms twice, and records failures with no receipt (Done when 5)", async () => {
    const gw = await withSchool(f.ctx, (tx) => tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused-in-this-test" } }));
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId: s, dueIds: [open[0].id], source: "LINK" }));
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: made.link.id }, data: { gatewayOrderId: "order_test_1" } }));
    const event = { gatewayAccountId: gw.id, gatewayPaymentId: "pay_test_1", orderId: "order_test_1", amountPaise: 600000, event: "payment.captured" };
    const one = await withSchool(f.ctx, (tx) => confirmGatewayPayment(tx, f.ctx, event));
    const two = await withSchool(f.ctx, (tx) => confirmGatewayPayment(tx, f.ctx, { ...event, event: "order.paid" }));
    expect(one.created).toBe(true);
    expect(two.created).toBe(false);
    expect(two.paymentId).toBe(one.paymentId);
    expect(await withSchool(f.ctx, (tx) => tx.payment.count({ where: { reference: "pay_test_1", status: "POSTED" } }))).toBe(1);
    expect(await withSchool(f.ctx, (tx) => tx.receipt.count({ where: { paymentId: one.paymentId! } }))).toBe(1);

    const made2 = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId: s, dueIds: [open[1].id], source: "PARENT_LINK" }));
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: made2.link.id }, data: { gatewayOrderId: "order_test_2" } }));
    const failed = await withSchool(f.ctx, (tx) => recordGatewayFailure(tx, f.ctx, { gatewayAccountId: gw.id, gatewayPaymentId: "pay_test_2", orderId: "order_test_2", amountPaise: 600000, reason: "Card declined" }));
    expect(failed?.status).toBe("FAILED");
    expect(await withSchool(f.ctx, (tx) => tx.receipt.count({ where: { paymentId: failed!.id } }))).toBe(0);
    expect(await dayBook(failed!.id)).toHaveLength(0);
  });
});

describe("a link paid twice (two tabs, or paying again later)", () => {
  it("posts the second payment as advance, says so on the payment, and tells the fee desk", async () => {
    const gw = await withSchool(f.ctx, (tx) => tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay twice", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused" } }));
    const s = await freshStudent();
    const open = await dues(f.ctx, s);
    const made = await withSchool(f.ctx, (tx) => createPaymentLink(tx, f.ctx, { studentId: s, dueIds: [open[0].id], source: "PARENT_LINK" }));
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: made.link.id }, data: { gatewayOrderId: "order_twice_1" } }));
    // Razorpay's webhook runs as nobody in the school, so the accountant is told (nobody is told about their own action).
    const gateway = { schoolId: f.ctx.schoolId, userId: null };
    const pay = (id: string) => withSchool(gateway, (tx) => confirmGatewayPayment(tx, gateway, { gatewayAccountId: gw.id, gatewayPaymentId: id, orderId: "order_twice_1", amountPaise: 600000, event: "payment.captured" }));
    const first = await pay("pay_twice_1");
    const second = await pay("pay_twice_2");
    expect(second.created).toBe(true);
    const [p1, p2] = await withSchool(f.ctx, (tx) => Promise.all([first, second].map((r) => tx.payment.findUniqueOrThrow({ where: { id: r.paymentId! } }))));
    expect(p1.note).not.toMatch(/Paid twice/);
    expect(p2.note).toMatch(/^Paid twice/);
    expect(p2.advancePaise).toBe(BigInt(600000));
    const desk = await withSchool(f.ctx, (tx) => feeDesk(tx, f.ctx));
    const told = await withSchool(f.ctx, (tx) => tx.notification.count({ where: { type: "fee-online", text: { contains: "paid twice online" } } }));
    expect(told).toBe(desk.length);
  });
});

describe("installments and closed books", () => {
  it("refuses installments that do not add up (Done when 6)", async () => {
    expect(checkSchedule(R(60000), [{ label: "Term 1", dueDate: new Date("2026-04-10"), amountPaise: R(30000) }, { label: "Term 2", dueDate: new Date("2026-10-10"), amountPaise: R(28000) }]))
      .toBe("Installments add up to ₹58,000. Total is ₹60,000.");
    const draft = await withSchool(f.ctx, (tx) => openDraft(tx, f.ctx, f.year.id, f.cls.id));
    await expect(withSchool(f.ctx, (tx) => saveFeeRow(tx, f.ctx, draft.id, { feeHeadId: f.tuition.id, frequency: "TERM", totalPaise: R(60000), schedule: [{ label: "Term 1", dueDate: new Date("2026-04-10"), amountPaise: R(30000) }, { label: "Term 2", dueDate: new Date("2026-10-10"), amountPaise: R(28000) }] }, undefined)))
      .rejects.toThrow("Installments add up to ₹58,000. Total is ₹60,000.");
  });

  it("keeps a closed financial year read-only", async () => {
    const past = new Date("2025-06-15");
    const fy = await withSchool(f.ctx, (tx) => financialYearOf(tx, f.ctx, past));
    expect(fy.name).toBe("2025-26");
    await withSchool(f.ctx, (tx) => closeFinancialYear(tx, f.ctx, fy.id, new Date("2026-10-09")));
    await expect(withSchool(f.ctx, (tx) => assertBooksOpen(tx, f.ctx, past))).rejects.toThrow("This date is in 2025-26 (April to March). Finance year 2025-26 is closed");
  });
});

let seq = 0;
/** A new student in Class 5 A with the class fees assigned. */
async function freshStudent() {
  seq++;
  return withSchool(f.ctx, async (tx) => {
    const g = await tx.guardian.create({ data: { schoolId: f.school.id, name: `Parent ${seq}`, relationship: "Father", phone: `90000${String(Date.now()).slice(-5)}`.slice(0, 10) } });
    const s = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: `F${Date.now()}${seq}`, firstName: "Student", fullName: `Student ${seq}` } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s.id, academicYearId: f.year.id, classId: f.cls.id, sectionId: f.a.id } });
    await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
    const { assignToStudent } = await import("@/lib/fees/structure");
    await assignToStudent(tx, f.ctx, s.id, f.structureId, null);
    return s.id;
  });
}
