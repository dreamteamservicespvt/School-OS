// Browser test of the money area (MONEY-01 to MONEY-14). Each case is a rule
// the accountant found broken on screen:
// - a promoted student whose last year's enrolment was made after this year's
//   (as the demo data does) shows this year's class everywhere money is shown,
//   and can be given a concession on this year's fees (MONEY-01, MONEY-07);
// - a concession on a later installment does not make it owed today (MONEY-08);
// - money cannot come in or go out on a date that has not come (MONEY-11);
// - an expense cancelled is money back in on the Day Book (MONEY-12);
// - the reminder preview names the family whose text it shows (MONEY-03);
// - "fee <name>" in Search offers Collect Fee for that student (MONEY-02);
// - the words: cancel reasons, due dates, receipt particulars, the default
//   Fee reminder (MONEY-04, 05, 06, 10), and the concession's fee heads (MONEY-09).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { classInYearOf, classOfStudents, studentCard } from "@/lib/fees/dues";
import { concessionHeadChoices, giveConcession } from "@/lib/fees/concessions";
import { concessionRows } from "@/lib/fees/concession-list";
import { findFeeReport } from "@/lib/fees/reports";
import type { FeeViewer } from "@/lib/fees/access";
import { parentLinkFees } from "@/lib/fees/parent-link";
import { studentLedger } from "@/lib/fees/ledger";
import { previewReminders } from "@/lib/fees/reminders";
import { cancelPayment } from "@/lib/fees/cancel";
import { receiptData } from "@/lib/fees/documents";
import { cancelReasonLabel } from "@/lib/fees/words";
import { feeIntent } from "@/lib/fees/find";
import { dayBookView } from "@/lib/finance/daybook-view";
import { cancelExpense, payExpense, recordExpense } from "@/lib/finance/expenses";
import { recordIncome } from "@/lib/finance/income";
import { addJournal } from "@/lib/finance/journals";
import { moveMoney } from "@/lib/finance/accounts";
import { cashAccount } from "@/lib/finance/settings";
import { READY_TEMPLATES } from "@/lib/messaging/templates";
import { formatDate } from "@/lib/format";
import { addDays, todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", () => ({ getCurrent: async () => who.current }));
const search = await import("@/app/api/v1/search/route");

let f: FeeSchool;
let other: FeeSchool;
let lastYear: { id: string; classId: string; sectionId: string };
const TZ = "Asia/Kolkata";
const today = todayIn(TZ);
const tomorrow = addDays(today, 1);

const viewerOf = (s: FeeSchool): FeeViewer => ({ userId: s.accountant.id, see: "all", change: "all", roleKeys: ["accountant"], sectionIds: null, yearId: s.year.id, yearIds: [s.year.id], campusId: null });
const currentFor = async (schoolId: string, userId: string): Promise<Current> => {
  const access = await accessIn(userId, schoolId);
  return { ...access!, ctx: { schoolId, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
};

beforeAll(async () => {
  [f, other] = await Promise.all([makeFeeSchool(), makeFeeSchool()]);
  // Ravi was in Class 4 A last year (2025-26, closed) and was promoted to Class 5 A. Last year's
  // enrolment is made after this year's, as in the demo data: "the enrolment made last" is the wrong one.
  lastYear = await withSchool(f.ctx, async (tx) => {
    const year = await tx.academicYear.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "2025-26", startDate: new Date("2025-04-01"), endDate: new Date("2026-03-31"), status: "CLOSED" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "Class 4", sortOrder: 4 } });
    const sec = await tx.section.create({ data: { schoolId: f.school.id, classId: cls.id, academicYearId: year.id, name: "A" } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: f.ravi.id, academicYearId: year.id, classId: cls.id, sectionId: sec.id, status: "PROMOTED" } });
    return { id: year.id, classId: cls.id, sectionId: sec.id };
  });
}, 180_000);

describe("a promoted student shows this year's class (MONEY-01)", () => {
  it("on the student card, in lists and for records of each year", async () => {
    await withSchool(f.ctx, async (tx) => {
      expect((await classOfStudents(tx, [f.ravi.id])).get(f.ravi.id)?.label).toBe("Class 5 A");
      expect((await classOfStudents(tx, [f.ravi.id], lastYear.id)).get(f.ravi.id)?.label).toBe("Class 4 A");
      const card = await studentCard(tx, f.ctx, f.ravi.id);
      expect(card?.classSection).toBe("Class 5 A");
      expect(card?.academicYearId).toBe(f.year.id);
      // History: a record of last year shows last year's class; one with no year shows this year's.
      const classIn = await classInYearOf(tx, [{ studentId: f.ravi.id, academicYearId: lastYear.id }, { studentId: f.ravi.id }]);
      expect(classIn(f.ravi.id, lastYear.id)?.label).toBe("Class 4 A");
      expect(classIn(f.ravi.id, f.year.id)?.label).toBe("Class 5 A");
      expect(classIn(f.ravi.id, null)?.label).toBe("Class 5 A");
    });
  });

  it("in the Day Book, the Collection details and the Cancelled payments report", async () => {
    const open = await dues(f.ctx, f.ravi.id);
    const kept = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(1000) });
    const gone = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [open[0].id], amountPaise: R(500), confirmDuplicate: true });
    await withSchool(f.ctx, (tx) => cancelPayment(tx, f.ctx, gone.payment.id, { reason: "Wrong amount", note: null }));
    await withSchool(f.ctx, async (tx) => {
      const v = await dayBookView(tx, { from: today, to: today, classId: null, depositAccountId: null, waiting: false, hidePay: null });
      const mine = v.rows.filter((r) => r.studentId === f.ravi.id);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((r) => r.classLabel === "Class 5 A")).toBe(true);

      const filter = { from: today, to: today, classId: null, feeHeadId: null, mode: null, collectorId: null, group: "day" as const, today };
      const details = await findFeeReport("collection-details")!.run(tx, f.ctx, filter, viewerOf(f));
      expect(details.rows.find((r) => r.student === "Ravi Kumar")?.class).toBe("Class 5 A");
      // The class filter goes by the class in the payment's year: this year's payment is not a Class 4 payment.
      const inClass4 = await findFeeReport("collection-details")!.run(tx, f.ctx, { ...filter, classId: lastYear.classId }, viewerOf(f));
      expect(inClass4.rows.some((r) => r.receipt && r.student === "Ravi Kumar")).toBe(false);
      const inClass5 = await findFeeReport("collection-details")!.run(tx, f.ctx, { ...filter, classId: f.cls.id }, viewerOf(f));
      expect(inClass5.rows.filter((r) => r.student === "Ravi Kumar").length).toBe(1);

      const cancelled = await findFeeReport("cancelled")!.run(tx, f.ctx, filter, viewerOf(f));
      expect(cancelled.rows.find((r) => r.student === "Ravi Kumar")?.class).toBe("Class 5 A");
      expect(kept.payment.academicYearId).toBe(f.year.id);
    });
  });

  it("on Parent Link", async () => {
    const kids = await withSchool(f.ctx, (tx) => parentLinkFees(tx, f.ctx, f.ravi.guardian.id));
    expect(kids.find((k) => k.studentId === f.ravi.id)?.classSection).toBe("Class 5 A");
  });
});

describe("a concession for a promoted student (MONEY-07, MONEY-09)", () => {
  it("is given on this year's fees, not refused because last year is closed", async () => {
    const r = await withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, {
      studentId: f.ravi.id, type: "DISCOUNT", mode: "amount", amountPaise: R(500), percentBp: 0, feeHeadIds: [f.tuition.id],
      periodFrom: null, periodTo: null, reason: "Hardship this term",
    }));
    expect(r.concession.academicYearId).toBe(f.year.id);
    expect(r.estimate).toBe(R(500));
    const list = await withSchool(f.ctx, (tx) => concessionRows(tx, { timeZone: TZ, ids: [r.concession.id] }));
    expect(list.rows[0].classLabel).toBe("Class 5 A");
  });

  it("offers the student's own fee heads, with Tuition chosen at the start", async () => {
    const choices = await withSchool(f.ctx, async (tx) => {
      // A head nobody in this school is charged for is not offered.
      await tx.feeHead.create({ data: { schoolId: f.school.id, name: "Event fees", kind: "activity", sortOrder: -1 } });
      return concessionHeadChoices(tx, f.ravi.id);
    });
    expect(choices.heads.map((h) => h.name)).toEqual(["Tuition fee"]);
    expect(choices.startId).toBe(f.tuition.id);
  });
});

describe("the ledger's balance now (MONEY-08, MONEY-04)", () => {
  it("counts only what is due by today when a later installment has a concession", async () => {
    const open = await dues(f.ctx, f.sita.id);
    const later = open[open.length - 1];
    await withSchool(f.ctx, (tx) => giveConcession(tx, f.ctx, {
      studentId: f.sita.id, type: "DISCOUNT", mode: "amount", amountPaise: R(800), percentBp: 0, feeHeadIds: [], dueIds: [later.id],
      periodFrom: null, periodTo: null, reason: "Rest of this year",
    }));
    const l = await withSchool(f.ctx, (tx) => studentLedger(tx, f.sita.id, today, TZ));
    const rows = await dues(f.ctx, f.sita.id);
    const dueByToday = rows.filter((d) => d.dueDate <= today).reduce((s, d) => s + d.balancePaise, BigInt(0));
    expect(l.balanceNow).toBe(dueByToday);
    expect(l.entries[l.entries.length - 1].balance).toBe(dueByToday);
    if (later.dueDate > today) {
      // Still under Coming up, at its reduced amount, and not in the statement yet.
      expect(l.comingUp.find((c) => c.id === later.id)?.amount).toBe(later.amountPaise - R(800));
      expect(l.entries.some((e) => e.key === `due:${later.id}`)).toBe(false);
    }
    // Due dates in the statement read DD-MM-YYYY.
    const first = l.entries.find((e) => e.key === `due:${rows[0].id}`)!;
    expect(first.sub).toBe(`Due ${formatDate(rows[0].dueDate)}`);
    expect(first.sub).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("money dated in the future is refused (MONEY-11)", () => {
  it("for an expense, its payment, other income, a journal entry and a money move", async () => {
    await withSchool(f.ctx, async (tx) => {
      const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", name: "Stationery" } });
      const income = await tx.accountHead.findFirstOrThrow({ where: { kind: "INCOME", name: "Donations" } });
      const cash = await cashAccount(tx, f.ctx);
      const bank = await tx.bankAccount.create({ data: { schoolId: f.school.id, kind: "BANK", name: "QA bank" } });
      const expense = { amountPaise: R(100), accountHeadId: head.id, vendorId: null, costCentreId: null, billFileId: null, note: "QA future", isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null };
      const pay = { mode: "CASH", reference: null, accountId: null, confirmLowCash: true };
      await expect(recordExpense(tx, f.ctx, { ...expense, date: tomorrow }, { ...pay, date: tomorrow })).rejects.toThrow("The expense date cannot be in the future.");
      // Recorded today, then marked paid with a date ahead: refused too.
      const e = await recordExpense(tx, f.ctx, { ...expense, date: today }, null);
      await expect(payExpense(tx, f.ctx, e.expense.id, { ...pay, date: tomorrow })).rejects.toThrow("The date paid cannot be in the future.");
      await expect(recordIncome(tx, f.ctx, { date: tomorrow, accountHeadId: income.id, amountPaise: R(100), receivedFrom: "QA donor", vendorId: null, mode: "CASH", reference: null, accountId: null, note: null }, true)).rejects.toThrow("The date received cannot be in the future.");
      await expect(addJournal(tx, f.ctx, { date: tomorrow, narration: "QA future", lines: [{ accountHeadId: head.id, debitPaise: R(10), creditPaise: BigInt(0) }, { accountHeadId: income.id, debitPaise: BigInt(0), creditPaise: R(10) }] })).rejects.toThrow("The journal date cannot be in the future.");
      await expect(moveMoney(tx, f.ctx, { fromId: cash.id, toId: bank.id, amountPaise: R(10), date: tomorrow, reference: null, confirmLowCash: true })).rejects.toThrow("The date moved cannot be in the future.");
      expect(await tx.dayBookEntry.count({ where: { date: { gt: today } } })).toBe(0);
    });
  });
});

describe("a cancelled expense on the Day Book (MONEY-12)", () => {
  it("is money back in, and Total expense adds up to the Expenses shown", async () => {
    await withSchool(other.ctx, async (tx) => {
      const head = await tx.accountHead.findFirstOrThrow({ where: { kind: "EXPENSE", name: "Stationery" } });
      const input = { date: today, amountPaise: R(100), accountHeadId: head.id, vendorId: null, costCentreId: null, billFileId: null, isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null };
      const pay = { date: today, mode: "CASH", reference: null, accountId: null, confirmLowCash: true };
      const a = await recordExpense(tx, other.ctx, { ...input, note: "Chalk" }, pay);
      await recordExpense(tx, other.ctx, { ...input, amountPaise: R(250), note: "Markers" }, pay);
      await cancelExpense(tx, other.ctx, a.expense.id, "Entered by mistake", today);
      const v = await dayBookView(tx, { from: today, to: today, classId: null, depositAccountId: null, waiting: false, hidePay: null });
      const back = v.sections.refunds.filter((r) => r.sourceType === "expense-cancel");
      expect(back.map((r) => r.total)).toEqual([R(100)]);
      const shown = v.sections.expense.reduce((s, r) => s + r.total, BigInt(0));
      expect(shown).toBe(R(350));
      expect(v.expenseReversed).toBe(R(100));
      expect(v.totals.expense).toBe(shown - v.expenseReversed);
    });
  });
});

describe("the reminder preview (MONEY-03, MONEY-06)", () => {
  const input = (studentIds: string[]) => ({ studentIds, channel: "whatsapp", templateId: null, text: "Dear {guardian_name}, {due_amount} for {student_name} is due. Please pay at {link}. - {school_name}", includeLink: false, today });

  it("shows the message of the family named above it, with one set of counts", async () => {
    const p = await withSchool(other.ctx, (tx) => previewReminders(tx, other.ctx, input([other.anil.id, other.sita.id, other.ravi.id])));
    // Anil's father opted out, so the first message is Sita's, to Mohan Rao.
    expect(p.sampleFor).toEqual({ parent: "Mohan Rao", students: ["Sita Rao"] });
    expect(p.sample).toContain("Dear Mohan Rao");
    expect(p.sample).toContain("Sita Rao");
    expect(p.sample).toContain("Please pay at the school office.");
    expect(p.students).toBe(3);
    expect(p.recipients).toBe(2);
    expect(p.messages).toBe(2);
    expect(p.cost).toBe(2);
    const back = await withSchool(other.ctx, (tx) => previewReminders(tx, other.ctx, input([other.ravi.id, other.sita.id])));
    expect(back.sampleFor?.parent).toBe("Srinivas Kumar");
    expect(back.sample).toContain("Ravi Kumar");
  });

  it("the default Fee reminder does not promise online payment", () => {
    const t = READY_TEMPLATES.find((x) => x.key === "fee-due" && x.channel === "whatsapp")!;
    expect(t.texts.en).not.toMatch(/pay on your Parent Link|pay online/i);
    expect(t.texts.en).toContain("Parent Link");
  });
});

describe("words on money screens (MONEY-10, MONEY-05)", () => {
  it("a cancel reason shows in the words the accountant chose", async () => {
    expect(cancelReasonLabel("Duplicate")).toBe("Same payment entered twice");
    expect(cancelReasonLabel("Wrong amount")).toBe("Wrong amount");
    const open = await dues(other.ctx, other.sita.id);
    const p = await collect(other.ctx, { studentId: other.sita.id, dueIds: [open[0].id], amountPaise: R(300) });
    await withSchool(other.ctx, (tx) => cancelPayment(tx, other.ctx, p.payment.id, { reason: "Duplicate", note: null }));
    const l = await withSchool(other.ctx, (tx) => studentLedger(tx, other.sita.id, today, TZ));
    expect(l.payments.find((x) => x.id === p.payment.id)?.cancelReason).toBe("Same payment entered twice");
    expect(l.entries.find((e) => e.paymentId === p.payment.id && e.cancelled)?.cancelled?.reason).toBe("Same payment entered twice");
  });

  it("receipt particulars have no brackets inside brackets", async () => {
    const open = await dues(other.ctx, other.ravi.id);
    const p = await collect(other.ctx, { studentId: other.ravi.id, dueIds: [open[0].id], amountPaise: open[0].balancePaise });
    const r = await withSchool(other.ctx, (tx) => receiptData(tx, other.ctx, p.payment.id));
    const label = r!.data.lines![0].label;
    expect(label).toBe(`Tuition fee · ${open[0].label}`);
    expect(label).not.toMatch(/\([^)]*\(/);
  });
});

describe("Search: fee <name> (MONEY-02)", () => {
  type Hit = { id: string; name: string; sub: string; href: string };
  const find = async (q: string) => (await search.GET(new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(q)}`))).json() as Promise<{ collect: Hit[]; students: Hit[] }>;

  it("reads the intent word by a plain rule", () => {
    expect(feeIntent("fee Rithvik")).toBe("Rithvik");
    expect(feeIntent("Fees  ravi kumar")).toBe("ravi kumar");
    expect(feeIntent("collect fee 2023/0138")).toBe("2023/0138");
    expect(feeIntent("fee")).toBeNull();
    expect(feeIntent("Feroz Khan")).toBeNull();
  });

  it("offers Collect Fee for that student to the accountant, never another school's", async () => {
    who.current = await currentFor(f.school.id, f.accountant.id);
    const body = await find("fee Ravi");
    expect(body.collect.map((c) => c.href)).toEqual([`/fee-management/collect/${f.ravi.id}`]);
    expect(body.collect[0].sub).toContain("Class 5 A");
    expect(body.students.map((s) => s.id)).toEqual([f.ravi.id]);
  });

  it("is not offered to the Principal, who does not sit at the counter", async () => {
    who.current = await currentFor(f.school.id, f.principal.id);
    expect((await find("fee Ravi")).collect).toEqual([]);
  });
});
