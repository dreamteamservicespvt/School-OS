// Leaving, clearance and certificates (A14): 03 §5 rules and "Done when" 7;
// 04-data-model.md rule 28; certificate approval and QR verification.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import { registerClearanceCheck, unregisterClearanceCheck } from "@/lib/students/clearance";
import { askWaiver, cancelLeaving, completeLeaving, refreshClearance, startLeaving } from "@/lib/students/leaving";
import { issueCertificate, requestCertificate } from "@/lib/students/certificates";
import { formatRupees } from "@/lib/format";
import { addStudent, studentSchool } from "./fixtures";
import "@/lib/students/handlers";

let s: Awaited<ReturnType<typeof studentSchool>>;
const dues = new Map<string, bigint>();
const books = new Map<string, number>();
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const pctx = () => ({ schoolId: s.school.id, userId: s.principal.id });

beforeAll(async () => {
  s = await studentSchool();
});
afterAll(() => {
  unregisterClearanceCheck("Fees");
  unregisterClearanceCheck("Library");
});

describe("clearance", () => {
  it("passes when no module has registered a check yet", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    const req = await withSchool(s.ctx, (tx) => startLeaving(tx, s.ctx, { studentId: student.id, type: "WITHDRAWAL", reason: "Family moving to another city", lastDate: today(), destinationSchool: null }));
    const checks = await withSchool(s.ctx, (tx) => refreshClearance(tx, s.ctx, req.id));
    expect(checks).toHaveLength(0);
    const cert = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null }));
    expect(cert.status).toBe("REQUESTED");
  });

  it("blocks a TC while fees are due or books are out, naming the amount (Done when 7)", async () => {
    registerClearanceCheck("Fees", async (_tx, _ctx, id) => {
      const due = dues.get(id) ?? BigInt(0);
      return due > BigInt(0) ? { clear: false, detail: `${formatRupees(due)} fees due`, amountPaise: due, actionHref: `/fee-management/collect?student=${id}`, actionLabel: "Collect fee" } : { clear: true, detail: "Clear" };
    });
    registerClearanceCheck("Library", async (_tx, _ctx, id) => {
      const n = books.get(id) ?? 0;
      return n ? { clear: false, detail: `${n} library book not returned` } : { clear: true, detail: "Clear" };
    }, { moduleKey: "library-management" });

    const { student } = await addStudent(s.ctx, s.s5a);
    dues.set(student.id, BigInt(450000));
    books.set(student.id, 1);
    await withSchool(s.ctx, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: s.school.id, moduleKey: "library-management" } }, data: { isOn: true } }));
    await withSchool(s.ctx, (tx) => startLeaving(tx, s.ctx, { studentId: student.id, type: "TRANSFER", reason: "Admission in another school", lastDate: today(), destinationSchool: "Kendriya Vidyalaya" }));
    await expect(withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null })))
      .rejects.toThrow("TC blocked: ₹4,500 fees due and 1 library book not returned");

    // Paying the fee and returning the book clears it.
    dues.set(student.id, BigInt(0));
    books.set(student.id, 0);
    const cert = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null }));
    expect(cert.status).toBe("REQUESTED");
  });

  it("lets a pending check be waived only through Approvals", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    dues.set(student.id, BigInt(600000));
    const req = await withSchool(s.ctx, (tx) => startLeaving(tx, s.ctx, { studentId: student.id, type: "WITHDRAWAL", reason: "Fees not affordable", lastDate: today(), destinationSchool: null }));
    const fees = await withSchool(s.ctx, (tx) => tx.studentClearanceCheck.findFirstOrThrow({ where: { leavingRequestId: req.id, name: "Fees" } }));
    expect(fees.status).toBe("PENDING");
    const approval = await withSchool(s.ctx, (tx) => askWaiver(tx, s.ctx, fees.id, "Fee written off by the management"));
    await expect(withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null }))).rejects.toThrow(/₹6,000 fees due/);
    await withSchool(pctx(), (tx) => decide(tx, pctx(), approval.id, "approve", null));
    const after = await withSchool(s.ctx, (tx) => refreshClearance(tx, s.ctx, req.id));
    expect(after.find((c) => c.name === "Fees")?.status).toBe("WAIVED");
    const cert = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null }));
    expect(cert.status).toBe("REQUESTED");
  });
});

describe("certificates", () => {
  it("a TC is numbered only when approved, and one original only: later copies are duplicates with a reason", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    await withSchool(s.ctx, (tx) => startLeaving(tx, s.ctx, { studentId: student.id, type: "TRANSFER", reason: "Family moving", lastDate: today(), destinationSchool: "DPS Pune" }));
    const tc = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null }));
    expect(tc.number).toBeNull();
    await withSchool(pctx(), async (tx) => decide(tx, pctx(), tc.approvalId ?? (await tx.certificate.findUniqueOrThrow({ where: { id: tc.id } })).approvalId!, "approve", null));
    const issued = await withSchool(s.ctx, (tx) => issueCertificate(tx, s.ctx, tc.id));
    expect(issued.status).toBe("ISSUED");
    expect(issued.number).toMatch(/^TC\/2026-27\/\d{4}$/);

    await expect(withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null })))
      .rejects.toThrow(/An original TC was issued on .* To print a duplicate, give the reason/);
    const dup = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null, duplicateReason: "Original lost by the parent" }));
    expect(dup.isDuplicate).toBe(true);
    expect(dup.originalId).toBe(tc.id);

    // Leaving cannot be cancelled once the TC is out.
    const req = await withSchool(s.ctx, (tx) => tx.leavingRequest.findFirstOrThrow({ where: { studentId: student.id } }));
    await expect(withSchool(s.ctx, (tx) => cancelLeaving(tx, s.ctx, req.id, "Family changed its mind"))).rejects.toThrow(/already issued/);
  });

  it("a rejected request is cancelled and never gets a number", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    await withSchool(s.ctx, (tx) => startLeaving(tx, s.ctx, { studentId: student.id, type: "WITHDRAWAL", reason: "Health reasons", lastDate: today(), destinationSchool: null }));
    const tc = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "TC", purpose: null, issueDate: today(), signatoryId: null }));
    const approvalId = (await withSchool(s.ctx, (tx) => tx.certificate.findUniqueOrThrow({ where: { id: tc.id } }))).approvalId!;
    await withSchool(pctx(), (tx) => decide(tx, pctx(), approvalId, "reject", "Parents have not signed the request"));
    const after = await withSchool(s.ctx, (tx) => tx.certificate.findUniqueOrThrow({ where: { id: tc.id } }));
    expect(after.status).toBe("CANCELLED");
    expect(after.number).toBeNull();
  });

  it("a bonafide certificate needs a purpose and is issued at once when the school asks no approval", async () => {
    const { student } = await addStudent(s.ctx, s.s5a);
    await expect(withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "BONAFIDE", purpose: null, issueDate: today(), signatoryId: null }))).rejects.toThrow(/purpose/);
    const c = await withSchool(s.ctx, (tx) => requestCertificate(tx, s.ctx, { studentId: student.id, type: "BONAFIDE", purpose: "Bank account opening", issueDate: today(), signatoryId: null }));
    expect(c.status).toBe("ISSUED");
    expect(c.number).toMatch(/^BONAFIDE\/2026-27\/\d{4}$/);
    expect((c.verifyCode ?? "").length).toBe(16);
  });

  it("the QR check shows only number, type, date and status, for the exact code", async () => {
    const c = await withSchool(s.ctx, (tx) => tx.certificate.findFirstOrThrow({ where: { type: "BONAFIDE", status: "ISSUED" } }));
    const rows = await prisma.$queryRaw<{ cert_number: string; cert_type: string; cert_status: string; school_name: string }[]>`SELECT * FROM verify_certificate(${c.verifyCode})`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cert_number: c.number, cert_type: "BONAFIDE", cert_status: "ISSUED", school_name: "Student Test School" });
    expect(Object.keys(rows[0]).sort()).toEqual(["cert_number", "cert_status", "cert_type", "is_duplicate", "issue_date", "school_name"].sort());
    expect(await prisma.$queryRaw<unknown[]>`SELECT * FROM verify_certificate(${"WRONGCODE1234567"})`).toHaveLength(0);
    // The check does not open the certificate table itself.
    expect(await prisma.certificate.findMany()).toHaveLength(0);
  });
});

describe("leaving completes on the last date", () => {
  it("changes the status and marks the enrolment left; the record stays", async () => {
    const { student, enrolment } = await addStudent(s.ctx, s.s5a);
    const req = await withSchool(s.ctx, (tx) => startLeaving(tx, s.ctx, { studentId: student.id, type: "TRANSFER", reason: "Family moving", lastDate: today(), destinationSchool: "St. Mary's" }));
    await withSchool(s.ctx, (tx) => completeLeaving(tx, s.ctx, req.id));
    await withSchool(s.ctx, async (tx) => {
      const st = await tx.student.findUniqueOrThrow({ where: { id: student.id } });
      expect(st.status).toBe("TRANSFERRED");
      expect(st.archivedAt).toBeNull();
      expect((await tx.enrolment.findUniqueOrThrow({ where: { id: enrolment.id } })).status).toBe("LEFT");
    });
  });
});
