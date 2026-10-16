// Fee and Finance demo: fee heads and a published fee structure for every
// class of this year (tuition by quarter, annual charges, exam fee, and an
// admission fee for new students), payments at the counter since go-live
// (full, partial, UPI and cash) so the Fee Dashboard, ledgers and Defaulters
// have real data; other income and paid expenses in the Day Book, one bigger
// expense waiting for approval; and a Vice Principal login to try the
// Finance View (no staff pay, no Accounts).
import { prisma, withSchool, type SchoolContext } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { ensureFeeDefaults } from "../../src/lib/fees/settings";
import { ensureFinanceDefaults, mainBankAccount } from "../../src/lib/finance/settings";
import { saveFeeHead, openDraft, saveFeeRow, publishStructure, assignToClass } from "../../src/lib/fees/structure";
import { defaultSchedule } from "../../src/lib/fees/schedule";
import { collectPayment } from "../../src/lib/fees/collect";
import { recordIncome } from "../../src/lib/finance/income";
import { recordExpense, saveVendor } from "../../src/lib/finance/expenses";
import type { SeedSchool } from "./types";

const R = (rupees: number) => BigInt(Math.round(rupees * 100));
const DAY = 86_400_000;

/** Tuition for the year by class: higher classes pay more. */
function tuitionFor(className: string) {
  const n = Number(className.match(/\d+/)?.[0] ?? 0);
  if (!n) return 24000; // Nursery, LKG, UKG
  return n <= 5 ? 32000 : n <= 8 ? 38000 : 44000;
}

async function vicePrincipal(school: SeedSchool) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return;
  let u = await prisma.userLogin.findUnique({ where: { username: "vp" } });
  if (!u) u = await prisma.userLogin.create({ data: { username: "vp", displayName: "Ramesh Iyer", phone: "9876500031", status: "ACTIVE", passwordHash: await hashPassword(password), passwordChangedAt: new Date() } });
  const userId = u.id;
  school.users.vp = userId;
  await withSchool({ schoolId: school.schoolId, userId: null }, async (tx) => {
    await tx.role.updateMany({ where: { key: "vice-principal" }, data: { isEnabled: true } });
    if (await tx.schoolAccess.findFirst({ where: { userLoginId: userId } })) return;
    const role = await tx.role.findFirstOrThrow({ where: { key: "vice-principal" } });
    await tx.schoolAccess.create({ data: { schoolId: school.schoolId, userLoginId: userId, roles: { create: [{ roleId: role.id, schoolId: school.schoolId }] } } });
  });
}

export async function seedFeesFinance(school: SeedSchool) {
  const base: SchoolContext = { schoolId: school.schoolId, userId: school.users.accountant ?? school.users.principal ?? null };
  await withSchool(base, async (tx) => {
    await ensureFeeDefaults(tx, base);
    await ensureFinanceDefaults(tx, base);
  });
  if (!school.full || !base.userId) return;
  const ctx = base;
  await vicePrincipal(school);

  const today = new Date(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) + "T00:00:00Z");
  const goLive = new Date("2026-04-01T00:00:00Z");
  const daysSinceGoLive = Math.max(1, Math.floor((today.getTime() - goLive.getTime()) / DAY));
  const dayAt = (n: number, hh = 10) => new Date(goLive.getTime() + Math.min(n, daysSinceGoLive) * DAY + (hh * 60 - 330) * 60_000);

  // Fee heads and structures.
  const assigned = await withSchool(ctx, async (tx) => {
    if (await tx.feeStructure.count()) return false;
    const year = await tx.academicYear.findUniqueOrThrow({ where: { id: school.yearId } });
    // Admission may have made some heads already (the admission fee); use those.
    const head = async (name: string, kind: string) => (await tx.feeHead.findFirst({ where: { name, archivedAt: null } })) ?? saveFeeHead(tx, ctx, { name, kind, taxable: false, gstRateBp: null, sacCode: null, bankAccountId: null, lateFeeApplies: kind === "tuition" });
    const tuition = await head("Tuition fee", "tuition");
    const annual = await head("Annual charges", "annual");
    const exam = await head("Exam fee", "exam");
    await head("Admission fee", "admission");
    const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } });
    for (const c of classes) {
      const enrolled = await tx.enrolment.count({ where: { classId: c.id, academicYearId: year.id, archivedAt: null } });
      if (!enrolled) continue;
      const draft = await openDraft(tx, ctx, year.id, c.id);
      const t = R(tuitionFor(c.name));
      await saveFeeRow(tx, ctx, draft.id, { feeHeadId: tuition.id, frequency: "QUARTERLY", totalPaise: t, schedule: defaultSchedule("QUARTERLY", t, year.startDate) });
      await saveFeeRow(tx, ctx, draft.id, { feeHeadId: annual.id, frequency: "YEARLY", totalPaise: R(6000), schedule: defaultSchedule("YEARLY", R(6000), year.startDate) });
      await saveFeeRow(tx, ctx, draft.id, { feeHeadId: exam.id, frequency: "HALF_YEARLY", totalPaise: R(2000), schedule: defaultSchedule("HALF_YEARLY", R(2000), year.startDate) });
      await publishStructure(tx, ctx, draft.id, year.startDate);
      await assignToClass(tx, ctx, draft.id, false);
    }
    return true;
  }, { timeout: 120_000 });
  if (!assigned) return;

  // Payments since go-live: most families paid the first quarter and the annual
  // charges; some paid only part; a few have paid nothing (they are on Defaulters).
  const students = await withSchool(ctx, (tx) => tx.studentFeeDue.groupBy({ by: ["studentId"], where: { state: "OPEN" }, orderBy: { studentId: "asc" } }));
  const modes = ["UPI", "CASH", "UPI", "BANK_TRANSFER", "UPI", "CASH"] as const;
  let i = 0;
  for (const { studentId } of students) {
    i++;
    if (i % 7 === 0) continue; // nothing paid yet
    await withSchool(ctx, async (tx) => {
      const dues = await tx.studentFeeDue.findMany({ where: { studentId, state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lte: new Date(goLive.getTime() + 75 * DAY) } }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
      if (!dues.length) return;
      const owed = dues.reduce((a, d) => a + d.balancePaise, BigInt(0));
      const partial = i % 5 === 0;
      const amount = partial ? (owed / BigInt(200)) * BigInt(100) : owed; // about half, in whole rupees
      const mode = modes[i % modes.length];
      await collectPayment(tx, ctx, { roleKeys: ["accountant"] }, {
        studentId, dueIds: dues.map((d) => d.id), amountPaise: amount, mode,
        reference: mode === "CASH" ? null : `${mode === "UPI" ? "UPI" : "NEFT"}${(400000 + i * 7919).toString()}`,
        chequeNo: null, chequeBank: null, chequeDate: null, paidAt: dayAt(3 + (i * 11) % 90, 9 + (i % 7)), note: null,
        discountPaise: BigInt(0), discountReason: null, waiveDueIds: [], waiveReason: null, confirmDuplicate: true,
      });
    }, { timeout: 60_000 });
  }

  // Other income and expenses in the Day Book.
  await withSchool(ctx, async (tx) => {
    const heads = await tx.accountHead.findMany();
    const h = (name: string) => heads.find((x) => x.name === name)!.id;
    const bank = await mainBankAccount(tx, ctx);
    await recordIncome(tx, ctx, { date: dayAt(40), accountHeadId: h("Hall rent"), amountPaise: R(15000), receivedFrom: "Lions Club, Kukatpally", vendorId: null, mode: "BANK_TRANSFER", reference: "NEFT88213", accountId: bank?.id ?? null, note: "Hall for a blood donation camp" }, true);
    await recordIncome(tx, ctx, { date: dayAt(95), accountHeadId: h("Scrap sale"), amountPaise: R(3200), receivedFrom: "Sri Ram Traders", vendorId: null, mode: "CASH", reference: null, accountId: null, note: "Old benches and newspapers" }, true);
    const stationer = await saveVendor(tx, ctx, { name: "Sri Sai Stationers", phone: "9849011223", gstin: null, address: "Kukatpally, Hyderabad" });
    const power = await saveVendor(tx, ctx, { name: "TSSPDCL", phone: null, gstin: null, address: null });
    const expense = async (date: Date, head: string, amount: number, note: string, vendorId: string | null, mode: string) =>
      recordExpense(tx, ctx, { date, accountHeadId: h(head), amountPaise: R(amount), vendorId, costCentreId: null, billFileId: null, note, isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null },
        amount <= 2000 ? { date, mode, reference: mode === "CASH" ? null : `UPI${Math.round(amount * 13)}`, accountId: null, confirmLowCash: true } : null);
    await expense(dayAt(20), "Stationery", 1850, "Chart paper and markers for the science fair", stationer.id, "CASH");
    await expense(dayAt(60), "Housekeeping", 1200, "Phenyl and brooms", null, "CASH");
    await expense(dayAt(100), "Printing", 1600, "Circulars for the PTM", stationer.id, "UPI");
    // Bigger ones need a bill photo and approval; this one is waiting.
    await tx.financeSetting.update({ where: { schoolId: ctx.schoolId }, data: { billRequiredAbove: R(100000) } });
    await expense(dayAt(150), "Electricity", 18450, "Electricity bill for September", power.id, "BANK_TRANSFER");
    await tx.financeSetting.update({ where: { schoolId: ctx.schoolId }, data: { billRequiredAbove: R(2000) } });
  }, { timeout: 60_000 });
}
