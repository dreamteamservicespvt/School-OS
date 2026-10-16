// A staff member's library fine "collected here or recovered from salary"
// (13 Fines): sent to salary, it lands on the next salary worked out as a
// one-time deduction with the fine number, once only; it cannot be collected
// at the desk meanwhile; it is Paid when that salary is approved; the
// accountant can take it off the salary (the fine is due at the desk again);
// the librarian can take it back while the salary is still being prepared,
// never once it waits for approval. Every step is in the audit log.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import { ensureSalaryDefaults } from "@/lib/salary/settings";
import { saveStructure } from "@/lib/salary/structures";
import { archiveAdjustment, calculateRun, openRun, sendForApproval, takeBack } from "@/lib/salary/payroll";
import { collectAtDesk, createFine, waiveFine } from "@/lib/library/fines";
import { librarySettings } from "@/lib/library/settings";
import { fineDeductionReason, sendFineToSalary, stopFineFromSalary } from "@/lib/library/salary";
import { lines, R } from "../salary/fixture";
import { as, addTestBook, day, desk, libFor, makeLibrarySchool, staffMember, student, type LibFixture } from "./fixture";

const OCT = day("2026-10-01");
const TODAY = day("2026-10-14");

describe("a staff member's library fine taken from salary", () => {
  let f: LibFixture;
  let acc: ReturnType<typeof as>;
  let runId = "";

  const fineFor = async (who: "staff" | "student", amount = 50) => {
    const b = await addTestBook(f, `Book for ${who} ${Math.random().toString(36).slice(2, 7)}`);
    const member = who === "staff" ? await staffMember(f, f.teacherStaff) : await student(f, f.meena);
    const ctx = desk(f);
    return withSchool(ctx, async (tx) => createFine(tx, ctx, await librarySettings(tx, ctx), {
      member, reason: "LATE", issueId: null, copyId: b.copies[0].id, bookId: b.book.id, lateDays: 5, amountPaise: R(amount), note: null, book: { title: b.book.title }, today: TODAY,
    }));
  };
  const fine = (id: string) => withSchool(desk(f), (tx) => tx.libraryFine.findFirstOrThrow({ where: { id } }));
  const adjustments = (rid: string) => withSchool(acc, (tx) => tx.payrollAdjustment.findMany({ where: { runId: rid, archivedAt: null } }));
  const line = (rid: string) => withSchool(acc, (tx) => tx.payrollLine.findFirstOrThrow({ where: { runId: rid, staffId: f.teacherStaff.id } }));

  beforeAll(async () => {
    f = await makeLibrarySchool("Library Salary Test School");
    acc = as(f, f.accountant.id);
    const sys = { schoolId: f.school.id, userId: null };
    await withSchool(sys, async (tx) => {
      await ensureFinanceDefaults(tx, sys);
      await ensureSalaryDefaults(tx, sys);
      await tx.statutorySetting.updateMany({ data: { ptOn: false, pfOn: false, esiOn: false } });
    });
    await withSchool(acc, (tx) => saveStructure(tx, acc, { staffId: f.teacherStaff.id, effectiveFrom: day("2026-04-01"), lines: lines(20000), pfApplies: false, esiApplies: false, tdsPaise: R(0), reason: null }));
    const run = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: OCT, today: TODAY }));
    runId = run.id;
  });

  it("refuses a student's fine, and a staff member without a salary structure", async () => {
    const s = await fineFor("student");
    await expect(withSchool(desk(f), (tx) => sendFineToSalary(tx, desk(f), s.id))).rejects.toThrow(/Only a staff member's fine/);
    const ctx = desk(f);
    const b = await addTestBook(f, "Librarian's own book");
    const padma = await staffMember(f, f.librarianStaff);
    const own = await withSchool(ctx, async (tx) => createFine(tx, ctx, await librarySettings(tx, ctx), { member: padma, reason: "LATE", issueId: null, copyId: b.copies[0].id, bookId: b.book.id, lateDays: 2, amountPaise: R(20), note: null, book: { title: b.book.title }, today: TODAY }));
    await expect(withSchool(acc, (tx) => sendFineToSalary(tx, acc, own.id))).rejects.toThrow("Padma Rao has no salary structure in Salary Management, so the fine cannot be taken from salary. Collect it here.");
  });

  it("goes on the next salary as one deduction, once, and cannot be collected at the desk meanwhile", async () => {
    const x = await fineFor("staff", 50);
    await withSchool(desk(f), (tx) => sendFineToSalary(tx, desk(f), x.id, day("2026-10-10")));
    await expect(withSchool(desk(f), (tx) => sendFineToSalary(tx, desk(f), x.id))).rejects.toThrow(/already going to be taken from salary/);
    await expect(withSchool(desk(f), (tx) => collectAtDesk(tx, desk(f), x.id, { mode: "CASH", reference: null, today: TODAY }))).rejects.toThrow(/going to be taken from salary/);

    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, TODAY));
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, TODAY));
    const adj = (await adjustments(runId)).filter((a) => a.reason.includes(x.fineNo));
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ type: "DEDUCTION", amountPaise: R(50), staffId: f.teacherStaff.id });
    expect(adj[0].reason).toBe(fineDeductionReason(x, adj[0].reason.match(/“(.*)”/)![1]));
    expect((await line(runId)).cutPaise).toBe(R(50));
    expect(await fine(x.id)).toMatchObject({ status: "DUE", adjustmentId: adj[0].id, runId });
  });

  it("can be taken back to the desk while the salary is being prepared; the salary is worked out again", async () => {
    const before = await withSchool(desk(f), (tx) => tx.libraryFine.findFirstOrThrow({ where: { runId, status: "DUE" } }));
    await withSchool(desk(f), (tx) => stopFineFromSalary(tx, desk(f), before.id, "To be collected at the library desk", (rid) => calculateRun(tx, desk(f), rid, TODAY)));
    expect(await fine(before.id)).toMatchObject({ salaryAt: null, adjustmentId: null, runId: null, status: "DUE" });
    expect((await adjustments(runId)).some((a) => a.reason.includes(before.fineNo))).toBe(false);
    expect((await line(runId)).cutPaise).toBe(R(0));
    const audit = await withSchool(acc, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Library Fine", recordId: before.id }, orderBy: { at: "asc" } }));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["sent-to-salary", "salary-stopped"]));
  });

  it("is due at the desk again when the accountant takes the deduction off the salary", async () => {
    const x = await fineFor("staff", 30);
    await withSchool(desk(f), (tx) => sendFineToSalary(tx, desk(f), x.id, day("2026-10-11")));
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, TODAY));
    const adj = (await adjustments(runId)).find((a) => a.reason.includes(x.fineNo))!;
    await withSchool(acc, (tx) => archiveAdjustment(tx, acc, adj.id, TODAY));
    expect(await fine(x.id)).toMatchObject({ status: "DUE", salaryAt: null, adjustmentId: null });
    // Recalculating does not put it back by itself.
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, TODAY));
    expect((await adjustments(runId)).some((a) => a.reason.includes(x.fineNo))).toBe(false);
    const told = await withSchool(as(f, f.librarian.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.librarian.id, text: { contains: x.fineNo } } }));
    expect(told?.text).toMatch(/taken off the October 2026 salary/);
  });

  it("is paid from salary when the salary is approved, and never collected twice", async () => {
    const x = await fineFor("staff", 40);
    await withSchool(desk(f), (tx) => sendFineToSalary(tx, desk(f), x.id, day("2026-10-12")));
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, TODAY));
    const run = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    // Waiting for approval: neither the desk nor a waiver can take it off.
    await expect(withSchool(desk(f), (tx) => stopFineFromSalary(tx, desk(f), x.id, "desk", (rid) => calculateRun(tx, desk(f), rid, TODAY)))).rejects.toThrow(/waiting for approval. Ask the accountant to take that salary back first/);
    await expect(withSchool(desk(f), (tx) => waiveFine(tx, desk(f), x.id, "Kind to staff"))).rejects.toThrow(/waiting for approval/);
    // Taken back and sent again keeps the one deduction.
    await withSchool(acc, (tx) => takeBack(tx, acc, runId));
    await withSchool(acc, (tx) => calculateRun(tx, acc, runId, TODAY));
    expect((await adjustments(runId)).filter((a) => a.reason.includes(x.fineNo))).toHaveLength(1);
    const again = await withSchool(acc, (tx) => sendForApproval(tx, acc, runId));
    expect(again.approvalId).not.toBe(run.approvalId);
    const pr = as(f, f.principal.id);
    await withSchool(pr, (tx) => decide(tx, pr, again.approvalId!, "approve", null));

    const paid = await fine(x.id);
    expect(paid).toMatchObject({ status: "PAID", paidHow: "salary" });
    expect(paid.paidAt).not.toBeNull();
    await expect(withSchool(desk(f), (tx) => collectAtDesk(tx, desk(f), x.id, { mode: "CASH", reference: null, today: TODAY }))).rejects.toThrow(/not due/);
    await expect(withSchool(desk(f), (tx) => waiveFine(tx, desk(f), x.id, "Too late now"))).rejects.toThrow(/already paid/);
    const audit = await withSchool(acc, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Library Fine", recordId: x.id } }));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["sent-to-salary", "paid-from-salary"]));
  });

  it("a fine sent after a month's salary is approved waits for a later month", async () => {
    const x = await fineFor("staff", 25);
    await withSchool(desk(f), (tx) => sendFineToSalary(tx, desk(f), x.id, day("2026-11-02")));
    const nov = await withSchool(acc, (tx) => openRun(tx, acc, { campusId: f.school.campus.id, month: day("2026-11-01"), today: TODAY }));
    await withSchool(acc, (tx) => calculateRun(tx, acc, nov.id, TODAY));
    expect((await adjustments(nov.id)).some((a) => a.reason.includes(x.fineNo))).toBe(true);
  });

  it("only people who look after fines may send one to salary", async () => {
    expect((await libFor(f, f.librarian.id)).can.fines).toBe(true);
    expect((await libFor(f, f.teacher.id)).can.fines).toBe(false);
    expect((await libFor(f, f.accountant.id)).can.fines).toBe(false);
  });
});
