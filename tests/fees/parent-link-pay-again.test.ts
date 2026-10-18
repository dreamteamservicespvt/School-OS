// Parent Link's Pay button tapped again (06 §2, A8): the open link for the
// same rows and amount is used again, not a new Payment Link each tap. Other
// rows, a changed amount, a paid, cancelled or nearly expired link, and
// another guardian each get their own link.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { startParentLinkPayment } from "@/lib/fees/parent-link";
import { cancelLink, REUSE_LEFT_MS } from "@/lib/fees/online";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const linkCount = (studentId: string) => withSchool(f.ctx, (tx) => tx.paymentLink.count({ where: { studentId } }));
const guardianOf = (studentId: string) => (studentId === f.ravi.id ? f.ravi.guardian.id : f.sita.guardian.id);
const pay = (studentId: string, dueIds: string[], guardianId = guardianOf(studentId)) =>
  withSchool({ schoolId: f.school.id, userId: null }, (tx) => startParentLinkPayment(tx, { schoolId: f.school.id, userId: null }, guardianId, studentId, dueIds));

beforeAll(async () => {
  f = await makeFeeSchool();
  await withSchool(f.ctx, (tx) => tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused-in-this-test" } }));
});

describe("Pay on Parent Link, tapped again", () => {
  it("opens the same payment link for the same fees and amount", async () => {
    const [q1] = await dues(f.ctx, f.ravi.id);
    const first = await pay(f.ravi.id, [q1.id]);
    const again = await pay(f.ravi.id, [q1.id]);
    expect(first.reused).toBe(false);
    expect(again.reused).toBe(true);
    expect(again.payPath).toBe(first.payPath);
    expect(again.linkId).toBe(first.linkId);
    expect(await linkCount(f.ravi.id)).toBe(1);
  });

  it("makes a new link for other rows, and again once the amount due changed", async () => {
    const [q1, q2] = await dues(f.ctx, f.ravi.id);
    const both = await pay(f.ravi.id, [q1.id, q2.id]);
    expect(both.reused).toBe(false);
    // The same two rows in another order are the same fees.
    expect((await pay(f.ravi.id, [q2.id, q1.id])).linkId).toBe(both.linkId);
    // Part of the first quarter is paid at the counter: the amount is different now.
    await collect(f.ctx, { studentId: f.ravi.id, dueIds: [q1.id], amountPaise: R(1000) });
    const after = await pay(f.ravi.id, [q1.id]);
    expect(after.reused).toBe(false);
    expect(after.amountPaise).toBe(R(5000));
    expect((await pay(f.ravi.id, [q1.id])).linkId).toBe(after.linkId);
  });

  it("never sends the parent to a paid, cancelled or nearly expired link", async () => {
    const [q1] = await dues(f.ctx, f.sita.id);
    const a = await pay(f.sita.id, [q1.id]);
    await withSchool(f.ctx, (tx) => cancelLink(tx, f.ctx, a.linkId));
    const b = await pay(f.sita.id, [q1.id]);
    expect(b.linkId).not.toBe(a.linkId);
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: b.linkId }, data: { expiresAt: new Date(Date.now() + REUSE_LEFT_MS / 2) } }));
    const c = await pay(f.sita.id, [q1.id]);
    expect(c.linkId).not.toBe(b.linkId);
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: c.linkId }, data: { status: "PAID" } }));
    const d = await pay(f.sita.id, [q1.id]);
    expect(d.linkId).not.toBe(c.linkId);
    // A failed attempt keeps the link open for another try.
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: d.linkId }, data: { status: "FAILED" } }));
    expect((await pay(f.sita.id, [q1.id])).linkId).toBe(d.linkId);
  });

  it("gives each guardian their own link, and leaves links sent by the office alone", async () => {
    const [q1] = await dues(f.ctx, f.sita.id);
    const second = await withSchool(f.ctx, async (tx) => {
      const g = await tx.guardian.create({ data: { schoolId: f.school.id, name: "Radha Rao", relationship: "Mother", phone: "9123400077", language: "en" } });
      await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: f.sita.id, guardianId: g.id, relationship: "Mother" } });
      return g;
    });
    const mine = await pay(f.sita.id, [q1.id]);
    const hers = await pay(f.sita.id, [q1.id], second.id);
    expect(hers.linkId).not.toBe(mine.linkId);
    expect((await pay(f.sita.id, [q1.id], second.id)).linkId).toBe(hers.linkId);
    // A link from before this change (a random secret that cannot be worked out again) is not reused.
    await withSchool(f.ctx, (tx) => tx.paymentLink.update({ where: { id: hers.linkId }, data: { tokenHash: "x".repeat(64) } }));
    expect((await pay(f.sita.id, [q1.id], second.id)).linkId).not.toBe(hers.linkId);
  });
});
