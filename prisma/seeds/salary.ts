// Salary demo: Salary Settings with Professional Tax on (Telangana), a salary
// structure for every staff member but one (a 6% increment from June for
// teachers, so they have two versions), a loan being recovered, an advance
// waiting for the Principal and one approved but not paid; salary months
// from April (go-live) to last month approved, paid into the Day Book and
// locked; this month calculated with a bonus, ready to send for approval.
// An HR login to try HR's View of Salary (days, leave and loss of pay, no money).
import { prisma, withSchool, type SchoolContext } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/password";
import { decide } from "../../src/lib/approvals";
import "../../src/lib/salary/handlers";
import { ensureSalaryDefaults, components, linesFrom } from "../../src/lib/salary/settings";
import { saveStructure, structureFor, fromStored, raisedLines } from "../../src/lib/salary/structures";
import { addAdjustment, calculateRun, markPaid, openRun, sendForApproval } from "../../src/lib/salary/payroll";
import { giveAdvance, payAdvance } from "../../src/lib/salary/advances";
import { addMonths, firstOfMonth, lastOfMonth } from "../../src/lib/salary/words";
import type { SeedSchool } from "./types";

const R = (rupees: number) => BigInt(Math.round(rupees * 100));

/** An "hr" demo login with the HR role (from DEMO_PASSWORD; none without it). */
async function hrLogin(school: SeedSchool) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return;
  let u = await prisma.userLogin.findUnique({ where: { username: "hr" } });
  if (!u) u = await prisma.userLogin.create({ data: { username: "hr", displayName: "Kavitha Reddy", phone: "9876500033", status: "ACTIVE", passwordHash: await hashPassword(password), passwordChangedAt: new Date() } });
  const userId = u.id;
  await withSchool({ schoolId: school.schoolId, userId: null }, async (tx) => {
    await tx.role.updateMany({ where: { key: "hr" }, data: { isEnabled: true } });
    if (await tx.schoolAccess.findFirst({ where: { userLoginId: userId } })) return;
    const role = await tx.role.findFirstOrThrow({ where: { key: "hr" } });
    await tx.schoolAccess.create({ data: { schoolId: school.schoolId, userLoginId: userId, roles: { create: [{ roleId: role.id, schoolId: school.schoolId }] } } });
  });
}

/** Monthly basic, conveyance and special allowance by designation. */
function payFor(designation: string): [number, number, number, number] {
  const d = designation.toLowerCase();
  if (d.includes("vice principal")) return [56000, 3200, 14800, 0];
  if (d.includes("principal")) return [70000, 3200, 16800, 6200];
  if (d.includes("pgt") || d.includes("academic")) return [29000, 1600, 4900, 1200];
  if (d.includes("tgt") || d.includes("computer")) return [21000, 1600, 3150, 0];
  if (d.includes("prt") || d.includes("pre-primary") || d.includes("art") || d.includes("physical")) return [15000, 1200, 2800, 0];
  if (d.includes("accountant") || d.includes("hr") || d.includes("admin") || d.includes("office head")) return [21000, 1600, 2900, 0];
  if (d.includes("receptionist") || d.includes("librarian") || d.includes("counsellor") || d.includes("supervisor")) return [12000, 1000, 2000, 0];
  if (d.includes("warden") || d.includes("store") || d.includes("lab")) return [11000, 1000, 1500, 0];
  return [9500, 1000, 1750, 0];
}

export async function seedSalary(school: SeedSchool) {
  const acc: SchoolContext = { schoolId: school.schoolId, userId: school.users.accountant ?? school.users.admin ?? null };
  const pri: SchoolContext = { schoolId: school.schoolId, userId: school.users.principal ?? null };
  await withSchool(acc, (tx) => ensureSalaryDefaults(tx, acc));
  if (!school.full || !acc.userId || !pri.userId) return;
  await hrLogin(school);
  const today = new Date(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) + "T00:00:00Z");
  const goLive = new Date("2026-04-01T00:00:00Z");
  const thisMonth = firstOfMonth(today);

  const already = await withSchool(acc, (tx) => tx.payrollRun.count());
  if (already) return;

  // Settings: Professional Tax on from go-live.
  const staffIds = await withSchool(acc, async (tx) => {
    await tx.statutorySetting.updateMany({ data: { ptOn: true } });
    const comps = await components(tx, acc);
    const id = (key: string | null, name: string) => comps.find((c) => (key ? c.systemKey === key : c.name === name))?.id;
    const staff = await tx.staff.findMany({ where: { archivedAt: null, campusId: school.campusId }, orderBy: { staffCode: "asc" } });
    const left = staff.find((s) => s.designation.toLowerCase().includes("art")) ?? staff[staff.length - 1];
    for (const s of staff) {
      if (s.id === left.id) continue;
      const [basic, conv, special, tds] = payFor(s.designation);
      const amounts = new Map<string, bigint>();
      const put = (cid: string | undefined, v: number) => { if (cid) amounts.set(cid, R(v)); };
      put(id("basic", "Basic pay"), basic);
      put(id(null, "Conveyance"), conv);
      put(id(null, "Special allowance"), special);
      const lines = linesFrom(comps.filter((c) => c.kind === "EARNING" && c.calc !== "ATTENDANCE" && (c.calc === "PERCENT" || amounts.has(c.id))), amounts);
      const gross = basic * 1.5 + conv + special;
      await saveStructure(tx, acc, { staffId: s.id, effectiveFrom: goLive, lines, pfApplies: true, esiApplies: gross <= 21000, tdsPaise: R(tds), reason: "Brought in at go-live" });
    }
    // Teachers got a 6% increment from June.
    const teachers = staff.filter((s) => s.staffType === "Teaching" && s.id !== left.id);
    for (const s of teachers) {
      const cur = await structureFor(tx, s.id, goLive);
      if (cur) await saveStructure(tx, acc, { staffId: s.id, effectiveFrom: new Date("2026-06-01T00:00:00Z"), lines: raisedLines(fromStored(cur.lines), 600), pfApplies: cur.pfApplies, esiApplies: cur.esiApplies, tdsPaise: cur.tdsPaise, reason: "6% increment from 1 Jun" });
    }
    return staff.filter((s) => s.id !== left.id).map((s) => s.id);
  });

  // A loan being recovered since June, an advance waiting and one approved, not paid yet.
  const loan = await withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: staffIds[staffIds.length - 1], type: "LOAN", amountPaise: R(30000), installmentPaise: R(3000), startMonth: new Date("2026-06-01T00:00:00Z"), reason: "House repairs after rains" }));
  await withSchool(pri, (tx) => decide(tx, pri, loan.approvalId!, "approve", null));
  await withSchool(acc, (tx) => payAdvance(tx, acc, loan.id, { date: new Date("2026-05-18T00:00:00Z"), mode: "BANK_TRANSFER", reference: "HDFCN26051811", accountId: null, today }));
  const advance = await withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: staffIds[staffIds.length - 2], type: "ADVANCE", amountPaise: R(10000), installmentPaise: R(2000), startMonth: addMonths(thisMonth, 1), reason: "Dussehra festival advance" }));
  await withSchool(pri, (tx) => decide(tx, pri, advance.approvalId!, "approve", null));
  await withSchool(acc, (tx) => giveAdvance(tx, acc, { staffId: staffIds[staffIds.length - 3], type: "ADVANCE", amountPaise: R(7500), installmentPaise: R(1500), startMonth: addMonths(thisMonth, 1), reason: "Child’s school fees" }));

  // Past months: worked out, approved, paid on the last day, locked as the next is approved.
  for (let m = goLive; m < thisMonth; m = addMonths(m, 1)) {
    const run = await withSchool(acc, async (tx) => {
      const r = await openRun(tx, acc, { campusId: school.campusId, month: m, today });
      await calculateRun(tx, acc, r.id, today);
      return sendForApproval(tx, acc, r.id);
    }, { timeout: 120_000 });
    await withSchool(pri, (tx) => decide(tx, pri, run.approvalId!, "approve", null), { timeout: 120_000 });
    const paidOn = lastOfMonth(m) < today ? lastOfMonth(m) : today;
    await withSchool(acc, (tx) => markPaid(tx, acc, run.id, { date: paidOn, mode: "BANK_TRANSFER", reference: `HDFCB${m.toISOString().slice(2, 7).replace("-", "")}0941`, accountId: null, today }));
  }

  // This month: calculated with a bonus, ready to send.
  await withSchool(acc, async (tx) => {
    const r = await openRun(tx, acc, { campusId: school.campusId, month: thisMonth, today });
    await calculateRun(tx, acc, r.id, today);
    await addAdjustment(tx, acc, { runId: r.id, staffId: staffIds[3], type: "BONUS", amountPaise: R(2000), reason: "Science fair coordination" }, today);
  }, { timeout: 120_000 });
}
