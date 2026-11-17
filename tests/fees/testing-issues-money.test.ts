// Money items of docs/qa/testing-issues.md (live test, 3 and 4 Nov 2026), checked again on 17 Nov 2026.
// 31: a screen's own error sentence is never saved as the reason for a discount, at the counter
//     or on a request, and an old row that holds one reads "No reason given" in the Discount and
//     concession report and on the student's statement, as it does on the lists.
// 33: after a discount and a refund the year's fee carries the discount only; the refund lowers
//     Paid, so what is left goes up by it (the rule since 2026-11-12).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide, followUpFor } from "@/lib/approvals";
import "@/lib/fees/handlers";
import type { FeeViewer } from "@/lib/fees/access";
import { giveConcession } from "@/lib/fees/concessions";
import { allDues, totalsOf } from "@/lib/fees/dues";
import { studentLedger } from "@/lib/fees/ledger";
import { MoneyProblem } from "@/lib/fees/problem";
import { markRefunded, requestRefund } from "@/lib/fees/refunds";
import { findFeeReport, type ReportFilter } from "@/lib/fees/reports";
import { assignToStudent } from "@/lib/fees/structure";
import { todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
let seq = 0;
const today = todayIn("Asia/Kolkata");
// The two sentences the live school's Concessions list showed as a "Reason" (issue 31).
const OVER_LIMIT = "Discounts above ₹1,000 need the principal's approval. Ask for approval, then collect once it is approved, or collect without the discount.";
const TOO_SHORT = "Give a reason of at least 5 characters for the discount.";

beforeAll(async () => {
  f = await makeFeeSchool();
  // What an approval does next is loaded on first use. Loaded here, outside a transaction: on a
  // slow disk that first load once took a minute, longer than a transaction may last.
  await followUpFor("concession");
}, 240_000);

/** A new student in Class 5 A with the year's Tuition fee: four rows of ₹6,000. */
async function freshStudent() {
  seq++;
  return withSchool(f.ctx, async (tx) => {
    const g = await tx.guardian.create({ data: { schoolId: f.school.id, name: `Parent T${seq}`, relationship: "Father", phone: `91${String(Date.now()).slice(-7)}${seq}`.slice(0, 10) } });
    const s = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: `T${Date.now()}${seq}`, firstName: "Student", fullName: `Student T${seq}` } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: s.id, academicYearId: f.year.id, classId: f.cls.id, sectionId: f.a.id } });
    await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
    await assignToStudent(tx, f.ctx, s.id, f.structureId, null);
    return s.id;
  });
}

/** Year, Paid and Left as the Collect Fee and ledger pages work them out. */
const yearPaidLeft = (studentId: string) => withSchool(f.ctx, async (tx) => totalsOf(await allDues(tx, studentId)));

describe("issue 31: a screen's error sentence is never a discount's reason", () => {
  it("refuses it at the counter and keeps nothing; the same discount with a real reason goes through", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    for (const sentence of [OVER_LIMIT, TOO_SHORT]) {
      const err = await collect(f.ctx, { studentId: s, dueIds: [first.id], amountPaise: R(5500), discountPaise: R(500), discountReason: sentence }).catch((e) => e);
      expect(err).toBeInstanceOf(MoneyProblem);
      expect((err as MoneyProblem).field).toBe("discountReason");
      expect((err as MoneyProblem).message).toBe(TOO_SHORT);
    }
    expect(await withSchool(f.ctx, (tx) => tx.concession.count({ where: { studentId: s } }))).toBe(0);
    expect(await withSchool(f.ctx, (tx) => tx.payment.count({ where: { studentId: s } }))).toBe(0);
    // Only the reason differs: the discount and the payment are fine.
    const r = await collect(f.ctx, { studentId: s, dueIds: [first.id], amountPaise: R(5500), discountPaise: R(500), discountReason: "Sibling in school" });
    expect(r.payment.discountPaise).toBe(R(500));
    const saved = await withSchool(f.ctx, (tx) => tx.concession.findMany({ where: { studentId: s } }));
    expect(saved.map((c) => c.reason)).toEqual(["Sibling in school"]);
  }, 120_000);

  it("refuses it as the reason for waiving a late fee", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    const late = await withSchool(f.ctx, (tx) => tx.studentFeeDue.create({ data: { schoolId: f.school.id, studentId: s, academicYearId: first.academicYearId, feeHeadId: first.feeHeadId, kind: "LATE_FEE", label: "Late fee", dueDate: first.dueDate, amountPaise: R(200), balancePaise: R(200), parentDueId: first.id } }));
    const pay = (waiveReason: string) => collect(f.ctx, { studentId: s, dueIds: [first.id, late.id], amountPaise: R(6000), waiveDueIds: [late.id], waiveReason });
    const err = await pay("Give a reason of at least 5 characters for the waiver.").catch((e) => e);
    expect(err).toBeInstanceOf(MoneyProblem);
    expect((err as MoneyProblem).field).toBe("waiveReason");
    expect(await withSchool(f.ctx, (tx) => tx.payment.count({ where: { studentId: s } }))).toBe(0);
    const r = await pay("In hospital in July");
    expect(r.payment.discountPaise).toBe(R(200));
  }, 120_000);

  it("refuses it on a request for approval too", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    const ask = (reason: string) => withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, { studentId: s, type: "DISCOUNT", mode: "amount", amountPaise: R(1500), percentBp: 0, feeHeadIds: [], dueIds: [first.id], periodFrom: null, periodTo: null, reason }, { forceApproval: true }));
    for (const sentence of [OVER_LIMIT, TOO_SHORT]) await expect(ask(sentence)).rejects.toThrow("Give a reason of at least 5 characters.");
    expect(await withSchool(f.ctx, (tx) => tx.concession.count({ where: { studentId: s } }))).toBe(0);
    expect((await ask("Father lost his job")).waiting).toBe(true);
  }, 120_000);

  it("shows \"No reason given\" for an old row in the concession report and on the statement", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    await collect(f.ctx, { studentId: s, dueIds: [first.id], amountPaise: R(5500), discountPaise: R(500), discountReason: "Sibling in school" });
    // An old row: saved before the server refused such sentences.
    await withSchool(f.ctx, (tx) => tx.concession.updateMany({ where: { studentId: s }, data: { reason: OVER_LIMIT } }));
    const viewer: FeeViewer = { userId: f.accountant.id, see: "all", change: "all", roleKeys: ["accountant"], sectionIds: null, yearId: f.year.id, yearIds: [f.year.id], campusId: null };
    const filter: ReportFilter = { from: new Date("2026-04-01"), to: today, classId: null, feeHeadId: null, mode: null, collectorId: null, group: "month", today };
    const report = await withSchool(f.ctx, (tx) => findFeeReport("concessions")!.run(tx, f.ctx, filter, viewer));
    const row = report.rows.find((r) => r.student === `Student T${seq}`)!;
    expect(row.reason).toBe("No reason given");
    const led = await withSchool(f.ctx, (tx) => studentLedger(tx, s, new Date(), "Asia/Kolkata"));
    const line = led.entries.find((e) => e.kind === "concession")!;
    expect(line.sub).toMatch(/^No reason given/);
    expect(line.sub).not.toContain("principal's approval");
  }, 120_000);
});

describe("issue 33: Year, Paid and Left after a discount and a refund", () => {
  it("keeps the fee at the discounted amount; the refund lowers Paid and raises what is left", async () => {
    const s = await freshStudent();
    const [first] = await dues(f.ctx, s);
    expect(await yearPaidLeft(s)).toEqual({ total: R(24000), paid: R(0), balance: R(24000) });
    // ₹5,000 paid in cash.
    const paid = await collect(f.ctx, { studentId: s, dueIds: [first.id], amountPaise: R(5000) });
    expect(await yearPaidLeft(s)).toEqual({ total: R(24000), paid: R(5000), balance: R(19000) });
    // A ₹3,000 discount, above the counter limit, approved by the Principal.
    const asked = await withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, { studentId: s, type: "DISCOUNT", mode: "amount", amountPaise: R(3000), percentBp: 0, feeHeadIds: [f.tuition.id], periodFrom: null, periodTo: null, reason: "Hardship case" }));
    expect(asked.waiting).toBe(true);
    const concession = await withSchool(f.ctx, (tx) => tx.concession.findUniqueOrThrow({ where: { id: asked.concession.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, concession.approvalId!, "approve", null));
    expect(await yearPaidLeft(s)).toEqual({ total: R(21000), paid: R(5000), balance: R(16000) });
    // ₹1,000 given back: approved, then marked refunded.
    const refund = await withSchool(f.ctx, (tx) => requestRefund(tx, f.ctx, { paymentId: paid.payment.id, amountPaise: R(1000), reason: "Paid twice by mistake", mode: "CASH" }));
    const waiting = await withSchool(f.ctx, (tx) => tx.refund.findUniqueOrThrow({ where: { id: refund.id } }));
    await withSchool(f.pctx, (tx) => decide(tx, f.pctx, waiting.approvalId!, "approve", null));
    // Approved but not yet paid back: nothing moves.
    expect(await yearPaidLeft(s)).toEqual({ total: R(21000), paid: R(5000), balance: R(16000) });
    await withSchool(f.ctx, (tx) => markRefunded(tx, f.ctx, refund.id, { date: paid.payment.paymentDate, reference: null, accountId: null }));
    expect(await yearPaidLeft(s)).toEqual({ total: R(21000), paid: R(4000), balance: R(17000) });
  }, 120_000);
});
