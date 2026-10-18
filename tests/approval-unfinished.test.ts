// "Approved, but not finished" (gap list G01, follow-up). Before 18 October
// 2026 a decision made on a server that had just started was recorded while
// its record stayed waiting. Here such requests are made as the old code
// left them (the Approval decided, the record untouched). The Approvals page
// lists each one for the person who decided it and for the Principal and
// School Admin, never for anyone else; Finish now runs the normal follow-up
// as the person who decided, with an Audit Log line; a follow-up that cannot
// be done now (the class is full) shows the plain reason and changes nothing.
// Nothing is finished by itself.
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
import { withSchool, type SchoolContext } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { REQUEST_TYPES, NOT_ASKED_YET, DecisionProblem, plainReason, type Decision } from "@/lib/approvals";
import { MoneyProblem } from "@/lib/fees/problem";
import { unfinishedOf } from "@/lib/approval-handlers";
import { decisionOf } from "@/lib/approval-waiting";
import { unfinishedApprovals } from "@/lib/approvals-unfinished";
import { finishFollowUpAction } from "@/app/(school)/approvals/actions";
import { applyLeave } from "@/lib/staff/leave";
import { issueBook } from "@/lib/library/desk";
import { markLostOrDamaged } from "@/lib/library/fines";
import { d, makeHrSchool } from "./staff-hr/fixture";
import { collect, dues, feature, makeFeeSchool, R } from "./fees/fixture";
import { TODAY, addTestBook, as, desk, makeLibrarySchool, plus, student } from "./library/fixture";
import { admissionSchool, day } from "./admission/fixtures";

async function signIn(userId: string, schoolId: string) {
  token = (await createSession(userId, schoolId, { userAgent: "test" })).token;
}

/** Decides a request the way the old code did on a cold server: the Approval says decided, the record is untouched. */
async function decidedByOldCode(schoolId: string, approvalId: string, by: string, decision: Decision, note: string | null = null) {
  const sys = { schoolId, userId: null };
  await withSchool(sys, async (tx) => {
    const a = await tx.approval.findUniqueOrThrow({ where: { id: approvalId } });
    await tx.approval.update({
      where: { id: a.id },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED", decidedById: by, decidedAt: new Date(Date.now() - 3 * 86_400_000), decisionReason: note,
        history: [...(a.history as object[]), { at: new Date().toISOString(), by, action: decision, note }],
      },
    });
  });
}

const listFor = (ctx: SchoolContext) => withSchool(ctx, async (tx) => (await unfinishedApprovals(tx, ctx)).map((a) => a.id));
const audits = (schoolId: string, recordId: string) => withSchool({ schoolId, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { action: "approval-follow-up-finished", recordId } }));

describe("every request type can be checked", () => {
  it("has a check for a record still waiting, for each type that can be asked for", () => {
    const notAsked: readonly string[] = NOT_ASKED_YET;
    const missing = REQUEST_TYPES.map((t) => t.key).filter((k) => !notAsked.includes(k) && typeof unfinishedOf(k) !== "function");
    expect(missing).toEqual([]);
    expect(unfinishedOf("no-such-request")).toBeNull();
  });

  it("reads the decision from the request: approved, not approved, sent back", () => {
    expect(decisionOf({ status: "APPROVED", history: [] })).toBe("approve");
    expect(decisionOf({ status: "REJECTED", history: [{ action: "asked" }, { action: "reject" }] })).toBe("reject");
    expect(decisionOf({ status: "REJECTED", history: [{ action: "asked" }, { action: "ask-change" }] })).toBe("ask-change");
    expect(decisionOf({ status: "WAITING", history: [] })).toBeNull();
  });

  it("shows a follow-up's own reason on Approvals, never a fault's inner words", () => {
    expect(plainReason(new DecisionProblem("This request was already decided."))).toBe("This request was already decided.");
    expect(plainReason(new MoneyProblem("Net pay is below zero for Ravi Kumar (-₹1,500)."))).toBe("Net pay is below zero for Ravi Kumar (-₹1,500).");
    expect(plainReason(new Error("relation does not exist"))).toBeNull();
    expect(plainReason(new TypeError("x is undefined"))).toBeNull();
    expect(plainReason(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }))).toBeNull();
    expect(plainReason("text")).toBeNull();
  });
});

describe("a staff leave approved while its leave stayed waiting", () => {
  it("is listed for the person who decided and the School Admin, finished once with an Audit Log line, and refused to anyone else", async () => {
    const f = await makeHrSchool();
    const tctx = { schoolId: f.school.id, userId: f.teacherLogin.id };
    const r = await withSchool(tctx, (tx) => applyLeave(tx, tctx, { staffId: f.teacher.id, leaveTypeId: f.cl.id, from: d("2026-11-11"), to: d("2026-11-12"), halfDayPart: null, reason: "Family function", documentFileId: null, onBehalf: false }));
    await decidedByOldCode(f.school.id, r.approval.id, f.principal.id, "approve");
    const pctx = { schoolId: f.school.id, userId: f.principal.id };
    const actx = { schoolId: f.school.id, userId: f.admin.id };
    const hctx = { schoolId: f.school.id, userId: f.headLogin.id };

    expect(await listFor(pctx)).toEqual([r.approval.id]);
    expect(await listFor(actx)).toEqual([r.approval.id]);
    expect(await listFor(hctx)).toEqual([]);
    expect(await listFor(tctx)).toEqual([]);

    // Nothing moves by itself; someone else cannot finish it.
    await signIn(f.headLogin.id, f.school.id);
    expect(await finishFollowUpAction(r.approval.id)).toMatch(/Only the person who decided this request, the Principal or the School Admin/);
    expect((await withSchool(pctx, (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: r.request.id } }))).status).toBe("WAITING");

    // The School Admin finishes it: the leave is approved in the Principal's name, and the Admin's finishing is in the Audit Log.
    await signIn(f.admin.id, f.school.id);
    expect(await finishFollowUpAction(r.approval.id)).toBeUndefined();
    const leave = await withSchool(pctx, (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: r.request.id } }));
    expect(leave).toMatchObject({ status: "APPROVED", decidedById: f.principal.id });
    const lines = await audits(f.school.id, r.approval.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].userLoginId).toBe(f.admin.id);
    expect(await listFor(pctx)).toEqual([]);
    // A second tap finds it finished.
    expect(await finishFollowUpAction(r.approval.id)).toMatch(/already finished/);
  });
});

describe("a cheque verified while its payment stayed waiting", () => {
  it("is posted with its receipt when the person who verified it finishes it", async () => {
    const f = await makeFeeSchool();
    await feature(f.ctx, "fee-verification", true);
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { verifyModes: ["CHEQUE"] } }));
    const open = await dues(f.ctx, f.ravi.id);
    const r = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(6000), mode: "CHEQUE", chequeNo: "123456", chequeBank: "SBI", chequeDate: new Date() });
    const approvalId = (await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }))).verifyApprovalId!;
    await decidedByOldCode(f.school.id, approvalId, f.principal.id, "approve");
    expect(await listFor(f.pctx)).toEqual([approvalId]);
    // The Accountant asked; they did not decide and are not the Principal.
    expect(await listFor(f.ctx)).toEqual([]);

    await signIn(f.principal.id, f.school.id);
    expect(await finishFollowUpAction(approvalId)).toBeUndefined();
    const payment = await withSchool(f.ctx, (tx) => tx.payment.findUniqueOrThrow({ where: { id: r.payment.id } }));
    expect(payment.status).toBe("POSTED");
    expect(await withSchool(f.ctx, (tx) => tx.receipt.count({ where: { paymentId: r.payment.id } }))).toBe(1);
  });
});

describe("a lost-book charge not approved while it stayed waiting", () => {
  it("is not charged once finished", async () => {
    const f = await makeLibrarySchool("Unfinished Library School");
    const b = await addTestBook(f, "Costly Atlas", 1, { pricePaise: BigInt(80000) });
    const rahul = await student(f, f.rahul);
    await withSchool(desk(f), (tx) => issueBook(tx, desk(f), { member: rahul, copyId: b.copies[0].id, today: TODAY }));
    const lost = await withSchool(desk(f), (tx) => markLostOrDamaged(tx, desk(f), { copyId: b.copies[0].id, kind: "LOST", chargePaise: null, note: "Lost on the bus", today: plus(TODAY, 4) }));
    await decidedByOldCode(f.school.id, lost.fine!.approvalId!, f.principal.id, "reject", "The book was found later");
    expect(await listFor(as(f, f.principal.id))).toEqual([lost.fine!.approvalId]);
    await signIn(f.principal.id, f.school.id);
    expect(await finishFollowUpAction(lost.fine!.approvalId!)).toBeUndefined();
    const fine = await withSchool(as(f, f.principal.id), (tx) => tx.libraryFine.findFirstOrThrow({ where: { id: lost.fine!.id } }));
    expect(fine.status).not.toBe("WAITING");
    expect(fine.feeDueId).toBeNull();
  });
});

describe("an admission approved while the application stayed at Decision", () => {
  it("shows the plain reason when the class is full now, and leaves everything as it was", async () => {
    const s = await admissionSchool("Unfinished Admission School");
    const sys = { schoolId: s.school.id, userId: null };
    const ids = await withSchool(sys, async (tx) => {
      await tx.section.updateMany({ where: { classId: s.c1, academicYearId: s.nextYearId }, data: { seats: 1 } });
      const base = { schoolId: s.school.id, campusId: s.campusId, academicYearId: s.nextYearId, classId: s.c1, dateOfBirth: day("2021-01-01"), gender: "Male", address: "Hyderabad" };
      // The one seat is held by an application approved since.
      await tx.application.create({ data: { ...base, applicationNo: "APP-HELD", firstName: "Held", fullName: "Held Seat", phone: "9876611001", stage: "APPROVED" } });
      const app = await tx.application.create({ data: { ...base, applicationNo: "APP-LATE", firstName: "Late", fullName: "Late Decision", phone: "9876611002", stage: "DECISION" } });
      const approval = await tx.approval.create({ data: { schoolId: s.school.id, type: "admission", recordType: "Application", recordId: app.id, summary: "Admission: Late Decision, Class 1", askedById: s.counsellor.id, currentApproverRole: "principal", step: 1, history: [] } });
      await tx.application.update({ where: { id: app.id }, data: { approvalId: approval.id } });
      return { appId: app.id, approvalId: approval.id };
    });
    await decidedByOldCode(s.school.id, ids.approvalId, s.principal.id, "approve");
    expect(await listFor({ schoolId: s.school.id, userId: s.principal.id })).toEqual([ids.approvalId]);

    await signIn(s.principal.id, s.school.id);
    expect(await finishFollowUpAction(ids.approvalId)).toMatch(/Class 1 A is full \(1 of 1, 1 held for approved applications\)/);
    const app = await withSchool(sys, (tx) => tx.application.findUniqueOrThrow({ where: { id: ids.appId } }));
    expect(app.stage).toBe("DECISION");
    expect(await audits(s.school.id, ids.approvalId)).toHaveLength(0);
    // Still listed, to finish once a seat is free.
    expect(await listFor({ schoolId: s.school.id, userId: s.principal.id })).toEqual([ids.approvalId]);
    await withSchool(sys, (tx) => tx.section.updateMany({ where: { classId: s.c1, academicYearId: s.nextYearId }, data: { seats: 2 } }));
    expect(await finishFollowUpAction(ids.approvalId)).toBeUndefined();
    expect((await withSchool(sys, (tx) => tx.application.findUniqueOrThrow({ where: { id: ids.appId } }))).stage).toBe("APPROVED");
  });

  it("never lists another school's requests", async () => {
    const other = await admissionSchool("Unfinished Other School");
    expect(await listFor({ schoolId: other.school.id, userId: other.principal.id })).toEqual([]);
  });
});
