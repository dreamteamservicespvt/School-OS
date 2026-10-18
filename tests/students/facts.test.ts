// Gap list G20: Promotion, the Student List and Parent 360 get the final
// result, attendance and fee facts from Examination & Results, Attendance and
// Fee Management (03 §2, workflow 11), through the real modules, with no
// registration: every page and action gets every source. Fee facts reach only
// people allowed to see fees; results only people who see that class's results.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { readListParams } from "@/lib/list";
import { addDays, todayIn } from "@/lib/staff/dates";
import { confirmPromotion, promotionPreview } from "@/lib/students/promotion";
import { getStudentSettings, savePolicy } from "@/lib/students/settings";
import { listFacts, studentsWithDues } from "@/lib/students/hooks";
import { LIST_FILTERS, loadStudentList } from "@/app/(school)/student-management/_lib/queries";
import { loadParent360 } from "@/app/(school)/student-management/guardians/load";
import type { Current } from "@/lib/current";
import { profileTabsFor } from "@/lib/students/profile-tabs";
import "@/lib/fees/profile-tab";
import { makeUser } from "../helpers";
import { addStudent, studentSchool } from "./fixtures";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const R = (rupees: number) => BigInt(rupees * 100);

let s: Awaited<ReturnType<typeof studentSchool>>;
let counsellorId: string;
/** a: failed, 75% attendance, ₹5,000 overdue. b: passed, ₹3,000 due soon. c: compartment, fees paid. d: draft result only, fees not due yet. e (5 B, a's sister): passed, ₹2,000 overdue. */
const id = { a: "", b: "", c: "", d: "", e: "" };
let guardianId = "";

beforeAll(async () => {
  s = await studentSchool();
  id.a = (await addStudent(s.ctx, s.s5a)).student.id;
  id.b = (await addStudent(s.ctx, s.s5a)).student.id;
  id.c = (await addStudent(s.ctx, s.s5a)).student.id;
  id.d = (await addStudent(s.ctx, s.s5a)).student.id;
  guardianId = (await withSchool(s.ctx, (tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: id.a } }))).guardianId;
  id.e = (await addStudent(s.ctx, s.s5b, { linkGuardianId: guardianId, duplicateReason: "Sister of the first student" })).student.id;
  const counsellor = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["admission-counsellor"] }], name: "Admission Counsellor" });
  counsellorId = counsellor.id;
  const today = todayIn("Asia/Kolkata");
  await withSchool(s.ctx, async (tx) => {
    await tx.role.updateMany({ where: { key: "admission-counsellor" }, data: { isEnabled: true } });
    const final = `final:${s.yearId}`;
    const result = (studentId: string, sectionId: string, outcome: string, percent: number, status: "PUBLISHED" | "DRAFT" = "PUBLISHED") =>
      tx.result.create({ data: { schoolId: s.school.id, academicYearId: s.yearId, key: final, studentId, classId: s.c5, sectionId, percent, outcome, complete: true, status } });
    await result(id.a, s.s5a, "Fail", 31);
    await result(id.b, s.s5a, "Pass", 78);
    await result(id.c, s.s5a, "Compartment", 41);
    await result(id.d, s.s5a, "Fail", 20, "DRAFT"); // a draft never leaves Examination & Results
    await result(id.e, s.s5b, "Pass", 88);
    // a: 3 present and 1 absent on school days in July = 75%.
    for (const [date, statusKey] of [["2026-07-06", "present"], ["2026-07-07", "present"], ["2026-07-08", "present"], ["2026-07-09", "absent"]] as const) {
      await tx.attendanceMark.create({ data: { schoolId: s.school.id, academicYearId: s.yearId, studentId: id.a, sectionId: s.s5a, date: day(date), statusKey } });
    }
    const head = await tx.feeHead.create({ data: { schoolId: s.school.id, name: "Tuition fee", kind: "tuition" } });
    const due = (studentId: string, dueDate: Date, amount: bigint, paid = BigInt(0)) =>
      tx.studentFeeDue.create({ data: { schoolId: s.school.id, studentId, academicYearId: s.yearId, feeHeadId: head.id, label: "Term fee", dueDate, amountPaise: amount, paidPaise: paid, balancePaise: amount - paid } });
    await due(id.a, addDays(today, -20), R(5000));
    await due(id.b, addDays(today, 10), R(3000));
    await due(id.c, addDays(today, -20), R(4000), R(4000));
    await due(id.d, addDays(today, 100), R(6000));
    await due(id.e, addDays(today, -5), R(2000));
    await tx.payment.create({ data: { schoolId: s.school.id, studentId: id.c, academicYearId: s.yearId, amountPaise: R(4000), mode: "UPI", paidAt: new Date(), paymentDate: addDays(today, -21) } });
  });
}, 120_000);

async function listAs(userId: string, raw: Record<string, string> = {}) {
  const who = await s.who(userId);
  const settings = await withSchool(s.ctx, (tx) => getStudentSettings(tx, s.ctx));
  const params = readListParams(raw, LIST_FILTERS);
  const data = await withSchool(who.ctx, (tx) => loadStudentList(tx, who, { params, yearId: s.yearId, yearStart: day("2026-04-01"), settings, shown: 25, seeParents: true }));
  return { ...data, row: (sid: string) => data.rows.find((r) => r.id === sid) };
}

describe("Promotion uses the final results, attendance and fees", () => {
  it("suggests Detain for a student who failed or has a compartment when a pass is required, with every reason", async () => {
    const p = await withSchool(s.ctx, (tx) => promotionPreview(tx, s.ctx, { fromSectionId: s.s5a }));
    const row = (sid: string) => p.rows.find((r) => r.studentId === sid)!;
    expect(p.rules).toMatchObject({ passRequired: true, feeDuesAllowed: true });
    expect(row(id.a)).toMatchObject({ suggested: "DETAIN", why: "did not pass, ₹5,000 fees due (a warning only)" });
    expect(row(id.a).facts).toMatchObject({ result: "fail", resultText: "Fail, 31%", attendancePct: 75, feeDuePaise: R(5000) });
    expect(row(id.b)).toMatchObject({ suggested: "PROMOTE", why: "passed, ₹3,000 fees due (a warning only)" });
    expect(row(id.c)).toMatchObject({ suggested: "DETAIN", why: "compartment result, not a pass yet" });
    // A draft final result is not a result: the page says it is not published.
    expect(row(id.d).facts.result).toBeNull();
    expect(row(id.d).why).toMatch(/^final result not published/);
    expect(p.resultsPublished).toBe(3);
  });

  it("leaves the amount out for people who may not see fees", async () => {
    const p = await withSchool(s.ctx, (tx) => promotionPreview(tx, s.ctx, { fromSectionId: s.s5a }, { feeAmounts: false }));
    expect(p.rows.find((r) => r.studentId === id.b)!.why).toBe("passed, fees due (a warning only)");
  });

  it("a changed suggestion needs a reason, and the batch keeps the facts it was decided on", async () => {
    const lone = await studentSchool();
    const x = (await addStudent(lone.ctx, lone.s5a)).student.id;
    await withSchool(lone.ctx, (tx) => tx.result.create({ data: { schoolId: lone.school.id, academicYearId: lone.yearId, key: `final:${lone.yearId}`, studentId: x, classId: lone.c5, sectionId: lone.s5a, percent: 30, outcome: "Fail", complete: true, status: "PUBLISHED" } }));
    await expect(withSchool(lone.ctx, (tx) => confirmPromotion(tx, lone.ctx, { fromSectionId: lone.s5a, toYearId: lone.nextYearId, decisions: [{ studentId: x, decision: "PROMOTE" }] })))
      .rejects.toThrow(/Give a reason .*the suggestion was detain/);
    await withSchool(lone.ctx, (tx) => confirmPromotion(tx, lone.ctx, { fromSectionId: lone.s5a, toYearId: lone.nextYearId, decisions: [{ studentId: x, decision: "PROMOTE", reason: "Passed the re-test in April" }] }));
    const d = await withSchool(lone.ctx, (tx) => tx.promotionDecision.findFirstOrThrow({ where: { studentId: x } }));
    expect(d).toMatchObject({ suggested: "DETAIN", decision: "PROMOTE" });
    expect(d.facts).toMatchObject({ result: "fail", resultText: "Fail, 30%" });
  });

  it("with no fee dues allowed and a minimum attendance, those stop promotion too", async () => {
    await withSchool(s.ctx, (tx) => savePolicy(tx, s.ctx, s.yearId, { passRequired: true, minAttendancePct: 80, feeDuesAllowed: false, exceptionApproverRole: "principal" }));
    const p = await withSchool(s.ctx, (tx) => promotionPreview(tx, s.ctx, { fromSectionId: s.s5a }));
    const row = (sid: string) => p.rows.find((r) => r.studentId === sid)!;
    expect(row(id.a)).toMatchObject({ suggested: "DETAIN", why: "did not pass, attendance 75% is below 80%, ₹5,000 fees due" });
    // Passed, but owes fees: no longer suggested Promote.
    expect(row(id.b)).toMatchObject({ suggested: "DETAIN", why: "₹3,000 fees due, passed, no attendance marked" });
    // Paid in full: fees do not count against them.
    expect(row(id.c).facts.feeDuePaise).toBe(BigInt(0));
  });
});

describe("Student List: attendance, result and fees", () => {
  it("shows each student's attendance %, published final result and fee status (Paid, Due, Overdue)", async () => {
    const l = await listAs(s.admin.id);
    expect(l.shows).toEqual({ attendance: true, fees: true, results: true });
    expect(l.row(id.a)).toMatchObject({ att: 75, result: "fail", resultText: "Fail, 31%", due: R(5000), overdue: true });
    expect(l.row(id.b)).toMatchObject({ att: null, result: "pass", due: R(3000), overdue: false });
    expect(l.row(id.c)).toMatchObject({ result: "compartment", due: BigInt(0), overdue: false });
    // Nothing has fallen due yet (the first row is 100 days away), and the draft result is not shown.
    expect(l.row(id.d)).toMatchObject({ result: null, resultText: null, due: null });
  });

  it("filters Has dues and Overdue for people who may see fees, with Fees by class's rule", async () => {
    const dues = await listAs(s.accountantUser.id, { fee: "dues" });
    expect(dues.rows.map((r) => r.id).sort()).toEqual([id.a, id.b, id.e].sort());
    const overdue = await listAs(s.principal.id, { fee: "overdue" });
    expect(overdue.rows.map((r) => r.id).sort()).toEqual([id.a, id.e].sort());
  });

  it("the Accountant sees fees but not attendance or results", async () => {
    const l = await listAs(s.accountantUser.id);
    expect(l.shows).toEqual({ attendance: false, fees: true, results: false });
    expect(l.row(id.a)).toMatchObject({ att: null, result: null, due: R(5000), overdue: true });
  });

  it("a class teacher sees attendance and their class's results, never fees, and the fee filter does nothing for them", async () => {
    const l = await listAs(s.teacherUser.id, { fee: "dues" });
    expect(l.shows).toEqual({ attendance: true, fees: false, results: true });
    // Their own section only, and every student in it: the fee filter is not applied for someone who may not see fees.
    expect(l.rows.map((r) => r.id).sort()).toEqual([id.a, id.b, id.c, id.d].sort());
    expect(l.rows.every((r) => r.due === null && !r.overdue)).toBe(true);
    expect(l.row(id.a)).toMatchObject({ att: 75, result: "fail" });
  });

  it("the Admission Counsellor sees no fees (admission fees only)", async () => {
    const l = await listAs(counsellorId, { fee: "overdue" });
    expect(l.shows.fees).toBe(false);
    expect(l.rows.every((r) => r.due === null)).toBe(true);
    expect(l.rows.map((r) => r.id)).toContain(id.b);
  });

  it("never gives facts about another school's students", async () => {
    const other = await studentSchool();
    const x = (await addStudent(other.ctx, other.s5a)).student.id;
    await withSchool(other.ctx, async (tx) => {
      const head = await tx.feeHead.create({ data: { schoolId: other.school.id, name: "Tuition fee", kind: "tuition" } });
      await tx.studentFeeDue.create({ data: { schoolId: other.school.id, studentId: x, academicYearId: other.yearId, feeHeadId: head.id, label: "Term fee", dueDate: addDays(todayIn("Asia/Kolkata"), -3), amountPaise: R(900), balancePaise: R(900) } });
      await tx.result.create({ data: { schoolId: other.school.id, academicYearId: other.yearId, key: `final:${other.yearId}`, studentId: x, classId: other.c5, sectionId: other.s5a, percent: 20, outcome: "Fail", complete: true, status: "PUBLISHED" } });
      await tx.attendanceMark.create({ data: { schoolId: other.school.id, academicYearId: other.yearId, studentId: x, sectionId: other.s5a, date: day("2026-07-06"), statusKey: "present" } });
    });
    const who = await s.who(s.admin.id);
    for (const yearId of [s.yearId, other.yearId]) {
      const f = (await withSchool(who.ctx, (tx) => listFacts(tx, who, [x], yearId))).facts.get(x);
      expect(f?.feeDuePaise).toBeUndefined();
      expect(f?.result).toBeUndefined();
      expect(f?.attendancePct ?? null).toBeNull();
    }
    expect(await withSchool(who.ctx, (tx) => studentsWithDues(tx, who, s.yearId, "dues"))).not.toContain(x);
  });
});

describe("Parent 360: fees, payments, attendance and results of the children", () => {
  const open = async (userId: string) => {
    const who = await s.who(userId);
    return withSchool(who.ctx, (tx) => loadParent360(tx, who, guardianId, { yearId: s.yearId, seeDocuments: false, parentLink: false }));
  };

  it("shows every child with this year's class and facts, and the latest payments", async () => {
    const p = (await open(s.admin.id))!;
    expect(p.kids.map((k) => k.studentId).sort()).toEqual([id.a, id.e].sort());
    const a = p.kids.find((k) => k.studentId === id.a)!;
    const e = p.kids.find((k) => k.studentId === id.e)!;
    expect(a.section?.sectionName).toBe("A");
    expect(e.section?.sectionName).toBe("B");
    expect(a.fact).toMatchObject({ attendancePct: 75, feeDuePaise: R(5000), feeOverdue: true, result: "fail" });
    expect(e.fact).toMatchObject({ feeDuePaise: R(2000), feeOverdue: true, result: "pass" });
    expect(p.shows.fees).toBe(true);
    expect(p.payments).toEqual([]); // the family has paid nothing yet (c's payment is another family's)
  });

  it("lists the family's payments, newest first", async () => {
    await withSchool(s.ctx, (tx) => tx.payment.create({ data: { schoolId: s.school.id, studentId: id.e, academicYearId: s.yearId, amountPaise: R(1000), mode: "CASH", paidAt: new Date(), paymentDate: todayIn("Asia/Kolkata") } }));
    const p = (await open(s.accountantUser.id))!;
    expect(p.payments.map((x) => [x.studentId, x.amountPaise])).toEqual([[id.e, R(1000)]]);
    // The Accountant sees fees, not attendance.
    expect(p.shows).toMatchObject({ fees: true, attendance: false });
    expect(p.kids.find((k) => k.studentId === id.a)!.fact?.attendancePct).toBeUndefined();
  });

  it("a class teacher sees only the child they teach, with no fees or payments", async () => {
    const p = (await open(s.teacherUser.id))!;
    expect(p.kids.map((k) => k.studentId)).toEqual([id.a]);
    expect(p.shows.fees).toBe(false);
    expect(p.payments).toEqual([]);
    expect(p.kids[0].fact).toMatchObject({ attendancePct: 75, result: "fail" });
    expect(p.kids[0].fact?.feeDuePaise).toBeUndefined();
  });

  it("the Admission Counsellor sees no fees or payments", async () => {
    const p = (await open(counsellorId))!;
    expect(p.shows.fees).toBe(false);
    expect(p.payments).toEqual([]);
    expect(p.kids.every((k) => k.fact?.feeDuePaise === undefined)).toBe(true);
  });
});

describe("Student Profile: the fee status agrees with the Student List", () => {
  it("shows what has fallen due, not the whole year's balance", async () => {
    const who = await s.who(s.admin.id);
    const current = { ...who, modulesOn: new Set(), user: { id: s.admin.id }, school: { timeZone: "Asia/Kolkata" } } as unknown as Current;
    const fees = profileTabsFor(current).find((t) => t.key === "fees")!;
    const strip = (studentId: string) => fees.summary!({ current, studentId, academicYearId: s.yearId });
    expect(await strip(id.a)).toEqual([expect.objectContaining({ label: "Fees due", value: "₹5,000", sub: "₹5,000 overdue", tone: "danger" })]);
    expect(await strip(id.b)).toEqual([expect.objectContaining({ label: "Fees due", value: "₹3,000", sub: "Not overdue yet", tone: "warning" })]);
    // The first instalment is 100 days away: nothing is due yet, as on the Student List.
    expect(await strip(id.d)).toEqual([expect.objectContaining({ label: "Fees", value: "Nothing due yet", sub: "₹6,000 not due yet" })]);
    expect(await strip(id.c)).toEqual([expect.objectContaining({ value: "All paid" })]);
  });
});
