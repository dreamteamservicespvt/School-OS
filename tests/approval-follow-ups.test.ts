// Approval follow-ups on a server that has just started (gap list G01). A
// decision moves its record on whatever was loaded first: decide() loads the
// follow-up list (src/lib/approval-handlers.ts) itself. This file imports no
// handler module: each test resets the module graph and loads only the
// screen's own action file, as a fresh server process would.
import { describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import { withSchool } from "@/lib/db";
import { applyLeave } from "@/lib/staff/leave";
import { issueBook } from "@/lib/library/desk";
import { markLostOrDamaged } from "@/lib/library/fines";
import { makeSchool, makeUser } from "./helpers";
import { d, makeHrSchool } from "./staff-hr/fixture";
import { collect, dues, feature, makeFeeSchool, R } from "./fees/fixture";
import { TODAY, addTestBook, as, desk, makeLibrarySchool, plus, student } from "./library/fixture";

async function signIn(userId: string, schoolId: string) {
  token = (await createSession(userId, schoolId, { userAgent: "test" })).token;
}

/** A fresh module graph, as on a server that has just started: nothing is loaded until the next import. */
const coldStart = () => vi.resetModules();

describe("every request type has its follow-up", () => {
  it("resolves for each type on a cold module graph, with only src/lib/approvals.ts imported", async () => {
    coldStart();
    const { REQUEST_TYPES, NOT_ASKED_YET, followUpFor } = await import("@/lib/approvals");
    const notAsked: readonly string[] = NOT_ASKED_YET;
    const missing: string[] = [];
    for (const { key } of REQUEST_TYPES) {
      const followUp = await followUpFor(key);
      if (notAsked.includes(key)) expect(followUp, key).toBeNull();
      else if (typeof followUp !== "function") missing.push(key);
    }
    expect(missing).toEqual([]);
    // Only these two are listed in 00-global.md §3 with nothing in School OS asking for them yet.
    expect([...NOT_ASKED_YET]).toEqual(["salary-adjustment", "user-request"]);
    expect(await followUpFor("no-such-request")).toBeNull();
  });

  it("refuses to decide a request with no follow-up, and changes nothing", async () => {
    const school = await makeSchool("No Follow-up School");
    const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Principal Person" });
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Teacher Person" });
    const sys = { schoolId: school.id, userId: null };
    const rows = await withSchool(sys, async (tx) =>
      Promise.all(["user-request", "made-up-request"].map((type) => tx.approval.create({ data: { schoolId: school.id, type, recordType: "Test", recordId: crypto.randomUUID(), summary: `${type} test`, askedById: teacher.id, currentApproverRole: "principal", step: 1, history: [] } }))),
    );
    coldStart();
    const { decide, DecisionProblem } = await import("@/lib/approvals");
    const pctx = { schoolId: school.id, userId: principal.id };
    for (const a of rows) {
      const refused = withSchool(pctx, (tx) => decide(tx, pctx, a.id, "approve", null));
      await expect(refused).rejects.toThrow(DecisionProblem);
      await expect(refused).rejects.toThrow(/cannot act on this request yet \(.+\), so nothing was changed/);
      const after = await withSchool(sys, (tx) => tx.approval.findUniqueOrThrow({ where: { id: a.id } }));
      expect(after).toMatchObject({ status: "WAITING", decidedById: null });
    }
  });
});

describe("a module's own screen decides on a cold server", () => {
  it("Staff & HR, Leave: the Principal approves and the leave is approved, with the balance used", async () => {
    const f = await makeHrSchool();
    const tctx = { schoolId: f.school.id, userId: f.teacherLogin.id };
    const r = await withSchool(tctx, (tx) => applyLeave(tx, tctx, { staffId: f.teacher.id, leaveTypeId: f.cl.id, from: d("2026-11-11"), to: d("2026-11-12"), halfDayPart: null, reason: "Family function", documentFileId: null, onBehalf: false }));
    expect(r.approval.currentApproverRole).toBe("principal");
    await signIn(f.principal.id, f.school.id);

    coldStart();
    const { decideLeave } = await import("@/app/(school)/staff-hr-management/leave/actions");
    const fd = new FormData();
    fd.set("decision", "approve");
    fd.set("approvalId", r.approval.id);
    const out = await decideLeave(null as never, fd);
    expect(out).toMatchObject({ ok: true, message: "Leave approved." });

    const sys = { schoolId: f.school.id, userId: null };
    const leave = await withSchool(sys, (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: r.request.id } }));
    expect(leave).toMatchObject({ status: "APPROVED", decidedById: f.principal.id });
    const approval = await withSchool(sys, (tx) => tx.approval.findUniqueOrThrow({ where: { id: r.approval.id } }));
    expect(approval.status).toBe("APPROVED");
  });

  it("Fee Management, Payments: verifying a cheque posts it with a receipt", async () => {
    const f = await makeFeeSchool();
    await feature(f.ctx, "fee-verification", true);
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { verifyModes: ["CHEQUE"] } }));
    const open = await dues(f.ctx, f.ravi.id);
    const r = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(6000), mode: "CHEQUE", chequeNo: "123456", chequeBank: "SBI", chequeDate: new Date() });
    expect(r.waiting).toBe(true);
    await signIn(f.principal.id, f.school.id);

    coldStart();
    const { verifyPayment } = await import("@/app/(school)/fee-management/payments/actions");
    const fd = new FormData();
    fd.set("paymentId", r.payment.id);
    const out = await verifyPayment(null, fd);
    expect(out?.ok).toBe(true);

    const payment = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    expect(payment.status).toBe("POSTED");
    const receipt = await withSchool(f.ctx, (tx) => tx.receipt.findUniqueOrThrow({ where: { paymentId: r.payment.id } }));
    // The message names the receipt that was made, not an empty number.
    expect(out?.message).toBe(`${receipt.number} posted. ₹6,000 is in today’s Day Book and the receipt is sent.`);
  });

  it("Library Management, Fines: approving a lost-book charge adds it to the student's fees", async () => {
    const f = await makeLibrarySchool("Cold Library School");
    const b = await addTestBook(f, "Costly Atlas", 1, { pricePaise: BigInt(80000) });
    const rahul = await student(f, f.rahul);
    await withSchool(desk(f), (tx) => issueBook(tx, desk(f), { member: rahul, copyId: b.copies[0].id, today: TODAY }));
    const lost = await withSchool(desk(f), (tx) => markLostOrDamaged(tx, desk(f), { copyId: b.copies[0].id, kind: "LOST", chargePaise: null, note: "Lost on the bus", today: plus(TODAY, 4) }));
    expect(lost.fine).toMatchObject({ status: "WAITING", feeDueId: null });
    await signIn(f.principal.id, f.school.id);

    coldStart();
    const { decideChargeAction } = await import("@/app/(school)/library-management/actions");
    const fd = new FormData();
    fd.set("fineId", lost.fine!.id);
    fd.set("decision", "approve");
    const out = await decideChargeAction(null as never, fd);
    expect(out).toMatchObject({ ok: true });

    const fine = await withSchool(as(f, f.principal.id), (tx) => tx.libraryFine.findFirstOrThrow({ where: { id: lost.fine!.id } }));
    expect(fine.status).toBe("DUE");
    expect(fine.feeDueId).toBeTruthy();
  });
});
